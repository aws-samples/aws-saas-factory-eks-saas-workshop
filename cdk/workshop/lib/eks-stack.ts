/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import nodeRolePolicyDoc from './node-role-policy-doc';
import { Construct } from 'constructs';
import { Karpenter } from 'cdk-eks-karpenter';
import { KubectlV27Layer } from '@aws-cdk/lambda-layer-kubectl-v27';

export interface EksStackProps extends cdk.NestedStackProps {
  instanceRoleArn: string;
  clusterName: string;
  wsParticipantRoleArn?: string;
}

export class EksStack extends cdk.NestedStack {
  nodeGroupRole: iam.IRole;
  eksCodebuildRole: iam.IRole;
  roleArnUsedByTvm: string;
  cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    const cluster = new eks.Cluster(this, `${props.clusterName}`, {
      clusterName: props.clusterName,
      mastersRole: clusterAdmin,
      version: eks.KubernetesVersion.V1_27,
      kubectlLayer: new KubectlV27Layer(this, 'kubectl'),
      defaultCapacity: 0,
      tags: {
        'karpenter.sh/discovery': `${props.clusterName}`,
      },
    });

    // The OIDC provider isn't initialized unless we access it
    cluster.openIdConnectProvider;
    const instanceRole = iam.Role.fromRoleArn(this, 'instanceRoleArn', props.instanceRoleArn);

    // Allow Cloud9 environment to make changes to the cluster.
    cluster.awsAuth.addRoleMapping(instanceRole, { groups: ['system:masters'] });
    if (!!props.wsParticipantRoleArn) {
      const wsParticipantRole = iam.Role.fromRoleArn(
        this,
        'wsParticipantRoleArn',
        props.wsParticipantRoleArn
      );
      cluster.awsAuth.addRoleMapping(wsParticipantRole, { groups: ['system:masters'] });
    }

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

    this.cluster = cluster;
    const karpenter = new Karpenter(this, 'Karpenter', {
      cluster: cluster,
      version: 'v0.31.2',
    });

    this.eksCodebuildRole = new iam.Role(this, 'CodeBuildKubectlRole', {
      assumedBy: new iam.AccountRootPrincipal(),
      inlinePolicies: {
        InlinePolicyForCodeBuild: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['eks:Describe*'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:CreateTable'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['cloudformation:ListStacks'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['cloudformation:DescribeStacks'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    cluster.awsAuth.addMastersRole(this.eksCodebuildRole);

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
    this.roleArnUsedByTvm = roleUsedByTokenVendingMachine.roleArn;

    new cdk.CfnOutput(this, 'EksCodebuildArn', { value: this.eksCodebuildRole.roleArn });
    new cdk.CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });
  }
}
