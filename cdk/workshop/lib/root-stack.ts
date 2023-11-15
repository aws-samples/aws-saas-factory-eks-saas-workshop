/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import * as cdk from 'aws-cdk-lib';

import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DestroyPolicySetter } from '../lib/cdk-aspect/destroy-policy-setter';
import { EksStack } from '../lib/eks-stack';
import { HelmChartStack } from '../lib/helm-chart-stack';
import { Cloud9Stack } from './cloud9-stack';
import { AdminStack } from './constructs/admin/admin-stack';
import { BaselineInfraStack } from './constructs/baseline-infra/baseline-infra-stack';
import { DynamoDbInitializer } from './constructs/generic/ddb-initializer';
import { TenantInfraStack } from './constructs/tenant-infra/tenant-infra-stack';
import { InstanceManagementStack } from './instance-management-stack';

export interface RootStackProps extends StackProps {
  clusterName: string;
  cloud9EnvironmentName: string;
  wsParticipantRoleArn?: string;
}

export class RootStack extends Stack {
  constructor(scope: Construct, id: string, props: RootStackProps) {
    super(scope, id, props);
    const clusterName = props.clusterName;
    const instanceManagementStack = new InstanceManagementStack(this, 'instance-management-stack');

    const eksStack = new EksStack(this, 'eks-stack', {
      clusterName: clusterName,
      instanceRoleArn: instanceManagementStack.instanceRoleArn,
      wsParticipantRoleArn: props?.wsParticipantRoleArn,
    });
    eksStack.addDependency(instanceManagementStack);

    new CfnOutput(this, 'EksStackRenderedName', {
      exportName: 'EksStackRenderedName',
      value: eksStack.stackName,
    });

    const cloud9Stack = new Cloud9Stack(this, 'cloud-9', {
      clusterName,
      instanceRoleArn: instanceManagementStack.instanceRoleArn,
      cloud9EnvironmentName: props.cloud9EnvironmentName,
    });
    cloud9Stack.addDependency(instanceManagementStack);
    cloud9Stack.addDependency(eksStack);

    const eksCodeBuildArn = eksStack.eksCodebuildRole.roleArn;
    const roleArnUsedByTvm = eksStack.roleArnUsedByTvm;

    const helmChartStack = new HelmChartStack(this, 'helm-chart-stack', {
      cluster: eksStack.cluster,
    });

    const eksElbUrl = helmChartStack.elbUrl;

    helmChartStack.addDependency(eksStack);
    cdk.Aspects.of(eksStack).add(new DestroyPolicySetter());

    const adminStack = new AdminStack(this, 'AdminStack', {
      elbUrl: eksElbUrl,
    });
    const { userPoolId, appClientId, issuer } = adminStack;

    const baseline = new BaselineInfraStack(this, 'BaselineStack', {
      AppClientId: appClientId,
      Region: this.region,
      UserPoolId: userPoolId,
      EksCodeBuildArn: eksCodeBuildArn,
      EksElbUrl: eksElbUrl,
    });

    const tenantInfra = new TenantInfraStack(this, 'TenantInfraStack', {
      elbUrl: eksElbUrl,
    });
    const authInfoSeed = new DynamoDbInitializer(this, 'AuthInfoInitializer', {
      tableName: 'AuthInfo',
      tableArn: baseline.authInfoTable.tableArn,
      records: {
        tenant_path: { S: 'app' },
        user_pool_type: { S: 'pooled' },
        user_pool_id: { S: tenantInfra.pooledTenantUserPoolId },
        client_id: { S: tenantInfra.pooledTenantAppClientId },
      },
    });

    const saasStackMetadataSeed = new DynamoDbInitializer(this, 'SaaSStackMetadataInitializer', {
      tableName: 'EKS-SaaS-Stack-Metadata',
      tableArn: baseline.eksSaaSStackMetadataTable.tableArn,
      records: {
        StackName: { S: 'eks-saas' },
        ELBURL: { S: eksElbUrl },
        CODEBUILD_ARN: { S: eksCodeBuildArn },
        IAM_ROLE_ARN: { S: roleArnUsedByTvm },
      },
    });

    baseline.tenantStackMappingTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
    baseline.eksSaaSStackMetadataTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);

    new CfnOutput(this, 'AdminUserPoolId', { value: userPoolId });
    new CfnOutput(this, 'AdminAppClientId', { value: appClientId });
    new CfnOutput(this, 'IssuerURL', { value: issuer });
    new CfnOutput(this, 'AWSRegion', { value: this.region });
    new CfnOutput(this, 'TenantRegistrationServiceECR', {
      value: baseline.tenantRegistrationEcrUri,
    });
    new CfnOutput(this, 'ProductServiceECR', { value: baseline.productServiceUri });
    new CfnOutput(this, 'ProductTable', { value: baseline.productTableName });
    new CfnOutput(this, 'OrderTable', { value: baseline.orderTableName });
    new CfnOutput(this, 'PooledTenantUserPoolId', { value: tenantInfra.pooledTenantUserPoolId });
    new CfnOutput(this, 'PooledTenantAppClientId', { value: tenantInfra.pooledTenantAppClientId });
    new CfnOutput(this, 'TenantTable', { value: baseline.tenantTableName });
    new CfnOutput(this, 'AuthInfoTable', { value: baseline.authInfoTableName });
    new CfnOutput(this, 'EksSaaSStackMetadataTable', {
      value: baseline.eksSaaSStackMetadataTableName,
    });
    new CfnOutput(this, 'TenantStackMappingTable', { value: baseline.tenantStackMappingTableName });
  }
}
