// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as blueprints from "@aws-quickstart/eks-blueprints";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { ILogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { ClusterInfo } from "@aws-quickstart/eks-blueprints";

export class MyCustomAwsForFluentBitAddOn implements blueprints.ClusterAddOn {
  deploy(clusterInfo: ClusterInfo): void | Promise<Construct> {
    const logGroup: ILogGroup = clusterInfo.getRequiredResource("LogGroup");
    const addon = new blueprints.addons.AwsForFluentBitAddOn({
      version: "0.1.30",
      iamPolicies: [
        new iam.PolicyStatement({
          actions: ["logs:*"],
          resources: [
            `${logGroup.logGroupArn}:*`,
            `${logGroup.logGroupArn}:*:*`,
          ],
        }),
      ],
      values: {
        additionalFilters: `
[FILTER]
    Name parser
    Match *
    Parser json
    Key_Name message
    Reserve_Data On
`,
        input: {
          parser: "cri",
        },
        cloudWatchLogs: {
          enabled: true,
          region: cdk.Stack.of(clusterInfo.cluster).region,
          logGroupName: logGroup.logGroupName,
          logGroupTemplate: logGroup.logGroupName,
          logStreamTemplate:
            "$kubernetes['namespace_name'].$kubernetes['pod_name'].$kubernetes['container_name']",
        },
        cloudWatch: {
          enabled: false,
        },
        firehose: {
          enabled: false,
        },
        kinesis: {
          enabled: false,
        },
        elasticsearch: {
          enabled: false,
        },
      },
    });
    return addon.deploy(clusterInfo);
  }
}
