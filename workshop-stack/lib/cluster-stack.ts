/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { BootstrapStack } from './bootstrap-stack';
import { EksStack } from './eks-stack';
import { AdminStack } from './admin-stack';
import { BaselineInfraStack } from './baseline-infra-stack';
import { TenantInfraStack } from './tenant-infra-stack';

import getTimeString from './utils';

export class ClusterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const timeStr = getTimeString();

    new BootstrapStack(this, 'BootstrapStack', {
      sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
      sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
    });
    
    
    const eksStack = new EksStack(this, 'EksStack', {
      vpcId: process.env.VPC_ID || 'VPC_ID_NOT_SET',
      cloud9EnvironmentId: process.env.CLOUD9_ENVIRONMENT_ID || 'CLOUD9_ENVIRONMENT_ID_NOT_SET',
      codeBuildRoleArn: process.env.BUILD_ROLE_ARN || 'arn:aws:123456789012::iam:role/NOT_SET'
    });
    
    const { elbUrl, codeBuildRole } = eksStack;
        
    const adminStack = new AdminStack(this, 'AdminStack', {
      elbUrl: elbUrl,
    });
    
    const { userPoolId, appClientId, issuer } = adminStack;
    
    const baseline = new BaselineInfraStack(this, 'BaselineStack', {
      AppClientId: appClientId,
      elbUrl: elbUrl,
      UserPoolId: userPoolId,
      TimeString: timeStr,
      EksCodeBuildArn: codeBuildRole.roleArn,
    });

    const tenantInfra = new TenantInfraStack(this, 'TenantInfraStack', {
      elbUrl: elbUrl,
    });

    /* TenantInfra Code pipeline needs a different version of CDK. Researching. Commenting out for now until
     * we figure that out.
    */
    baseline.tenantStackMappingTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
    baseline.eksSaaSStackMetadataTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);


    new CfnOutput(this, 'AdminUserPoolId', { value: userPoolId });
    new CfnOutput(this, 'AdminAppClientId', { value: appClientId });
    new CfnOutput(this, 'IssuerURL', { value: issuer });
    new CfnOutput(this, 'AWSRegion', { value: this.region });

    /*
     * Outputs from the BaselineInfraStack
    */
    new CfnOutput(this, 'ProductServiceECR', { value: baseline.productServiceUri });
    new CfnOutput(this, 'ProductTable', { value: baseline.productTableName });
    new CfnOutput(this, 'OrderTable', { value: baseline.orderTableName });
    new CfnOutput(this, 'TenantTable', { value: baseline.tenantTableName });
    new CfnOutput(this, 'AuthInfoTable', { value: baseline.authInfoTableName });
    new CfnOutput(this, 'EksSaaSStackMetadataTable', {
      value: baseline.eksSaaSStackMetadataTableName,
    });
    new CfnOutput(this, 'TenantStackMappingTable', { value: baseline.tenantStackMappingTableName });

    /*
     * Outputs from the TenantInfraStack
    */
    new CfnOutput(this, 'PooledTenantUserPoolId', { value: tenantInfra.pooledTenantUserPoolId });
    new CfnOutput(this, 'PooledTenantAppClientId', { value: tenantInfra.pooledTenantAppClientId });

    /*
     * Outputs from the EksStack
    */
    new CfnOutput(this, 'ELBURL', { value: eksStack.elbUrl });
    new CfnOutput(this, 'EksCodebuildArn', { value: eksStack.codeBuildRole.roleArn });
    new CfnOutput(this, 'RoleUsedByTVM', { value: eksStack.roleUsedByTokenVendingMachine.roleArn });


  }
}
