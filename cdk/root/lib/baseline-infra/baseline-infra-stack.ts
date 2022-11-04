/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { Construct } from 'constructs';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export interface BaselineStackProps extends NestedStackProps {
  UserPoolId: string;
  AppClientId: string;
  elbUrl: string;
  Region: string;
  TimeString: string;
  EksCodeBuildArn: string;
}

export class BaselineInfraStack extends NestedStack {
  tenantTable: dynamodb.Table;
  tenantTableName: string;
  authInfoTable: dynamodb.Table;
  authInfoTableName: string;
  productTable: dynamodb.Table;
  productTableName: string;
  orderTable: dynamodb.Table;
  orderTableName: string;
  eksSaaSStackMetadataTable: dynamodb.Table;
  eksSaaSStackMetadataTableName: string;
  tenantStackMappingTable: dynamodb.Table;
  tenantStackMappingTableName: string;
  codeBuildRole: iam.Role;
  productServiceUri: string;
  tenantRegistrationEcrUri: string;
  dynamicAssumeRoleArn: string;

  constructor(scope: Construct, id: string, props?: BaselineStackProps) {
    super(scope, id, props);

    const timeStr = props?.TimeString;

    this.tenantTable = new dynamodb.Table(this, 'Tenant', {
      tableName: `Tenants-${timeStr}`,
      partitionKey: { name: 'tenant_id', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.tenantTableName = this.tenantTable.tableName;
    this.tenantTable.grantFullAccess;

    this.authInfoTable = new dynamodb.Table(this, 'AuthInfo', {
      tableName: `AuthInfo-${timeStr}`,
      partitionKey: { name: 'tenant_path', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.authInfoTableName = this.authInfoTable.tableName;

    this.productTable = new dynamodb.Table(this, 'Products', {
      tableName: `Products-Pooled-${timeStr}`,
      partitionKey: { name: 'tenant_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'product_id', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.productTableName = this.productTable.tableName;

    this.orderTable = new dynamodb.Table(this, 'Orders', {
      tableName: `Orders-Pooled-${timeStr}`,
      partitionKey: { name: 'tenant_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'order_id', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.orderTableName = this.orderTable.tableName;

    const productServiceRepo = new ecr.Repository(this, 'ProductServiceRepo', {
      imageScanOnPush: false,
    });
    this.productServiceUri = productServiceRepo.repositoryUri;

    const tenantRegistrationServiceRepo = new ecr.Repository(
      this,
      'TenantRegistrationServiceRepo',
      {
        imageScanOnPush: false,
      }
    );
    this.tenantRegistrationEcrUri = tenantRegistrationServiceRepo.repositoryUri;

    const ecrRole = new iam.Role(this, 'EcrPublicUser', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    ecr.AuthorizationToken.grantRead(ecrRole);
    ecr.PublicGalleryAuthorizationToken.grantRead(ecrRole);

    this.eksSaaSStackMetadataTable = new dynamodb.Table(this, 'EKS-SaaS-Stack-Metadata', {
      tableName: `EKS-SaaS-Stack-Metadata`,
      partitionKey: { name: 'StackName', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.eksSaaSStackMetadataTableName = this.eksSaaSStackMetadataTable.tableName;
    this.eksSaaSStackMetadataTable.grantFullAccess;

    this.tenantStackMappingTable = new dynamodb.Table(this, 'EKS-SaaS-Tenant-Stack-Mapping', {
      tableName: `EKS-SaaS-Tenant-Stack-Mapping`,
      partitionKey: { name: 'TenantName', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
    });
    this.tenantStackMappingTableName = this.tenantStackMappingTable.tableName;
    this.tenantStackMappingTable.grantWriteData(
      iam.Role.fromRoleArn(this, 'eksCodeBuildArn', props!.EksCodeBuildArn)
    );
  }
}
