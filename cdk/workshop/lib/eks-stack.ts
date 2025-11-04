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
import { KubectlV30Layer } from '@aws-cdk/lambda-layer-kubectl-v30';

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
      version: eks.KubernetesVersion.V1_32,
      kubectlLayer: new KubectlV30Layer(this, 'kubectl'),
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

    // Create custom nodegroup role with additional trusted principals
    const customNodegroupRole = new iam.Role(this, 'CustomNodegroupRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('ec2.amazonaws.com')
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    const tagSession = customNodegroupRole.assumeRolePolicy?.addStatements(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:TagSession', 'sts:AssumeRole'],
      principals: [
        new iam.ServicePrincipal('pods.eks.amazonaws.com')
      ], 
    }));

    // Create Managed Nodegroup.
    const nodegroup = new eks.Nodegroup(this, 'ng-1', {
      cluster,
      desiredSize: 3,
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE)],
      nodeRole: customNodegroupRole,
      launchTemplateSpec: {
        // See https://github.com/aws/aws-cdk/issues/6734
        id: (launchTemplate.node.defaultChild as ec2.CfnLaunchTemplate).ref,
        version: launchTemplate.latestVersionNumber,
      },
    });
    nodegroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    const podIdentityAddon = new eks.Addon(this, 'eks-pod-identity-agent', {
      cluster,
      addonName: 'eks-pod-identity-agent',
    });
    podIdentityAddon.node.addDependency(customNodegroupRole)

    const podIdentityAssociationSharedServices = new eks.CfnPodIdentityAssociation(this, 'podIdentityAssociationSharedServices', {
      clusterName: cluster.clusterName,
      roleArn: customNodegroupRole.roleArn,
      serviceAccount: 'default',
      namespace: 'default',
    });

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

    // This Pod Identity Association enables the Karpenter service account in the 'karpenter' namespace
    // to assume the specified IAM role, allowing Karpenter to manage resources in the cluster.
    const podIdentityAssociationKarpenter = new eks.CfnPodIdentityAssociation(this, 'podIdentityAssociationKarpenter', {
      clusterName: cluster.clusterName,
      roleArn: customNodegroupRole.roleArn,
      serviceAccount: 'karpenter',
      namespace: 'karpenter',
    });

    this.cluster = cluster;
    const karpenter = new Karpenter(this, 'Karpenter', {
      cluster: cluster,
      version: '1.2.4',
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
              actions: ['eks:CreatePodIdentityAssociation'],
              resources: [`arn:aws:eks:${this.region}:${this.account}:cluster/*`],
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
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['iam:PassRole', 'iam:GetRole'],
              resources: [customNodegroupRole.roleArn],
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
    new cdk.CfnOutput(this, 'NodegroupRoleArn', { value: nodegroup.role.roleArn });
    new cdk.CfnOutput(this, 'KarpenterNodeRoleArn', { value: karpenter.nodeRole.roleArn });
  }
}
