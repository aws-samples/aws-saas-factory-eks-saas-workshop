// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as ssm from "aws-cdk-lib/aws-ssm";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import * as blueprints from "@aws-quickstart/eks-blueprints";

var path = require("path");
export class SSMResources extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      clusterInfo: blueprints.ClusterInfo;
      workshopSSMPrefix: string;
    }
  ) {
    super(scope, id);

    const clusterInfo = props.clusterInfo;
    const workshopSSMPrefix = props.workshopSSMPrefix;

    new ssm.StringParameter(this, "clusterNameParameter", {
      parameterName: `${workshopSSMPrefix}/clusterName`,
      stringValue: clusterInfo.cluster.clusterName,
    });

    new ssm.StringParameter(this, "kubectlRoleArnParameter", {
      parameterName: `${workshopSSMPrefix}/kubectlRoleArn`,
      stringValue: clusterInfo.cluster.kubectlRole?.roleArn || "EMPTY",
    });

    new ssm.StringParameter(this, "kubectlSecurityGroupIdParameter", {
      parameterName: `${workshopSSMPrefix}/kubectlSecurityGroupId`,
      stringValue:
        clusterInfo.cluster.kubectlSecurityGroup?.securityGroupId || "EMPTY",
    });

    new ssm.StringParameter(this, "clusterSecurityGroupIdParameter", {
      parameterName: `${workshopSSMPrefix}/clusterSecurityGroupId`,
      stringValue: clusterInfo.cluster.clusterSecurityGroupId,
    });

    new ssm.StringParameter(this, "kubectlLambdaRoleArnParameter", {
      parameterName: `${workshopSSMPrefix}/kubectlLambdaRoleArnParameter`,
      stringValue: clusterInfo.cluster.kubectlLambdaRole?.roleArn || "EMPTY",
    });

    new ssm.StringParameter(this, "kubectlLayerVersionArn", {
      parameterName: `${workshopSSMPrefix}/kubectlLayerVersionArn`,
      stringValue: clusterInfo.cluster.kubectlLayer?.layerVersionArn || "EMPTY",
    });

    new ssm.StringParameter(this, "awscliLayerVersionArn", {
      parameterName: `${workshopSSMPrefix}/awscliLayerVersionArn`,
      stringValue: clusterInfo.cluster.awscliLayer?.layerVersionArn || "EMPTY",
    });

    new ssm.StringParameter(this, "vpcIdParameter", {
      parameterName: `${workshopSSMPrefix}/vpcIdParameter`,
      stringValue: clusterInfo.cluster.vpc.vpcId,
    });

    new ssm.StringParameter(this, "openIdConnectProviderArnParameter", {
      parameterName: `${workshopSSMPrefix}/openIdConnectProviderArn`,
      stringValue:
        clusterInfo.cluster.openIdConnectProvider.openIdConnectProviderArn,
    });
  }
}
