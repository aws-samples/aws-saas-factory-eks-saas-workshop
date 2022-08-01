/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { Stack, StackProps, Construct, CfnOutput } from '@aws-cdk/core';

import { BootstrapStack } from './bootstrap-stack';
import { EksStack } from './eks-stack';
import { AdminStack } from './admin-stack';
import { BaselineInfraStack } from './baseline-infra-stack';

import getTimeString from './utils';

export class ClusterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const timeStr = getTimeString();

    new BootstrapStack(this, 'BootstrapStack', {
      sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
      sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
    });
    
    
    const eksStack = new EksStack(this, 'EksStack', {
      vpcId: process.env.VPC_ID || 'VPC_ID_NOT_SET',
      cloud9EnvironmentId: process.env.CLOUD9_ENVIRONMENT_ID || 'CLOUD9_ENVIRONMENT_ID_NOT_SET',
      codeBuildRoleArn: process.env.BUILD_ROLE_ARN || 'arn:aws:123456789012::iam:role/NOT_SET'
    });
    
    const { elbUrl, codeBuildRole } = eksStack;
        
    const adminStack = new AdminStack(this, 'AdminStack', {
      elbUrl: elbUrl,
    });
    
    const { userPoolId, appClientId, issuer } = adminStack;
    
    const baseline = new BaselineInfraStack(this, 'BaselineStack', {
      AppClientId: appClientId,
      elbUrl: elbUrl,
      UserPoolId: userPoolId,
      TimeString: timeStr,
      EksCodeBuildArn: codeBuildRole.roleArn,
    });
  }
}
