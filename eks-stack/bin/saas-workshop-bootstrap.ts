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

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
const participantAssumedRoleArn = process.env.PARTICIPANT_ASSUMED_ROLE_ARN;
const workshopSSMPrefix = "/workshop";
const cloud9ConnectionType = "CONNECT_SSM";
const cloud9InstanceTypes = ["m5.large", "m4.large"];
const cloud9ImageId = "ubuntu-22.04-x86_64";

export class LogGroupResourceProvider implements ResourceProvider<ILogGroup> {
  provide(context: ResourceContext): ILogGroup {
    const scope = context.scope;
    return new logs.LogGroup(scope, "fluent-bit-log-group", {
      logGroupName: `${workshopSSMPrefix}/fluent-bit-logs`,
      retention: logs.RetentionDays.ONE_WEEK,
    });
  }
}

const blueprint = blueprints.EksBlueprint.builder()
  .resourceProvider("LogGroup", new LogGroupResourceProvider())
  .account(account)
  .region(region)
  .teams(
    new blueprints.PlatformTeam({
      name: "admins",
      userRoleArn: `arn:aws:iam::${account}:role/Admin`,
    })
  )
  .addOns(
    new MyCustomAwsForFluentBitAddOn(),
    new blueprints.addons.KedaAddOn({
      podSecurityContextFsGroup: 1001,
      securityContextRunAsGroup: 1001,
      securityContextRunAsUser: 1001,
      irsaRoles: ["AmazonSQSReadOnlyAccess"],
    }),
    new blueprints.addons.IstioBaseAddOn(),
    new blueprints.addons.IstioControlPlaneAddOn()
  )
  .clusterProvider(
    new blueprints.MngClusterProvider({
      version: KubernetesVersion.V1_27,
      minSize: 2,
      desiredSize: 2,
      maxSize: 4,
      nodeGroupCapacityType: CapacityType.ON_DEMAND,
      amiType: eks.NodegroupAmiType.BOTTLEROCKET_X86_64,
      instanceTypes: [
        new ec2.InstanceType("m6i.xlarge"),
        new ec2.InstanceType("r6i.xlarge"),
        new ec2.InstanceType("m5.xlarge"),
        new ec2.InstanceType("m4.xlarge"),
        new ec2.InstanceType("c4.xlarge"),
        new ec2.InstanceType("c5.xlarge"),
      ],
    })
  )
  .build(app, "SaaSWorkshopBootstrap");

blueprint
  .getClusterInfo()
  .nodeGroups?.forEach((nodeGroup) =>
    nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    )
  );

const kubectlRole = blueprint.getClusterInfo().cluster.kubectlRole;
if (kubectlRole) {
  const role = kubectlRole as iam.Role;
  role.assumeRolePolicy?.addStatements(
    new iam.PolicyStatement({
      actions: ["sts:AssumeRole"],
      principals: [
        new iam.AnyPrincipal().withConditions({
          ArnEquals: {
            "aws:PrincipalArn": `arn:aws:iam::${account}:role/*`,
          },
        }),
      ],
    })
  );
}

new SSMResources(blueprint, "SSMResources", {
  clusterInfo: blueprint.getClusterInfo(),
  workshopSSMPrefix: workshopSSMPrefix,
});

new Cloud9Resources(blueprint, "Cloud9Resources", {
  createCloud9Instance: true,
  workshopSSMPrefix: workshopSSMPrefix,
  cloud9MemberArn: participantAssumedRoleArn,
  cloud9ConnectionType: cloud9ConnectionType,
  cloud9InstanceTypes: cloud9InstanceTypes,
  cloud9ImageId: cloud9ImageId,
});

cdk.Aspects.of(blueprint).add(new DestroyPolicySetter());
cdk.Tags.of(blueprint).add("EksSaaSWorkshop", "BootstrapResources");
