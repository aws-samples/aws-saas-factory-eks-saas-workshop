#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { RootStack } from '../lib/root-stack';

const app = new cdk.App();
new RootStack(app, 'RootStack');
