/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { Construct } from 'constructs';
import { Stack, StackProps, CfnParameter, CfnOutput } from 'aws-cdk-lib';
import { AdminStack } from './admin/admin-stack';
import { BaselineInfraStack } from './baseline-infra/baseline-infra-stack';
import { TenantInfraStack } from '../lib/tenant-infra/tenant-infra-stack';
import getTimeString from './utils';

export class RootStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const eksElbUrl = new CfnParameter(this, 'eksElbUrl', {
      type: 'String',
      description: 'The URL of the ELB for our EKS Cluster',
    });

    const eksCodeBuildArn = new CfnParameter(this, 'eksCodeBuildArn', {
      type: 'String',
      description: 'The AWS ARN of the role that CodeBuild will use to interact with EKS',
    });

    const adminEmailAddr = new CfnParameter(this, 'adminEmailAddr', {
      type: 'String',
      description: 'The email address of the first admin user',
    });

    const timeStr = getTimeString();
    const adminStack = new AdminStack(this, 'AdminStack', {
      adminEmailAddress: adminEmailAddr.valueAsString,
      elbUrl: eksElbUrl.valueAsString,
    });
    const { userPoolId, appClientId, issuer } = adminStack;

    const baseline = new BaselineInfraStack(this, 'BaselineStack', {
      AppClientId: appClientId,
      elbUrl: eksElbUrl.valueAsString,
      Region: this.region,
      UserPoolId: userPoolId,
      TimeString: timeStr,
      EksCodeBuildArn: eksCodeBuildArn.valueAsString,
    });

    const tenantInfra = new TenantInfraStack(this, 'TenantInfraStack', {
      elbUrl: eksElbUrl.valueAsString,
    });

    baseline.tenantStackMappingTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
    baseline.eksSaaSStackMetadataTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);

    new CfnOutput(this, 'AdminUserPoolId', { value: userPoolId });
    new CfnOutput(this, 'AdminAppClientId', { value: appClientId });
    new CfnOutput(this, 'IssuerURL', { value: issuer });
    new CfnOutput(this, 'AWSRegion', { value: this.region });

    // new CfnOutput(this, 'TenantRegistrationECR', { value: baseline.tenantRegistrationEcrUri });
    // new CfnOutput(this, 'TenantMangementECR', { value: baseline.tenantManagementEcrUri });
    // new CfnOutput(this, 'UserManagementECR', { value: baseline.userManagementEcrUri });
    // new CfnOutput(this, 'AdminApplicationECR', { value: baseline.adminSiteEcrUri });
    // new CfnOutput(this, 'ApplicationECR', { value: baseline.appSiteEcrUri });
    new CfnOutput(this, 'ProductServiceECR', { value: baseline.productServiceUri });
    // new CfnOutput(this, 'OrderServiceECR', { value: baseline.orderServiceUri });
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
