/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import nodeRolePolicyDoc from './node-role-policy-doc';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class EksStack extends Stack {
  elbUrl: string;
  nodeGroupRole: iam.IRole;
  eksCodebuildRole: iam.IRole;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ingressControllerReleaseName = 'controller';

    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    const cluster = new eks.Cluster(this, 'eksworkshop-eksctl', {
      clusterName: `eksworkshop-eksctl`,
      mastersRole: clusterAdmin,
      version: eks.KubernetesVersion.V1_25,
      defaultCapacity: 2,
    });

    //Export this for later use in the TVM
    const role = cluster.defaultNodegroup!.role;
    role?.attachInlinePolicy(
      new iam.Policy(this, 'saas-inline-policy', {
        document: nodeRolePolicyDoc,
      })
    );
    this.nodeGroupRole = role;

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
          ],
        }),
      },
    });

    cluster.awsAuth.addMastersRole(this.eksCodebuildRole);
    this.elbUrl = albAddress.value;

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

    new CfnOutput(this, 'ELBURL', { value: this.elbUrl });
    new CfnOutput(this, 'EksCodebuildArn', { value: this.eksCodebuildRole.roleArn });
    new CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });
  }
}
