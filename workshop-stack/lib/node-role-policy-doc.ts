/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import * as iam from '@aws-cdk/aws-iam';

const nodeRolePolicyDoc = new iam.PolicyDocument({
  assignSids: false,
  statements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['arn:aws:iam::*:role/service-role/cwe-role-*'],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'events.amazonaws.com',
        },
      },
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'codepipeline.amazonaws.com',
        },
      },
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'iam:AWSServiceName': ['cognito-idp.amazonaws.com', 'email.cognito-idp.amazonaws.com'],
        },
      },
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'iam:PassedToService': ['application-autoscaling.amazonaws.com', 'dax.amazonaws.com'],
        },
      },
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'iam:PassedToService': [
            'replication.dynamodb.amazonaws.com',
            'dax.amazonaws.com',
            'dynamodb.application-autoscaling.amazonaws.com',
            'contributorinsights.dynamodb.amazonaws.com',
          ],
        },
      },
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'acm:ListCertificates',
        'application-autoscaling:DeleteScalingPolicy',
        'application-autoscaling:DeregisterScalableTarget',
        'application-autoscaling:DescribeScalableTargets',
        'application-autoscaling:DescribeScalingActivities',
        'application-autoscaling:DescribeScalingPolicies',
        'application-autoscaling:PutScalingPolicy',
        'application-autoscaling:RegisterScalableTarget',
        'cloudformation:*',
        'cloudformation:DescribeStacks',
        'cloudformation:ListChangeSets',
        'cloudfront:*',
        'cloudfront:ListDistributions',
        'cloudtrail:DescribeTrails',
        'cloudtrail:LookupEvents',
        'cloudwatch:DeleteAlarms',
        'cloudwatch:DescribeAlarmHistory',
        'cloudwatch:DescribeAlarms',
        'cloudwatch:DescribeAlarmsForMetric',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics',
        'cloudwatch:PutMetricAlarm',
        'codebuild:BatchGetProjects',
        'codebuild:CreateProject',
        'codebuild:ListCuratedEnvironmentImages',
        'codebuild:ListProjects',
        'codecommit:GetReferences',
        'codecommit:ListBranches',
        'codecommit:ListRepositories',
        'codedeploy:BatchGetDeploymentGroups',
        'codedeploy:ListApplications',
        'codedeploy:ListDeploymentGroups',
        'codepipeline:*',
        'cognito-identity:*',
        'cognito-idp:*',
        'cognito-sync:*',
        'dynamodb:*',
        'ec2:DescribeRegions',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeSubnets',
        'ec2:DescribeVpcEndpoints',
        'ec2:DescribeVpcs',
        'ecr:*',
        'ecr:DescribeRepositories',
        'ecr:ListImages',
        'elasticloadbalancing:DescribeLoadBalancers',
        'iam:*',
        'iam:GetRole',
        'iam:GetSAMLProvider',
        'iam:ListOpenIDConnectProviders',
        'iam:ListRoles',
        'iam:ListSAMLProviders',
        'iam:ListServerCertificates',
        'kinesis:ListStreams',
        'kms:DescribeKey',
        'kms:ListAliases',
        'lambda:CreateEventSourceMapping',
        'lambda:CreateFunction',
        'lambda:DeleteEventSourceMapping',
        'lambda:DeleteFunction',
        'lambda:GetFunctionConfiguration',
        'lambda:GetPolicy',
        'lambda:GetPolicy2*',
        'lambda:ListEventSourceMappings',
        'lambda:ListFunctions',
        'lambda:ListFunctions2*',
        'organizations:DescribeAccount',
        'organizations:DescribeOrganization',
        'organizations:DescribeOrganizationalUnit',
        'organizations:DescribePolicy',
        'organizations:ListChildren',
        'organizations:ListParents',
        'organizations:ListPolicies',
        'organizations:ListPoliciesForTarget',
        'organizations:ListRoots',
        'organizations:ListTargetsForPolicy',
        'resource-groups:CreateGroup',
        'resource-groups:DeleteGroup',
        'resource-groups:GetGroup',
        'resource-groups:GetGroupQuery',
        'resource-groups:ListGroupResources',
        'resource-groups:ListGroups',
        'route53:*',
        'route53domains:*',
        's3:*',
        's3:GetBucketLocation',
        's3:GetBucketWebsite',
        's3:ListAllMyBuckets',
        's3:ListBucket',
        'sns:ListPlatformApplications',
        'sns:ListTopics',
        'tag:GetResources',
        'waf:GetWebACL',
        'waf:ListWebACLs',
      ],
      resources: ['*'],
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudtrail:CreateTrail',
        'cloudtrail:GetEventSelectors',
        'cloudtrail:PutEventSelectors',
        'cloudtrail:StartLogging',
        'cloudwatch:GetInsightRuleReport',
        'iam:DeleteServiceLinkedRole',
        'iam:GetServiceLinkedRoleDeletionStatus',
        's3:CreateBucket',
        's3:GetBucketPolicy',
        's3:GetBucketVersioning',
        's3:GetObject',
        's3:GetObjectVersion',
        's3:ListBucket',
        's3:PutBucketPolicy',
      ],
      resources: [
        'arn:aws:s3::*:codepipeline-*',
        'arn:aws:cloudtrail:*:*:trail/codepipeline-source-trail',
        'arn:aws:iam::*:role/aws-service-role/cognito-idp.amazonaws.com/AWSServiceRoleForAmazonCognitoIdp*',
        'arn:aws:iam::*:role/aws-service-role/email.cognito-idp.amazonaws.com/AWSServiceRoleForAmazonCognitoIdpEmail*',
        'arn:aws:cloudwatch:*:*:insight-rule/DynamoDBContributorInsights*',
      ],
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListAllMyBuckets'],
      resources: ['arn:aws:s3:::*'],
    }),
  ],
});

export default nodeRolePolicyDoc;
