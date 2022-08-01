"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EksStack = void 0;
const core_1 = require("@aws-cdk/core");
const cdk = require("@aws-cdk/core");
const eks = require("@aws-cdk/aws-eks");
const ec2 = require("@aws-cdk/aws-ec2");
const iam = require("@aws-cdk/aws-iam");
const cr = require("@aws-cdk/custom-resources");
const logs = require("@aws-cdk/aws-logs");
const lambda = require("@aws-cdk/aws-lambda");
const path = require("path");
const KeyName = 'workshop';
class EksStack extends core_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Tag the stack and its resources.
        this.tags.setTag('StackName', 'EksStack');
        // The VPC ID is supplied by the caller from the VPC_ID environment variable.
        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: props.vpcId
        });
        // CodeBuild role is supplied by the caller from the BUILD_ROLE_ARN environment variable.
        this.codeBuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);
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
        new core_1.CfnOutput(this, 'WorkspaceInstanceRoleName', {
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
            clusterName: 'eksworkshop-eksctl',
            defaultCapacity: 0,
            mastersRole: this.codeBuildRole,
        });
        // The OIDC provider isn't initialized unless we access it
        cluster.openIdConnectProvider;
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
        const role = nodegroup.role;
        /* Need to figure this out - TBD - RANJITH!!!!!!
        Error on document not being able to be assigned to PolicyDocument type.
    
        role?.attachInlinePolicy(new iam.Policy(this, 'saas-inline-policy', {
          document: nodeRolePolicyDoc,
        })
        );
        */
        this.nodeGroupRole = role;
        new core_1.CfnOutput(this, 'NodegroupRoleName', {
            value: nodegroup.role.roleName
        });
        //Create Ingress
        const ingressControllerReleaseName = 'controller';
        const ingressChart = cluster.addHelmChart('IngressController', {
            chart: 'nginx-ingress',
            repository: 'https://helm.nginx.com/stable',
            release: ingressControllerReleaseName,
            values: {
                controller: {
                    publishService: {
                        enabled: true,
                    },
                    service: {
                        annotations: {
                            'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
                            'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'http',
                            'service.beta.kubernetes.io/aws-load-balancer-ssl-ports': '443',
                            'service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout': '3600',
                        },
                        targetPorts: {
                            https: 'http',
                        },
                    },
                },
            },
        });
        const albAddress = new eks.KubernetesObjectValue(this, 'elbAddress', {
            cluster,
            objectType: 'Service',
            objectName: `${ingressControllerReleaseName}-nginx-ingress`,
            jsonPath: '.status.loadBalancer.ingress[0].hostname',
        });
        const masterIngress = cluster.addManifest('masterIngressResource', {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: {
                name: 'workshop-ingress-master',
                annotations: {
                    'kubernetes.io/ingress.class': 'nginx',
                    'nginx.org/mergeable-ingress-type': 'master',
                },
            },
            spec: {
                rules: [
                    {
                        host: albAddress.value,
                    },
                ],
            },
        });
        masterIngress.node.addDependency(ingressChart);
        this.elbUrl = albAddress.value;
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
        const dynamoDbDoc = new iam.PolicyDocument({
            assignSids: false,
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'dynamodb:GetItem',
                        'dynamodb:PutItem',
                        'dynamodb:BatchGetItem',
                        'dynamodb:Query',
                        'dynamodb:Scan',
                        'dynamodb:DescribeTable',
                    ],
                    resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*`],
                }),
            ],
        });
        const roleUsedByTokenVendingMachine = new iam.Role(this, 'DynamicAssumeRole', {
            assumedBy: this.nodeGroupRole,
            inlinePolicies: {
                dynamoPolicy: dynamoDbDoc,
            },
        });
        new core_1.CfnOutput(this, 'ELBURL', { value: this.elbUrl });
        new core_1.CfnOutput(this, 'EksCodebuildArn', { value: this.codeBuildRole.roleArn });
        new core_1.CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });
    }
}
exports.EksStack = EksStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWtzLXN0YWNrLWJhY2t1cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVrcy1zdGFjay1iYWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsd0NBQW1GO0FBQ25GLHFDQUFxQztBQUVyQyx3Q0FBd0M7QUFDeEMsd0NBQXdDO0FBRXhDLHdDQUF3QztBQUN4QyxnREFBZ0Q7QUFDaEQsMENBQTBDO0FBQzFDLDhDQUE4QztBQUM5Qyw2QkFBNkI7QUFFN0IsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDO0FBTzNCLE1BQWEsUUFBUyxTQUFRLGtCQUFXO0lBS3ZDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUUxQyw2RUFBNkU7UUFDN0UsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtZQUMxQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7U0FDbkIsQ0FBQyxDQUFDO1FBRUgseUZBQXlGO1FBQ3hGLElBQUksQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUxRix3RUFBd0U7UUFDeEUsMEVBQTBFO1FBQzFFLHFFQUFxRTtRQUNyRSwrREFBK0Q7UUFDL0QsTUFBTSxZQUFZLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7WUFDeEQsZUFBZSxFQUFFO2dCQUNmLEdB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ZWRTdGFjaywgTmVzdGVkU3RhY2tQcm9wcywgQ29uc3RydWN0LCBDZm5PdXRwdXR9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuXG5pbXBvcnQgKiBhcyBla3MgZnJvbSAnQGF3cy1jZGsvYXdzLWVrcyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnQGF3cy1jZGsvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdAYXdzLWNkay9hd3MtczMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnQGF3cy1jZGsvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ0Bhd3MtY2RrL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdAYXdzLWNkay9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmNvbnN0IEtleU5hbWUgPSAnd29ya3Nob3AnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVrc1N0YWNrUHJvcHMgZXh0ZW5kcyBOZXN0ZWRTdGFja1Byb3BzIHtcbiAgdnBjSWQ6IHN0cmluZ1xuICBjbG91ZDlFbnZpcm9ubWVudElkOiBzdHJpbmdcbiAgY29kZUJ1aWxkUm9sZUFybjogc3RyaW5nXG59XG5leHBvcnQgY2xhc3MgRWtzU3RhY2sgZXh0ZW5kcyBOZXN0ZWRTdGFjayB7XG4gIGVsYlVybDogc3RyaW5nO1xuICBub2RlR3JvdXBSb2xlOiBpYW0uSVJvbGU7XG4gIGNvZGVCdWlsZFJvbGU6IGlhbS5JUm9sZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRWtzU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gVGFnIHRoZSBzdGFjayBhbmQgaXRzIHJlc291cmNlcy5cbiAgICB0aGlzLnRhZ3Muc2V0VGFnKCdTdGFja05hbWUnLCAnRWtzU3RhY2snKTtcblxuICAgIC8vIFRoZSBWUEMgSUQgaXMgc3VwcGxpZWQgYnkgdGhlIGNhbGxlciBmcm9tIHRoZSBWUENfSUQgZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tTG9va3VwKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogcHJvcHMudnBjSWRcbiAgICB9KTtcblxuICAgIC8vIENvZGVCdWlsZCByb2xlIGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgZnJvbSB0aGUgQlVJTERfUk9MRV9BUk4gZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAgIHRoaXMuY29kZUJ1aWxkUm9sZSA9IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdDb2RlQnVpbGRSb2xlJywgcHJvcHMuY29kZUJ1aWxkUm9sZUFybik7XG5cbiAgICAvLyBDcmVhdGUgYW4gRUMyIGluc3RhbmNlIHJvbGUgZm9yIHRoZSBDbG91ZDkgZW52aXJvbm1lbnQuIFRoaXMgaW5zdGFuY2VcbiAgICAvLyByb2xlIGlzIHBvd2VyZnVsLCBhbGxvd2luZyB0aGUgcGFydGljaXBhbnQgdG8gaGF2ZSB1bmZldHRlcmVkIGFjY2VzcyB0b1xuICAgIC8vIHRoZSBwcm92aXNpb25lZCBhY2NvdW50LiBUaGlzIG1pZ2h0IGJlIHRvbyBicm9hZC4gSXQncyBwb3NzaWJsZSB0b1xuICAgIC8vIHRpZ2h0ZW4gdGhpcyBkb3duLCBidXQgdGhlcmUgbWF5IGJlIHVuaW50ZW5kZWQgY29uc2VxdWVuY2VzLlxuICAgIGNvbnN0IGluc3RhbmNlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya3NwYWNlSW5zdGFuY2VSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzJylcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBFQzIgaW5zdGFuY2Ugcm9sZSdcbiAgICB9KTtcbiAgICBpbnN0YW5jZVJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG5cbiAgICAvLyBEdXJpbmcgaW50ZXJuYWwgdGVzdGluZyB3ZSBmb3VuZCB0aGF0IElzZW5nYXJkIGFjY291bnQgYmFzZWxpbmluZ1xuICAgIC8vIHdhcyBhdHRhY2hpbmcgSUFNIHJvbGVzIHRvIGluc3RhbmNlcyBpbiB0aGUgYmFja2dyb3VuZC4gVGhpcyBwcmV2ZW50c1xuICAgIC8vIHRoZSBzdGFjayBmcm9tIGJlaW5nIGNsZWFubHkgZGVzdHJveWVkLCBzbyB3ZSB3aWxsIHJlY29yZCB0aGUgaW5zdGFuY2VcbiAgICAvLyByb2xlIG5hbWUgYW5kIHVzZSBpdCBsYXRlciB0byBkZWxldGUgYW55IGF0dGFjaGVkIHBvbGljaWVzIGJlZm9yZVxuICAgIC8vIGNsZWFudXAuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnV29ya3NwYWNlSW5zdGFuY2VSb2xlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBpbnN0YW5jZVJvbGUucm9sZU5hbWVcbiAgICB9KTtcblxuICAgIGNvbnN0IGluc3RhbmNlUHJvZmlsZSA9IG5ldyBpYW0uQ2ZuSW5zdGFuY2VQcm9maWxlKHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVByb2ZpbGUnLCB7XG4gICAgICByb2xlczogW2luc3RhbmNlUm9sZS5yb2xlTmFtZV1cbiAgICB9KTtcblxuICAgIC8vIE9idGFpbiBDbG91ZDkgd29ya3NwYWNlIGluc3RhbmNlIElEIGFuZCBzZWN1cml0eSBncm91cC5cbiAgICBjb25zdCB3b3Jrc3BhY2VJbnN0YW5jZSA9IG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnV29ya3NwYWNlSW5zdGFuY2UnLCB7XG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgIHJlc291cmNlczogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuQU5ZX1JFU09VUkNFLFxuICAgICAgfSksXG4gICAgICBvblVwZGF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgYWN0aW9uOiAnZGVzY3JpYmVJbnN0YW5jZXMnLFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihwcm9wcy5jbG91ZDlFbnZpcm9ubWVudElkKSxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIEZpbHRlcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgTmFtZTogJ3RhZzphd3M6Y2xvdWQ5OmVudmlyb25tZW50JyxcbiAgICAgICAgICAgICAgVmFsdWVzOiBbcHJvcHMuY2xvdWQ5RW52aXJvbm1lbnRJZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIG91dHB1dFBhdGhzOiBbXG4gICAgICAgICAgJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLkluc3RhbmNlSWQnLFxuICAgICAgICAgICdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5OZXR3b3JrSW50ZXJmYWNlcy4wLkdyb3Vwcy4wLkdyb3VwSWQnXG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBpbnN0YW5jZUlkID0gd29ya3NwYWNlSW5zdGFuY2UuZ2V0UmVzcG9uc2VGaWVsZCgnUmVzZXJ2YXRpb25zLjAuSW5zdGFuY2VzLjAuSW5zdGFuY2VJZCcpO1xuXG4gICAgY29uc3Qgd29ya3NwYWNlU2VjdXJpdHlHcm91cCA9IGVjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQoXG4gICAgICB0aGlzLCAnV29ya3NwYWNlU2VjdXJpdHlHcm91cCcsXG4gICAgICB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5OZXR3b3JrSW50ZXJmYWNlcy4wLkdyb3Vwcy4wLkdyb3VwSWQnKSk7XG5cblxuICAgIC8vIFRoaXMgZnVuY3Rpb24gcHJvdmlkZXMgYSBDdXN0b20gUmVzb3VyY2UgdGhhdCBkZXRhY2hlcyBhbnkgZXhpc3RpbmcgSUFNXG4gICAgLy8gaW5zdGFuY2UgcHJvZmlsZSB0aGF0IG1pZ2h0IGJlIGF0dGFjaGVkIHRvIHRoZSBDbG91ZDkgRW52aXJvbm1lbnQsIGFuZFxuICAgIC8vIHJlcGxhY2VzIGl0IHdpdGggdGhlIHByb2ZpbGUrcm9sZSB3ZSBjcmVhdGVkIG91cnNlbHZlcy5cbiAgICBjb25zdCB1cGRhdGVJbnN0YW5jZVByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICd1cGRhdGUtaW5zdGFuY2UtcHJvZmlsZScpKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5vbkV2ZW50SGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWFxuICAgIH0pO1xuICAgIHVwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdlYzI6RGVzY3JpYmVJYW1JbnN0YW5jZVByb2ZpbGVBc3NvY2lhdGlvbnMnLFxuICAgICAgICAnZWMyOlJlcGxhY2VJYW1JbnN0YW5jZVByb2ZpbGVBc3NvY2lhdGlvbicsXG4gICAgICAgICdlYzI6QXNzb2NpYXRlSWFtSW5zdGFuY2VQcm9maWxlJyxcbiAgICAgICAgJ2lhbTpQYXNzUm9sZSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFsnKiddIC8vIFRPRE86IHVzZSBzcGVjaWZpYyBpbnN0YW5jZSBBUk5cbiAgICB9KSk7XG5cbiAgICBjb25zdCB1cGRhdGVJbnN0YW5jZVByb2ZpbGUgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ1VwZGF0ZUluc3RhbmNlUHJvZmlsZVByb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IHVwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnVXBkYXRlSW5zdGFuY2VQcm9maWxlJywge1xuICAgICAgc2VydmljZVRva2VuOiB1cGRhdGVJbnN0YW5jZVByb2ZpbGUuc2VydmljZVRva2VuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBJbnN0YW5jZUlkOiBpbnN0YW5jZUlkLFxuICAgICAgICBJbnN0YW5jZVByb2ZpbGVBcm46IGluc3RhbmNlUHJvZmlsZS5hdHRyQXJuXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYW4gU1NIIGtleSBwYWlyIGZvciBsb2dnaW5nIGludG8gdGhlIEs4UyBub2Rlcy5cbiAgICBjb25zdCBzc2hLZXlQYWlyID0gbmV3IGNyLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsICdTU0hLZXlQYWlyJywge1xuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU2RrQ2FsbHMoe1xuICAgICAgICByZXNvdXJjZXM6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LkFOWV9SRVNPVVJDRSxcbiAgICAgIH0pLFxuICAgICAgb25DcmVhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ0VDMicsXG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZUtleVBhaXInLFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihLZXlOYW1lKSxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIEtleU5hbWUsXG4gICAgICAgICAgS2V5VHlwZTogJ3JzYSdcbiAgICAgICAgfSxcbiAgICAgICAgb3V0cHV0UGF0aHM6IFtcbiAgICAgICAgICAnS2V5TmFtZScsXG4gICAgICAgICAgJ0tleU1hdGVyaWFsJ1xuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgb25EZWxldGU6IHtcbiAgICAgICAgc2VydmljZTogJ0VDMicsXG4gICAgICAgIGFjdGlvbjogJ2RlbGV0ZUtleVBhaXInLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgS2V5TmFtZSxcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGtleU1hdGVyaWFsID0gc3NoS2V5UGFpci5nZXRSZXNwb25zZUZpZWxkKCdLZXlNYXRlcmlhbCcpO1xuICAgIGNvbnN0IGtleU5hbWUgPSBzc2hLZXlQYWlyLmdldFJlc3BvbnNlRmllbGQoJ0tleU5hbWUnKTtcblxuXG4gICAgLy8gQ3JlYXRlIG91ciBFS1MgY2x1c3Rlci5cbiAgICBjb25zdCBjbHVzdGVyID0gbmV3IGVrcy5DbHVzdGVyKHRoaXMsICdDbHVzdGVyJywge1xuICAgICAgdnBjLFxuICAgICAgdmVyc2lvbjogZWtzLkt1YmVybmV0ZXNWZXJzaW9uLlYxXzIxLFxuICAgICAgY2x1c3Rlck5hbWU6ICdla3N3b3Jrc2hvcC1la3NjdGwnLFxuICAgICAgZGVmYXVsdENhcGFjaXR5OiAwLFxuICAgICAgbWFzdGVyc1JvbGU6IHRoaXMuY29kZUJ1aWxkUm9sZSxcbiAgICB9KTtcblxuICAgIC8vIFRoZSBPSURDIHByb3ZpZGVyIGlzbid0IGluaXRpYWxpemVkIHVubGVzcyB3ZSBhY2Nlc3MgaXRcbiAgICBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlcjtcblxuICAgIC8vIEFsbG93IENsb3VkOSBlbnZpcm9ubWVudCB0byBtYWtlIGNoYW5nZXMgdG8gdGhlIGNsdXN0ZXIuXG4gICAgY2x1c3Rlci5hd3NBdXRoLmFkZFJvbGVNYXBwaW5nKGluc3RhbmNlUm9sZSwgeyBncm91cHM6IFsnc3lzdGVtOm1hc3RlcnMnXSB9KTtcblxuICAgIGNsdXN0ZXIuY29ubmVjdGlvbnMuYWxsb3dGcm9tKHdvcmtzcGFjZVNlY3VyaXR5R3JvdXAsIGVjMi5Qb3J0LnRjcCg0NDMpKTtcbiAgICBjbHVzdGVyLmNvbm5lY3Rpb25zLmFsbG93RnJvbSh3b3Jrc3BhY2VTZWN1cml0eUdyb3VwLCBlYzIuUG9ydC50Y3AoMjIpKTtcblxuICAgIC8vIENyZWF0ZSBhIGxhdW5jaCB0ZW1wbGF0ZSBmb3Igb3VyIEVLUyBtYW5hZ2VkIG5vZGVncm91cCB0aGF0IGNvbmZpZ3VyZXNcbiAgICAvLyBrdWJlbGV0IHdpdGggYSBzdGF0aWNQb2RQYXRoLlxuICAgIGNvbnN0IHVzZXJEYXRhID0gbmV3IGVjMi5NdWx0aXBhcnRVc2VyRGF0YSgpO1xuICAgIHVzZXJEYXRhLmFkZFVzZXJEYXRhUGFydChlYzIuVXNlckRhdGEuZm9yTGludXgoKSk7XG4gICAgdXNlckRhdGEuYWRkQ29tbWFuZHMoXG4gICAgICAnc2V0IC14JyxcbiAgICAgICdlY2hvIGluc3RhbGxpbmcga2VybmVsLWRldmVsIHBhY2thZ2Ugc28gRmFsY28gZUJQRiBtb2R1bGUgY2FuIGJlIGxvYWRlZCcsXG4gICAgICAneXVtIC15IGluc3RhbGwga2VybmVsLWRldmVsJyxcbiAgICAgICdlY2hvIEFkZGluZyBzdGF0aWNQb2RQYXRoIGNvbmZpZ3VyYXRpb24gdG8ga3ViZWxldCBjb25maWcgZmlsZScsXG4gICAgICAnbWtkaXIgLXAgL2V0Yy9rdWJlbGV0LmQnLFxuICAgICAgJ3l1bSAteSBpbnN0YWxsIGpxJyxcbiAgICAgICdqcSBcXCcuc3RhdGljUG9kUGF0aD1cIi9ldGMva3ViZWxldC5kXCJcXCcgPCAvZXRjL2t1YmVybmV0ZXMva3ViZWxldC9rdWJlbGV0LWNvbmZpZy5qc29uID4gL3RtcC9rdWJlbGV0LWNvbmZpZy5qc29uJyxcbiAgICAgICdtdiAvdG1wL2t1YmVsZXQtY29uZmlnLmpzb24gL2V0Yy9rdWJlcm5ldGVzL2t1YmVsZXQva3ViZWxldC1jb25maWcuanNvbicsXG4gICAgICAnc3lzdGVtY3RsIHJlc3RhcnQga3ViZWxldCdcbiAgICApO1xuXG4gICAgY29uc3QgbGF1bmNoVGVtcGxhdGUgPSBuZXcgZWMyLkxhdW5jaFRlbXBsYXRlKHRoaXMsICdOb2RlTGF1bmNoVGVtcGxhdGUnLCB7XG4gICAgICB1c2VyRGF0YSxcbiAgICAgIGtleU5hbWUsXG4gICAgICBibG9ja0RldmljZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGRldmljZU5hbWU6ICcvZGV2L3h2ZGEnLFxuICAgICAgICAgIHZvbHVtZToge1xuICAgICAgICAgICAgZWJzRGV2aWNlOiB7XG4gICAgICAgICAgICAgIHZvbHVtZVR5cGU6IGVjMi5FYnNEZXZpY2VWb2x1bWVUeXBlLkdQMyxcbiAgICAgICAgICAgICAgLy8gZW5zdXJlIGFkZXF1YXRlIHJvb20gZm9yIGZvcmVuc2ljcyBkdW1wc1xuICAgICAgICAgICAgICB2b2x1bWVTaXplOiAxMDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBNYW5hZ2VkIE5vZGVncm91cC5cbiAgICBjb25zdCBub2RlZ3JvdXAgPSBuZXcgZWtzLk5vZGVncm91cCh0aGlzLCAnbmctMScsIHtcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBkZXNpcmVkU2l6ZTogMyxcbiAgICAgIGluc3RhbmNlVHlwZXM6IFtlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLk01QSwgZWMyLkluc3RhbmNlU2l6ZS5YTEFSR0UpXSxcbiAgICAgIHN1Ym5ldHM6IHZwYy5zZWxlY3RTdWJuZXRzKHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX05BVCB9KSxcbiAgICAgIGxhdW5jaFRlbXBsYXRlU3BlYzoge1xuICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy82NzM0XG4gICAgICAgIGlkOiAobGF1bmNoVGVtcGxhdGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgZWMyLkNmbkxhdW5jaFRlbXBsYXRlKS5yZWYsXG4gICAgICAgIHZlcnNpb246IGxhdW5jaFRlbXBsYXRlLmxhdGVzdFZlcnNpb25OdW1iZXIsXG4gICAgICB9XG4gICAgfSk7XG4gICAgbm9kZWdyb3VwLnJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG4gICAgXG4gICAgY29uc3Qgcm9sZSA9IG5vZGVncm91cC5yb2xlO1xuXG4gICAgLyogTmVlZCB0byBmaWd1cmUgdGhpcyBvdXQgLSBUQkQgLSBSQU5KSVRIISEhISEhXG4gICAgRXJyb3Igb24gZG9jdW1lbnQgbm90IGJlaW5nIGFibGUgdG8gYmUgYXNzaWduZWQgdG8gUG9saWN5RG9jdW1lbnQgdHlwZS5cblxuICAgIHJvbGU/LmF0dGFjaElubGluZVBvbGljeShuZXcgaWFtLlBvbGljeSh0aGlzLCAnc2Fhcy1pbmxpbmUtcG9saWN5Jywge1xuICAgICAgZG9jdW1lbnQ6IG5vZGVSb2xlUG9saWN5RG9jLFxuICAgIH0pXG4gICAgKTtcbiAgICAqL1xuXG4gICAgdGhpcy5ub2RlR3JvdXBSb2xlID0gcm9sZTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ05vZGVncm91cFJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IG5vZGVncm91cC5yb2xlLnJvbGVOYW1lXG4gICAgfSk7XG5cbiAgICAvL0NyZWF0ZSBJbmdyZXNzXG4gICAgY29uc3QgaW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZSA9ICdjb250cm9sbGVyJztcblxuICAgIGNvbnN0IGluZ3Jlc3NDaGFydCA9IGNsdXN0ZXIuYWRkSGVsbUNoYXJ0KCdJbmdyZXNzQ29udHJvbGxlcicsIHtcbiAgICAgIGNoYXJ0OiAnbmdpbngtaW5ncmVzcycsXG4gICAgICByZXBvc2l0b3J5OiAnaHR0cHM6Ly9oZWxtLm5naW54LmNvbS9zdGFibGUnLFxuICAgICAgcmVsZWFzZTogaW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZSxcbiAgICAgIHZhbHVlczoge1xuICAgICAgICBjb250cm9sbGVyOiB7XG4gICAgICAgICAgcHVibGlzaFNlcnZpY2U6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZXJ2aWNlOiB7XG4gICAgICAgICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItdHlwZSc6ICdubGInLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItYmFja2VuZC1wcm90b2NvbCc6ICdodHRwJyxcbiAgICAgICAgICAgICAgJ3NlcnZpY2UuYmV0YS5rdWJlcm5ldGVzLmlvL2F3cy1sb2FkLWJhbGFuY2VyLXNzbC1wb3J0cyc6ICc0NDMnLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItY29ubmVjdGlvbi1pZGxlLXRpbWVvdXQnOiAnMzYwMCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdGFyZ2V0UG9ydHM6IHtcbiAgICAgICAgICAgICAgaHR0cHM6ICdodHRwJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGJBZGRyZXNzID0gbmV3IGVrcy5LdWJlcm5ldGVzT2JqZWN0VmFsdWUodGhpcywgJ2VsYkFkZHJlc3MnLCB7XG4gICAgICBjbHVzdGVyLFxuICAgICAgb2JqZWN0VHlwZTogJ1NlcnZpY2UnLFxuICAgICAgb2JqZWN0TmFtZTogYCR7aW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZX0tbmdpbngtaW5ncmVzc2AsXG4gICAgICBqc29uUGF0aDogJy5zdGF0dXMubG9hZEJhbGFuY2VyLmluZ3Jlc3NbMF0uaG9zdG5hbWUnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFzdGVySW5ncmVzcyA9IGNsdXN0ZXIuYWRkTWFuaWZlc3QoJ21hc3RlckluZ3Jlc3NSZXNvdXJjZScsIHtcbiAgICAgIGFwaVZlcnNpb246ICduZXR3b3JraW5nLms4cy5pby92MScsXG4gICAgICBraW5kOiAnSW5ncmVzcycsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBuYW1lOiAnd29ya3Nob3AtaW5ncmVzcy1tYXN0ZXInLFxuICAgICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAgICdrdWJlcm5ldGVzLmlvL2luZ3Jlc3MuY2xhc3MnOiAnbmdpbngnLFxuICAgICAgICAgICduZ2lueC5vcmcvbWVyZ2VhYmxlLWluZ3Jlc3MtdHlwZSc6ICdtYXN0ZXInLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHNwZWM6IHtcbiAgICAgICAgcnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBob3N0OiBhbGJBZGRyZXNzLnZhbHVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIG1hc3RlckluZ3Jlc3Mubm9kZS5hZGREZXBlbmRlbmN5KGluZ3Jlc3NDaGFydCk7XG5cbiAgICB0aGlzLmVsYlVybCA9IGFsYkFkZHJlc3MudmFsdWU7XG5cblxuICAgIC8vIFNpbmNlIENsb3VkOSBoYXMgdGhlIFNTTSBhZ2VudCBvbiBpdCwgd2UnbGwgdGFrZSBhZHZhbnRhZ2Ugb2YgaXRzXG4gICAgLy8gcHJlc2VuY2UgdG8gcHJlcGFyZSB0aGUgaW5zdGFuY2UuIFRoaXMgaW5jbHVkZXMgaW5zdGFsbGluZyBrdWJlY3RsLFxuICAgIC8vIHNldHRpbmcgdXAgdGhlIGt1YmVjb25maWcgZmlsZSwgYW5kIGluc3RhbGxpbmcgdGhlIFNTSCBwcml2YXRlIGtleVxuICAgIC8vIGludG8gdGhlIGRlZmF1bHQgdXNlcidzIGhvbWUgZGlyZWN0b3J5LiBXZSBjYW4gYWRkIG1vcmUgc3RlcHMgbGF0ZXJcbiAgICAvLyBpZiB3ZSBsaWtlLlxuXG4gICAgLy8gRmlyc3QsIGFsbG93IFNTTSB0byB3cml0ZSBSdW4gQ29tbWFuZCBsb2dzIHRvIENsb3VkV2F0Y2ggTG9ncy4gVGhpc1xuICAgIC8vIHdpbGwgYWxsb3cgdXMgdG8gZGlhZ25vc2UgcHJvYmxlbXMgbGF0ZXIuXG4gICAgY29uc3QgcnVuQ29tbWFuZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1J1bkNvbW1hbmRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3NzbS5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG4gICAgY29uc3QgcnVuQ29tbWFuZExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1J1bkNvbW1hbmRMb2dzJyk7XG4gICAgcnVuQ29tbWFuZExvZ0dyb3VwLmdyYW50V3JpdGUocnVuQ29tbWFuZFJvbGUpO1xuXG4gICAgLy8gTm93LCBpbnZva2UgUnVuQ29tbWFuZC5cbiAgICBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0luc3RhbmNlUHJlcCcsIHtcbiAgICAgIGluc3RhbGxMYXRlc3RBd3NTZGs6IGZhbHNlLFxuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU3RhdGVtZW50cyhbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgICAgIHJlc291cmNlczogW3J1bkNvbW1hbmRSb2xlLnJvbGVBcm5dXG4gICAgICAgIH0pLFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ3NzbTpTZW5kQ29tbWFuZCdcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgfSlcbiAgICAgIF0pLFxuICAgICAgb25VcGRhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ3NlbmRDb21tYW5kJyxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YocHJvcHMuY2xvdWQ5RW52aXJvbm1lbnRJZCksXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBEb2N1bWVudE5hbWU6ICdBV1MtUnVuU2hlbGxTY3JpcHQnLFxuICAgICAgICAgIERvY3VtZW50VmVyc2lvbjogJyRMQVRFU1QnLFxuICAgICAgICAgIEluc3RhbmNlSWRzOiBbaW5zdGFuY2VJZF0sXG4gICAgICAgICAgVGltZW91dFNlY29uZHM6IDMwLFxuICAgICAgICAgIFNlcnZpY2VSb2xlQXJuOiBydW5Db21tYW5kUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIENsb3VkV2F0Y2hPdXRwdXRDb25maWc6IHtcbiAgICAgICAgICAgIENsb3VkV2F0Y2hMb2dHcm91cE5hbWU6IHJ1bkNvbW1hbmRMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICAgICAgICBDbG91ZFdhdGNoT3V0cHV0RW5hYmxlZDogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgLy8gQWRkIGNvbW1hbmRzIGhlcmUgdG8gdGFzdGUuXG4gICAgICAgICAgICAgICdjdXJsIC1zU0wgLW8gL3RtcC9rdWJlY3RsIGh0dHBzOi8vYW1hem9uLWVrcy5zMy51cy13ZXN0LTIuYW1hem9uYXdzLmNvbS8xLjIxLjIvMjAyMS0wNy0wNS9iaW4vbGludXgvYW1kNjQva3ViZWN0bCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnbXYgL3RtcC9rdWJlY3RsIC91c3IvbG9jYWwvYmluL2t1YmVjdGwnLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2F3cyBla3MgdXBkYXRlLWt1YmVjb25maWcgLS1uYW1lICR7Y2x1c3Rlci5jbHVzdGVyTmFtZX0gLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1yb2xlLWFybiAke2luc3RhbmNlUm9sZS5yb2xlQXJufScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJleHBvcnQgQVdTX0RFRkFVTFRfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImV4cG9ydCBBV1NfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnbWtkaXIgLXAgfi8uc3NoICYmIGNobW9kIDcwMCB+Ly5zc2gnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgLy8gVGhlIGtleSBtYXRlcmlhbCBpc24ndCBwcm9wZXJseSBlc2NhcGVkLCBzbyB3ZSdsbCBqdXN0IGJhc2U2NC1lbmNvZGUgaXQgZmlyc3RcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiJHtjZGsuRm4uYmFzZTY0KGtleU1hdGVyaWFsKX1cIiB8IGJhc2U2NCAtZCA+IH4vLnNzaC9pZF9yc2EnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdjaG1vZCA2MDAgfi8uc3NoL2lkX3JzYScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICAnY3VybCAtLXNpbGVudCAtLWxvY2F0aW9uIFwiaHR0cHM6Ly9naXRodWIuY29tL3dlYXZld29ya3MvZWtzY3RsL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9la3NjdGxfJCh1bmFtZSAtcylfYW1kNjQudGFyLmd6XCIgfCB0YXIgeHogLUMgL3RtcCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2Vrc2N0bCcsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2Vrc2N0bCAvdXNyL2xvY2FsL2JpbicsXG4gICAgICAgICAgICAgICd5dW0gLXkgaW5zdGFsbCBqcSBnZXR0ZXh0IGJhc2gtY29tcGxldGlvbiBtb3JldXRpbHMnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4va3ViZWN0bCBjb21wbGV0aW9uIGJhc2ggPiAvZXRjL2Jhc2hfY29tcGxldGlvbi5kL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4vZWtzY3RsIGNvbXBsZXRpb24gYmFzaCA+IC9ldGMvYmFzaF9jb21wbGV0aW9uLmQvZWtzY3RsJyxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiYWxpYXMgaz1rdWJlY3RsXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImNvbXBsZXRlIC1GIF9fc3RhcnRfa3ViZWN0bCBrXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIC8vIEluc3RhbGwgSGVsbVxuICAgICAgICAgICAgICAnY3VybCAtZnNTTCAtbyAvdG1wL2hlbG0udGd6IGh0dHBzOi8vZ2V0LmhlbG0uc2gvaGVsbS12My43LjEtbGludXgtYW1kNjQudGFyLmd6JyxcbiAgICAgICAgICAgICAgJ3RhciAtQyAvdG1wIC14emYgL3RtcC9oZWxtLnRneicsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2xpbnV4LWFtZDY0L2hlbG0gL3Vzci9sb2NhbC9iaW4vaGVsbScsXG4gICAgICAgICAgICAgICdybSAtcmYgL3RtcC9oZWxtLnRneiAvdG1wL2xpbnV4LWFtZDY0JyxcbiAgICAgICAgICAgICAgLy8gUmVzaXplIHZvbHVtZVxuICAgICAgICAgICAgICBgdm9sdW1lX2lkPSQoYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBkZXNjcmliZS12b2x1bWVzIC0tZmlsdGVycyBOYW1lPWF0dGFjaG1lbnQuaW5zdGFuY2UtaWQsVmFsdWVzPSR7aW5zdGFuY2VJZH0gLS1xdWVyeSAnVm9sdW1lc1swXS5Wb2x1bWVJZCcgLS1vdXRwdXQgdGV4dClgLFxuICAgICAgICAgICAgICBgYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBtb2RpZnktdm9sdW1lIC0tdm9sdW1lLWlkICR2b2x1bWVfaWQgLS1zaXplIDMwYCxcbiAgICAgICAgICAgICAgLy8gVGhpcyBtdXN0IGJlIHRoZSBsYXN0IGxpbmUgLSBkbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgICBgcmVib290YFxuICAgICAgICAgICAgICAvLyBEbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG91dHB1dFBhdGhzOiBbJ0NvbW1hbmRJZCddXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBkeW5hbW9EYkRvYyA9IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgYXNzaWduU2lkczogZmFsc2UsXG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOkJhdGNoR2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlVGFibGUnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLypgXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVzZWRCeVRva2VuVmVuZGluZ01hY2hpbmUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0R5bmFtaWNBc3N1bWVSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiB0aGlzLm5vZGVHcm91cFJvbGUsXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBkeW5hbW9Qb2xpY3k6IGR5bmFtb0RiRG9jLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VMQlVSTCcsIHsgdmFsdWU6IHRoaXMuZWxiVXJsIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0Vrc0NvZGVidWlsZEFybicsIHsgdmFsdWU6IHRoaXMuY29kZUJ1aWxkUm9sZS5yb2xlQXJuIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JvbGVVc2VkQnlUVk0nLCB7IHZhbHVlOiByb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZS5yb2xlQXJuIH0pO1xuXG4gIH1cbn1cbiJdfQ==