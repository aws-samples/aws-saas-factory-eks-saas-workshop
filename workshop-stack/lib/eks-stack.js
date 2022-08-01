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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWtzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWtzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFtRjtBQUNuRixxQ0FBcUM7QUFFckMsd0NBQXdDO0FBQ3hDLHdDQUF3QztBQUV4Qyx3Q0FBd0M7QUFDeEMsZ0RBQWdEO0FBQ2hELDBDQUEwQztBQUMxQyw4Q0FBOEM7QUFDOUMsNkJBQTZCO0FBQzdCLGlFQUF1RDtBQUV2RCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUM7QUFPM0IsTUFBYSxRQUFTLFNBQVEsa0JBQVc7SUFLdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUd4Qix5RkFBeUY7UUFDeEYsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFGLHdFQUF3RTtRQUN4RSwwRUFBMEU7UUFDMUUscUVBQXFFO1FBQ3JFLCtEQUErRDtRQUMvRCxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9ELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztZQUN4RCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxxQkFBcUIsQ0FBQzthQUNsRTtZQUNELFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBRTFHLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJC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QUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO29CQUN4QixPQUFPLEVBQUU7d0JBQ1Asa0JBQWtCO3dCQUNsQixrQkFBa0I7d0JBQ2xCLHVCQUF1Qjt3QkFDdkIsZ0JBQWdCO3dCQUNoQixlQUFlO3dCQUNmLHdCQUF3QjtxQkFDekI7b0JBQ0QsU0FBUyxFQUFFLENBQUMsb0JBQW9CLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sVUFBVSxDQUFDO2lCQUN2RSxDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLDZCQUE2QixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUUsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQzdCLGNBQWMsRUFBRTtnQkFDZCxZQUFZLEVBQUUsV0FBVzthQUMxQjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFFekYsQ0FBQztDQUNGO0FBeFhELDRCQXdYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5lc3RlZFN0YWNrLCBOZXN0ZWRTdGFja1Byb3BzLCBDb25zdHJ1Y3QsIENmbk91dHB1dH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbmltcG9ydCAqIGFzIGVrcyBmcm9tICdAYXdzLWNkay9hd3MtZWtzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdAYXdzLWNkay9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ0Bhd3MtY2RrL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnQGF3cy1jZGsvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdAYXdzLWNkay9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnQGF3cy1jZGsvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBub2RlUm9sZVBvbGljeURvYyBmcm9tICcuL25vZGUtcm9sZS1wb2xpY3ktZG9jJztcblxuY29uc3QgS2V5TmFtZSA9ICd3b3Jrc2hvcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWtzU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICB2cGNJZDogc3RyaW5nXG4gIGNsb3VkOUVudmlyb25tZW50SWQ6IHN0cmluZ1xuICBjb2RlQnVpbGRSb2xlQXJuOiBzdHJpbmdcbn1cbmV4cG9ydCBjbGFzcyBFa3NTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG4gIG5vZGVHcm91cFJvbGU6IGlhbS5JUm9sZTtcbiAgY29kZUJ1aWxkUm9sZTogaWFtLklSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFa3NTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cblxuICAgIC8vIENvZGVCdWlsZCByb2xlIGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgZnJvbSB0aGUgQlVJTERfUk9MRV9BUk4gZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAgIHRoaXMuY29kZUJ1aWxkUm9sZSA9IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdDb2RlQnVpbGRSb2xlJywgcHJvcHMuY29kZUJ1aWxkUm9sZUFybik7XG5cbiAgICAvLyBDcmVhdGUgYW4gRUMyIGluc3RhbmNlIHJvbGUgZm9yIHRoZSBDbG91ZDkgZW52aXJvbm1lbnQuIFRoaXMgaW5zdGFuY2VcbiAgICAvLyByb2xlIGlzIHBvd2VyZnVsLCBhbGxvd2luZyB0aGUgcGFydGljaXBhbnQgdG8gaGF2ZSB1bmZldHRlcmVkIGFjY2VzcyB0b1xuICAgIC8vIHRoZSBwcm92aXNpb25lZCBhY2NvdW50LiBUaGlzIG1pZ2h0IGJlIHRvbyBicm9hZC4gSXQncyBwb3NzaWJsZSB0b1xuICAgIC8vIHRpZ2h0ZW4gdGhpcyBkb3duLCBidXQgdGhlcmUgbWF5IGJlIHVuaW50ZW5kZWQgY29uc2VxdWVuY2VzLlxuICAgIGNvbnN0IGluc3RhbmNlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya3NwYWNlSW5zdGFuY2VSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzJylcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBFQzIgaW5zdGFuY2Ugcm9sZSdcbiAgICB9KTtcbiAgICBpbnN0YW5jZVJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdXb3Jrc3BhY2VJbnN0YW5jZVJvbGVOYW1lJywge1xuICAgICAgdmFsdWU6IGluc3RhbmNlUm9sZS5yb2xlTmFtZVxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5DZm5JbnN0YW5jZVByb2ZpbGUodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgIHJvbGVzOiBbaW5zdGFuY2VSb2xlLnJvbGVOYW1lXVxuICAgIH0pO1xuXG4gICAgICAgIC8vIE9idGFpbiBDbG91ZDkgd29ya3NwYWNlIGluc3RhbmNlIElEIGFuZCBzZWN1cml0eSBncm91cC5cbiAgICAgICAgY29uc3Qgd29ya3NwYWNlSW5zdGFuY2UgPSBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1dvcmtzcGFjZUluc3RhbmNlJywge1xuICAgICAgICAgIHBvbGljeTogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVNka0NhbGxzKHtcbiAgICAgICAgICAgIHJlc291cmNlczogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuQU5ZX1JFU09VUkNFLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgICAgICBzZXJ2aWNlOiAnRUMyJyxcbiAgICAgICAgICAgIGFjdGlvbjogJ2Rlc2NyaWJlSW5zdGFuY2VzJyxcbiAgICAgICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKHByb3BzLmNsb3VkOUVudmlyb25tZW50SWQpLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBGaWx0ZXJzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgTmFtZTogJ3RhZzphd3M6Y2xvdWQ5OmVudmlyb25tZW50JyxcbiAgICAgICAgICAgICAgICAgIFZhbHVlczogW3Byb3BzLmNsb3VkOUVudmlyb25tZW50SWRdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3V0cHV0UGF0aHM6IFtcbiAgICAgICAgICAgICAgJ1Jlc2VydmF0aW9ucy4wLkluc3RhbmNlcy4wLkluc3RhbmNlSWQnLFxuICAgICAgICAgICAgICAnUmVzZXJ2YXRpb25zLjAuSW5zdGFuY2VzLjAuTmV0d29ya0ludGVyZmFjZXMuMC5Hcm91cHMuMC5Hcm91cElkJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGluc3RhbmNlSWQgPSB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5JbnN0YW5jZUlkJyk7XG4gICAgXG4gICAgICAgIGNvbnN0IHdvcmtzcGFjZVNlY3VyaXR5R3JvdXAgPSBlYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKFxuICAgICAgICAgIHRoaXMsICdXb3Jrc3BhY2VTZWN1cml0eUdyb3VwJyxcbiAgICAgICAgICB3b3Jrc3BhY2VJbnN0YW5jZS5nZXRSZXNwb25zZUZpZWxkKCdSZXNlcnZhdGlvbnMuMC5JbnN0YW5jZXMuMC5OZXR3b3JrSW50ZXJmYWNlcy4wLkdyb3Vwcy4wLkdyb3VwSWQnKSk7XG4gICAgXG4gICAgXG4gICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gcHJvdmlkZXMgYSBDdXN0b20gUmVzb3VyY2UgdGhhdCBkZXRhY2hlcyBhbnkgZXhpc3RpbmcgSUFNXG4gICAgICAgIC8vIGluc3RhbmNlIHByb2ZpbGUgdGhhdCBtaWdodCBiZSBhdHRhY2hlZCB0byB0aGUgQ2xvdWQ5IEVudmlyb25tZW50LCBhbmRcbiAgICAgICAgLy8gcmVwbGFjZXMgaXQgd2l0aCB0aGUgcHJvZmlsZStyb2xlIHdlIGNyZWF0ZWQgb3Vyc2VsdmVzLlxuICAgICAgICBjb25zdCB1cGRhdGVJbnN0YW5jZVByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwZGF0ZUluc3RhbmNlUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAndXBkYXRlLWluc3RhbmNlLXByb2ZpbGUnKSksXG4gICAgICAgICAgaGFuZGxlcjogJ2luZGV4Lm9uRXZlbnRIYW5kbGVyJyxcbiAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWFxuICAgICAgICB9KTtcbiAgICAgICAgdXBkYXRlSW5zdGFuY2VQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZWMyOkRlc2NyaWJlSWFtSW5zdGFuY2VQcm9maWxlQXNzb2NpYXRpb25zJyxcbiAgICAgICAgICAgICdlYzI6UmVwbGFjZUlhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9uJyxcbiAgICAgICAgICAgICdlYzI6QXNzb2NpYXRlSWFtSW5zdGFuY2VQcm9maWxlJyxcbiAgICAgICAgICAgICdpYW06UGFzc1JvbGUnXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFsnKiddIC8vIFRPRE86IHVzZSBzcGVjaWZpYyBpbnN0YW5jZSBBUk5cbiAgICAgICAgfSkpO1xuICAgIFxuICAgICAgICBjb25zdCB1cGRhdGVJbnN0YW5jZVByb2ZpbGUgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ1VwZGF0ZUluc3RhbmNlUHJvZmlsZVByb3ZpZGVyJywge1xuICAgICAgICAgIG9uRXZlbnRIYW5kbGVyOiB1cGRhdGVJbnN0YW5jZVByb2ZpbGVGdW5jdGlvbixcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1VwZGF0ZUluc3RhbmNlUHJvZmlsZScsIHtcbiAgICAgICAgICBzZXJ2aWNlVG9rZW46IHVwZGF0ZUluc3RhbmNlUHJvZmlsZS5zZXJ2aWNlVG9rZW4sXG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgSW5zdGFuY2VJZDogaW5zdGFuY2VJZCxcbiAgICAgICAgICAgIEluc3RhbmNlUHJvZmlsZUFybjogaW5zdGFuY2VQcm9maWxlLmF0dHJBcm5cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICAvLyBDcmVhdGUgYW4gU1NIIGtleSBwYWlyIGZvciBsb2dnaW5nIGludG8gdGhlIEs4UyBub2Rlcy5cbiAgICAgICAgY29uc3Qgc3NoS2V5UGFpciA9IG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnU1NIS2V5UGFpcicsIHtcbiAgICAgICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TZGtDYWxscyh7XG4gICAgICAgICAgICByZXNvdXJjZXM6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LkFOWV9SRVNPVVJDRSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBvbkNyZWF0ZToge1xuICAgICAgICAgICAgc2VydmljZTogJ0VDMicsXG4gICAgICAgICAgICBhY3Rpb246ICdjcmVhdGVLZXlQYWlyJyxcbiAgICAgICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKEtleU5hbWUpLFxuICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBLZXlOYW1lLFxuICAgICAgICAgICAgICBLZXlUeXBlOiAncnNhJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG91dHB1dFBhdGhzOiBbXG4gICAgICAgICAgICAgICdLZXlOYW1lJyxcbiAgICAgICAgICAgICAgJ0tleU1hdGVyaWFsJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgb25EZWxldGU6IHtcbiAgICAgICAgICAgIHNlcnZpY2U6ICdFQzInLFxuICAgICAgICAgICAgYWN0aW9uOiAnZGVsZXRlS2V5UGFpcicsXG4gICAgICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIEtleU5hbWUsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGtleU1hdGVyaWFsID0gc3NoS2V5UGFpci5nZXRSZXNwb25zZUZpZWxkKCdLZXlNYXRlcmlhbCcpO1xuICAgICAgICBjb25zdCBrZXlOYW1lID0gc3NoS2V5UGFpci5nZXRSZXNwb25zZUZpZWxkKCdLZXlOYW1lJyk7XG4gICAgXG4gICAgLy8gQ3JlYXRlIG91ciBFS1MgY2x1c3Rlci5cbiAgICBjb25zdCBjbHVzdGVyID0gbmV3IGVrcy5DbHVzdGVyKHRoaXMsICdDbHVzdGVyJywge1xuICAgICAgdmVyc2lvbjogZWtzLkt1YmVybmV0ZXNWZXJzaW9uLlYxXzIxLFxuICAgICAgY2x1c3Rlck5hbWU6ICdla3N3b3Jrc2hvcC1la3NjdGwnLFxuICAgICAgZGVmYXVsdENhcGFjaXR5OiAwLFxuICAgICAgbWFzdGVyc1JvbGU6IHRoaXMuY29kZUJ1aWxkUm9sZSxcbiAgICB9KTtcblxuICAgIFxuICAgIC8vIFRoZSBPSURDIHByb3ZpZGVyIGlzbid0IGluaXRpYWxpemVkIHVubGVzcyB3ZSBhY2Nlc3MgaXRcbiAgICBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlcjtcblxuICAgIC8vIEFsbG93IENsb3VkOSBlbnZpcm9ubWVudCB0byBtYWtlIGNoYW5nZXMgdG8gdGhlIGNsdXN0ZXIuXG4gICAgY2x1c3Rlci5hd3NBdXRoLmFkZFJvbGVNYXBwaW5nKGluc3RhbmNlUm9sZSwgeyBncm91cHM6IFsnc3lzdGVtOm1hc3RlcnMnXSB9KTtcblxuICAgIC8vIEFsbG93IENsb3VkOSBlbnZpcm9ubWVudCB0byBtYWtlIGNoYW5nZXMgdG8gdGhlIGNsdXN0ZXIuXG4gICAgLy9jbHVzdGVyLmF3c0F1dGguYWRkTWFzdGVyc1JvbGUodGhpcy5jb2RlQnVpbGRSb2xlKTtcblxuICAgIGNsdXN0ZXIuY29ubmVjdGlvbnMuYWxsb3dGcm9tKHdvcmtzcGFjZVNlY3VyaXR5R3JvdXAsIGVjMi5Qb3J0LnRjcCg0NDMpKTtcbiAgICBjbHVzdGVyLmNvbm5lY3Rpb25zLmFsbG93RnJvbSh3b3Jrc3BhY2VTZWN1cml0eUdyb3VwLCBlYzIuUG9ydC50Y3AoMjIpKTtcblxuICAgICAgLy8gQ3JlYXRlIGEgbGF1bmNoIHRlbXBsYXRlIGZvciBvdXIgRUtTIG1hbmFnZWQgbm9kZWdyb3VwIHRoYXQgY29uZmlndXJlc1xuICAgIC8vIGt1YmVsZXQgd2l0aCBhIHN0YXRpY1BvZFBhdGguXG4gICAgY29uc3QgdXNlckRhdGEgPSBuZXcgZWMyLk11bHRpcGFydFVzZXJEYXRhKCk7XG4gICAgdXNlckRhdGEuYWRkVXNlckRhdGFQYXJ0KGVjMi5Vc2VyRGF0YS5mb3JMaW51eCgpKTtcbiAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICdzZXQgLXgnLFxuICAgICAgJ2VjaG8gaW5zdGFsbGluZyBrZXJuZWwtZGV2ZWwgcGFja2FnZSBzbyBGYWxjbyBlQlBGIG1vZHVsZSBjYW4gYmUgbG9hZGVkJyxcbiAgICAgICd5dW0gLXkgaW5zdGFsbCBrZXJuZWwtZGV2ZWwnLFxuICAgICAgJ2VjaG8gQWRkaW5nIHN0YXRpY1BvZFBhdGggY29uZmlndXJhdGlvbiB0byBrdWJlbGV0IGNvbmZpZyBmaWxlJyxcbiAgICAgICdta2RpciAtcCAvZXRjL2t1YmVsZXQuZCcsXG4gICAgICAneXVtIC15IGluc3RhbGwganEnLFxuICAgICAgJ2pxIFxcJy5zdGF0aWNQb2RQYXRoPVwiL2V0Yy9rdWJlbGV0LmRcIlxcJyA8IC9ldGMva3ViZXJuZXRlcy9rdWJlbGV0L2t1YmVsZXQtY29uZmlnLmpzb24gPiAvdG1wL2t1YmVsZXQtY29uZmlnLmpzb24nLFxuICAgICAgJ212IC90bXAva3ViZWxldC1jb25maWcuanNvbiAvZXRjL2t1YmVybmV0ZXMva3ViZWxldC9rdWJlbGV0LWNvbmZpZy5qc29uJyxcbiAgICAgICdzeXN0ZW1jdGwgcmVzdGFydCBrdWJlbGV0J1xuICAgICk7XG5cbiAgICBjb25zdCBsYXVuY2hUZW1wbGF0ZSA9IG5ldyBlYzIuTGF1bmNoVGVtcGxhdGUodGhpcywgJ05vZGVMYXVuY2hUZW1wbGF0ZScsIHtcbiAgICAgIHVzZXJEYXRhLFxuICAgICAga2V5TmFtZSxcbiAgICAgIGJsb2NrRGV2aWNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGV2aWNlTmFtZTogJy9kZXYveHZkYScsXG4gICAgICAgICAgdm9sdW1lOiB7XG4gICAgICAgICAgICBlYnNEZXZpY2U6IHtcbiAgICAgICAgICAgICAgdm9sdW1lVHlwZTogZWMyLkVic0RldmljZVZvbHVtZVR5cGUuR1AzLFxuICAgICAgICAgICAgICAvLyBlbnN1cmUgYWRlcXVhdGUgcm9vbSBmb3IgZm9yZW5zaWNzIGR1bXBzXG4gICAgICAgICAgICAgIHZvbHVtZVNpemU6IDEwMFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIE1hbmFnZWQgTm9kZWdyb3VwLlxuICAgIGNvbnN0IG5vZGVncm91cCA9IG5ldyBla3MuTm9kZWdyb3VwKHRoaXMsICduZy0xJywge1xuICAgICAgY2x1c3RlcixcbiAgICAgIGRlc2lyZWRTaXplOiAzLFxuICAgICAgaW5zdGFuY2VUeXBlczogW2VjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuTTUsIGVjMi5JbnN0YW5jZVNpemUuTEFSR0UpXSxcbiAgICAgIGxhdW5jaFRlbXBsYXRlU3BlYzoge1xuICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy82NzM0XG4gICAgICAgIGlkOiAobGF1bmNoVGVtcGxhdGUubm9kZS5kZWZhdWx0Q2hpbGQgYXMgZWMyLkNmbkxhdW5jaFRlbXBsYXRlKS5yZWYsXG4gICAgICAgIHZlcnNpb246IGxhdW5jaFRlbXBsYXRlLmxhdGVzdFZlcnNpb25OdW1iZXIsXG4gICAgICB9XG4gICAgfSk7XG4gICAgbm9kZWdyb3VwLnJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG5cbiAgICAvL0V4cG9ydCB0aGlzIGZvciBsYXRlciB1c2UgaW4gdGhlIFRWTVxuICAgIGNvbnN0IHJvbGUgPSBub2RlZ3JvdXAucm9sZTtcbiAgICByb2xlPy5hdHRhY2hJbmxpbmVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCAnc2Fhcy1pbmxpbmUtcG9saWN5Jywge1xuICAgICAgICAgIGRvY3VtZW50OiBub2RlUm9sZVBvbGljeURvYyxcbiAgICAgIH0pXG4gICAgKTtcbiAgICB0aGlzLm5vZGVHcm91cFJvbGUgPSByb2xlO1xuICAgIFxuICAgIC8vIER1cmluZyBpbnRlcm5hbCB0ZXN0aW5nIHdlIGZvdW5kIHRoYXQgSXNlbmdhcmQgYWNjb3VudCBiYXNlbGluaW5nXG4gICAgLy8gd2FzIGF0dGFjaGluZyBJQU0gcm9sZXMgdG8gaW5zdGFuY2VzIGluIHRoZSBiYWNrZ3JvdW5kLiBUaGlzIHByZXZlbnRzXG4gICAgLy8gdGhlIHN0YWNrIGZyb20gYmVpbmcgY2xlYW5seSBkZXN0cm95ZWQsIHNvIHdlIHdpbGwgcmVjb3JkIHRoZSBpbnN0YW5jZVxuICAgIC8vIHJvbGUgbmFtZSBhbmQgdXNlIGl0IGxhdGVyIHRvIGRlbGV0ZSBhbnkgYXR0YWNoZWQgcG9saWNpZXMgYmVmb3JlXG4gICAgLy8gY2xlYW51cC5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTm9kZWdyb3VwUm9sZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogbm9kZWdyb3VwLnJvbGUucm9sZU5hbWVcbiAgICB9KTtcbiAgICBcbiAgICAvL0NyZWF0ZSBJbmdyZXNzXG4gICAgY29uc3QgaW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZSA9ICdjb250cm9sbGVyJztcblxuICAgIGNvbnN0IGluZ3Jlc3NDaGFydCA9IGNsdXN0ZXIuYWRkSGVsbUNoYXJ0KCdJbmdyZXNzQ29udHJvbGxlcicsIHtcbiAgICAgIGNoYXJ0OiAnbmdpbngtaW5ncmVzcycsXG4gICAgICByZXBvc2l0b3J5OiAnaHR0cHM6Ly9oZWxtLm5naW54LmNvbS9zdGFibGUnLFxuICAgICAgcmVsZWFzZTogaW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZSxcbiAgICAgIHZhbHVlczoge1xuICAgICAgICBjb250cm9sbGVyOiB7XG4gICAgICAgICAgcHVibGlzaFNlcnZpY2U6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZXJ2aWNlOiB7XG4gICAgICAgICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItdHlwZSc6ICdubGInLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItYmFja2VuZC1wcm90b2NvbCc6ICdodHRwJyxcbiAgICAgICAgICAgICAgJ3NlcnZpY2UuYmV0YS5rdWJlcm5ldGVzLmlvL2F3cy1sb2FkLWJhbGFuY2VyLXNzbC1wb3J0cyc6ICc0NDMnLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItY29ubmVjdGlvbi1pZGxlLXRpbWVvdXQnOiAnMzYwMCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdGFyZ2V0UG9ydHM6IHtcbiAgICAgICAgICAgICAgaHR0cHM6ICdodHRwJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGJBZGRyZXNzID0gbmV3IGVrcy5LdWJlcm5ldGVzT2JqZWN0VmFsdWUodGhpcywgJ2VsYkFkZHJlc3MnLCB7XG4gICAgICBjbHVzdGVyLFxuICAgICAgb2JqZWN0VHlwZTogJ1NlcnZpY2UnLFxuICAgICAgb2JqZWN0TmFtZTogYCR7aW5ncmVzc0NvbnRyb2xsZXJSZWxlYXNlTmFtZX0tbmdpbngtaW5ncmVzc2AsXG4gICAgICBqc29uUGF0aDogJy5zdGF0dXMubG9hZEJhbGFuY2VyLmluZ3Jlc3NbMF0uaG9zdG5hbWUnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFzdGVySW5ncmVzcyA9IGNsdXN0ZXIuYWRkTWFuaWZlc3QoJ21hc3RlckluZ3Jlc3NSZXNvdXJjZScsIHtcbiAgICAgIGFwaVZlcnNpb246ICduZXR3b3JraW5nLms4cy5pby92MScsXG4gICAgICBraW5kOiAnSW5ncmVzcycsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBuYW1lOiAnd29ya3Nob3AtaW5ncmVzcy1tYXN0ZXInLFxuICAgICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAgICdrdWJlcm5ldGVzLmlvL2luZ3Jlc3MuY2xhc3MnOiAnbmdpbngnLFxuICAgICAgICAgICduZ2lueC5vcmcvbWVyZ2VhYmxlLWluZ3Jlc3MtdHlwZSc6ICdtYXN0ZXInLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHNwZWM6IHtcbiAgICAgICAgcnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBob3N0OiBhbGJBZGRyZXNzLnZhbHVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIG1hc3RlckluZ3Jlc3Mubm9kZS5hZGREZXBlbmRlbmN5KGluZ3Jlc3NDaGFydCk7XG5cbiAgICB0aGlzLmVsYlVybCA9IGFsYkFkZHJlc3MudmFsdWU7XG5cbiAgICAgICAgLy8gU2luY2UgQ2xvdWQ5IGhhcyB0aGUgU1NNIGFnZW50IG9uIGl0LCB3ZSdsbCB0YWtlIGFkdmFudGFnZSBvZiBpdHNcbiAgICAvLyBwcmVzZW5jZSB0byBwcmVwYXJlIHRoZSBpbnN0YW5jZS4gVGhpcyBpbmNsdWRlcyBpbnN0YWxsaW5nIGt1YmVjdGwsXG4gICAgLy8gc2V0dGluZyB1cCB0aGUga3ViZWNvbmZpZyBmaWxlLCBhbmQgaW5zdGFsbGluZyB0aGUgU1NIIHByaXZhdGUga2V5XG4gICAgLy8gaW50byB0aGUgZGVmYXVsdCB1c2VyJ3MgaG9tZSBkaXJlY3RvcnkuIFdlIGNhbiBhZGQgbW9yZSBzdGVwcyBsYXRlclxuICAgIC8vIGlmIHdlIGxpa2UuXG5cbiAgICAvLyBGaXJzdCwgYWxsb3cgU1NNIHRvIHdyaXRlIFJ1biBDb21tYW5kIGxvZ3MgdG8gQ2xvdWRXYXRjaCBMb2dzLiBUaGlzXG4gICAgLy8gd2lsbCBhbGxvdyB1cyB0byBkaWFnbm9zZSBwcm9ibGVtcyBsYXRlci5cbiAgICBjb25zdCBydW5Db21tYW5kUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUnVuQ29tbWFuZFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnc3NtLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcbiAgICBjb25zdCBydW5Db21tYW5kTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUnVuQ29tbWFuZExvZ3MnKTtcbiAgICBydW5Db21tYW5kTG9nR3JvdXAuZ3JhbnRXcml0ZShydW5Db21tYW5kUm9sZSk7XG5cbiAgICAvLyBOb3csIGludm9rZSBSdW5Db21tYW5kLlxuICAgIG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnSW5zdGFuY2VQcmVwJywge1xuICAgICAgaW5zdGFsbExhdGVzdEF3c1NkazogZmFsc2UsXG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TdGF0ZW1lbnRzKFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbcnVuQ29tbWFuZFJvbGUucm9sZUFybl1cbiAgICAgICAgfSksXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnc3NtOlNlbmRDb21tYW5kJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KVxuICAgICAgXSksXG4gICAgICBvblVwZGF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnU1NNJyxcbiAgICAgICAgYWN0aW9uOiAnc2VuZENvbW1hbmQnLFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihwcm9wcy5jbG91ZDlFbnZpcm9ubWVudElkKSxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIERvY3VtZW50TmFtZTogJ0FXUy1SdW5TaGVsbFNjcmlwdCcsXG4gICAgICAgICAgRG9jdW1lbnRWZXJzaW9uOiAnJExBVEVTVCcsXG4gICAgICAgICAgSW5zdGFuY2VJZHM6IFtpbnN0YW5jZUlkXSxcbiAgICAgICAgICBUaW1lb3V0U2Vjb25kczogMzAsXG4gICAgICAgICAgU2VydmljZVJvbGVBcm46IHJ1bkNvbW1hbmRSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgQ2xvdWRXYXRjaE91dHB1dENvbmZpZzoge1xuICAgICAgICAgICAgQ2xvdWRXYXRjaExvZ0dyb3VwTmFtZTogcnVuQ29tbWFuZExvZ0dyb3VwLmxvZ0dyb3VwTmFtZSxcbiAgICAgICAgICAgIENsb3VkV2F0Y2hPdXRwdXRFbmFibGVkOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAvLyBBZGQgY29tbWFuZHMgaGVyZSB0byB0YXN0ZS5cbiAgICAgICAgICAgICAgJ2N1cmwgLXNTTCAtbyAvdG1wL2t1YmVjdGwgaHR0cHM6Ly9hbWF6b24tZWtzLnMzLnVzLXdlc3QtMi5hbWF6b25hd3MuY29tLzEuMjEuMi8yMDIxLTA3LTA1L2Jpbi9saW51eC9hbWQ2NC9rdWJlY3RsJyxcbiAgICAgICAgICAgICAgJ2NobW9kICt4IC90bXAva3ViZWN0bCcsXG4gICAgICAgICAgICAgICdtdiAvdG1wL2t1YmVjdGwgL3Vzci9sb2NhbC9iaW4va3ViZWN0bCcsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnYXdzIGVrcyB1cGRhdGUta3ViZWNvbmZpZyAtLW5hbWUgJHtjbHVzdGVyLmNsdXN0ZXJOYW1lfSAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXJvbGUtYXJuICR7aW5zdGFuY2VSb2xlLnJvbGVBcm59JyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgIGBzdSAtbCAtYyAnZWNobyBcImV4cG9ydCBBV1NfREVGQVVMVF9SRUdJT049JHt0aGlzLnJlZ2lvbn1cIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiZXhwb3J0IEFXU19SRUdJT049JHt0aGlzLnJlZ2lvbn1cIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdta2RpciAtcCB+Ly5zc2ggJiYgY2htb2QgNzAwIH4vLnNzaCcgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICAvLyBUaGUga2V5IG1hdGVyaWFsIGlzbid0IHByb3Blcmx5IGVzY2FwZWQsIHNvIHdlJ2xsIGp1c3QgYmFzZTY0LWVuY29kZSBpdCBmaXJzdFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCIke2Nkay5Gbi5iYXNlNjQoa2V5TWF0ZXJpYWwpfVwiIHwgYmFzZTY0IC1kID4gfi8uc3NoL2lkX3JzYScgZWMyLXVzZXJgLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2NobW9kIDYwMCB+Ly5zc2gvaWRfcnNhJyBlYzItdXNlcmAsXG4gICAgICAgICAgICAgICdjdXJsIC0tc2lsZW50IC0tbG9jYXRpb24gXCJodHRwczovL2dpdGh1Yi5jb20vd2VhdmV3b3Jrcy9la3NjdGwvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2Vrc2N0bF8kKHVuYW1lIC1zKV9hbWQ2NC50YXIuZ3pcIiB8IHRhciB4eiAtQyAvdG1wJyxcbiAgICAgICAgICAgICAgJ2NobW9kICt4IC90bXAvZWtzY3RsJyxcbiAgICAgICAgICAgICAgJ212IC90bXAvZWtzY3RsIC91c3IvbG9jYWwvYmluJyxcbiAgICAgICAgICAgICAgJ3l1bSAteSBpbnN0YWxsIGpxIGdldHRleHQgYmFzaC1jb21wbGV0aW9uIG1vcmV1dGlscycsXG4gICAgICAgICAgICAgICcvdXNyL2xvY2FsL2Jpbi9rdWJlY3RsIGNvbXBsZXRpb24gYmFzaCA+IC9ldGMvYmFzaF9jb21wbGV0aW9uLmQva3ViZWN0bCcsXG4gICAgICAgICAgICAgICcvdXNyL2xvY2FsL2Jpbi9la3NjdGwgY29tcGxldGlvbiBiYXNoID4gL2V0Yy9iYXNoX2NvbXBsZXRpb24uZC9la3NjdGwnLFxuICAgICAgICAgICAgICBgc3UgLWwgLWMgJ2VjaG8gXCJhbGlhcyBrPWt1YmVjdGxcIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgYHN1IC1sIC1jICdlY2hvIFwiY29tcGxldGUgLUYgX19zdGFydF9rdWJlY3RsIGtcIiA+PiB+Ly5iYXNoX3Byb2ZpbGUnIGVjMi11c2VyYCxcbiAgICAgICAgICAgICAgLy8gSW5zdGFsbCBIZWxtXG4gICAgICAgICAgICAgICdjdXJsIC1mc1NMIC1vIC90bXAvaGVsbS50Z3ogaHR0cHM6Ly9nZXQuaGVsbS5zaC9oZWxtLXYzLjcuMS1saW51eC1hbWQ2NC50YXIuZ3onLFxuICAgICAgICAgICAgICAndGFyIC1DIC90bXAgLXh6ZiAvdG1wL2hlbG0udGd6JyxcbiAgICAgICAgICAgICAgJ212IC90bXAvbGludXgtYW1kNjQvaGVsbSAvdXNyL2xvY2FsL2Jpbi9oZWxtJyxcbiAgICAgICAgICAgICAgJ3JtIC1yZiAvdG1wL2hlbG0udGd6IC90bXAvbGludXgtYW1kNjQnLFxuICAgICAgICAgICAgICAvLyBSZXNpemUgdm9sdW1lXG4gICAgICAgICAgICAgIGB2b2x1bWVfaWQ9JChhd3MgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gZWMyIGRlc2NyaWJlLXZvbHVtZXMgLS1maWx0ZXJzIE5hbWU9YXR0YWNobWVudC5pbnN0YW5jZS1pZCxWYWx1ZXM9JHtpbnN0YW5jZUlkfSAtLXF1ZXJ5ICdWb2x1bWVzWzBdLlZvbHVtZUlkJyAtLW91dHB1dCB0ZXh0KWAsXG4gICAgICAgICAgICAgIGBhd3MgLS1yZWdpb24gJHt0aGlzLnJlZ2lvbn0gZWMyIG1vZGlmeS12b2x1bWUgLS12b2x1bWUtaWQgJHZvbHVtZV9pZCAtLXNpemUgMzBgLFxuICAgICAgICAgICAgICAvLyBUaGlzIG11c3QgYmUgdGhlIGxhc3QgbGluZSAtIGRvIG5vdCBhZGQgYW55IGxpbmVzIGFmdGVyIHRoaXMhXG4gICAgICAgICAgICAgIGByZWJvb3RgXG4gICAgICAgICAgICAgIC8vIERvIG5vdCBhZGQgYW55IGxpbmVzIGFmdGVyIHRoaXMhXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgb3V0cHV0UGF0aHM6IFsnQ29tbWFuZElkJ11cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGR5bmFtb0RiRG9jID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBhc3NpZ25TaWRzOiBmYWxzZSxcbiAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hHZXRJdGVtJyxcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvKmBdLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRHluYW1pY0Fzc3VtZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IHRoaXMubm9kZUdyb3VwUm9sZSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIGR5bmFtb1BvbGljeTogZHluYW1vRGJEb2MsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUxCVVJMJywgeyB2YWx1ZTogdGhpcy5lbGJVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzQ29kZWJ1aWxkQXJuJywgeyB2YWx1ZTogdGhpcy5jb2RlQnVpbGRSb2xlLnJvbGVBcm4gfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUm9sZVVzZWRCeVRWTScsIHsgdmFsdWU6IHJvbGVVc2VkQnlUb2tlblZlbmRpbmdNYWNoaW5lLnJvbGVBcm4gfSk7XG5cbiAgfVxufVxuIl19