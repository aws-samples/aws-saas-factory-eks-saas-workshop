#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { RootStack } from '../lib/root-stack';

const app = new App();
new RootStack(app, 'RootStack');
