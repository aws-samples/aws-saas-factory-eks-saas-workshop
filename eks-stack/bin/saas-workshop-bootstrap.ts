#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as eks from "aws-cdk-lib/aws-eks";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as blueprints from "@aws-quickstart/eks-blueprints";
import { CapacityType, KubernetesVersion } from "aws-cdk-lib/aws-eks";
import { Cloud9Resources } from "../lib/cloud9-resources";
import { DestroyPolicySetter } from "../lib/cdk-aspect/destroy-policy-setter";
import { SSMResources } from "../lib/ssm-resources";
import { ILogGroup } from "aws-cdk-lib/aws-logs";
import {
  ResourceProvider,
  ResourceContext,
} from "@aws-quickstart/eks-blueprints";
import { MyCustomAwsForFluentBitAddOn } from "../lib/fluentbit";
import { EksStack } from "../lib/eks-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
const participantAssumedRoleArn = process.env.PARTICIPANT_ASSUMED_ROLE_ARN;
const workshopSSMPrefix = "/workshop";
const cloud9ConnectionType = "CONNECT_SSM";
const cloud9InstanceTypes = ["m5.large", "m4.large"];
const cloud9ImageId = "amazonlinux-2023-x86_64";

new EksStack(app, "SaaSWorkshopBootstrap", {});

// new Cloud9Resources(app, "Cloud9Resources", {
//   createCloud9Instance: true,
//   workshopSSMPrefix: workshopSSMPrefix,
//   cloud9MemberArn: participantAssumedRoleArn,
//   cloud9ConnectionType: cloud9ConnectionType,
//   cloud9InstanceTypes: cloud9InstanceTypes,
//   cloud9ImageId: cloud9ImageId,
// });
