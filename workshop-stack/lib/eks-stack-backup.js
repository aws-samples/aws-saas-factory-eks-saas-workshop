"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EksStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cdk = require("aws-cdk-lib");
const eks = require("aws-cdk-lib/aws-eks");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const cr = require("aws-cdk-lib/custom-resources");
const logs = require("aws-cdk-lib/aws-logs");
const lambda = require("aws-cdk-lib/aws-lambda");
const path = require("path");
const KeyName = 'workshop';
class EksStack extends aws_cdk_lib_1.NestedStack {
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
        new aws_cdk_lib_1.CfnOutput(this, 'WorkspaceInstanceRoleName', {
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
        new aws_cdk_lib_1.CfnOutput(this, 'NodegroupRoleName', {
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
        new aws_cdk_lib_1.CfnOutput(this, 'ELBURL', { value: this.elbUrl });
        new aws_cdk_lib_1.CfnOutput(this, 'EksCodebuildArn', { value: this.codeBuildRole.roleArn });
        new aws_cdk_lib_1.CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });
    }
}
exports.EksStack = EksStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWtzLXN0YWNrLWJhY2t1cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVrcy1zdGFjay1iYWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBQXNFO0FBQ3RFLG1DQUFtQztBQUduQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBRTNDLDJDQUEyQztBQUMzQyxtREFBbUQ7QUFDbkQsNkNBQTZDO0FBQzdDLGlEQUFpRDtBQUNqRCw2QkFBNkI7QUFFN0IsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDO0FBTzNCLE1BQWEsUUFBUyxTQUFRLHlCQUFXO0lBS3ZDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUUxQyw2RUFBNkU7UUFDN0UsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtZQUMxQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7U0FDbkIsQ0FBQyxDQUFDO1FBRUgseUZBQXlGO1FBQ3hGLElBQUksQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUxRix3RUFBd0U7UUFDeEUsMEVBQTBFO1FBQzFFLHFFQUFxRTtRQUNyRSwrREFBK0Q7UUFDL0QsTUFBTSxZQUFZLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7WUFDeEQsZUFBZSxFQUFFO2dCQUNmLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMscUJBQXFCLENBQUM7YUFDbEU7WUFDRCxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUNILFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQztRQUUxRyxvRUFBb0U7UUFDcEUsd0VBQXdFO1FBQ3hFLHlFQUF5RTtRQUN6RSxvRUFBb0U7UUFDcEUsV0FBVztRQUNYLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLFlBQVksQ0FBQyxRQUFRO1NBQzdCLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNuRixLQUFLLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1NBQy9CLENBQUMsQ0FBQztRQUVILDBEQUEwRDtRQUMxRCxNQUFNLGlCQUFpQixHQUFHLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM1RSxNQUFNLEVBQUUsRUFBRSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQztnQkFDOUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZO2FBQ25ELENBQUM7WUFDRixRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0Isa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUM7Z0JBQ3ZFLFVBQVUsRUFBRTtvQkFDVixPQUFPLEVBQUU7d0JBQ1A7NEJBQ0UsSUFBSSxFQUFFLDRCQUE0Qjs0QkFDbEMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDO3lCQUNwQztxQkFDRjtpQkFDRjtnQkFDRCxXQUFXLEVBQUU7b0JBQ1gsdUNBQXVDO29CQUN2QyxpRUFBaUU7aUJBQ2xFO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFDSCxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBRS9GLE1BQU0sc0JBQXNCLEdBQUcsR0FBRyxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FDbEUsSUFBSSxFQUFFLHdCQUF3QixFQUM5QixpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxpRUFBaUUsQ0FBQyxDQUFDLENBQUM7UUFHekcsMEVBQTBFO1FBQzFFLHlFQUF5RTtRQUN6RSwwREFBMEQ7UUFDMUQsTUFBTSw2QkFBNkIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQy9GLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1lBQzVFLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztTQUNwQyxDQUFDLENBQUM7UUFDSCw2QkFBNkIsQ0FBQyxlQUFlLENBQUMsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3BFLE9BQU8sRUFBRTtnQkFDUCw0Q0FBNEM7Z0JBQzVDLDBDQUEwQztnQkFDMUMsaUNBQWlDO2dCQUNqQyxjQUFjO2FBQ2Y7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxrQ0FBa0M7U0FDcEQsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLHFCQUFxQixHQUFHLElBQUksRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsK0JBQStCLEVBQUU7WUFDbkYsY0FBYyxFQUFFLDZCQUE2QjtTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQ3BELFlBQVksRUFBRSxxQkFBcUIsQ0FBQyxZQUFZO1lBQ2hELFVBQVUsRUFBRTtnQkFDVixVQUFVLEVBQUUsVUFBVTtnQkFDdEIsa0JBQWtCLEVBQUUsZUFBZSxDQUFDLE9BQU87YUFDNUM7U0FDRixDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsTUFBTSxVQUFVLEdBQUcsSUFBSSxFQUFFLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUM5RCxNQUFNLEVBQUUsRUFBRSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQztnQkFDOUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZO2FBQ25ELENBQUM7WUFDRixRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGVBQWU7Z0JBQ3ZCLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDO2dCQUNyRCxVQUFVLEVBQUU7b0JBQ1YsT0FBTztvQkFDUCxPQUFPLEVBQUUsS0FBSztpQkFDZjtnQkFDRCxXQUFXLEVBQUU7b0JBQ1gsU0FBUztvQkFDVCxhQUFhO2lCQUNkO2FBQ0Y7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGVBQWU7Z0JBQ3ZCLFVBQVUsRUFBRTtvQkFDVixPQUFPO2lCQUNSO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDL0QsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBR3ZELDBCQUEwQjtRQUMxQixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUMvQyxHQUFHO1lBQ0gsT0FBTyxFQUFFLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLO1lBQ3BDLFdBQVcsRUFBRSxvQkFBb0I7WUFDakMsZUFBZSxFQUFFLENBQUM7WUFDbEIsV0FBVyxFQUFFLElBQUksQ0FBQyxhQUFhO1NBQ2hDLENBQUMsQ0FBQztRQUVILDBEQUEwRDtRQUMxRCxPQUFPLENBQUMscUJBQXFCLENBQUM7UUFFOUIsMkRBQTJEO1FBQzNELE9BQU8sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTdFLE9BQU8sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4RSx5RUFBeUU7UUFDekUsZ0NBQWdDO1FBQ2hDLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDN0MsUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbEQsUUFBUSxDQUFDLFdBQVcsQ0FDbEIsUUFBUSxFQUNSLHlFQUF5RSxFQUN6RSw2QkFBNkIsRUFDN0IsZ0VBQWdFLEVBQ2hFLHlCQUF5QixFQUN6QixtQkFBbUIsRUFDbkIsaUhBQWlILEVBQ2pILHlFQUF5RSxFQUN6RSwyQkFBMkIsQ0FDNUIsQ0FBQztRQUVGLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDeEUsUUFBUTtZQUNSLE9BQU87WUFDUCxZQUFZLEVBQUU7Z0JBQ1o7b0JBQ0UsVUFBVSxFQUFFLFdBQVc7b0JBQ3ZCLE1BQU0sRUFBRTt3QkFDTixTQUFTLEVBQUU7NEJBQ1QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHOzRCQUN2QywyQ0FBMkM7NEJBQzNDLFVBQVUsRUFBRSxHQUFHO3lCQUNoQjtxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2hELE9BQU87WUFDUCxXQUFXLEVBQUUsQ0FBQztZQUNkLGFBQWEsRUFBRSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEYsT0FBTyxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNFLGtCQUFrQixFQUFFO2dCQUNsQixpREFBaUQ7Z0JBQ2pELEVBQUUsRUFBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQXNDLENBQUMsR0FBRztnQkFDbkUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxtQkFBbUI7YUFDNUM7U0FDRixDQUFDLENBQUM7UUFDSCxTQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBRTVHLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUM7UUFFNUI7Ozs7Ozs7VUFPRTtRQUVGLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBRTFCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUTtTQUMvQixDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsTUFBTSw0QkFBNEIsR0FBRyxZQUFZLENBQUM7UUFFbEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBRTtZQUM3RCxLQUFLLEVBQUUsZUFBZTtZQUN0QixVQUFVLEVBQUUsK0JBQStCO1lBQzNDLE9BQU8sRUFBRSw0QkFBNEI7WUFDckMsTUFBTSxFQUFFO2dCQUNOLFVBQVUsRUFBRTtvQkFDVixjQUFjLEVBQUU7d0JBQ2QsT0FBTyxFQUFFLElBQUk7cUJBQ2Q7b0JBQ0QsT0FBTyxFQUFFO3dCQUNQLFdBQVcsRUFBRTs0QkFDWCxtREFBbUQsRUFBRSxLQUFLOzRCQUMxRCwrREFBK0QsRUFBRSxNQUFNOzRCQUN2RSx3REFBd0QsRUFBRSxLQUFLOzRCQUMvRCxzRUFBc0UsRUFBRSxNQUFNO3lCQUMvRTt3QkFDRCxXQUFXLEVBQUU7NEJBQ1gsS0FBSyxFQUFFLE1BQU07eUJBQ2Q7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDbkUsT0FBTztZQUNQLFVBQVUsRUFBRSxTQUFTO1lBQ3JCLFVBQVUsRUFBRSxHQUFHLDRCQUE0QixnQkFBZ0I7WUFDM0QsUUFBUSxFQUFFLDBDQUEwQztTQUNyRCxDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLHVCQUF1QixFQUFFO1lBQ2pFLFVBQVUsRUFBRSxzQkFBc0I7WUFDbEMsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsSUFBSSxFQUFFLHlCQUF5QjtnQkFDL0IsV0FBVyxFQUFFO29CQUNYLDZCQUE2QixFQUFFLE9BQU87b0JBQ3RDLGtDQUFrQyxFQUFFLFFBQVE7aUJBQzdDO2FBQ0Y7WUFDRCxJQUFJLEVBQUU7Z0JBQ0osS0FBSyxFQUFFO29CQUNMO3dCQUNFLElBQUksRUFBRSxVQUFVLENBQUMsS0FBSztxQkFDdkI7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUNILGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUcvQixvRUFBb0U7UUFDcEUsc0VBQXNFO1FBQ3RFLHFFQUFxRTtRQUNyRSxzRUFBc0U7UUFDdEUsY0FBYztRQUVkLHNFQUFzRTtRQUN0RSw0Q0FBNEM7UUFDNUMsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMxRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7U0FDekQsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDckUsa0JBQWtCLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRTlDLDBCQUEwQjtRQUMxQixJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQzdDLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsTUFBTSxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUM7Z0JBQ2hELElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsT0FBTyxFQUFFLENBQUMsY0FBYyxDQUFDO29CQUN6QixTQUFTLEVBQUUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDO2lCQUNwQyxDQUFDO2dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsT0FBTyxFQUFFO3dCQUNQLGlCQUFpQjtxQkFDbEI7b0JBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO2lCQUNqQixDQUFDO2FBQ0gsQ0FBQztZQUNGLFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUUsYUFBYTtnQkFDckIsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUM7Z0JBQ3ZFLFVBQVUsRUFBRTtvQkFDVixZQUFZLEVBQUUsb0JBQW9CO29CQUNsQyxlQUFlLEVBQUUsU0FBUztvQkFDMUIsV0FBVyxFQUFFLENBQUMsVUFBVSxDQUFDO29CQUN6QixjQUFjLEVBQUUsRUFBRTtvQkFDbEIsY0FBYyxFQUFFLGNBQWMsQ0FBQyxPQUFPO29CQUN0QyxzQkFBc0IsRUFBRTt3QkFDdEIsc0JBQXNCLEVBQUUsa0JBQWtCLENBQUMsWUFBWTt3QkFDdkQsdUJBQXVCLEVBQUUsSUFBSTtxQkFDOUI7b0JBQ0QsVUFBVSxFQUFFO3dCQUNWLFFBQVEsRUFBRTs0QkFDUiw4QkFBOEI7NEJBQzlCLG1IQUFtSDs0QkFDbkgsdUJBQXVCOzRCQUN2Qix3Q0FBd0M7NEJBQ3hDLDhDQUE4QyxPQUFPLENBQUMsV0FBVyxhQUFhLElBQUksQ0FBQyxNQUFNLGVBQWUsWUFBWSxDQUFDLE9BQU8sWUFBWTs0QkFDeEksNkNBQTZDLElBQUksQ0FBQyxNQUFNLGdDQUFnQzs0QkFDeEYscUNBQXFDLElBQUksQ0FBQyxNQUFNLGdDQUFnQzs0QkFDaEYseURBQXlEOzRCQUN6RCxnRkFBZ0Y7NEJBQ2hGLG1CQUFtQixHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMseUNBQXlDOzRCQUN0Riw2Q0FBNkM7NEJBQzdDLDJJQUEySTs0QkFDM0ksc0JBQXNCOzRCQUN0QiwrQkFBK0I7NEJBQy9CLHFEQUFxRDs0QkFDckQseUVBQXlFOzRCQUN6RSx1RUFBdUU7NEJBQ3ZFLCtEQUErRDs0QkFDL0QsNkVBQTZFOzRCQUM3RSxlQUFlOzRCQUNmLGdGQUFnRjs0QkFDaEYsZ0NBQWdDOzRCQUNoQyw4Q0FBOEM7NEJBQzlDLHVDQUF1Qzs0QkFDdkMsZ0JBQWdCOzRCQUNoQiw0QkFBNEIsSUFBSSxDQUFDLE1BQU0sc0VBQXNFLFVBQVUsK0NBQStDOzRCQUN0SyxnQkFBZ0IsSUFBSSxDQUFDLE1BQU0scURBQXFEOzRCQUNoRixnRUFBZ0U7NEJBQ2hFLFFBQVE7NEJBQ1IsbUNBQW1DO3lCQUNwQztxQkFDRjtpQkFDRjtnQkFDRCxXQUFXLEVBQUUsQ0FBQyxXQUFXLENBQUM7YUFDM0I7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7WUFDekMsVUFBVSxFQUFFLEtBQUs7WUFDakIsVUFBVSxFQUFFO2dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztvQkFDeEIsT0FBTyxFQUFFO3dCQUNQLGtCQUFrQjt3QkFDbEIsa0JBQWtCO3dCQUNsQix1QkFBdUI7d0JBQ3ZCLGdCQUFnQjt3QkFDaEIsZUFBZTt3QkFDZix3QkFBd0I7cUJBQ3pCO29CQUNELFNBQVMsRUFBRSxDQUFDLG9CQUFvQixJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxPQUFPLFVBQVUsQ0FBQztpQkFDdkUsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzVFLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYTtZQUM3QixjQUFjLEVBQUU7Z0JBQ2QsWUFBWSxFQUFFLFdBQVc7YUFDMUI7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN0RCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM5RSxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxFQUFFLEtBQUssRUFBRSw2QkFBNkIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBRXpGLENBQUM7Q0FDRjtBQW5ZRCw0QkFtWUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXN0ZWRTdGFjaywgTmVzdGVkU3RhY2tQcm9wcywgQ2ZuT3V0cHV0fSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmltcG9ydCAqIGFzIGVrcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWtzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuY29uc3QgS2V5TmFtZSA9ICd3b3Jrc2hvcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWtzU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICB2cGNJZDogc3RyaW5nXG4gIGNsb3VkOUVudmlyb25tZW50SWQ6IHN0cmluZ1xuICBjb2RlQnVpbGRSb2xlQXJuOiBzdHJpbmdcbn1cbmV4cG9ydCBjbGFzcyBFa3NTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG4gIG5vZGVHcm91cFJvbGU6IGlhbS5JUm9sZTtcbiAgY29kZUJ1aWxkUm9sZTogaWFtLklSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFa3NTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBUYWcgdGhlIHN0YWNrIGFuZCBpdHMgcmVzb3VyY2VzLlxuICAgIHRoaXMudGFncy5zZXRUYWcoJ1N0YWNrTmFtZScsICdFa3NTdGFjaycpO1xuXG4gICAgLy8gVGhlIFZQQyBJRCBpcyBzdXBwbGllZCBieSB0aGUgY2FsbGVyIGZyb20gdGhlIFZQQ19JRCBlbnZpcm9ubWVudCB2YXJpYWJsZS5cbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBwcm9wcy52cGNJZFxuICAgIH0pO1xuXG4gICAgLy8gQ29kZUJ1aWxkIHJvbGUgaXMgc3VwcGxpZWQgYnkgdGhlIGNhbGxlciBmcm9tIHRoZSBCVUlMRF9ST0xFX0FSTiBlbnZpcm9ubWVudCB2YXJpYWJsZS5cbiAgICAgdGhpcy5jb2RlQnVpbGRSb2xlID0gaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0NvZGVCdWlsZFJvbGUnLCBwcm9wcy5jb2RlQnVpbGRSb2xlQXJuKTtcblxuICAgIC8vIENyZWF0ZSBhbiBFQzIgaW5zdGFuY2Ugcm9sZSBmb3IgdGhlIENsb3VkOSBlbnZpcm9ubWVudC4gVGhpcyBpbnN0YW5jZVxuICAgIC8vIHJvbGUgaXMgcG93ZXJmdWwsIGFsbG93aW5nIHRoZSBwYXJ0aWNpcGFudCB0byBoYXZlIHVuZmV0dGVyZWQgYWNjZXNzIHRvXG4gICAgLy8gdGhlIHByb3Zpc2lvbmVkIGFjY291bnQuIFRoaXMgbWlnaHQgYmUgdG9vIGJyb2FkLiBJdCdzIHBvc3NpYmxlIHRvXG4gICAgLy8gdGlnaHRlbiB0aGlzIGRvd24sIGJ1dCB0aGVyZSBtYXkgYmUgdW5pbnRlbmRlZCBjb25zZXF1ZW5jZXMuXG4gICAgY29uc3QgaW5zdGFuY2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FkbWluaXN0cmF0b3JBY2Nlc3MnKVxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV29ya3NwYWNlIEVDMiBpbnN0YW5jZSByb2xlJ1xuICAgIH0pO1xuICAgIGluc3RhbmNlUm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpKTtcblxuICAgIC8vIER1cmluZyBpbnRlcm5hbCB0ZXN0aW5nIHdlIGZvdW5kIHRoYXQgSXNlbmdhcmQgYWNjb3VudCBiYXNlbGluaW5nXG4gICAgLy8gd2FzIGF0dGFjaGluZyBJQU0gcm9sZXMgdG8gaW5zdGFuY2VzIGluIHRoZSBiYWNrZ3JvdW5kLiBUaGlzIHByZXZlbnRzXG4gICAgLy8gdGhlIHN0YWNrIGZyb20gYmVpbmcgY2xlYW5seSBkZXN0cm95ZWQsIHNvIHdlIHdpbGwgcmVjb3JkIHRoZSBpbnN0YW5jZVxuICAgIC8vIHJvbGUgbmFtZSBhbmQgdXNlIGl0IGxhdGVyIHRvIGRlbGV0ZSBhbnkgYXR0YWNoZWQgcG9saWNpZXMgYmVmb3JlXG4gICAgLy8gY2xlYW51cC5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IGluc3RhbmNlUm9sZS5yb2xlTmFtZVxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5DZm5JbnN0YW5jZVByb2ZpbGUodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgIHJvbGVzOiBbaW5zdGFuY2VSb2xlLnJvbGVOYW1lXVxuICAgIH0pO1xuXG4gICAgLy8gT2J0YWluIENsb3VkOSB3b3Jrc3BhY2UgaW5zdGFuY2UgSUQgYW5kIHNlY3VyaXR5IGdyb3VwLlxuICAgIGNvbnN0IHdvcmtzcGFjZUluc3RhbmNlID0gbmV3IGNyLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZScsIHtcbiAgICAgIHBvbGljeTogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgcmVzb3VyY2VzOiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5BTllfUkVTT1VSQ0UsXG4gICAgICB9KSxcbiAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdFQzInLFxuICAgICAgICBhY3Rpb246ICdkZXNjcmliZUluc3RhbmNlcycsXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKHByb3BzLmNsb3VkOUVudmlyb25tZW50SWQpLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgRmlsdGVyczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBOYW1lOiAndGFnOmF3czpjbG91ZDk6ZW52aXJvbm1lbnQnLFxuICAgICAgICAgICAgICBWYWx1ZXM6IFtwcm9wcy5jbG91ZDlFbnZpcm9ubWVudElkXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgb3V0cHV0UGF0aHM6IFtcbiAgICAgICAgICAnUmVzZXJ2YXRpb25zLjAuSW5zdGFuY2VzLjAuSW5zdGFuY2VJZCcsXG4gICAgICAgICAgJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLk5ldHdvcmtJbnRlcmZhY2VzLjAuR3JvdXBzLjAuR3JvdXBJZCdcbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGluc3RhbmNlSWQgPSB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5JbnN0YW5jZUlkJyk7XG5cbiAgICBjb25zdCB3b3Jrc3BhY2VTZWN1cml0eUdyb3VwID0gZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZChcbiAgICAgIHRoaXMsICdXb3Jrc3BhY2VTZWN1cml0eUdyb3VwJyxcbiAgICAgIHdvcmtzcGFjZUluc3RhbmNlLmdldFJlc3BvbnNlRmllbGQoJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLk5ldHdvcmtJbnRlcmZhY2VzLjAuR3JvdXBzLjAuR3JvdXBJZCcpKTtcblxuXG4gICAgLy8gVGhpcyBmdW5jdGlvbiBwcm92aWRlcyBhIEN1c3RvbSBSZXNvdXJjZSB0aGF0IGRldGFjaGVzIGFueSBleGlzdGluZyBJQU1cbiAgICAvLyBpbnN0YW5jZSBwcm9maWxlIHRoYXQgbWlnaHQgYmUgYXR0YWNoZWQgdG8gdGhlIENsb3VkOSBFbnZpcm9ubWVudCwgYW5kXG4gICAgLy8gcmVwbGFjZXMgaXQgd2l0aCB0aGUgcHJvZmlsZStyb2xlIHdlIGNyZWF0ZWQgb3Vyc2VsdmVzLlxuICAgIGNvbnN0IHVwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJ3VwZGF0ZS1pbnN0YW5jZS1wcm9maWxlJykpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4Lm9uRXZlbnRIYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YXG4gICAgfSk7XG4gICAgdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2VjMjpEZXNjcmliZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9ucycsXG4gICAgICAgICdlYzI6UmVwbGFjZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9uJyxcbiAgICAgICAgJ2VjMjpBc3NvY2lhdGVJYW1JbnN0YW5jZVByb2ZpbGUnLFxuICAgICAgICAnaWFtOlBhc3NSb2xlJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogWycqJ10gLy8gVE9ETzogdXNlIHNwZWNpZmljIGluc3RhbmNlIEFSTlxuICAgIH0pKTtcblxuICAgIGNvbnN0IHVwZGF0ZUluc3RhbmNlUHJvZmlsZSA9IG5ldyBjci5Qcm92aWRlcih0aGlzLCAnVXBkYXRlSW5zdGFuY2VQcm9maWxlUHJvdmlkZXInLCB7XG4gICAgICBvbkV2ZW50SGFuZGxlcjogdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24sXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdVcGRhdGVJbnN0YW5jZVByb2ZpbGUnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHVwZGF0ZUluc3RhbmNlUHJvZmlsZS5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEluc3RhbmNlSWQ6IGluc3RhbmNlSWQsXG4gICAgICAgIEluc3RhbmNlUHJvZmlsZUFybjogaW5zdGFuY2VQcm9maWxlLmF0dHJBcm5cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhbiBTU0gga2V5IHBhaXIgZm9yIGxvZ2dpbmcgaW50byB0aGUgSzhTIG5vZGVzLlxuICAgIGNvbnN0IHNzaEtleVBhaXIgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1NTSEtleVBhaXInLCB7XG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgIHJlc291cmNlczogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuQU5ZX1JFU09VUkNFLFxuICAgICAgfSksXG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlS2V5UGFpcicsXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKEtleU5hbWUpLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgS2V5TmFtZSxcbiAgICAgICAgICBLZXlUeXBlOiAncnNhJ1xuICAgICAgICB9LFxuICAgICAgICBvdXRwdXRQYXRoczogW1xuICAgICAgICAgICdLZXlOYW1lJyxcbiAgICAgICAgICAnS2V5TWF0ZXJpYWwnXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBvbkRlbGV0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgYWN0aW9uOiAnZGVsZXRlS2V5UGFpcicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBLZXlOYW1lLFxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qga2V5TWF0ZXJpYWwgPSBzc2hLZXlQYWlyLmdldFJlc3BvbnNlRmllbGQoJ0tleU1hdGVyaWFsJyk7XG4gICAgY29uc3Qga2V5TmFtZSA9IHNzaEtleVBhaXIuZ2V0UmVzcG9uc2VGaWVsZCgnS2V5TmFtZScpO1xuXG5cbiAgICAvLyBDcmVhdGUgb3VyIEVLUyBjbHVzdGVyLlxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWtzLkNsdXN0ZXIodGhpcywgJ0NsdXN0ZXInLCB7XG4gICAgICB2cGMsXG4gICAgICB2ZXJzaW9uOiBla3MuS3ViZXJuZXRlc1ZlcnNpb24uVjFfMjEsXG4gICAgICBjbHVzdGVyTmFtZTogJ2Vrc3dvcmtzaG9wLWVrc2N0bCcsXG4gICAgICBkZWZhdWx0Q2FwYWNpdHk6IDAsXG4gICAgICBtYXN0ZXJzUm9sZTogdGhpcy5jb2RlQnVpbGRSb2xlLFxuICAgIH0pO1xuXG4gICAgLy8gVGhlIE9JREMgcHJvdmlkZXIgaXNuJ3QgaW5pdGlhbGl6ZWQgdW5sZXNzIHdlIGFjY2VzcyBpdFxuICAgIGNsdXN0ZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyO1xuXG4gICAgLy8gQWxsb3cgQ2xvdWQ5IGVudmlyb25tZW50IHRvIG1ha2UgY2hhbmdlcyB0byB0aGUgY2x1c3Rlci5cbiAgICBjbHVzdGVyLmF3c0F1dGguYWRkUm9sZU1hcHBpbmcoaW5zdGFuY2VSb2xlLCB7IGdyb3VwczogWydzeXN0ZW06bWFzdGVycyddIH0pO1xuXG4gICAgY2x1c3Rlci5jb25uZWN0aW9ucy5hbGxvd0Zyb20od29ya3NwYWNlU2VjdXJpdHlHcm91cCwgZWMyLlBvcnQudGNwKDQ0MykpO1xuICAgIGNsdXN0ZXIuY29ubmVjdGlvbnMuYWxsb3dGcm9tKHdvcmtzcGFjZVNlY3VyaXR5R3JvdXAsIGVjMi5Qb3J0LnRjcCgyMikpO1xuXG4gICAgLy8gQ3JlYXRlIGEgbGF1bmNoIHRlbXBsYXRlIGZvciBvdXIgRUtTIG1hbmFnZWQgbm9kZWdyb3VwIHRoYXQgY29uZmlndXJlc1xuICAgIC8vIGt1YmVsZXQgd2l0aCBhIHN0YXRpY1BvZFBhdGguXG4gICAgY29uc3QgdXNlckRhdGEgPSBuZXcgZWMyLk11bHRpcGFydFVzZXJEYXRhKCk7XG4gICAgdXNlckRhdGEuYWRkVXNlckRhdGFQYXJ0KGVjMi5Vc2VyRGF0YS5mb3JMaW51eCgpKTtcbiAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICdzZXQgLXgnLFxuICAgICAgJ2VjaG8gaW5zdGFsbGluZyBrZXJuZWwtZGV2ZWwgcGFja2FnZSBzbyBGYWxjbyBlQlBGIG1vZHVsZSBjYW4gYmUgbG9hZGVkJyxcbiAgICAgICd5dW0gLXkgaW5zdGFsbCBrZXJuZWwtZGV2ZWwnLFxuICAgICAgJ2VjaG8gQWRkaW5nIHN0YXRpY1BvZFBhdGggY29uZmlndXJhdGlvbiB0byBrdWJlbGV0IGNvbmZpZyBmaWxlJyxcbiAgICAgICdta2RpciAtcCAvZXRjL2t1YmVsZXQuZCcsXG4gICAgICAneXVtIC15IGluc3RhbGwganEnLFxuICAgICAgJ2pxIFxcJy5zdGF0aWNQb2RQYXRoPVwiL2V0Yy9rdWJlbGV0LmRcIlxcJyA8IC9ldGMva3ViZXJuZXRlcy9rdWJlbGV0L2t1YmVsZXQtY29uZmlnLmpzb24gPiAvdG1wL2t1YmVsZXQtY29uZmlnLmpzb24nLFxuICAgICAgJ212IC90bXAva3ViZWxldC1jb25maWcuanNvbiAvZXRjL2t1YmVybmV0ZXMva3ViZWxldC9rdWJlbGV0LWNvbmZpZy5qc29uJyxcbiAgICAgICdzeXN0ZW1jdGwgcmVzdGFydCBrdWJlbGV0J1xuICAgICk7XG5cbiAgICBjb25zdCBsYXVuY2hUZW1wbGF0ZSA9IG5ldyBlYzIuTGF1bmNoVGVtcGxhdGUodGhpcywgJ05vZGVMYXVuY2hUZW1wbGF0ZScsIHtcbiAgICAgIHVzZXJEYXRhLFxuICAgICAga2V5TmFtZSxcbiAgICAgIGJsb2NrRGV2aWNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGV2aWNlTmFtZTogJy9kZXYveHZkYScsXG4gICAgICAgICAgdm9sdW1lOiB7XG4gICAgICAgICAgICBlYnNEZXZpY2U6IHtcbiAgICAgICAgICAgICAgdm9sdW1lVHlwZTogZWMyLkVic0RldmljZVZvbHVtZVR5cGUuR1AzLFxuICAgICAgICAgICAgICAvLyBlbnN1cmUgYWRlcXVhdGUgcm9vbSBmb3IgZm9yZW5zaWNzIGR1bXBzXG4gICAgICAgICAgICAgIHZvbHVtZVNpemU6IDEwMFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIE1hbmFnZWQgTm9kZWdyb3VwLlxuICAgIGNvbnN0IG5vZGVncm91cCA9IG5ldyBla3MuTm9kZWdyb3VwKHRoaXMsICduZy0xJywge1xuICAgICAgY2x1c3RlcixcbiAgICAgIGRlc2lyZWRTaXplOiAzLFxuICAgICAgaW5zdGFuY2VUeXBlczogW2VjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuTTVBLCBlYzIuSW5zdGFuY2VTaXplLlhMQVJHRSldLFxuICAgICAgc3VibmV0czogdnBjLnNlbGVjdFN1Ym5ldHMoeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfTkFUIH0pLFxuICAgICAgbGF1bmNoVGVtcGxhdGVTcGVjOiB7XG4gICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vYXdzL2F3cy1jZGsvaXNzdWVzLzY3MzRcbiAgICAgICAgaWQ6IChsYXVuY2hUZW1wbGF0ZS5ub2RlLmRlZmF1bHRDaGlsZCBhcyBlYzIuQ2ZuTGF1bmNoVGVtcGxhdGUpLnJlZixcbiAgICAgICAgdmVyc2lvbjogbGF1bmNoVGVtcGxhdGUubGF0ZXN0VmVyc2lvbk51bWJlcixcbiAgICAgIH1cbiAgICB9KTtcbiAgICBub2RlZ3JvdXAucm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpKTtcbiAgICBcbiAgICBjb25zdCByb2xlID0gbm9kZWdyb3VwLnJvbGU7XG5cbiAgICAvKiBOZWVkIHRvIGZpZ3VyZSB0aGlzIG91dCAtIFRCRCAtIFJBTkpJVEghISEhISFcbiAgICBFcnJvciBvbiBkb2N1bWVudCBub3QgYmVpbmcgYWJsZSB0byBiZSBhc3NpZ25lZCB0byBQb2xpY3lEb2N1bWVudCB0eXBlLlxuXG4gICAgcm9sZT8uYXR0YWNoSW5saW5lUG9saWN5KG5ldyBpYW0uUG9saWN5KHRoaXMsICdzYWFzLWlubGluZS1wb2xpY3knLCB7XG4gICAgICBkb2N1bWVudDogbm9kZVJvbGVQb2xpY3lEb2MsXG4gICAgfSlcbiAgICApO1xuICAgICovXG5cbiAgICB0aGlzLm5vZGVHcm91cFJvbGUgPSByb2xlO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTm9kZWdyb3VwUm9sZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogbm9kZWdyb3VwLnJvbGUucm9sZU5hbWVcbiAgICB9KTtcblxuICAgIC8vQ3JlYXRlIEluZ3Jlc3NcbiAgICBjb25zdCBpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lID0gJ2NvbnRyb2xsZXInO1xuXG4gICAgY29uc3QgaW5ncmVzc0NoYXJ0ID0gY2x1c3Rlci5hZGRIZWxtQ2hhcnQoJ0luZ3Jlc3NDb250cm9sbGVyJywge1xuICAgICAgY2hhcnQ6ICduZ2lueC1pbmdyZXNzJyxcbiAgICAgIHJlcG9zaXRvcnk6ICdodHRwczovL2hlbG0ubmdpbnguY29tL3N0YWJsZScsXG4gICAgICByZWxlYXNlOiBpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lLFxuICAgICAgdmFsdWVzOiB7XG4gICAgICAgIGNvbnRyb2xsZXI6IHtcbiAgICAgICAgICBwdWJsaXNoU2VydmljZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNlcnZpY2U6IHtcbiAgICAgICAgICAgIGFubm90YXRpb25zOiB7XG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci10eXBlJzogJ25sYicsXG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci1iYWNrZW5kLXByb3RvY29sJzogJ2h0dHAnLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItc3NsLXBvcnRzJzogJzQ0MycsXG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci1jb25uZWN0aW9uLWlkbGUtdGltZW91dCc6ICczNjAwJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0YXJnZXRQb3J0czoge1xuICAgICAgICAgICAgICBodHRwczogJ2h0dHAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFsYkFkZHJlc3MgPSBuZXcgZWtzLkt1YmVybmV0ZXNPYmplY3RWYWx1ZSh0aGlzLCAnZWxiQWRkcmVzcycsIHtcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBvYmplY3RUeXBlOiAnU2VydmljZScsXG4gICAgICBvYmplY3ROYW1lOiBgJHtpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lfS1uZ2lueC1pbmdyZXNzYCxcbiAgICAgIGpzb25QYXRoOiAnLnN0YXR1cy5sb2FkQmFsYW5jZXIuaW5ncmVzc1swXS5ob3N0bmFtZScsXG4gICAgfSk7XG5cbiAgICBjb25zdCBtYXN0ZXJJbmdyZXNzID0gY2x1c3Rlci5hZGRNYW5pZmVzdCgnbWFzdGVySW5ncmVzc1Jlc291cmNlJywge1xuICAgICAgYXBpVmVyc2lvbjogJ25ldHdvcmtpbmcuazhzLmlvL3YxJyxcbiAgICAgIGtpbmQ6ICdJbmdyZXNzJyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIG5hbWU6ICd3b3Jrc2hvcC1pbmdyZXNzLW1hc3RlcicsXG4gICAgICAgIGFubm90YXRpb25zOiB7XG4gICAgICAgICAgJ2t1YmVybmV0ZXMuaW8vaW5ncmVzcy5jbGFzcyc6ICduZ2lueCcsXG4gICAgICAgICAgJ25naW54Lm9yZy9tZXJnZWFibGUtaW5ncmVzcy10eXBlJzogJ21hc3RlcicsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgc3BlYzoge1xuICAgICAgICBydWxlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGhvc3Q6IGFsYkFkZHJlc3MudmFsdWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgbWFzdGVySW5ncmVzcy5ub2RlLmFkZERlcGVuZGVuY3koaW5ncmVzc0NoYXJ0KTtcblxuICAgIHRoaXMuZWxiVXJsID0gYWxiQWRkcmVzcy52YWx1ZTtcblxuXG4gICAgLy8gU2luY2UgQ2xvdWQ5IGhhcyB0aGUgU1NNIGFnZW50IG9uIGl0LCB3ZSdsbCB0YWtlIGFkdmFudGFnZSBvZiBpdHNcbiAgICAvLyBwcmVzZW5jZSB0byBwcmVwYXJlIHRoZSBpbnN0YW5jZS4gVGhpcyBpbmNsdWRlcyBpbnN0YWxsaW5nIGt1YmVjdGwsXG4gICAgLy8gc2V0dGluZyB1cCB0aGUga3ViZWNvbmZpZyBmaWxlLCBhbmQgaW5zdGFsbGluZyB0aGUgU1NIIHByaXZhdGUga2V5XG4gICAgLy8gaW50byB0aGUgZGVmYXVsdCB1c2VyJ3MgaG9tZSBkaXJlY3RvcnkuIFdlIGNhbiBhZGQgbW9yZSBzdGVwcyBsYXRlclxuICAgIC8vIGlmIHdlIGxpa2UuXG5cbiAgICAvLyBGaXJzdCwgYWxsb3cgU1NNIHRvIHdyaXRlIFJ1biBDb21tYW5kIGxvZ3MgdG8gQ2xvdWRXYXRjaCBMb2dzLiBUaGlzXG4gICAgLy8gd2lsbCBhbGxvdyB1cyB0byBkaWFnbm9zZSBwcm9ibGVtcyBsYXRlci5cbiAgICBjb25zdCBydW5Db21tYW5kUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUnVuQ29tbWFuZFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnc3NtLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcbiAgICBjb25zdCBydW5Db21tYW5kTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUnVuQ29tbWFuZExvZ3MnKTtcbiAgICBydW5Db21tYW5kTG9nR3JvdXAuZ3JhbnRXcml0ZShydW5Db21tYW5kUm9sZSk7XG5cbiAgICAvLyBOb3csIGludm9rZSBSdW5Db21tYW5kLlxuICAgIG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnSW5zdGFuY2VQcmVwJywge1xuICAgICAgaW5zdGFsbExhdGVzdEF3c1NkazogZmFsc2UsXG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TdGF0ZW1lbnRzKFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbcnVuQ29tbWFuZFJvbGUucm9sZUFybl1cbiAgICAgICAgfSksXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnc3NtOlNlbmRDb21tYW5kJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KVxuICAgICAgXSksXG4gICAgICBvblVwZGF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnU1NNJyxcbiAgICAgICAgYWN0aW9uOiAnc2VuZENvbW1hbmQnLFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihwcm9wcy5jbG91ZDlFbnZpcm9ubWVudElkKSxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIERvY3VtZW50TmFtZTogJ0FXUy1SdW5TaGVsbFNjcmlwdCcsXG4gICAgICAgICAgRG9jdW1lbnRWZXJzaW9uOiAnJExBVEVTVCcsXG4gICAgICAgICAgSW5zdGFuY2VJZHM6IFtpbnN0YW5jZUlkXSxcbiAgICAgICAgICBUaW1lb3V0U2Vjb25kczogMzAsXG4gICAgICAgICAgU2VydmljZVJvbGVBcm46IHJ1bkNvbW1hbmRSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgQ2xvdWRXYXRjaE91dHB1dENvbmZpZzoge1xuICAgICAgICAgICAgQ2xvdWRXYXRjaExvZ0dyb3VwTmFtZTogcnVuQ29tbWFuZExvZ0dyb3VwLmxvZ0dyb3VwTmFtZSxcbiAgICAgICAgICAgIENsb3VkV2F0Y2hPdXRwdXRFbmFibGVkOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAvLyBBZGQgY29tbWFuZHMgaGVyZSB0byB0YXN0ZS5cbiAgICAgICAgICAgICAgJ2N1cmwgLXNTTCAtbyAvdG1wL2t1YmVjdGwgaHR0cHM6Ly9hbWF6b24tZWtzLnMzLnVzLXdlc3QtMi5hbWF6b25hd3MuY29tLzEuMjEuMi8yMDIxLTA3LTA1L2Jpbi9saW51eC9hbWQ2NC9rdWJlY3RsJyxcbiAgICAgICAgICAgICAgJ2NobW9kICt4IC90bXAva3ViZWN0bCcsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2t1YmVjdGwgL3Vzci9sb2NhbC9iaW4va3ViZWN0bCcsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnYXdzIGVrcyB1cGRhdGUta3ViZWNvbmZpZyAtLW5hbWUgJHtjbHVzdGVyLmNsdXN0ZXJOYW1lfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXJvbGUtYXJuICR7aW5zdGFuY2VSb2xlLnJvbGVBcm59JyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImV4cG9ydCBBV1NfREVGQVVMVF9SRUdJT049JHt0aGlzLnJlZ2lvbn1cIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiZXhwb3J0IEFXU19SRUdJT049JHt0aGlzLnJlZ2lvbn1cIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdta2RpciAtcCB+Ly5zc2ggJiYgY2htb2QgNzAwIH4vLnNzaCcgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICAvLyBUaGUga2V5IG1hdGVyaWFsIGlzbid0IHByb3Blcmx5IGVzY2FwZWQsIHNvIHdlJ2xsIGp1c3QgYmFzZTY0LWVuY29kZSBpdCBmaXJzdFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCIke2Nkay5Gbi5iYXNlNjQoa2V5TWF0ZXJpYWwpfVwiIHwgYmFzZTY0IC1kID4gfi8uc3NoL2lkX3JzYScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2NobW9kIDYwMCB+Ly5zc2gvaWRfcnNhJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgICdjdXJsIC0tc2lsZW50IC0tbG9jYXRpb24gXCJodHRwczovL2dpdGh1Yi5jb20vd2VhdmV3b3Jrcy9la3NjdGwvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2Vrc2N0bF8kKHVuYW1lIC1zKV9hbWQ2NC50YXIuZ3pcIiB8IHRhciB4eiAtQyAvdG1wJyxcbiAgICAgICAgICAgICAgJ2NobW9kICt4IC90bXAvZWtzY3RsJyxcbiAgICAgICAgICAgICAgJ212IC90bXAvZWtzY3RsIC91c3IvbG9jYWwvYmluJyxcbiAgICAgICAgICAgICAgJ3l1bSAteSBpbnN0YWxsIGpxIGdldHRleHQgYmFzaC1jb21wbGV0aW9uIG1vcmV1dGlscycsXG4gICAgICAgICAgICAgICcvdXNyL2xvY2FsL2Jpbi9rdWJlY3RsIGNvbXBsZXRpb24gYmFzaCA+IC9ldGMvYmFzaF9jb21wbGV0aW9uLmQva3ViZWN0bCcsXG4gICAgICAgICAgICAgICcvdXNyL2xvY2FsL2Jpbi9la3NjdGwgY29tcGxldGlvbiBiYXNoID4gL2V0Yy9iYXNoX2NvbXBsZXRpb24uZC9la3NjdGwnLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJhbGlhcyBrPWt1YmVjdGxcIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiY29tcGxldGUgLUYgX19zdGFydF9rdWJlY3RsIGtcIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgLy8gSW5zdGFsbCBIZWxtXG4gICAgICAgICAgICAgICdjdXJsIC1mc1NMIC1vIC90bXAvaGVsbS50Z3ogaHR0cHM6Ly9nZXQuaGVsbS5zaC9oZWxtLXYzLjcuMS1saW51eC1hbWQ2NC50YXIuZ3onLFxuICAgICAgICAgICAgICAndGFyIC1DIC90bXAgLXh6ZiAvdG1wL2hlbG0udGd6JyxcbiAgICAgICAgICAgICAgJ212IC90bXAvbGludXgtYW1kNjQvaGVsbSAvdXNyL2xvY2FsL2Jpbi9oZWxtJyxcbiAgICAgICAgICAgICAgJ3JtIC1yZiAvdG1wL2hlbG0udGd6IC90bXAvbGludXgtYW1kNjQnLFxuICAgICAgICAgICAgICAvLyBSZXNpemUgdm9sdW1lXG4gICAgICAgICAgICAgIGB2b2x1bWVfaWQ9JChhd3MgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gZWMyIGRlc2NyaWJlLXZvbHVtZXMgLS1maWx0ZXJzIE5hbWU9YXR0YWNobWVudC5pbnN0YW5jZS1pZCxWYWx1ZXM9JHtpbnN0YW5jZUlkfSAtLXF1ZXJ5ICdWb2x1bWVzWzBdLlZvbHVtZUlkJyAtLW91dHB1dCB0ZXh0KWAsXG4gICAgICAgICAgICAgIGBhd3MgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gZWMyIG1vZGlmeS12b2x1bWUgLS12b2x1bWUtaWQgJHZvbHVtZV9pZCAtLXNpemUgMzBgLFxuICAgICAgICAgICAgICAvLyBUaGlzIG11c3QgYmUgdGhlIGxhc3QgbGluZSAtIGRvIG5vdCBhZGQgYW55IGxpbmVzIGFmdGVyIHRoaXMhXG4gICAgICAgICAgICAgIGByZWJvb3RgXG4gICAgICAgICAgICAgIC8vIERvIG5vdCBhZGQgYW55IGxpbmVzIGFmdGVyIHRoaXMhXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgb3V0cHV0UGF0aHM6IFsnQ29tbWFuZElkJ11cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGR5bmFtb0RiRG9jID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBhc3NpZ25TaWRzOiBmYWxzZSxcbiAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hHZXRJdGVtJyxcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvKmBdLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRHluYW1pY0Fzc3VtZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IHRoaXMubm9kZUdyb3VwUm9sZSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIGR5bmFtb1BvbGljeTogZHluYW1vRGJEb2MsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUxCVVJMJywgeyB2YWx1ZTogdGhpcy5lbGJVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzQ29kZWJ1aWxkQXJuJywgeyB2YWx1ZTogdGhpcy5jb2RlQnVpbGRSb2xlLnJvbGVBcm4gfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUm9sZVVzZWRCeVRWTScsIHsgdmFsdWU6IHJvbGVVc2VkQnlUb2tlblZlbmRpbmdNYWNoaW5lLnJvbGVBcm4gfSk7XG5cbiAgfVxufVxuIl19