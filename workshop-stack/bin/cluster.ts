#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib/core';

import { BootstrapStack } from '../lib/bootstrap-stack';
import { ClusterStack } from '../lib/cluster-stack';

const app = new App();

new BootstrapStack(app, 'BootstrapStack', {
  sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
  sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
});

new ClusterStack(app, 'ClusterStack');

