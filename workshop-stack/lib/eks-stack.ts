import { NestedStack, NestedStackProps, Construct, CfnOutput} from '@aws-cdk/core';
import * as cdk from '@aws-cdk/core';

import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as cr from '@aws-cdk/custom-resources';
import * as logs from '@aws-cdk/aws-logs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';
import nodeRolePolicyDoc from './node-role-policy-doc';

const KeyName = 'workshop';

export interface EksStackProps extends NestedStackProps {
  vpcId: string
  cloud9EnvironmentId: string
  codeBuildRoleArn: string
}
export class EksStack extends NestedStack {
  elbUrl: string;
  nodeGroupRole: iam.IRole;
  codeBuildRole: iam.IRole;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);


    // CodeBuild role is supplied by the caller from the BUILD_ROLE_ARN environment variable.
     this.codeBuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);

    // Create our EKS cluster.
    const cluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_21,
      clusterName: 'eksworkshop-eksctl',
      defaultCapacity: 2,
      mastersRole: this.codeBuildRole,
    });

    //Export this for later use in the TVM
    const role = cluster.defaultNodegroup!.role;
    role?.attachInlinePolicy(
      new iam.Policy(this, 'saas-inline-policy', {
        document: nodeRolePolicyDoc,
      })
    );
    this.nodeGroupRole = role;
    
    // The OIDC provider isn't initialized unless we access it
    cluster.openIdConnectProvider;

    // Allow Cloud9 environment to make changes to the cluster.
    cluster.awsAuth.addMastersRole(this.codeBuildRole);


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
    new CfnOutput(this, 'EksCodebuildArn', { value: this.codeBuildRole.roleArn });
    new CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });

  }
}
