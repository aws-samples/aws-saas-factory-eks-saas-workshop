"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClusterStack = void 0;
const cdk = require("@aws-cdk/core");
const eks = require("@aws-cdk/aws-eks");
const ec2 = require("@aws-cdk/aws-ec2");
const s3 = require("@aws-cdk/aws-s3");
const iam = require("@aws-cdk/aws-iam");
const cr = require("@aws-cdk/custom-resources");
const logs = require("@aws-cdk/aws-logs");
const lambda = require("@aws-cdk/aws-lambda");
const path = require("path");
const KeyName = 'workshop';
class ClusterStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Tag the stack and its resources.
        this.tags.setTag('StackName', 'ClusterStack');
        // The VPC ID is supplied by the caller from the VPC_ID environment variable.
        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: props.vpcId
        });
        // CodeBuild role is supplied by the caller from the BUILD_ROLE_ARN environment variable.
        const codeBuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);
        // Create an EC2 instance role for the Cloud9 environment. This instance
        // role is powerful, allowing the participant to have unfettered access to
        // the provisioned account. This might be too broad. It's possible to
        // tighten this down, but there may be unintended consequences.
        const instanceRole = new iam.Role(this, 'WorkspaceInstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
            ],
            description: 'Workspace EC2 instance role'
        });
        instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        // During internal testing we found that Isengard account baselining
        // was attaching IAM roles to instances in the background. This prevents
        // the stack from being cleanly destroyed, so we will record the instance
        // role name and use it later to delete any attached policies before
        // cleanup.
        new cdk.CfnOutput(this, 'WorkspaceInstanceRoleName', {
            value: instanceRole.roleName
        });
        const instanceProfile = new iam.CfnInstanceProfile(this, 'WorkspaceInstanceProfile', {
            roles: [instanceRole.roleName]
        });
        // Obtain Cloud9 workspace instance ID and security group.
        const workspaceInstance = new cr.AwsCustomResource(this, 'WorkspaceInstance', {
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
            onUpdate: {
                service: 'EC2',
                action: 'describeInstances',
                physicalResourceId: cr.PhysicalResourceId.of(props.cloud9EnvironmentId),
                parameters: {
                    Filters: [
                        {
                            Name: 'tag:aws:cloud9:environment',
                            Values: [props.cloud9EnvironmentId]
                        }
                    ]
                },
                outputPaths: [
                    'Reservations.0.Instances.0.InstanceId',
                    'Reservations.0.Instances.0.NetworkInterfaces.0.Groups.0.GroupId'
                ]
            }
        });
        const instanceId = workspaceInstance.getResponseField('Reservations.0.Instances.0.InstanceId');
        const workspaceSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'WorkspaceSecurityGroup', workspaceInstance.getResponseField('Reservations.0.Instances.0.NetworkInterfaces.0.Groups.0.GroupId'));
        // This function provides a Custom Resource that detaches any existing IAM
        // instance profile that might be attached to the Cloud9 Environment, and
        // replaces it with the profile+role we created ourselves.
        const updateInstanceProfileFunction = new lambda.Function(this, 'UpdateInstanceProfileFunction', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'update-instance-profile')),
            handler: 'index.onEventHandler',
            runtime: lambda.Runtime.NODEJS_14_X
        });
        updateInstanceProfileFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ec2:DescribeIamInstanceProfileAssociations',
                'ec2:ReplaceIamInstanceProfileAssociation',
                'ec2:AssociateIamInstanceProfile',
                'iam:PassRole'
            ],
            resources: ['*'] // TODO: use specific instance ARN
        }));
        const updateInstanceProfile = new cr.Provider(this, 'UpdateInstanceProfileProvider', {
            onEventHandler: updateInstanceProfileFunction,
        });
        new cdk.CustomResource(this, 'UpdateInstanceProfile', {
            serviceToken: updateInstanceProfile.serviceToken,
            properties: {
                InstanceId: instanceId,
                InstanceProfileArn: instanceProfile.attrArn
            }
        });
        // Create an SSH key pair for logging into the K8S nodes.
        const sshKeyPair = new cr.AwsCustomResource(this, 'SSHKeyPair', {
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
            onCreate: {
                service: 'EC2',
                action: 'createKeyPair',
                physicalResourceId: cr.PhysicalResourceId.of(KeyName),
                parameters: {
                    KeyName,
                    KeyType: 'rsa'
                },
                outputPaths: [
                    'KeyName',
                    'KeyMaterial'
                ]
            },
            onDelete: {
                service: 'EC2',
                action: 'deleteKeyPair',
                parameters: {
                    KeyName,
                }
            },
        });
        const keyMaterial = sshKeyPair.getResponseField('KeyMaterial');
        const keyName = sshKeyPair.getResponseField('KeyName');
        // Create our EKS cluster.
        const cluster = new eks.Cluster(this, 'Cluster', {
            vpc,
            version: eks.KubernetesVersion.V1_21,
            clusterName: 'security-workshop',
            defaultCapacity: 0,
            mastersRole: codeBuildRole,
        });
        // The OIDC provider isn't initialized unless we access it
        cluster.openIdConnectProvider;
        // Enable cluster logging. See https://github.com/aws/aws-cdk/issues/4159
        new cr.AwsCustomResource(this, "ClusterLogsEnabler", {
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [`${cluster.clusterArn}/update-config`],
            }),
            onCreate: {
                physicalResourceId: { id: `${cluster.clusterArn}/LogsEnabler` },
                service: "EKS",
                action: "updateClusterConfig",
                region: this.region,
                parameters: {
                    name: cluster.clusterName,
                    logging: {
                        clusterLogging: [
                            {
                                enabled: true,
                                types: [
                                    "api",
                                    "audit",
                                    "authenticator",
                                    "controllerManager",
                                    "scheduler",
                                ],
                            },
                        ],
                    },
                },
            }
        });
        // Allow Cloud9 environment to make changes to the cluster.
        cluster.awsAuth.addRoleMapping(instanceRole, { groups: ['system:masters'] });
        cluster.connections.allowFrom(workspaceSecurityGroup, ec2.Port.tcp(443));
        cluster.connections.allowFrom(workspaceSecurityGroup, ec2.Port.tcp(22));
        // Create a launch template for our EKS managed nodegroup that configures
        // kubelet with a staticPodPath.
        const userData = new ec2.MultipartUserData();
        userData.addUserDataPart(ec2.UserData.forLinux());
        userData.addCommands('set -x', 'echo installing kernel-devel package so Falco eBPF module can be loaded', 'yum -y install kernel-devel', 'echo Adding staticPodPath configuration to kubelet config file', 'mkdir -p /etc/kubelet.d', 'yum -y install jq', 'jq \'.staticPodPath="/etc/kubelet.d"\' < /etc/kubernetes/kubelet/kubelet-config.json > /tmp/kubelet-config.json', 'mv /tmp/kubelet-config.json /etc/kubernetes/kubelet/kubelet-config.json', 'systemctl restart kubelet');
        const launchTemplate = new ec2.LaunchTemplate(this, 'NodeLaunchTemplate', {
            userData,
            keyName,
            blockDevices: [
                {
                    deviceName: '/dev/xvda',
                    volume: {
                        ebsDevice: {
                            volumeType: ec2.EbsDeviceVolumeType.GP3,
                            // ensure adequate room for forensics dumps
                            volumeSize: 100
                        }
                    }
                }
            ]
        });
        // Create Managed Nodegroup.
        const nodegroup = new eks.Nodegroup(this, 'ng-1', {
            cluster,
            desiredSize: 3,
            instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5A, ec2.InstanceSize.XLARGE)],
            subnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }),
            launchTemplateSpec: {
                // See https://github.com/aws/aws-cdk/issues/6734
                id: launchTemplate.node.defaultChild.ref,
                version: launchTemplate.latestVersionNumber,
            }
        });
        nodegroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        // During internal testing we found that Isengard account baselining
        // was attaching IAM roles to instances in the background. This prevents
        // the stack from being cleanly destroyed, so we will record the instance
        // role name and use it later to delete any attached policies before
        // cleanup.
        new cdk.CfnOutput(this, 'NodegroupRoleName', {
            value: nodegroup.role.roleName
        });
        // Create an S3 bucket for forensics collection.
        const forensicsBucket = new s3.Bucket(this, 'ForensicsBucket', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
            versioned: true,
            blockPublicAccess: {
                blockPublicAcls: true,
                blockPublicPolicy: true,
                ignorePublicAcls: true,
                restrictPublicBuckets: true,
            }
        });
        forensicsBucket.grantReadWrite(instanceRole);
        // Nodes also need to be able to write to the forensics bucket, since the
        // SSM RunCommand session used to capture forensic data can only do what the
        // instance itself has permission to do.
        forensicsBucket.grantWrite(nodegroup.role);
        // Since Cloud9 has the SSM agent on it, we'll take advantage of its
        // presence to prepare the instance. This includes installing kubectl,
        // setting up the kubeconfig file, and installing the SSH private key
        // into the default user's home directory. We can add more steps later
        // if we like.
        // First, allow SSM to write Run Command logs to CloudWatch Logs. This
        // will allow us to diagnose problems later.
        const runCommandRole = new iam.Role(this, 'RunCommandRole', {
            assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
        });
        const runCommandLogGroup = new logs.LogGroup(this, 'RunCommandLogs');
        runCommandLogGroup.grantWrite(runCommandRole);
        // Now, invoke RunCommand.
        new cr.AwsCustomResource(this, 'InstancePrep', {
            installLatestAwsSdk: false,
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['iam:PassRole'],
                    resources: [runCommandRole.roleArn]
                }),
                new iam.PolicyStatement({
                    actions: [
                        'ssm:SendCommand'
                    ],
                    resources: ['*']
                })
            ]),
            onUpdate: {
                service: 'SSM',
                action: 'sendCommand',
                physicalResourceId: cr.PhysicalResourceId.of(props.cloud9EnvironmentId),
                parameters: {
                    DocumentName: 'AWS-RunShellScript',
                    DocumentVersion: '$LATEST',
                    InstanceIds: [instanceId],
                    TimeoutSeconds: 30,
                    ServiceRoleArn: runCommandRole.roleArn,
                    CloudWatchOutputConfig: {
                        CloudWatchLogGroupName: runCommandLogGroup.logGroupName,
                        CloudWatchOutputEnabled: true
                    },
                    Parameters: {
                        commands: [
                            // Add commands here to taste.
                            'curl -sSL -o /tmp/kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.21.2/2021-07-05/bin/linux/amd64/kubectl',
                            'chmod +x /tmp/kubectl',
                            'mv /tmp/kubectl /usr/local/bin/kubectl',
                            `su -l -c 'aws eks update-kubeconfig --name ${cluster.clusterName} --region ${this.region} --role-arn ${instanceRole.roleArn}' ec2-user`,
                            `su -l -c 'echo "export FORENSICS_S3_BUCKET=${forensicsBucket.bucketName}" >> ~/.bash_profile' ec2-user`,
                            `su -l -c 'echo "export AWS_DEFAULT_REGION=${this.region}" >> ~/.bash_profile' ec2-user`,
                            `su -l -c 'echo "export AWS_REGION=${this.region}" >> ~/.bash_profile' ec2-user`,
                            `su -l -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh' ec2-user`,
                            // The key material isn't properly escaped, so we'll just base64-encode it first
                            `su -l -c 'echo "${cdk.Fn.base64(keyMaterial)}" | base64 -d > ~/.ssh/id_rsa' ec2-user`,
                            `su -l -c 'chmod 600 ~/.ssh/id_rsa' ec2-user`,
                            'curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp',
                            'chmod +x /tmp/eksctl',
                            'mv /tmp/eksctl /usr/local/bin',
                            'yum -y install jq gettext bash-completion moreutils',
                            '/usr/local/bin/kubectl completion bash > /etc/bash_completion.d/kubectl',
                            '/usr/local/bin/eksctl completion bash > /etc/bash_completion.d/eksctl',
                            `su -l -c 'echo "alias k=kubectl" >> ~/.bash_profile' ec2-user`,
                            `su -l -c 'echo "complete -F __start_kubectl k" >> ~/.bash_profile' ec2-user`,
                            // Install Helm
                            'curl -fsSL -o /tmp/helm.tgz https://get.helm.sh/helm-v3.7.1-linux-amd64.tar.gz',
                            'tar -C /tmp -xzf /tmp/helm.tgz',
                            'mv /tmp/linux-amd64/helm /usr/local/bin/helm',
                            'rm -rf /tmp/helm.tgz /tmp/linux-amd64',
                            // Resize volume
                            `volume_id=$(aws --region ${this.region} ec2 describe-volumes --filters Name=attachment.instance-id,Values=${instanceId} --query 'Volumes[0].VolumeId' --output text)`,
                            `aws --region ${this.region} ec2 modify-volume --volume-id $volume_id --size 30`,
                            // This must be the last line - do not add any lines after this!
                            `reboot`
                            // Do not add any lines after this!
                        ]
                    },
                },
                outputPaths: ['CommandId']
            }
        });
    }
}
exports.ClusterStack = ClusterStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2x1c3Rlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsdXN0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFDeEMsc0NBQXNDO0FBQ3RDLHdDQUF3QztBQUN4QyxnREFBZ0Q7QUFDaEQsMENBQTBDO0FBQzFDLDhDQUE4QztBQUM5Qyw2QkFBNkI7QUFHN0IsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDO0FBTzNCLE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUU5Qyw2RUFBNkU7UUFDN0UsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtZQUMxQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7U0FDbkIsQ0FBQyxDQUFDO1FBRUgseUZBQXlGO1FBQ3pGLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFMUYsd0VBQXdFO1FBQ3hFLDBFQUEwRTtRQUMxRSxxRUFBcUU7UUFDckUsK0RBQStEO1FBQy9ELE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0QsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDO1lBQ3hELGVBQWUsRUFBRTtnQkFDZixHQUFH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QUNGO2lCQUNGO2dCQUNELFdBQVcsRUFBRSxDQUFDLFdBQVcsQ0FBQzthQUMzQjtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXBWRCxvQ0FvVkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBla3MgZnJvbSAnQGF3cy1jZGsvYXdzLWVrcyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnQGF3cy1jZGsvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdAYXdzLWNkay9hd3MtczMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnQGF3cy1jZGsvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ0Bhd3MtY2RrL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdAYXdzLWNkay9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB5YW1sIGZyb20gJ2pzLXlhbWwnO1xuXG5jb25zdCBLZXlOYW1lID0gJ3dvcmtzaG9wJztcblxuZXhwb3J0IGludGVyZmFjZSBDbHVzdGVyU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgdnBjSWQ6IHN0cmluZ1xuICBjbG91ZDlFbnZpcm9ubWVudElkOiBzdHJpbmdcbiAgY29kZUJ1aWxkUm9sZUFybjogc3RyaW5nXG59XG5leHBvcnQgY2xhc3MgQ2x1c3RlclN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBDbHVzdGVyU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gVGFnIHRoZSBzdGFjayBhbmQgaXRzIHJlc291cmNlcy5cbiAgICB0aGlzLnRhZ3Muc2V0VGFnKCdTdGFja05hbWUnLCAnQ2x1c3RlclN0YWNrJyk7XG5cbiAgICAvLyBUaGUgVlBDIElEIGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgZnJvbSB0aGUgVlBDX0lEIGVudmlyb25tZW50IHZhcmlhYmxlLlxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IHByb3BzLnZwY0lkXG4gICAgfSk7XG5cbiAgICAvLyBDb2RlQnVpbGQgcm9sZSBpcyBzdXBwbGllZCBieSB0aGUgY2FsbGVyIGZyb20gdGhlIEJVSUxEX1JPTEVfQVJOIGVudmlyb25tZW50IHZhcmlhYmxlLlxuICAgIGNvbnN0IGNvZGVCdWlsZFJvbGUgPSBpYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnQ29kZUJ1aWxkUm9sZScsIHByb3BzLmNvZGVCdWlsZFJvbGVBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIGFuIEVDMiBpbnN0YW5jZSByb2xlIGZvciB0aGUgQ2xvdWQ5IGVudmlyb25tZW50LiBUaGlzIGluc3RhbmNlXG4gICAgLy8gcm9sZSBpcyBwb3dlcmZ1bCwgYWxsb3dpbmcgdGhlIHBhcnRpY2lwYW50IHRvIGhhdmUgdW5mZXR0ZXJlZCBhY2Nlc3MgdG9cbiAgICAvLyB0aGUgcHJvdmlzaW9uZWQgYWNjb3VudC4gVGhpcyBtaWdodCBiZSB0b28gYnJvYWQuIEl0J3MgcG9zc2libGUgdG9cbiAgICAvLyB0aWdodGVuIHRoaXMgZG93biwgYnV0IHRoZXJlIG1heSBiZSB1bmludGVuZGVkIGNvbnNlcXVlbmNlcy5cbiAgICBjb25zdCBpbnN0YW5jZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlYzIuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQWRtaW5pc3RyYXRvckFjY2VzcycpXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246ICdXb3Jrc3BhY2UgRUMyIGluc3RhbmNlIHJvbGUnXG4gICAgfSk7XG4gICAgaW5zdGFuY2VSb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJykpO1xuXG4gICAgLy8gRHVyaW5nIGludGVybmFsIHRlc3Rpbmcgd2UgZm91bmQgdGhhdCBJc2VuZ2FyZCBhY2NvdW50IGJhc2VsaW5pbmdcbiAgICAvLyB3YXMgYXR0YWNoaW5nIElBTSByb2xlcyB0byBpbnN0YW5jZXMgaW4gdGhlIGJhY2tncm91bmQuIFRoaXMgcHJldmVudHNcbiAgICAvLyB0aGUgc3RhY2sgZnJvbSBiZWluZyBjbGVhbmx5IGRlc3Ryb3llZCwgc28gd2Ugd2lsbCByZWNvcmQgdGhlIGluc3RhbmNlXG4gICAgLy8gcm9sZSBuYW1lIGFuZCB1c2UgaXQgbGF0ZXIgdG8gZGVsZXRlIGFueSBhdHRhY2hlZCBwb2xpY2llcyBiZWZvcmVcbiAgICAvLyBjbGVhbnVwLlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IGluc3RhbmNlUm9sZS5yb2xlTmFtZVxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5DZm5JbnN0YW5jZVByb2ZpbGUodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgIHJvbGVzOiBbaW5zdGFuY2VSb2xlLnJvbGVOYW1lXVxuICAgIH0pO1xuXG4gICAgLy8gT2J0YWluIENsb3VkOSB3b3Jrc3BhY2UgaW5zdGFuY2UgSUQgYW5kIHNlY3VyaXR5IGdyb3VwLlxuICAgIGNvbnN0IHdvcmtzcGFjZUluc3RhbmNlID0gbmV3IGNyLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZScsIHtcbiAgICAgIHBvbGljeTogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgcmVzb3VyY2VzOiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5BTllfUkVTT1VSQ0UsXG4gICAgICB9KSxcbiAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdFQzInLFxuICAgICAgICBhY3Rpb246ICdkZXNjcmliZUluc3RhbmNlcycsXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKHByb3BzLmNsb3VkOUVudmlyb25tZW50SWQpLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgRmlsdGVyczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBOYW1lOiAndGFnOmF3czpjbG91ZDk6ZW52aXJvbm1lbnQnLFxuICAgICAgICAgICAgICBWYWx1ZXM6IFtwcm9wcy5jbG91ZDlFbnZpcm9ubWVudElkXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgb3V0cHV0UGF0aHM6IFtcbiAgICAgICAgICAnUmVzZXJ2YXRpb25zLjAuSW5zdGFuY2VzLjAuSW5zdGFuY2VJZCcsXG4gICAgICAgICAgJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLk5ldHdvcmtJbnRlcmZhY2VzLjAuR3JvdXBzLjAuR3JvdXBJZCdcbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGluc3RhbmNlSWQgPSB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5JbnN0YW5jZUlkJyk7XG5cbiAgICBjb25zdCB3b3Jrc3BhY2VTZWN1cml0eUdyb3VwID0gZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZChcbiAgICAgIHRoaXMsICdXb3Jrc3BhY2VTZWN1cml0eUdyb3VwJyxcbiAgICAgIHdvcmtzcGFjZUluc3RhbmNlLmdldFJlc3BvbnNlRmllbGQoJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLk5ldHdvcmtJbnRlcmZhY2VzLjAuR3JvdXBzLjAuR3JvdXBJZCcpKTtcblxuXG4gICAgLy8gVGhpcyBmdW5jdGlvbiBwcm92aWRlcyBhIEN1c3RvbSBSZXNvdXJjZSB0aGF0IGRldGFjaGVzIGFueSBleGlzdGluZyBJQU1cbiAgICAvLyBpbnN0YW5jZSBwcm9maWxlIHRoYXQgbWlnaHQgYmUgYXR0YWNoZWQgdG8gdGhlIENsb3VkOSBFbnZpcm9ubWVudCwgYW5kXG4gICAgLy8gcmVwbGFjZXMgaXQgd2l0aCB0aGUgcHJvZmlsZStyb2xlIHdlIGNyZWF0ZWQgb3Vyc2VsdmVzLlxuICAgIGNvbnN0IHVwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJ3VwZGF0ZS1pbnN0YW5jZS1wcm9maWxlJykpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4Lm9uRXZlbnRIYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YXG4gICAgfSk7XG4gICAgdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2VjMjpEZXNjcmliZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9ucycsXG4gICAgICAgICdlYzI6UmVwbGFjZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9uJyxcbiAgICAgICAgJ2VjMjpBc3NvY2lhdGVJYW1JbnN0YW5jZVByb2ZpbGUnLFxuICAgICAgICAnaWFtOlBhc3NSb2xlJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogWycqJ10gLy8gVE9ETzogdXNlIHNwZWNpZmljIGluc3RhbmNlIEFSTlxuICAgIH0pKTtcblxuICAgIGNvbnN0IHVwZGF0ZUluc3RhbmNlUHJvZmlsZSA9IG5ldyBjci5Qcm92aWRlcih0aGlzLCAnVXBkYXRlSW5zdGFuY2VQcm9maWxlUHJvdmlkZXInLCB7XG4gICAgICBvbkV2ZW50SGFuZGxlcjogdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24sXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdVcGRhdGVJbnN0YW5jZVByb2ZpbGUnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHVwZGF0ZUluc3RhbmNlUHJvZmlsZS5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEluc3RhbmNlSWQ6IGluc3RhbmNlSWQsXG4gICAgICAgIEluc3RhbmNlUHJvZmlsZUFybjogaW5zdGFuY2VQcm9maWxlLmF0dHJBcm5cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhbiBTU0gga2V5IHBhaXIgZm9yIGxvZ2dpbmcgaW50byB0aGUgSzhTIG5vZGVzLlxuICAgIGNvbnN0IHNzaEtleVBhaXIgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1NTSEtleVBhaXInLCB7XG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgIHJlc291cmNlczogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuQU5ZX1JFU09VUkNFLFxuICAgICAgfSksXG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlS2V5UGFpcicsXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKEtleU5hbWUpLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgS2V5TmFtZSxcbiAgICAgICAgICBLZXlUeXBlOiAncnNhJ1xuICAgICAgICB9LFxuICAgICAgICBvdXRwdXRQYXRoczogW1xuICAgICAgICAgICdLZXlOYW1lJyxcbiAgICAgICAgICAnS2V5TWF0ZXJpYWwnXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBvbkRlbGV0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgYWN0aW9uOiAnZGVsZXRlS2V5UGFpcicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBLZXlOYW1lLFxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qga2V5TWF0ZXJpYWwgPSBzc2hLZXlQYWlyLmdldFJlc3BvbnNlRmllbGQoJ0tleU1hdGVyaWFsJyk7XG4gICAgY29uc3Qga2V5TmFtZSA9IHNzaEtleVBhaXIuZ2V0UmVzcG9uc2VGaWVsZCgnS2V5TmFtZScpO1xuXG5cbiAgICAvLyBDcmVhdGUgb3VyIEVLUyBjbHVzdGVyLlxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWtzLkNsdXN0ZXIodGhpcywgJ0NsdXN0ZXInLCB7XG4gICAgICB2cGMsXG4gICAgICB2ZXJzaW9uOiBla3MuS3ViZXJuZXRlc1ZlcnNpb24uVjFfMjEsXG4gICAgICBjbHVzdGVyTmFtZTogJ3NlY3VyaXR5LXdvcmtzaG9wJyxcbiAgICAgIGRlZmF1bHRDYXBhY2l0eTogMCxcbiAgICAgIG1hc3RlcnNSb2xlOiBjb2RlQnVpbGRSb2xlLFxuICAgIH0pO1xuXG4gICAgLy8gVGhlIE9JREMgcHJvdmlkZXIgaXNuJ3QgaW5pdGlhbGl6ZWQgdW5sZXNzIHdlIGFjY2VzcyBpdFxuICAgIGNsdXN0ZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyO1xuXG4gICAgLy8gRW5hYmxlIGNsdXN0ZXIgbG9nZ2luZy4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvNDE1OVxuICAgIG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCBcIkNsdXN0ZXJMb2dzRW5hYmxlclwiLCB7XG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgIHJlc291cmNlczogW2Ake2NsdXN0ZXIuY2x1c3RlckFybn0vdXBkYXRlLWNvbmZpZ2BdLFxuICAgICAgfSksXG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IHsgaWQ6IGAke2NsdXN0ZXIuY2x1c3RlckFybn0vTG9nc0VuYWJsZXJgIH0sXG4gICAgICAgIHNlcnZpY2U6IFwiRUtTXCIsXG4gICAgICAgIGFjdGlvbjogXCJ1cGRhdGVDbHVzdGVyQ29uZmlnXCIsXG4gICAgICAgIHJlZ2lvbjogdGhpcy5yZWdpb24sXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBuYW1lOiBjbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgICAgIGxvZ2dpbmc6IHtcbiAgICAgICAgICAgIGNsdXN0ZXJMb2dnaW5nOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICAgIHR5cGVzOiBbXG4gICAgICAgICAgICAgICAgICBcImFwaVwiLFxuICAgICAgICAgICAgICAgICAgXCJhdWRpdFwiLFxuICAgICAgICAgICAgICAgICAgXCJhdXRoZW50aWNhdG9yXCIsXG4gICAgICAgICAgICAgICAgICBcImNvbnRyb2xsZXJNYW5hZ2VyXCIsXG4gICAgICAgICAgICAgICAgICBcInNjaGVkdWxlclwiLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBDbG91ZDkgZW52aXJvbm1lbnQgdG8gbWFrZSBjaGFuZ2VzIHRvIHRoZSBjbHVzdGVyLlxuICAgIGNsdXN0ZXIuYXdzQXV0aC5hZGRSb2xlTWFwcGluZyhpbnN0YW5jZVJvbGUsIHsgZ3JvdXBzOiBbJ3N5c3RlbTptYXN0ZXJzJ10gfSk7XG5cbiAgICBjbHVzdGVyLmNvbm5lY3Rpb25zLmFsbG93RnJvbSh3b3Jrc3BhY2VTZWN1cml0eUdyb3VwLCBlYzIuUG9ydC50Y3AoNDQzKSk7XG4gICAgY2x1c3Rlci5jb25uZWN0aW9ucy5hbGxvd0Zyb20od29ya3NwYWNlU2VjdXJpdHlHcm91cCwgZWMyLlBvcnQudGNwKDIyKSk7XG5cbiAgICAvLyBDcmVhdGUgYSBsYXVuY2ggdGVtcGxhdGUgZm9yIG91ciBFS1MgbWFuYWdlZCBub2RlZ3JvdXAgdGhhdCBjb25maWd1cmVzXG4gICAgLy8ga3ViZWxldCB3aXRoIGEgc3RhdGljUG9kUGF0aC5cbiAgICBjb25zdCB1c2VyRGF0YSA9IG5ldyBlYzIuTXVsdGlwYXJ0VXNlckRhdGEoKTtcbiAgICB1c2VyRGF0YS5hZGRVc2VyRGF0YVBhcnQoZWMyLlVzZXJEYXRhLmZvckxpbnV4KCkpO1xuICAgIHVzZXJEYXRhLmFkZENvbW1hbmRzKFxuICAgICAgJ3NldCAteCcsXG4gICAgICAnZWNobyBpbnN0YWxsaW5nIGtlcm5lbC1kZXZlbCBwYWNrYWdlIHNvIEZhbGNvIGVCUEYgbW9kdWxlIGNhbiBiZSBsb2FkZWQnLFxuICAgICAgJ3l1bSAteSBpbnN0YWxsIGtlcm5lbC1kZXZlbCcsXG4gICAgICAnZWNobyBBZGRpbmcgc3RhdGljUG9kUGF0aCBjb25maWd1cmF0aW9uIHRvIGt1YmVsZXQgY29uZmlnIGZpbGUnLFxuICAgICAgJ21rZGlyIC1wIC9ldGMva3ViZWxldC5kJyxcbiAgICAgICd5dW0gLXkgaW5zdGFsbCBqcScsXG4gICAgICAnanEgXFwnLnN0YXRpY1BvZFBhdGg9XCIvZXRjL2t1YmVsZXQuZFwiXFwnIDwgL2V0Yy9rdWJlcm5ldGVzL2t1YmVsZXQva3ViZWxldC1jb25maWcuanNvbiA+IC90bXAva3ViZWxldC1jb25maWcuanNvbicsXG4gICAgICAnbXYgL3RtcC9rdWJlbGV0LWNvbmZpZy5qc29uIC9ldGMva3ViZXJuZXRlcy9rdWJlbGV0L2t1YmVsZXQtY29uZmlnLmpzb24nLFxuICAgICAgJ3N5c3RlbWN0bCByZXN0YXJ0IGt1YmVsZXQnXG4gICAgKTtcblxuICAgIGNvbnN0IGxhdW5jaFRlbXBsYXRlID0gbmV3IGVjMi5MYXVuY2hUZW1wbGF0ZSh0aGlzLCAnTm9kZUxhdW5jaFRlbXBsYXRlJywge1xuICAgICAgdXNlckRhdGEsXG4gICAgICBrZXlOYW1lLFxuICAgICAgYmxvY2tEZXZpY2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBkZXZpY2VOYW1lOiAnL2Rldi94dmRhJyxcbiAgICAgICAgICB2b2x1bWU6IHtcbiAgICAgICAgICAgIGVic0RldmljZToge1xuICAgICAgICAgICAgICB2b2x1bWVUeXBlOiBlYzIuRWJzRGV2aWNlVm9sdW1lVHlwZS5HUDMsXG4gICAgICAgICAgICAgIC8vIGVuc3VyZSBhZGVxdWF0ZSByb29tIGZvciBmb3JlbnNpY3MgZHVtcHNcbiAgICAgICAgICAgICAgdm9sdW1lU2l6ZTogMTAwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTWFuYWdlZCBOb2RlZ3JvdXAuXG4gICAgY29uc3Qgbm9kZWdyb3VwID0gbmV3IGVrcy5Ob2RlZ3JvdXAodGhpcywgJ25nLTEnLCB7XG4gICAgICBjbHVzdGVyLFxuICAgICAgZGVzaXJlZFNpemU6IDMsXG4gICAgICBpbnN0YW5jZVR5cGVzOiBbZWMyLkluc3RhbmNlVHlwZS5vZihlYzIuSW5zdGFuY2VDbGFzcy5NNUEsIGVjMi5JbnN0YW5jZVNpemUuWExBUkdFKV0sXG4gICAgICBzdWJuZXRzOiB2cGMuc2VsZWN0U3VibmV0cyh7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9OQVQgfSksXG4gICAgICBsYXVuY2hUZW1wbGF0ZVNwZWM6IHtcbiAgICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvNjczNFxuICAgICAgICBpZDogKGxhdW5jaFRlbXBsYXRlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGVjMi5DZm5MYXVuY2hUZW1wbGF0ZSkucmVmLFxuICAgICAgICB2ZXJzaW9uOiBsYXVuY2hUZW1wbGF0ZS5sYXRlc3RWZXJzaW9uTnVtYmVyLFxuICAgICAgfVxuICAgIH0pO1xuICAgIG5vZGVncm91cC5yb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJykpO1xuXG4gICAgLy8gRHVyaW5nIGludGVybmFsIHRlc3Rpbmcgd2UgZm91bmQgdGhhdCBJc2VuZ2FyZCBhY2NvdW50IGJhc2VsaW5pbmdcbiAgICAvLyB3YXMgYXR0YWNoaW5nIElBTSByb2xlcyB0byBpbnN0YW5jZXMgaW4gdGhlIGJhY2tncm91bmQuIFRoaXMgcHJldmVudHNcbiAgICAvLyB0aGUgc3RhY2sgZnJvbSBiZWluZyBjbGVhbmx5IGRlc3Ryb3llZCwgc28gd2Ugd2lsbCByZWNvcmQgdGhlIGluc3RhbmNlXG4gICAgLy8gcm9sZSBuYW1lIGFuZCB1c2UgaXQgbGF0ZXIgdG8gZGVsZXRlIGFueSBhdHRhY2hlZCBwb2xpY2llcyBiZWZvcmVcbiAgICAvLyBjbGVhbnVwLlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOb2RlZ3JvdXBSb2xlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBub2RlZ3JvdXAucm9sZS5yb2xlTmFtZVxuICAgIH0pO1xuXG5cbiAgICAvLyBDcmVhdGUgYW4gUzMgYnVja2V0IGZvciBmb3JlbnNpY3MgY29sbGVjdGlvbi5cbiAgICBjb25zdCBmb3JlbnNpY3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdGb3JlbnNpY3NCdWNrZXQnLCB7XG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgb2JqZWN0T3duZXJzaGlwOiBzMy5PYmplY3RPd25lcnNoaXAuQlVDS0VUX09XTkVSX1BSRUZFUlJFRCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiB7XG4gICAgICAgIGJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgYmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgIGlnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIHJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgIH1cbiAgICB9KTtcbiAgICBmb3JlbnNpY3NCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoaW5zdGFuY2VSb2xlKTtcblxuICAgIC8vIE5vZGVzIGFsc28gbmVlZCB0byBiZSBhYmxlIHRvIHdyaXRlIHRvIHRoZSBmb3JlbnNpY3MgYnVja2V0LCBzaW5jZSB0aGVcbiAgICAvLyBTU00gUnVuQ29tbWFuZCBzZXNzaW9uIHVzZWQgdG8gY2FwdHVyZSBmb3JlbnNpYyBkYXRhIGNhbiBvbmx5IGRvIHdoYXQgdGhlXG4gICAgLy8gaW5zdGFuY2UgaXRzZWxmIGhhcyBwZXJtaXNzaW9uIHRvIGRvLlxuICAgIGZvcmVuc2ljc0J1Y2tldC5ncmFudFdyaXRlKG5vZGVncm91cC5yb2xlKTtcblxuICAgIC8vIFNpbmNlIENsb3VkOSBoYXMgdGhlIFNTTSBhZ2VudCBvbiBpdCwgd2UnbGwgdGFrZSBhZHZhbnRhZ2Ugb2YgaXRzXG4gICAgLy8gcHJlc2VuY2UgdG8gcHJlcGFyZSB0aGUgaW5zdGFuY2UuIFRoaXMgaW5jbHVkZXMgaW5zdGFsbGluZyBrdWJlY3RsLFxuICAgIC8vIHNldHRpbmcgdXAgdGhlIGt1YmVjb25maWcgZmlsZSwgYW5kIGluc3RhbGxpbmcgdGhlIFNTSCBwcml2YXRlIGtleVxuICAgIC8vIGludG8gdGhlIGRlZmF1bHQgdXNlcidzIGhvbWUgZGlyZWN0b3J5LiBXZSBjYW4gYWRkIG1vcmUgc3RlcHMgbGF0ZXJcbiAgICAvLyBpZiB3ZSBsaWtlLlxuXG4gICAgLy8gRmlyc3QsIGFsbG93IFNTTSB0byB3cml0ZSBSdW4gQ29tbWFuZCBsb2dzIHRvIENsb3VkV2F0Y2ggTG9ncy4gVGhpc1xuICAgIC8vIHdpbGwgYWxsb3cgdXMgdG8gZGlhZ25vc2UgcHJvYmxlbXMgbGF0ZXIuXG4gICAgY29uc3QgcnVuQ29tbWFuZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1J1bkNvbW1hbmRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3NzbS5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG4gICAgY29uc3QgcnVuQ29tbWFuZExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1J1bkNvbW1hbmRMb2dzJyk7XG4gICAgcnVuQ29tbWFuZExvZ0dyb3VwLmdyYW50V3JpdGUocnVuQ29tbWFuZFJvbGUpO1xuXG4gICAgLy8gTm93LCBpbnZva2UgUnVuQ29tbWFuZC5cbiAgICBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0luc3RhbmNlUHJlcCcsIHtcbiAgICAgIGluc3RhbGxMYXRlc3RBd3NTZGs6IGZhbHNlLFxuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU3RhdGVtZW50cyhbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgICAgIHJlc291cmNlczogW3J1bkNvbW1hbmRSb2xlLnJvbGVBcm5dXG4gICAgICAgIH0pLFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ3NzbTpTZW5kQ29tbWFuZCdcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgfSlcbiAgICAgIF0pLFxuICAgICAgb25VcGRhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ3NlbmRDb21tYW5kJyxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YocHJvcHMuY2xvdWQ5RW52aXJvbm1lbnRJZCksXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBEb2N1bWVudE5hbWU6ICdBV1MtUnVuU2hlbGxTY3JpcHQnLFxuICAgICAgICAgIERvY3VtZW50VmVyc2lvbjogJyRMQVRFU1QnLFxuICAgICAgICAgIEluc3RhbmNlSWRzOiBbaW5zdGFuY2VJZF0sXG4gICAgICAgICAgVGltZW91dFNlY29uZHM6IDMwLFxuICAgICAgICAgIFNlcnZpY2VSb2xlQXJuOiBydW5Db21tYW5kUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIENsb3VkV2F0Y2hPdXRwdXRDb25maWc6IHtcbiAgICAgICAgICAgIENsb3VkV2F0Y2hMb2dHcm91cE5hbWU6IHJ1bkNvbW1hbmRMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICAgICAgICBDbG91ZFdhdGNoT3V0cHV0RW5hYmxlZDogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgLy8gQWRkIGNvbW1hbmRzIGhlcmUgdG8gdGFzdGUuXG4gICAgICAgICAgICAgICdjdXJsIC1zU0wgLW8gL3RtcC9rdWJlY3RsIGh0dHBzOi8vYW1hem9uLWVrcy5zMy51cy13ZXN0LTIuYW1hem9uYXdzLmNvbS8xLjIxLjIvMjAyMS0wNy0wNS9iaW4vbGludXgvYW1kNjQva3ViZWN0bCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnbXYgL3RtcC9rdWJlY3RsIC91c3IvbG9jYWwvYmluL2t1YmVjdGwnLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2F3cyBla3MgdXBkYXRlLWt1YmVjb25maWcgLS1uYW1lICR7Y2x1c3Rlci5jbHVzdGVyTmFtZX0gLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1yb2xlLWFybiAke2luc3RhbmNlUm9sZS5yb2xlQXJufScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJleHBvcnQgRk9SRU5TSUNTX1MzX0JVQ0tFVD0ke2ZvcmVuc2ljc0J1Y2tldC5idWNrZXROYW1lfVwiID4+IH4vLmJhc2hfcHJvZmlsZScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJleHBvcnQgQVdTX0RFRkFVTFRfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImV4cG9ydCBBV1NfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnbWtkaXIgLXAgfi8uc3NoICYmIGNobW9kIDcwMCB+Ly5zc2gnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgLy8gVGhlIGtleSBtYXRlcmlhbCBpc24ndCBwcm9wZXJseSBlc2NhcGVkLCBzbyB3ZSdsbCBqdXN0IGJhc2U2NC1lbmNvZGUgaXQgZmlyc3RcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiJHtjZGsuRm4uYmFzZTY0KGtleU1hdGVyaWFsKX1cIiB8IGJhc2U2NCAtZCA+IH4vLnNzaC9pZF9yc2EnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdjaG1vZCA2MDAgfi8uc3NoL2lkX3JzYScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICAnY3VybCAtLXNpbGVudCAtLWxvY2F0aW9uIFwiaHR0cHM6Ly9naXRodWIuY29tL3dlYXZld29ya3MvZWtzY3RsL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9la3NjdGxfJCh1bmFtZSAtcylfYW1kNjQudGFyLmd6XCIgfCB0YXIgeHogLUMgL3RtcCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2Vrc2N0bCcsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2Vrc2N0bCAvdXNyL2xvY2FsL2JpbicsXG4gICAgICAgICAgICAgICd5dW0gLXkgaW5zdGFsbCBqcSBnZXR0ZXh0IGJhc2gtY29tcGxldGlvbiBtb3JldXRpbHMnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4va3ViZWN0bCBjb21wbGV0aW9uIGJhc2ggPiAvZXRjL2Jhc2hfY29tcGxldGlvbi5kL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4vZWtzY3RsIGNvbXBsZXRpb24gYmFzaCA+IC9ldGMvYmFzaF9jb21wbGV0aW9uLmQvZWtzY3RsJyxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiYWxpYXMgaz1rdWJlY3RsXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImNvbXBsZXRlIC1GIF9fc3RhcnRfa3ViZWN0bCBrXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIC8vIEluc3RhbGwgSGVsbVxuICAgICAgICAgICAgICAnY3VybCAtZnNTTCAtbyAvdG1wL2hlbG0udGd6IGh0dHBzOi8vZ2V0LmhlbG0uc2gvaGVsbS12My43LjEtbGludXgtYW1kNjQudGFyLmd6JyxcbiAgICAgICAgICAgICAgJ3RhciAtQyAvdG1wIC14emYgL3RtcC9oZWxtLnRneicsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2xpbnV4LWFtZDY0L2hlbG0gL3Vzci9sb2NhbC9iaW4vaGVsbScsXG4gICAgICAgICAgICAgICdybSAtcmYgL3RtcC9oZWxtLnRneiAvdG1wL2xpbnV4LWFtZDY0JyxcbiAgICAgICAgICAgICAgLy8gUmVzaXplIHZvbHVtZVxuICAgICAgICAgICAgICBgdm9sdW1lX2lkPSQoYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBkZXNjcmliZS12b2x1bWVzIC0tZmlsdGVycyBOYW1lPWF0dGFjaG1lbnQuaW5zdGFuY2UtaWQsVmFsdWVzPSR7aW5zdGFuY2VJZH0gLS1xdWVyeSAnVm9sdW1lc1swXS5Wb2x1bWVJZCcgLS1vdXRwdXQgdGV4dClgLFxuICAgICAgICAgICAgICBgYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBtb2RpZnktdm9sdW1lIC0tdm9sdW1lLWlkICR2b2x1bWVfaWQgLS1zaXplIDMwYCxcbiAgICAgICAgICAgICAgLy8gVGhpcyBtdXN0IGJlIHRoZSBsYXN0IGxpbmUgLSBkbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgICBgcmVib290YFxuICAgICAgICAgICAgICAvLyBEbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG91dHB1dFBhdGhzOiBbJ0NvbW1hbmRJZCddXG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==