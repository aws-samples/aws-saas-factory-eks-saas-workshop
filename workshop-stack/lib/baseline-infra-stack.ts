/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */


import { Construct, NestedStack, NestedStackProps } from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import * as ecr from '@aws-cdk/aws-ecr';

export interface BaselineStackProps extends NestedStackProps {
  UserPoolId: string;
  AppClientId: string;
  elbUrl: string;
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
  // adminSiteEcrUri: string;
  // tenantRegistrationEcrUri: string;
  // tenantManagementEcrUri: string;
  // userManagementEcrUri: string;
  // appSiteEcrUri: string;
  codeBuildRole: iam.Role;
  productServiceUri: string;
  // orderServiceUri: string;
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

    // const adminSiteRepo = new ecr.Repository(this, 'AdminSiteRepo', {
    //   repositoryName: `admin-site-${timeStr}`,
    //   imageScanOnPush: true,
    // });
    // this.adminSiteEcrUri = adminSiteRepo.repositoryUri;
    // const tenantRegistrationServiceRepo = new ecr.Repository(
    //   this,
    //   'TenantRegistrationServiceRepo',
    //   {
    //     repositoryName: `tenant-registration-service-${timeStr}`,
    //     imageScanOnPush: true,
    //   }
    // );
    // this.tenantRegistrationEcrUri = tenantRegistrationServiceRepo.repositoryUri;
    // const tenantManagementServiceRepo = new ecr.Repository(this, 'TenantManagementServiceRepo', {
    //   repositoryName: `tenant-management-service-${timeStr}`,
    //   imageScanOnPush: true,
    // });
    // this.tenantManagementEcrUri = tenantManagementServiceRepo.repositoryUri;
    // const userManagementServiceRepo = new ecr.Repository(this, 'UserManagementServiceRepo', {
    //   repositoryName: `user-management-service-${timeStr}`,
    //   imageScanOnPush: true,
    // });
    // this.userManagementEcrUri = userManagementServiceRepo.repositoryUri;
    // const applicationSiteRepo = new ecr.Repository(this, 'ApplicationSiteRepo', {
    //   repositoryName: `application-site-${timeStr}`,
    //   imageScanOnPush: true,
    // });
    // this.appSiteEcrUri = applicationSiteRepo.repositoryUri;

    const productServiceRepo = new ecr.Repository(this, 'ProductServiceRepo', {
      repositoryName: `product-service-${timeStr}`,
      imageScanOnPush: true,
    });
    this.productServiceUri = productServiceRepo.repositoryUri;

    // const orderServiceRepo = new ecr.Repository(this, 'OrderServiceRepo', {
    //   repositoryName: `order-service-${timeStr}`,
    //   imageScanOnPush: true,
    // });
    // this.orderServiceUri = orderServiceRepo.repositoryUri;

    const ecrRole = new iam.Role(this, 'EcrPublicUser', {
      roleName: `EcrPublicUser-${timeStr}`,
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
    /*this.tenantStackMappingTable.grantWriteData(
      iam.Role.fromRoleArn(this, 'eksCodeBuildArn', props!.EksCodeBuildArn)
    );*/
  }
}
