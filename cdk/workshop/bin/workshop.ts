#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RootStack } from '../lib/root-stack';
import { DestroyPolicySetter } from '../lib/cdk-aspect/destroy-policy-setter';
import { BootstrapStack } from '../lib/bootstrap-stack';

const app = new cdk.App();

new BootstrapStack(app, 'BootstrapStack', {
  sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
  sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
});
const wsParticipantRoleArn = process.env.WS_PARTICIPANT_ROLE_ARN;
const rootStack = new RootStack(app, 'root-stack', {
  clusterName: 'eksworkshop-eksctl',
  cloud9EnvironmentName: 'eks-saas-workshop',
  wsParticipantRoleArn,
});

//cdk.Aspects.of(eksStack).add(new DestroyPolicySetter());
cdk.Aspects.of(rootStack).add(new DestroyPolicySetter());
