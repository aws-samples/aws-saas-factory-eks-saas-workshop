// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import {
  ClusterInfo,
  HelmAddOn,
  HelmAddOnUserProps,
} from "@aws-quickstart/eks-blueprints";
import { createNamespace } from "@aws-quickstart/eks-blueprints/dist/utils";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

/**
 * Configuration options for the FluentBit add-on.
 */
export interface AwsCloudWatchMetricsAddOnProps extends HelmAddOnUserProps {
  /**
   * Iam policies for the add-on.
   */
  iamPolicies?: PolicyStatement[];

  /**
   * Create Namespace with the provided one (will not if namespace is kube-system)
   */
  createNamespace?: boolean;
}
/**
 * Default props for the add-on.
 */
const defaultProps: AwsCloudWatchMetricsAddOnProps = {
  chart: "aws-cloudwatch-metrics",
  version: "0.0.9",
  repository: "https://aws.github.io/eks-charts",
  namespace: "amazon-cloudwatch",
  createNamespace: false,
  values: {},
};

export class AwsCloudWatchMetricsAddOn extends HelmAddOn {
  readonly options: AwsCloudWatchMetricsAddOnProps;

  constructor(props?: AwsCloudWatchMetricsAddOnProps) {
    super({ ...(defaultProps as any), ...props });
    this.options = this.props;
  }

  deploy(clusterInfo: ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster;
    const namespace = this.options.namespace!;

    // Create the FluentBut service account.
    const serviceAccountName = "aws-cloudwatch-metrics-sa";
    const sa = cluster.addServiceAccount(serviceAccountName, {
      name: serviceAccountName,
      namespace: namespace,
    });

    // Create namespace
    if (this.options.createNamespace) {
      const ns = createNamespace(namespace, cluster, true);
      sa.node.addDependency(ns);
    }

    // Apply additional IAM policies to the service account.
    const policies = this.options.iamPolicies || [];
    policies.forEach((policy: PolicyStatement) =>
      sa.addToPrincipalPolicy(policy)
    );

    sa.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          "ec2:DescribeTags",
          "ec2:DescribeVolumes",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );

    // Configure values.
    const values = {
      serviceAccount: {
        name: serviceAccountName,
        create: false,
      },
      ...this.options.values,
    };

    const helmChart = this.addHelmChart(clusterInfo, values);
    helmChart.node.addDependency(sa);
    return Promise.resolve(helmChart);
  }
}
