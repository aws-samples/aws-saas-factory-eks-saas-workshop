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
const node_role_policy_doc_1 = require("./node-role-policy-doc");
const KeyName = 'workshop';
class EksStack extends core_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
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
            version: eks.KubernetesVersion.V1_21,
            clusterName: 'eksworkshop-eksctl',
            defaultCapacity: 0,
            mastersRole: this.codeBuildRole,
        });
        // The OIDC provider isn't initialized unless we access it
        cluster.openIdConnectProvider;
        // Allow Cloud9 environment to make changes to the cluster.
        cluster.awsAuth.addRoleMapping(instanceRole, { groups: ['system:masters'] });
        // Allow Cloud9 environment to make changes to the cluster.
        //cluster.awsAuth.addMastersRole(this.codeBuildRole);
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
            instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE)],
            launchTemplateSpec: {
                // See https://github.com/aws/aws-cdk/issues/6734
                id: launchTemplate.node.defaultChild.ref,
                version: launchTemplate.latestVersionNumber,
            }
        });
        nodegroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        //Export this for later use in the TVM
        const role = nodegroup.role;
        role === null || role === void 0 ? void 0 : role.attachInlinePolicy(new iam.Policy(this, 'saas-inline-policy', {
            document: node_role_policy_doc_1.default,
        }));
        this.nodeGroupRole = role;
        // During internal testing we found that Isengard account baselining
        // was attaching IAM roles to instances in the background. This prevents
        // the stack from being cleanly destroyed, so we will record the instance
        // role name and use it later to delete any attached policies before
        // cleanup.
        new cdk.CfnOutput(this, 'NodegroupRoleName', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWtzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWtzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFtRjtBQUNuRixxQ0FBcUM7QUFFckMsd0NBQXdDO0FBQ3hDLHdDQUF3QztBQUV4Qyx3Q0FBd0M7QUFDeEMsZ0RBQWdEO0FBQ2hELDBDQUEwQztBQUMxQyw4Q0FBOEM7QUFDOUMsNkJBQTZCO0FBQzdCLGlFQUF1RDtBQUV2RCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUM7QUFPM0IsTUFBYSxRQUFTLFNBQVEsa0JBQVc7SUFLdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUd4Qix5RkFBeUY7UUFDeEYsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFGLHdFQUF3RTtRQUN4RSwwRUFBMEU7UUFDMUUscUVBQXFFO1FBQ3JFLCtEQUErRDtRQUMvRCxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9ELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztZQUN4RCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxxQkFBcUIsQ0FBQzthQUNsRTtZQUNELFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBRTFHLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLFlBQVksQ0FBQyxRQUFRO1NBQzdCLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNuRixLQUFLLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1NBQy9CLENBQUMsQ0FBQztRQUVDLDBEQUEwRDtRQUMxRCxNQUFNLGlCQUFpQixHQUFHLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM1RSxNQUFNLEVBQUUsRUFBRSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQztnQkFDOUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZO2FBQ25ELENBQUM7WUFDRixRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0Isa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUM7Z0JBQ3ZFLFVBQVUsRUFBRTtvQkFDVixPQUFPLEVBQUU7d0JBQ1A7NEJBQ0UsSUFBSSxFQUFFLDRCQUE0Qjs0QkFDbEMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDO3lCQUNwQztxQkFDRjtpQkFDRjtnQkFDRCxXQUFXLEVBQUU7b0JBQ1gsdUNBQXVDO29CQUN2QyxpRUFBaUU7aUJBQ2xFO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFDSCxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBRS9GLDBFQUEwRTtRQUMxRSx5RUFBeUU7UUFDekUsMERBQTBEO1FBQzFELE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUMvRixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUM1RSxPQUFPLEVBQUUsc0JBQXNCO1lBQy9CLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7U0FDcEMsQ0FBQyxDQUFDO1FBQ0gsNkJBQTZCLENBQUMsZUFBZSxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUNwRSxPQUFPLEVBQUU7Z0JBQ1AsNENBQTRDO2dCQUM1QywwQ0FBMEM7Z0JBQzFDLGlDQUFpQztnQkFDakMsY0FBYzthQUNmO1lBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsa0NBQWtDO1NBQ3BELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxxQkFBcUIsR0FBRyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQ25GLGNBQWMsRUFBRSw2QkFBNkI7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUNwRCxZQUFZLEVBQUUscUJBQXFCLENBQUMsWUFBWTtZQUNoRCxVQUFVLEVBQUU7Z0JBQ1YsVUFBVSxFQUFFLFVBQVU7Z0JBQ3RCLGtCQUFrQixFQUFFLGVBQWUsQ0FBQyxPQUFPO2FBQzVDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgseURBQXlEO1FBQ3pELE1BQU0sVUFBVSxHQUFHLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDOUQsTUFBTSxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUM7Z0JBQzlDLFNBQVMsRUFBRSxFQUFFLENBQUMsdUJBQXVCLENBQUMsWUFBWTthQUNuRCxDQUFDO1lBQ0YsUUFBUSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRSxlQUFlO2dCQUN2QixrQkFBa0IsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQztnQkFDckQsVUFBVSxFQUFFO29CQUNWLE9BQU87b0JBQ1AsT0FBTyxFQUFFLEtBQUs7aUJBQ2Y7Z0JBQ0QsV0FBVyxFQUFFO29CQUNYLFNBQVM7b0JBQ1QsYUFBYTtpQkFDZDthQUNGO1lBQ0QsUUFBUSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRSxlQUFlO2dCQUN2QixVQUFVLEVBQUU7b0JBQ1YsT0FBTztpQkFDUjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUzRCwwQkFBMEI7UUFDMUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDL0MsT0FBTyxFQUFFLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLO1lBQ3BDLFdBQVcsRUFBRSxvQkFBb0I7WUFDakMsZUFBZSxFQUFFLENBQUM7WUFDbEIsV0FBVyxFQUFFLElBQUksQ0FBQyxhQUFhO1NBQ2hDLENBQUMsQ0FBQztRQUdILDBEQUEwRDtRQUMxRCxPQUFPLENBQUMscUJBQXFCLENBQUM7UUFFOUIsMkRBQTJEO1FBQzNELE9BQU8sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTdFLDJEQUEyRDtRQUMzRCxxREFBcUQ7UUFFbkQseUVBQXlFO1FBQzNFLGdDQUFnQztRQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzdDLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELFFBQVEsQ0FBQyxXQUFXLENBQ2xCLFFBQVEsRUFDUix5RUFBeUUsRUFDekUsNkJBQTZCLEVBQzdCLGdFQUFnRSxFQUNoRSx5QkFBeUIsRUFDekIsbUJBQW1CLEVBQ25CLGlIQUFpSCxFQUNqSCx5RUFBeUUsRUFDekUsMkJBQTJCLENBQzVCLENBQUM7UUFFRixNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hFLFFBQVE7WUFDUixPQUFPO1lBQ1AsWUFBWSxFQUFFO2dCQUNaO29CQUNFLFVBQVUsRUFBRSxXQUFXO29CQUN2QixNQUFNLEVBQUU7d0JBQ04sU0FBUyxFQUFFOzRCQUNULFVBQVUsRUFBRSxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRzs0QkFDdkMsMkNBQTJDOzRCQUMzQyxVQUFVLEVBQUUsR0FBRzt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUNoRCxPQUFPO1lBQ1AsV0FBVyxFQUFFLENBQUM7WUFDZCxhQUFhLEVBQUUsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xGLGtCQUFrQixFQUFFO2dCQUNsQixpREFBaUQ7Z0JBQ2pELEVBQUUsRUFBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQXNDLENBQUMsR0FBRztnQkFDbkUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxtQkFBbUI7YUFDNUM7U0FDRixDQUFDLENBQUM7UUFDSCxTQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBRTVHLHNDQUFzQztRQUN0QyxNQUFNLElBQUksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO1FBQzVCLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxrQkFBa0IsQ0FDdEIsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN2QyxRQUFRLEVBQUUsOEJBQWlCO1NBQzlCLENBQUMsRUFDRjtRQUNGLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBRTFCLG9FQUFvRTtRQUNwRSx3RUFBd0U7UUFDeEUseUVBQXlFO1FBQ3pFLG9FQUFvRTtRQUNwRSxXQUFXO1FBQ1gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRO1NBQy9CLENBQUMsQ0FBQztRQUVILGdCQUFnQjtRQUNoQixNQUFNLDRCQUE0QixHQUFHLFlBQVksQ0FBQztRQUVsRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO1lBQzdELEtBQUssRUFBRSxlQUFlO1lBQ3RCLFVBQVUsRUFBRSwrQkFBK0I7WUFDM0MsT0FBTyxFQUFFLDRCQUE0QjtZQUNyQyxNQUFNLEVBQUU7Z0JBQ04sVUFBVSxFQUFFO29CQUNWLGNBQWMsRUFBRTt3QkFDZCxPQUFPLEVBQUUsSUFBSTtxQkFDZDtvQkFDRCxPQUFPLEVBQUU7d0JBQ1AsV0FBVyxFQUFFOzRCQUNYLG1EQUFtRCxFQUFFLEtBQUs7NEJBQzFELCtEQUErRCxFQUFFLE1BQU07NEJBQ3ZFLHdEQUF3RCxFQUFFLEtBQUs7NEJBQy9ELHNFQUFzRSxFQUFFLE1BQU07eUJBQy9FO3dCQUNELFdBQVcsRUFBRTs0QkFDWCxLQUFLLEVBQUUsTUFBTTt5QkFDZDtxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNuRSxPQUFPO1lBQ1AsVUFBVSxFQUFFLFNBQVM7WUFDckIsVUFBVSxFQUFFLEdBQUcsNEJBQTRCLGdCQUFnQjtZQUMzRCxRQUFRLEVBQUUsMENBQTBDO1NBQ3JELENBQUMsQ0FBQztRQUVILE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsdUJBQXVCLEVBQUU7WUFDakUsVUFBVSxFQUFFLHNCQUFzQjtZQUNsQyxJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRTtnQkFDUixJQUFJLEVBQUUseUJBQXlCO2dCQUMvQixXQUFXLEVBQUU7b0JBQ1gsNkJBQTZCLEVBQUUsT0FBTztvQkFDdEMsa0NBQWtDLEVBQUUsUUFBUTtpQkFDN0M7YUFDRjtZQUNELElBQUksRUFBRTtnQkFDSixLQUFLLEVBQUU7b0JBQ0w7d0JBQ0UsSUFBSSxFQUFFLFVBQVUsQ0FBQyxLQUFLO3FCQUN2QjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFL0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRTNCLG9FQUFvRTtRQUN4RSxzRUFBc0U7UUFDdEUscUVBQXFFO1FBQ3JFLHNFQUFzRTtRQUN0RSxjQUFjO1FBRWQsc0VBQXNFO1FBQ3RFLDRDQUE0QztRQUM1QyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztTQUN6RCxDQUFDLENBQUM7UUFDSCxNQUFNLGtCQUFrQixHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNyRSxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFOUMsMEJBQTBCO1FBQzFCLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDN0MsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixNQUFNLEVBQUUsRUFBRSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQztnQkFDaEQsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixPQUFPLEVBQUUsQ0FBQyxjQUFjLENBQUM7b0JBQ3pCLFNBQVMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUM7aUJBQ3BDLENBQUM7Z0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixPQUFPLEVBQUU7d0JBQ1AsaUJBQWlCO3FCQUNsQjtvQkFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7aUJBQ2pCLENBQUM7YUFDSCxDQUFDO1lBQ0YsUUFBUSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRSxhQUFhO2dCQUNyQixrQkFBa0IsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQztnQkFDdkUsVUFBVSxFQUFFO29CQUNWLFlBQVksRUFBRSxvQkFBb0I7b0JBQ2xDLGVBQWUsRUFBRSxTQUFTO29CQUMxQixXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUM7b0JBQ3pCLGNBQWMsRUFBRSxFQUFFO29CQUNsQixjQUFjLEVBQUUsY0FBYyxDQUFDLE9BQU87b0JBQ3RDLHNCQUFzQixFQUFFO3dCQUN0QixzQkFBc0IsRUFBRSxrQkFBa0IsQ0FBQyxZQUFZO3dCQUN2RCx1QkFBdUIsRUFBRSxJQUFJO3FCQUM5QjtvQkFDRCxVQUFVLEVBQUU7d0JBQ1YsUUFBUSxFQUFFOzRCQUNSLDhCQUE4Qjs0QkFDOUIsbUhBQW1IOzRCQUNuSCx1QkFBdUI7NEJBQ3ZCLHdDQUF3Qzs0QkFDeEMsOENBQThDLE9BQU8sQ0FBQyxXQUFXLGFBQWEsSUFBSSxDQUFDLE1BQU0sZUFBZSxZQUFZLENBQUMsT0FBTyxZQUFZOzRCQUN4SSw2Q0FBNkMsSUFBSSxDQUFDLE1BQU0sZ0NBQWdDOzRCQUN4RixxQ0FBcUMsSUFBSSxDQUFDLE1BQU0sZ0NBQWdDOzRCQUNoRix5REFBeUQ7NEJBQ3pELGdGQUFnRjs0QkFDaEYsbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx5Q0FBeUM7NEJBQ3RGLDZDQUE2Qzs0QkFDN0MsMklBQTJJOzRCQUMzSSxzQkFBc0I7NEJBQ3RCLCtCQUErQjs0QkFDL0IscURBQXFEOzRCQUNyRCx5RUFBeUU7NEJBQ3pFLHVFQUF1RTs0QkFDdkUsK0RBQStEOzRCQUMvRCw2RUFBNkU7NEJBQzdFLGVBQWU7NEJBQ2YsZ0ZBQWdGOzRCQUNoRixnQ0FBZ0M7NEJBQ2hDLDhDQUE4Qzs0QkFDOUMsdUNBQXVDOzRCQUN2QyxnQkFBZ0I7NEJBQ2hCLDRCQUE0QixJQUFJLENBQUMsTUFBTSxzRUFBc0UsVUFBVSwrQ0FBK0M7NEJBQ3RLLGdCQUFnQixJQUFJLENBQUMsTUFBTSxxREFBcUQ7NEJBQ2hGLGdFQUFnRTs0QkFDaEUsUUFBUTs0QkFDUixtQ0FBbUM7eUJBQ3BDO3FCQUNGO2lCQUNGO2dCQUNELFdBQVcsRUFBRSxDQUFDLFdBQVcsQ0FBQzthQUMzQjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztZQUN6QyxVQUFVLEVBQUUsS0FBSztZQUNqQixVQUFVLEVBQUU7Z0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO29CQUN4QixPQUFPLEVBQUU7d0JBQ1Asa0JBQWtCO3dCQUNsQixrQkFBa0I7d0JBQ2xCLHVCQUF1Qjt3QkFDdkIsZ0JBQWdCO3dCQUNoQixlQUFlO3dCQUNmLHdCQUF3QjtxQkFDekI7b0JBQ0QsU0FBUyxFQUFFLENBQUMsb0JBQW9CLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sVUFBVSxDQUFDO2lCQUN2RSxDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLDZCQUE2QixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUUsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQzdCLGNBQWMsRUFBRTtnQkFDZCxZQUFZLEVBQUUsV0FBVzthQUMxQjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFFekYsQ0FBQztDQUNGO0FBaFhELDRCQWdYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5lc3RlZFN0YWNrLCBOZXN0ZWRTdGFja1Byb3BzLCBDb25zdHJ1Y3QsIENmbk91dHB1dH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbmltcG9ydCAqIGFzIGVrcyBmcm9tICdAYXdzLWNkay9hd3MtZWtzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdAYXdzLWNkay9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ0Bhd3MtY2RrL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnQGF3cy1jZGsvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdAYXdzLWNkay9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnQGF3cy1jZGsvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBub2RlUm9sZVBvbGljeURvYyBmcm9tICcuL25vZGUtcm9sZS1wb2xpY3ktZG9jJztcblxuY29uc3QgS2V5TmFtZSA9ICd3b3Jrc2hvcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWtzU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICB2cGNJZDogc3RyaW5nXG4gIGNsb3VkOUVudmlyb25tZW50SWQ6IHN0cmluZ1xuICBjb2RlQnVpbGRSb2xlQXJuOiBzdHJpbmdcbn1cbmV4cG9ydCBjbGFzcyBFa3NTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG4gIG5vZGVHcm91cFJvbGU6IGlhbS5JUm9sZTtcbiAgY29kZUJ1aWxkUm9sZTogaWFtLklSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFa3NTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cblxuICAgIC8vIENvZGVCdWlsZCByb2xlIGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgZnJvbSB0aGUgQlVJTERfUk9MRV9BUk4gZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAgIHRoaXMuY29kZUJ1aWxkUm9sZSA9IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdDb2RlQnVpbGRSb2xlJywgcHJvcHMuY29kZUJ1aWxkUm9sZUFybik7XG5cbiAgICAvLyBDcmVhdGUgYW4gRUMyIGluc3RhbmNlIHJvbGUgZm9yIHRoZSBDbG91ZDkgZW52aXJvbm1lbnQuIFRoaXMgaW5zdGFuY2VcbiAgICAvLyByb2xlIGlzIHBvd2VyZnVsLCBhbGxvd2luZyB0aGUgcGFydGljaXBhbnQgdG8gaGF2ZSB1bmZldHRlcmVkIGFjY2VzcyB0b1xuICAgIC8vIHRoZSBwcm92aXNpb25lZCBhY2NvdW50LiBUaGlzIG1pZ2h0IGJlIHRvbyBicm9hZC4gSXQncyBwb3NzaWJsZSB0b1xuICAgIC8vIHRpZ2h0ZW4gdGhpcyBkb3duLCBidXQgdGhlcmUgbWF5IGJlIHVuaW50ZW5kZWQgY29uc2VxdWVuY2VzLlxuICAgIGNvbnN0IGluc3RhbmNlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya3NwYWNlSW5zdGFuY2VSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzJylcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBFQzIgaW5zdGFuY2Ugcm9sZSdcbiAgICB9KTtcbiAgICBpbnN0YW5jZVJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IGluc3RhbmNlUm9sZS5yb2xlTmFtZVxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5DZm5JbnN0YW5jZVByb2ZpbGUodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgIHJvbGVzOiBbaW5zdGFuY2VSb2xlLnJvbGVOYW1lXVxuICAgIH0pO1xuXG4gICAgICAgIC8vIE9idGFpbiBDbG91ZDkgd29ya3NwYWNlIGluc3RhbmNlIElEIGFuZCBzZWN1cml0eSBncm91cC5cbiAgICAgICAgY29uc3Qgd29ya3NwYWNlSW5zdGFuY2UgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlJywge1xuICAgICAgICAgIHBvbGljeTogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgICAgIHJlc291cmNlczogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuQU5ZX1JFU09VUkNFLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgICAgIGFjdGlvbjogJ2Rlc2NyaWJlSW5zdGFuY2VzJyxcbiAgICAgICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKHByb3BzLmNsb3VkOUVudmlyb25tZW50SWQpLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBGaWx0ZXJzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgTmFtZTogJ3RhZzphd3M6Y2xvdWQ5OmVudmlyb25tZW50JyxcbiAgICAgICAgICAgICAgICAgIFZhbHVlczogW3Byb3BzLmNsb3VkOUVudmlyb25tZW50SWRdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3V0cHV0UGF0aHM6IFtcbiAgICAgICAgICAgICAgJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLkluc3RhbmNlSWQnLFxuICAgICAgICAgICAgICAnUmVzZXJ2YXRpb25zLjAuSW5zdGFuY2VzLjAuTmV0d29ya0ludGVyZmFjZXMuMC5Hcm91cHMuMC5Hcm91cElkJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlSWQgPSB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5JbnN0YW5jZUlkJyk7ICAgIFxuICAgIFxuICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGEgQ3VzdG9tIFJlc291cmNlIHRoYXQgZGV0YWNoZXMgYW55IGV4aXN0aW5nIElBTVxuICAgICAgICAvLyBpbnN0YW5jZSBwcm9maWxlIHRoYXQgbWlnaHQgYmUgYXR0YWNoZWQgdG8gdGhlIENsb3VkOSBFbnZpcm9ubWVudCwgYW5kXG4gICAgICAgIC8vIHJlcGxhY2VzIGl0IHdpdGggdGhlIHByb2ZpbGUrcm9sZSB3ZSBjcmVhdGVkIG91cnNlbHZlcy5cbiAgICAgICAgY29uc3QgdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGRhdGVJbnN0YW5jZVByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJ3VwZGF0ZS1pbnN0YW5jZS1wcm9maWxlJykpLFxuICAgICAgICAgIGhhbmRsZXI6ICdpbmRleC5vbkV2ZW50SGFuZGxlcicsXG4gICAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1hcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2VjMjpEZXNjcmliZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9ucycsXG4gICAgICAgICAgICAnZWMyOlJlcGxhY2VJYW1JbnN0YW5jZVByb2ZpbGVBc3NvY2lhdGlvbicsXG4gICAgICAgICAgICAnZWMyOkFzc29jaWF0ZUlhbUluc3RhbmNlUHJvZmlsZScsXG4gICAgICAgICAgICAnaWFtOlBhc3NSb2xlJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSAvLyBUT0RPOiB1c2Ugc3BlY2lmaWMgaW5zdGFuY2UgQVJOXG4gICAgICAgIH0pKTtcbiAgICBcbiAgICAgICAgY29uc3QgdXBkYXRlSW5zdGFuY2VQcm9maWxlID0gbmV3IGNyLlByb3ZpZGVyKHRoaXMsICdVcGRhdGVJbnN0YW5jZVByb2ZpbGVQcm92aWRlcicsIHtcbiAgICAgICAgICBvbkV2ZW50SGFuZGxlcjogdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdVcGRhdGVJbnN0YW5jZVByb2ZpbGUnLCB7XG4gICAgICAgICAgc2VydmljZVRva2VuOiB1cGRhdGVJbnN0YW5jZVByb2ZpbGUuc2VydmljZVRva2VuLFxuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIEluc3RhbmNlSWQ6IGluc3RhbmNlSWQsXG4gICAgICAgICAgICBJbnN0YW5jZVByb2ZpbGVBcm46IGluc3RhbmNlUHJvZmlsZS5hdHRyQXJuXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gQ3JlYXRlIGFuIFNTSCBrZXkgcGFpciBmb3IgbG9nZ2luZyBpbnRvIHRoZSBLOFMgbm9kZXMuXG4gICAgICAgIGNvbnN0IHNzaEtleVBhaXIgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1NTSEtleVBhaXInLCB7XG4gICAgICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU2RrQ2FsbHMoe1xuICAgICAgICAgICAgcmVzb3VyY2VzOiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5BTllfUkVTT1VSQ0UsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgb25DcmVhdGU6IHtcbiAgICAgICAgICAgIHNlcnZpY2U6ICdFQzInLFxuICAgICAgICAgICAgYWN0aW9uOiAnY3JlYXRlS2V5UGFpcicsXG4gICAgICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihLZXlOYW1lKSxcbiAgICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgS2V5TmFtZSxcbiAgICAgICAgICAgICAgS2V5VHlwZTogJ3JzYSdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvdXRwdXRQYXRoczogW1xuICAgICAgICAgICAgICAnS2V5TmFtZScsXG4gICAgICAgICAgICAgICdLZXlNYXRlcmlhbCdcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9LFxuICAgICAgICAgIG9uRGVsZXRlOiB7XG4gICAgICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgICAgIGFjdGlvbjogJ2RlbGV0ZUtleVBhaXInLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBLZXlOYW1lLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBjb25zdCBrZXlNYXRlcmlhbCA9IHNzaEtleVBhaXIuZ2V0UmVzcG9uc2VGaWVsZCgnS2V5TWF0ZXJpYWwnKTtcbiAgICAgICAgY29uc3Qga2V5TmFtZSA9IHNzaEtleVBhaXIuZ2V0UmVzcG9uc2VGaWVsZCgnS2V5TmFtZScpO1xuICAgIFxuICAgIC8vIENyZWF0ZSBvdXIgRUtTIGNsdXN0ZXIuXG4gICAgY29uc3QgY2x1c3RlciA9IG5ldyBla3MuQ2x1c3Rlcih0aGlzLCAnQ2x1c3RlcicsIHtcbiAgICAgIHZlcnNpb246IGVrcy5LdWJlcm5ldGVzVmVyc2lvbi5WMV8yMSxcbiAgICAgIGNsdXN0ZXJOYW1lOiAnZWtzd29ya3Nob3AtZWtzY3RsJyxcbiAgICAgIGRlZmF1bHRDYXBhY2l0eTogMCxcbiAgICAgIG1hc3RlcnNSb2xlOiB0aGlzLmNvZGVCdWlsZFJvbGUsXG4gICAgfSk7XG5cbiAgICBcbiAgICAvLyBUaGUgT0lEQyBwcm92aWRlciBpc24ndCBpbml0aWFsaXplZCB1bmxlc3Mgd2UgYWNjZXNzIGl0XG4gICAgY2x1c3Rlci5vcGVuSWRDb25uZWN0UHJvdmlkZXI7XG5cbiAgICAvLyBBbGxvdyBDbG91ZDkgZW52aXJvbm1lbnQgdG8gbWFrZSBjaGFuZ2VzIHRvIHRoZSBjbHVzdGVyLlxuICAgIGNsdXN0ZXIuYXdzQXV0aC5hZGRSb2xlTWFwcGluZyhpbnN0YW5jZVJvbGUsIHsgZ3JvdXBzOiBbJ3N5c3RlbTptYXN0ZXJzJ10gfSk7XG5cbiAgICAvLyBBbGxvdyBDbG91ZDkgZW52aXJvbm1lbnQgdG8gbWFrZSBjaGFuZ2VzIHRvIHRoZSBjbHVzdGVyLlxuICAgIC8vY2x1c3Rlci5hd3NBdXRoLmFkZE1hc3RlcnNSb2xlKHRoaXMuY29kZUJ1aWxkUm9sZSk7XG5cbiAgICAgIC8vIENyZWF0ZSBhIGxhdW5jaCB0ZW1wbGF0ZSBmb3Igb3VyIEVLUyBtYW5hZ2VkIG5vZGVncm91cCB0aGF0IGNvbmZpZ3VyZXNcbiAgICAvLyBrdWJlbGV0IHdpdGggYSBzdGF0aWNQb2RQYXRoLlxuICAgIGNvbnN0IHVzZXJEYXRhID0gbmV3IGVjMi5NdWx0aXBhcnRVc2VyRGF0YSgpO1xuICAgIHVzZXJEYXRhLmFkZFVzZXJEYXRhUGFydChlYzIuVXNlckRhdGEuZm9yTGludXgoKSk7XG4gICAgdXNlckRhdGEuYWRkQ29tbWFuZHMoXG4gICAgICAnc2V0IC14JyxcbiAgICAgICdlY2hvIGluc3RhbGxpbmcga2VybmVsLWRldmVsIHBhY2thZ2Ugc28gRmFsY28gZUJQRiBtb2R1bGUgY2FuIGJlIGxvYWRlZCcsXG4gICAgICAneXVtIC15IGluc3RhbGwga2VybmVsLWRldmVsJyxcbiAgICAgICdlY2hvIEFkZGluZyBzdGF0aWNQb2RQYXRoIGNvbmZpZ3VyYXRpb24gdG8ga3ViZWxldCBjb25maWcgZmlsZScsXG4gICAgICAnbWtkaXIgLXAgL2V0Yy9rdWJlbGV0LmQnLFxuICAgICAgJ3l1bSAteSBpbnN0YWxsIGpxJyxcbiAgICAgICdqcSBcXCcuc3RhdGljUG9kUGF0aD1cIi9ldGMva3ViZWxldC5kXCJcXCcgPCAvZXRjL2t1YmVybmV0ZXMva3ViZWxldC9rdWJlbGV0LWNvbmZpZy5qc29uID4gL3RtcC9rdWJlbGV0LWNvbmZpZy5qc29uJyxcbiAgICAgICdtdiAvdG1wL2t1YmVsZXQtY29uZmlnLmpzb24gL2V0Yy9rdWJlcm5ldGVzL2t1YmVsZXQva3ViZWxldC1jb25maWcuanNvbicsXG4gICAgICAnc3lzdGVtY3RsIHJlc3RhcnQga3ViZWxldCdcbiAgICApO1xuXG4gICAgY29uc3QgbGF1bmNoVGVtcGxhdGUgPSBuZXcgZWMyLkxhdW5jaFRlbXBsYXRlKHRoaXMsICdOb2RlTGF1bmNoVGVtcGxhdGUnLCB7XG4gICAgICB1c2VyRGF0YSxcbiAgICAgIGtleU5hbWUsXG4gICAgICBibG9ja0RldmljZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGRldmljZU5hbWU6ICcvZGV2L3h2ZGEnLFxuICAgICAgICAgIHZvbHVtZToge1xuICAgICAgICAgICAgZWJzRGV2aWNlOiB7XG4gICAgICAgICAgICAgIHZvbHVtZVR5cGU6IGVjMi5FYnNEZXZpY2VWb2x1bWVUeXBlLkdQMyxcbiAgICAgICAgICAgICAgLy8gZW5zdXJlIGFkZXF1YXRlIHJvb20gZm9yIGZvcmVuc2ljcyBkdW1wc1xuICAgICAgICAgICAgICB2b2x1bWVTaXplOiAxMDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBNYW5hZ2VkIE5vZGVncm91cC5cbiAgICBjb25zdCBub2RlZ3JvdXAgPSBuZXcgZWtzLk5vZGVncm91cCh0aGlzLCAnbmctMScsIHtcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBkZXNpcmVkU2l6ZTogMyxcbiAgICAgIGluc3RhbmNlVHlwZXM6IFtlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLk01LCBlYzIuSW5zdGFuY2VTaXplLkxBUkdFKV0sXG4gICAgICBsYXVuY2hUZW1wbGF0ZVNwZWM6IHtcbiAgICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvNjczNFxuICAgICAgICBpZDogKGxhdW5jaFRlbXBsYXRlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGVjMi5DZm5MYXVuY2hUZW1wbGF0ZSkucmVmLFxuICAgICAgICB2ZXJzaW9uOiBsYXVuY2hUZW1wbGF0ZS5sYXRlc3RWZXJzaW9uTnVtYmVyLFxuICAgICAgfVxuICAgIH0pO1xuICAgIG5vZGVncm91cC5yb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJykpO1xuXG4gICAgLy9FeHBvcnQgdGhpcyBmb3IgbGF0ZXIgdXNlIGluIHRoZSBUVk1cbiAgICBjb25zdCByb2xlID0gbm9kZWdyb3VwLnJvbGU7XG4gICAgcm9sZT8uYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgJ3NhYXMtaW5saW5lLXBvbGljeScsIHtcbiAgICAgICAgICBkb2N1bWVudDogbm9kZVJvbGVQb2xpY3lEb2MsXG4gICAgICB9KVxuICAgICk7XG4gICAgdGhpcy5ub2RlR3JvdXBSb2xlID0gcm9sZTtcbiAgICBcbiAgICAvLyBEdXJpbmcgaW50ZXJuYWwgdGVzdGluZyB3ZSBmb3VuZCB0aGF0IElzZW5nYXJkIGFjY291bnQgYmFzZWxpbmluZ1xuICAgIC8vIHdhcyBhdHRhY2hpbmcgSUFNIHJvbGVzIHRvIGluc3RhbmNlcyBpbiB0aGUgYmFja2dyb3VuZC4gVGhpcyBwcmV2ZW50c1xuICAgIC8vIHRoZSBzdGFjayBmcm9tIGJlaW5nIGNsZWFubHkgZGVzdHJveWVkLCBzbyB3ZSB3aWxsIHJlY29yZCB0aGUgaW5zdGFuY2VcbiAgICAvLyByb2xlIG5hbWUgYW5kIHVzZSBpdCBsYXRlciB0byBkZWxldGUgYW55IGF0dGFjaGVkIHBvbGljaWVzIGJlZm9yZVxuICAgIC8vIGNsZWFudXAuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05vZGVncm91cFJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IG5vZGVncm91cC5yb2xlLnJvbGVOYW1lXG4gICAgfSk7XG4gICAgXG4gICAgLy9DcmVhdGUgSW5ncmVzc1xuICAgIGNvbnN0IGluZ3Jlc3NDb250cm9sbGVyUmVsZWFzZU5hbWUgPSAnY29udHJvbGxlcic7XG5cbiAgICBjb25zdCBpbmdyZXNzQ2hhcnQgPSBjbHVzdGVyLmFkZEhlbG1DaGFydCgnSW5ncmVzc0NvbnRyb2xsZXInLCB7XG4gICAgICBjaGFydDogJ25naW54LWluZ3Jlc3MnLFxuICAgICAgcmVwb3NpdG9yeTogJ2h0dHBzOi8vaGVsbS5uZ2lueC5jb20vc3RhYmxlJyxcbiAgICAgIHJlbGVhc2U6IGluZ3Jlc3NDb250cm9sbGVyUmVsZWFzZU5hbWUsXG4gICAgICB2YWx1ZXM6IHtcbiAgICAgICAgY29udHJvbGxlcjoge1xuICAgICAgICAgIHB1Ymxpc2hTZXJ2aWNlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2VydmljZToge1xuICAgICAgICAgICAgYW5ub3RhdGlvbnM6IHtcbiAgICAgICAgICAgICAgJ3NlcnZpY2UuYmV0YS5rdWJlcm5ldGVzLmlvL2F3cy1sb2FkLWJhbGFuY2VyLXR5cGUnOiAnbmxiJyxcbiAgICAgICAgICAgICAgJ3NlcnZpY2UuYmV0YS5rdWJlcm5ldGVzLmlvL2F3cy1sb2FkLWJhbGFuY2VyLWJhY2tlbmQtcHJvdG9jb2wnOiAnaHR0cCcsXG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci1zc2wtcG9ydHMnOiAnNDQzJyxcbiAgICAgICAgICAgICAgJ3NlcnZpY2UuYmV0YS5rdWJlcm5ldGVzLmlvL2F3cy1sb2FkLWJhbGFuY2VyLWNvbm5lY3Rpb24taWRsZS10aW1lb3V0JzogJzM2MDAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRhcmdldFBvcnRzOiB7XG4gICAgICAgICAgICAgIGh0dHBzOiAnaHR0cCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgYWxiQWRkcmVzcyA9IG5ldyBla3MuS3ViZXJuZXRlc09iamVjdFZhbHVlKHRoaXMsICdlbGJBZGRyZXNzJywge1xuICAgICAgY2x1c3RlcixcbiAgICAgIG9iamVjdFR5cGU6ICdTZXJ2aWNlJyxcbiAgICAgIG9iamVjdE5hbWU6IGAke2luZ3Jlc3NDb250cm9sbGVyUmVsZWFzZU5hbWV9LW5naW54LWluZ3Jlc3NgLFxuICAgICAganNvblBhdGg6ICcuc3RhdHVzLmxvYWRCYWxhbmNlci5pbmdyZXNzWzBdLmhvc3RuYW1lJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IG1hc3RlckluZ3Jlc3MgPSBjbHVzdGVyLmFkZE1hbmlmZXN0KCdtYXN0ZXJJbmdyZXNzUmVzb3VyY2UnLCB7XG4gICAgICBhcGlWZXJzaW9uOiAnbmV0d29ya2luZy5rOHMuaW8vdjEnLFxuICAgICAga2luZDogJ0luZ3Jlc3MnLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgbmFtZTogJ3dvcmtzaG9wLWluZ3Jlc3MtbWFzdGVyJyxcbiAgICAgICAgYW5ub3RhdGlvbnM6IHtcbiAgICAgICAgICAna3ViZXJuZXRlcy5pby9pbmdyZXNzLmNsYXNzJzogJ25naW54JyxcbiAgICAgICAgICAnbmdpbngub3JnL21lcmdlYWJsZS1pbmdyZXNzLXR5cGUnOiAnbWFzdGVyJyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBzcGVjOiB7XG4gICAgICAgIHJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaG9zdDogYWxiQWRkcmVzcy52YWx1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBtYXN0ZXJJbmdyZXNzLm5vZGUuYWRkRGVwZW5kZW5jeShpbmdyZXNzQ2hhcnQpO1xuXG4gICAgdGhpcy5lbGJVcmwgPSBhbGJBZGRyZXNzLnZhbHVlO1xuXG4gICAgICAgIC8vIFNpbmNlIENsb3VkOSBoYXMgdGhlIFNTTSBhZ2VudCBvbiBpdCwgd2UnbGwgdGFrZSBhZHZhbnRhZ2Ugb2YgaXRzXG4gICAgLy8gcHJlc2VuY2UgdG8gcHJlcGFyZSB0aGUgaW5zdGFuY2UuIFRoaXMgaW5jbHVkZXMgaW5zdGFsbGluZyBrdWJlY3RsLFxuICAgIC8vIHNldHRpbmcgdXAgdGhlIGt1YmVjb25maWcgZmlsZSwgYW5kIGluc3RhbGxpbmcgdGhlIFNTSCBwcml2YXRlIGtleVxuICAgIC8vIGludG8gdGhlIGRlZmF1bHQgdXNlcidzIGhvbWUgZGlyZWN0b3J5LiBXZSBjYW4gYWRkIG1vcmUgc3RlcHMgbGF0ZXJcbiAgICAvLyBpZiB3ZSBsaWtlLlxuXG4gICAgLy8gRmlyc3QsIGFsbG93IFNTTSB0byB3cml0ZSBSdW4gQ29tbWFuZCBsb2dzIHRvIENsb3VkV2F0Y2ggTG9ncy4gVGhpc1xuICAgIC8vIHdpbGwgYWxsb3cgdXMgdG8gZGlhZ25vc2UgcHJvYmxlbXMgbGF0ZXIuXG4gICAgY29uc3QgcnVuQ29tbWFuZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1J1bkNvbW1hbmRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3NzbS5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG4gICAgY29uc3QgcnVuQ29tbWFuZExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1J1bkNvbW1hbmRMb2dzJyk7XG4gICAgcnVuQ29tbWFuZExvZ0dyb3VwLmdyYW50V3JpdGUocnVuQ29tbWFuZFJvbGUpO1xuXG4gICAgLy8gTm93LCBpbnZva2UgUnVuQ29tbWFuZC5cbiAgICBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0luc3RhbmNlUHJlcCcsIHtcbiAgICAgIGluc3RhbGxMYXRlc3RBd3NTZGs6IGZhbHNlLFxuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU3RhdGVtZW50cyhbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgICAgIHJlc291cmNlczogW3J1bkNvbW1hbmRSb2xlLnJvbGVBcm5dXG4gICAgICAgIH0pLFxuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ3NzbTpTZW5kQ29tbWFuZCdcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgfSlcbiAgICAgIF0pLFxuICAgICAgb25VcGRhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ3NlbmRDb21tYW5kJyxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YocHJvcHMuY2xvdWQ5RW52aXJvbm1lbnRJZCksXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBEb2N1bWVudE5hbWU6ICdBV1MtUnVuU2hlbGxTY3JpcHQnLFxuICAgICAgICAgIERvY3VtZW50VmVyc2lvbjogJyRMQVRFU1QnLFxuICAgICAgICAgIEluc3RhbmNlSWRzOiBbaW5zdGFuY2VJZF0sXG4gICAgICAgICAgVGltZW91dFNlY29uZHM6IDMwLFxuICAgICAgICAgIFNlcnZpY2VSb2xlQXJuOiBydW5Db21tYW5kUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIENsb3VkV2F0Y2hPdXRwdXRDb25maWc6IHtcbiAgICAgICAgICAgIENsb3VkV2F0Y2hMb2dHcm91cE5hbWU6IHJ1bkNvbW1hbmRMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICAgICAgICBDbG91ZFdhdGNoT3V0cHV0RW5hYmxlZDogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgLy8gQWRkIGNvbW1hbmRzIGhlcmUgdG8gdGFzdGUuXG4gICAgICAgICAgICAgICdjdXJsIC1zU0wgLW8gL3RtcC9rdWJlY3RsIGh0dHBzOi8vYW1hem9uLWVrcy5zMy51cy13ZXN0LTIuYW1hem9uYXdzLmNvbS8xLjIxLjIvMjAyMS0wNy0wNS9iaW4vbGludXgvYW1kNjQva3ViZWN0bCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnbXYgL3RtcC9rdWJlY3RsIC91c3IvbG9jYWwvYmluL2t1YmVjdGwnLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2F3cyBla3MgdXBkYXRlLWt1YmVjb25maWcgLS1uYW1lICR7Y2x1c3Rlci5jbHVzdGVyTmFtZX0gLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gLS1yb2xlLWFybiAke2luc3RhbmNlUm9sZS5yb2xlQXJufScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJleHBvcnQgQVdTX0RFRkFVTFRfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImV4cG9ydCBBV1NfUkVHSU9OPSR7dGhpcy5yZWdpb259XCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnbWtkaXIgLXAgfi8uc3NoICYmIGNobW9kIDcwMCB+Ly5zc2gnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgLy8gVGhlIGtleSBtYXRlcmlhbCBpc24ndCBwcm9wZXJseSBlc2NhcGVkLCBzbyB3ZSdsbCBqdXN0IGJhc2U2NC1lbmNvZGUgaXQgZmlyc3RcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiJHtjZGsuRm4uYmFzZTY0KGtleU1hdGVyaWFsKX1cIiB8IGJhc2U2NCAtZCA+IH4vLnNzaC9pZF9yc2EnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdjaG1vZCA2MDAgfi8uc3NoL2lkX3JzYScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICAnY3VybCAtLXNpbGVudCAtLWxvY2F0aW9uIFwiaHR0cHM6Ly9naXRodWIuY29tL3dlYXZld29ya3MvZWtzY3RsL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9la3NjdGxfJCh1bmFtZSAtcylfYW1kNjQudGFyLmd6XCIgfCB0YXIgeHogLUMgL3RtcCcsXG4gICAgICAgICAgICAgICdjaG1vZCAreCAvdG1wL2Vrc2N0bCcsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2Vrc2N0bCAvdXNyL2xvY2FsL2JpbicsXG4gICAgICAgICAgICAgICd5dW0gLXkgaW5zdGFsbCBqcSBnZXR0ZXh0IGJhc2gtY29tcGxldGlvbiBtb3JldXRpbHMnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4va3ViZWN0bCBjb21wbGV0aW9uIGJhc2ggPiAvZXRjL2Jhc2hfY29tcGxldGlvbi5kL2t1YmVjdGwnLFxuICAgICAgICAgICAgICAnL3Vzci9sb2NhbC9iaW4vZWtzY3RsIGNvbXBsZXRpb24gYmFzaCA+IC9ldGMvYmFzaF9jb21wbGV0aW9uLmQvZWtzY3RsJyxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiYWxpYXMgaz1rdWJlY3RsXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImNvbXBsZXRlIC1GIF9fc3RhcnRfa3ViZWN0bCBrXCIgPj4gfi8uYmFzaF9wcm9maWxlJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIC8vIEluc3RhbGwgSGVsbVxuICAgICAgICAgICAgICAnY3VybCAtZnNTTCAtbyAvdG1wL2hlbG0udGd6IGh0dHBzOi8vZ2V0LmhlbG0uc2gvaGVsbS12My43LjEtbGludXgtYW1kNjQudGFyLmd6JyxcbiAgICAgICAgICAgICAgJ3RhciAtQyAvdG1wIC14emYgL3RtcC9oZWxtLnRneicsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2xpbnV4LWFtZDY0L2hlbG0gL3Vzci9sb2NhbC9iaW4vaGVsbScsXG4gICAgICAgICAgICAgICdybSAtcmYgL3RtcC9oZWxtLnRneiAvdG1wL2xpbnV4LWFtZDY0JyxcbiAgICAgICAgICAgICAgLy8gUmVzaXplIHZvbHVtZVxuICAgICAgICAgICAgICBgdm9sdW1lX2lkPSQoYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBkZXNjcmliZS12b2x1bWVzIC0tZmlsdGVycyBOYW1lPWF0dGFjaG1lbnQuaW5zdGFuY2UtaWQsVmFsdWVzPSR7aW5zdGFuY2VJZH0gLS1xdWVyeSAnVm9sdW1lc1swXS5Wb2x1bWVJZCcgLS1vdXRwdXQgdGV4dClgLFxuICAgICAgICAgICAgICBgYXdzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IGVjMiBtb2RpZnktdm9sdW1lIC0tdm9sdW1lLWlkICR2b2x1bWVfaWQgLS1zaXplIDMwYCxcbiAgICAgICAgICAgICAgLy8gVGhpcyBtdXN0IGJlIHRoZSBsYXN0IGxpbmUgLSBkbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgICBgcmVib290YFxuICAgICAgICAgICAgICAvLyBEbyBub3QgYWRkIGFueSBsaW5lcyBhZnRlciB0aGlzIVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG91dHB1dFBhdGhzOiBbJ0NvbW1hbmRJZCddXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBkeW5hbW9EYkRvYyA9IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgYXNzaWduU2lkczogZmFsc2UsXG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOkJhdGNoR2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlVGFibGUnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLypgXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVzZWRCeVRva2VuVmVuZGluZ01hY2hpbmUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0R5bmFtaWNBc3N1bWVSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiB0aGlzLm5vZGVHcm91cFJvbGUsXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBkeW5hbW9Qb2xpY3k6IGR5bmFtb0RiRG9jLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VMQlVSTCcsIHsgdmFsdWU6IHRoaXMuZWxiVXJsIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0Vrc0NvZGVidWlsZEFybicsIHsgdmFsdWU6IHRoaXMuY29kZUJ1aWxkUm9sZS5yb2xlQXJuIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JvbGVVc2VkQnlUVk0nLCB7IHZhbHVlOiByb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZS5yb2xlQXJuIH0pO1xuXG4gIH1cbn1cbiJdfQ==