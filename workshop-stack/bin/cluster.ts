#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';

import { BootstrapStack } from '../lib/bootstrap-stack';
import { ClusterStack } from '../lib/cluster-stack';

const app = new cdk.App();

new BootstrapStack(app, 'BootstrapStack', {
  sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
  sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
});


new ClusterStack(app, 'ClusterStack', {
  env: {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    account: process.env.AWS_ACCOUNT_ID
  },
  vpcId: process.env.VPC_ID || 'VPC_ID_NOT_SET',
  cloud9EnvironmentId: process.env.CLOUD9_ENVIRONMENT_ID || 'CLOUD9_ENVIRONMENT_ID_NOT_SET',
  codeBuildRoleArn: process.env.BUILD_ROLE_ARN || 'arn:aws:123456789012::iam:role/NOT_SET'
});

