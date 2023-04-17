import { NestedStack, NestedStackProps, CfnOutput } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import nodeRolePolicyDoc from './node-role-policy-doc';

const KeyName = 'workshop';

export interface EksStackProps extends NestedStackProps {
  vpcId: string;
  cloud9EnvironmentId: string;
  codeBuildRoleArn: string;
}
export class EksStack extends NestedStack {
  elbUrl: string;
  nodeGroupRole: iam.IRole;
  codeBuildRole: iam.IRole;
  roleUsedByTokenVendingMachine: iam.IRole;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    // CodeBuild role is supplied by the caller from the BUILD_ROLE_ARN environment variable.
    this.codeBuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);

    // Create an EC2 instance role for the Cloud9 environment. This instance
    // role is powerful, allowing the participant to have unfettered access to
    // the provisioned account. This might be too broad. It's possible to
    // tighten this down, but there may be unintended consequences.
    const instanceRole = new iam.Role(this, 'WorkspaceInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      description: 'Workspace EC2 instance role',
    });
    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    new CfnOutput(this, 'WorkspaceInstanceRoleName', {
      value: instanceRole.roleName,
    });

    const instanceProfile = new iam.CfnInstanceProfile(this, 'WorkspaceInstanceProfile', {
      roles: [instanceRole.roleName],
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
              Values: [props.cloud9EnvironmentId],
            },
          ],
        },
        outputPaths: [
          'Reservations.0.Instances.0.InstanceId',
          'Reservations.0.Instances.0.NetworkInterfaces.0.Groups.0.GroupId',
        ],
      },
    });
    const instanceId = workspaceInstance.getResponseField('Reservations.0.Instances.0.InstanceId');

    // This function provides a Custom Resource that detaches any existing IAM
    // instance profile that might be attached to the Cloud9 Environment, and
    // replaces it with the profile+role we created ourselves.
    const updateInstanceProfileFunction = new lambda.Function(
      this,
      'UpdateInstanceProfileFunction',
      {
        code: lambda.Code.fromAsset(path.join(__dirname, 'update-instance-profile')),
        handler: 'index.onEventHandler',
        runtime: lambda.Runtime.NODEJS_14_X,
      }
    );
    updateInstanceProfileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:DescribeIamInstanceProfileAssociations',
          'ec2:ReplaceIamInstanceProfileAssociation',
          'ec2:AssociateIamInstanceProfile',
          'iam:PassRole',
        ],
        resources: ['*'], // TODO: use specific instance ARN
      })
    );

    const updateInstanceProfile = new cr.Provider(this, 'UpdateInstanceProfileProvider', {
      onEventHandler: updateInstanceProfileFunction,
    });

    new cdk.CustomResource(this, 'UpdateInstanceProfile', {
      serviceToken: updateInstanceProfile.serviceToken,
      properties: {
        InstanceId: instanceId,
        InstanceProfileArn: instanceProfile.attrArn,
      },
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
          KeyType: 'rsa',
        },
        outputPaths: ['KeyName', 'KeyMaterial'],
      },
      onDelete: {
        service: 'EC2',
        action: 'deleteKeyPair',
        parameters: {
          KeyName,
        },
      },
    });

    const keyMaterial = sshKeyPair.getResponseField('KeyMaterial');
    const keyName = sshKeyPair.getResponseField('KeyName');

    // Create our EKS cluster.
    const cluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_25,
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
    userData.addCommands(
      'set -x',
      'echo installing kernel-devel package so Falco eBPF module can be loaded',
      'yum -y install kernel-devel',
      'echo Adding staticPodPath configuration to kubelet config file',
      'mkdir -p /etc/kubelet.d',
      'yum -y install jq',
      'jq \'.staticPodPath="/etc/kubelet.d"\' < /etc/kubernetes/kubelet/kubelet-config.json > /tmp/kubelet-config.json',
      'mv /tmp/kubelet-config.json /etc/kubernetes/kubelet/kubelet-config.json',
      'systemctl restart kubelet'
    );

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
              volumeSize: 100,
            },
          },
        },
      ],
    });

    // Create Managed Nodegroup.
    const nodegroup = new eks.Nodegroup(this, 'ng-1', {
      cluster,
      desiredSize: 3,
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE)],
      launchTemplateSpec: {
        // See https://github.com/aws/aws-cdk/issues/6734
        id: (launchTemplate.node.defaultChild as ec2.CfnLaunchTemplate).ref,
        version: launchTemplate.latestVersionNumber,
      },
    });
    nodegroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    //Export this for later use in the TVM
    const role = nodegroup.role;
    role?.attachInlinePolicy(
      new iam.Policy(this, 'saas-inline-policy', {
        document: nodeRolePolicyDoc,
      })
    );
    this.nodeGroupRole = role;

    // During internal testing we found that Isengard account baselining
    // was attaching IAM roles to instances in the background. This prevents
    // the stack from being cleanly destroyed, so we will record the instance
    // role name and use it later to delete any attached policies before
    // cleanup.
    new cdk.CfnOutput(this, 'NodegroupRoleName', {
      value: nodegroup.role.roleName,
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
          resources: [runCommandRole.roleArn],
        }),
        new iam.PolicyStatement({
          actions: ['ssm:SendCommand'],
          resources: ['*'],
        }),
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
            CloudWatchOutputEnabled: true,
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
              `su -l -c 'echo "${cdk.Fn.base64(
                keyMaterial
              )}" | base64 -d > ~/.ssh/id_rsa' ec2-user`,
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
              `reboot`,
              // Do not add any lines after this!
            ],
          },
        },
        outputPaths: ['CommandId'],
      },
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

    this.roleUsedByTokenVendingMachine = new iam.Role(this, 'DynamicAssumeRole', {
      assumedBy: this.nodeGroupRole,
      inlinePolicies: {
        dynamoPolicy: dynamoDbDoc,
      },
    });
  }
}
