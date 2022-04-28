/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export function getCodeBuildRole(parent: Construct, account: string, region: string): iam.Role {
  return new iam.Role(parent, 'CodeBuildRole', {
    assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    description: 'Role assigned to our tenant onboarding code build project',
    inlinePolicies: {
      TenantOnboardingPolicy: getCodeBuildPolicyDoc(account, region),
    },
  });
}

function getCodeBuildPolicyDoc(account: string, region: string): iam.PolicyDocument {
  return new iam.PolicyDocument({
    assignSids: false,
    statements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${account}:role/*`],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:aws:cloudformation:${region}:${account}:stack/*`],
      }),
    ],
  });
}
