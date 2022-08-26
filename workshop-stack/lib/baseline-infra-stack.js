"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaselineInfraStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const iam = require("aws-cdk-lib/aws-iam");
const ecr = require("aws-cdk-lib/aws-ecr");
class BaselineInfraStack extends aws_cdk_lib_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const timeStr = props === null || props === void 0 ? void 0 : props.TimeString;
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
        const tenantRegistrationServiceRepo = new ecr.Repository(this, 'TenantRegistrationServiceRepo', {
            repositoryName: `tenant-registration-service-${timeStr}`,
            imageScanOnPush: true,
        });
        this.tenantRegistrationEcrUri = tenantRegistrationServiceRepo.repositoryUri;
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
exports.BaselineInfraStack = BaselineInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZWxpbmUtaW5mcmEtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiYXNlbGluZS1pbmZyYS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUFHSCw2Q0FBNEQ7QUFHNUQscURBQXFEO0FBQ3JELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFVM0MsTUFBYSxrQkFBbUIsU0FBUSx5QkFBVztJQXVCakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLE9BQU8sR0FBRyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsVUFBVSxDQUFDO1FBRWxDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDcEQsU0FBUyxFQUFFLFdBQVcsT0FBTyxFQUFFO1lBQy9CLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hFLFlBQVksRUFBRSxDQUFDO1lBQ2YsYUFBYSxFQUFFLENBQUM7U0FDakIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQztRQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQztRQUVqQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxZQUFZLE9BQU8sRUFBRTtZQUNoQyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUMxRSxZQUFZLEVBQUUs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QUMsQ0FBQztRQUV2RCxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNuRixTQUFTLEVBQUUseUJBQXlCO1lBQ3BDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hFLFlBQVksRUFBRSxDQUFDO1lBQ2YsYUFBYSxFQUFFLENBQUM7U0FDakIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLDZCQUE2QixHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUM7UUFDOUUsSUFBSSxDQUFDLHlCQUF5QixDQUFDLGVBQWUsQ0FBQztRQUUvQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUN2RixTQUFTLEVBQUUsK0JBQStCO1lBQzFDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3pFLFlBQVksRUFBRSxDQUFDO1lBQ2YsYUFBYSxFQUFFLENBQUM7U0FDakIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLDJCQUEyQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxTQUFTLENBQUM7UUFDMUU7O1lBRUk7SUFDTixDQUFDO0NBQ0Y7QUFySUQsZ0RBcUlDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG4gKi9cblxuXG5pbXBvcnQgeyBOZXN0ZWRTdGFjaywgTmVzdGVkU3RhY2tQcm9wcyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VsaW5lU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICBVc2VyUG9vbElkOiBzdHJpbmc7XG4gIEFwcENsaWVudElkOiBzdHJpbmc7XG4gIGVsYlVybDogc3RyaW5nO1xuICBUaW1lU3RyaW5nOiBzdHJpbmc7XG4gIEVrc0NvZGVCdWlsZEFybjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQmFzZWxpbmVJbmZyYVN0YWNrIGV4dGVuZHMgTmVzdGVkU3RhY2sge1xuICB0ZW5hbnRUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHRlbmFudFRhYmxlTmFtZTogc3RyaW5nO1xuICBhdXRoSW5mb1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgYXV0aEluZm9UYWJsZU5hbWU6IHN0cmluZztcbiAgcHJvZHVjdFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHJvZHVjdFRhYmxlTmFtZTogc3RyaW5nO1xuICBvcmRlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgb3JkZXJUYWJsZU5hbWU6IHN0cmluZztcbiAgZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIGVrc1NhYVNTdGFja01ldGFkYXRhVGFibGVOYW1lOiBzdHJpbmc7XG4gIHRlbmFudFN0YWNrTWFwcGluZ1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdGVuYW50U3RhY2tNYXBwaW5nVGFibGVOYW1lOiBzdHJpbmc7XG4gIC8vIGFkbWluU2l0ZUVjclVyaTogc3RyaW5nO1xuICB0ZW5hbnRSZWdpc3RyYXRpb25FY3JVcmk6IHN0cmluZztcbiAgLy8gdGVuYW50TWFuYWdlbWVudEVjclVyaTogc3RyaW5nO1xuICAvLyB1c2VyTWFuYWdlbWVudEVjclVyaTogc3RyaW5nO1xuICAvLyBhcHBTaXRlRWNyVXJpOiBzdHJpbmc7XG4gIGNvZGVCdWlsZFJvbGU6IGlhbS5Sb2xlO1xuICBwcm9kdWN0U2VydmljZVVyaTogc3RyaW5nO1xuICAvLyBvcmRlclNlcnZpY2VVcmk6IHN0cmluZztcbiAgZHluYW1pY0Fzc3VtZVJvbGVBcm46IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IEJhc2VsaW5lU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgdGltZVN0ciA9IHByb3BzPy5UaW1lU3RyaW5nO1xuXG4gICAgdGhpcy50ZW5hbnRUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVGVuYW50Jywge1xuICAgICAgdGFibGVOYW1lOiBgVGVuYW50cy0ke3RpbWVTdHJ9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHJlYWRDYXBhY2l0eTogNSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDUsXG4gICAgfSk7XG4gICAgdGhpcy50ZW5hbnRUYWJsZU5hbWUgPSB0aGlzLnRlbmFudFRhYmxlLnRhYmxlTmFtZTtcbiAgICB0aGlzLnRlbmFudFRhYmxlLmdyYW50RnVsbEFjY2VzcztcblxuICAgIHRoaXMuYXV0aEluZm9UYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQXV0aEluZm8nLCB7XG4gICAgICB0YWJsZU5hbWU6IGBBdXRoSW5mby0ke3RpbWVTdHJ9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50X3BhdGgnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICB9KTtcbiAgICB0aGlzLmF1dGhJbmZvVGFibGVOYW1lID0gdGhpcy5hdXRoSW5mb1RhYmxlLnRhYmxlTmFtZTtcblxuICAgIHRoaXMucHJvZHVjdFRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdQcm9kdWN0cycsIHtcbiAgICAgIHRhYmxlTmFtZTogYFByb2R1Y3RzLVBvb2xlZC0ke3RpbWVTdHJ9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3Byb2R1Y3RfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICB9KTtcbiAgICB0aGlzLnByb2R1Y3RUYWJsZU5hbWUgPSB0aGlzLnByb2R1Y3RUYWJsZS50YWJsZU5hbWU7XG5cbiAgICB0aGlzLm9yZGVyVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ09yZGVycycsIHtcbiAgICAgIHRhYmxlTmFtZTogYE9yZGVycy1Qb29sZWQtJHt0aW1lU3RyfWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlbmFudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdvcmRlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMub3JkZXJUYWJsZU5hbWUgPSB0aGlzLm9yZGVyVGFibGUudGFibGVOYW1lO1xuXG4gICAgLy8gY29uc3QgYWRtaW5TaXRlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnQWRtaW5TaXRlUmVwbycsIHtcbiAgICAvLyAgIHJlcG9zaXRvcnlOYW1lOiBgYWRtaW4tc2l0ZS0ke3RpbWVTdHJ9YCxcbiAgICAvLyAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAvLyB9KTtcbiAgICAvLyB0aGlzLmFkbWluU2l0ZUVjclVyaSA9IGFkbWluU2l0ZVJlcG8ucmVwb3NpdG9yeVVyaTtcbiAgICBjb25zdCB0ZW5hbnRSZWdpc3RyYXRpb25TZXJ2aWNlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeShcbiAgICAgIHRoaXMsXG4gICAgICAnVGVuYW50UmVnaXN0cmF0aW9uU2VydmljZVJlcG8nLFxuICAgICAge1xuICAgICAgICByZXBvc2l0b3J5TmFtZTogYHRlbmFudC1yZWdpc3RyYXRpb24tc2VydmljZS0ke3RpbWVTdHJ9YCxcbiAgICAgICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy50ZW5hbnRSZWdpc3RyYXRpb25FY3JVcmkgPSB0ZW5hbnRSZWdpc3RyYXRpb25TZXJ2aWNlUmVwby5yZXBvc2l0b3J5VXJpO1xuICAgIC8vIGNvbnN0IHRlbmFudE1hbmFnZW1lbnRTZXJ2aWNlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnVGVuYW50TWFuYWdlbWVudFNlcnZpY2VSZXBvJywge1xuICAgIC8vICAgcmVwb3NpdG9yeU5hbWU6IGB0ZW5hbnQtbWFuYWdlbWVudC1zZXJ2aWNlLSR7dGltZVN0cn1gLFxuICAgIC8vICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgIC8vIH0pO1xuICAgIC8vIHRoaXMudGVuYW50TWFuYWdlbWVudEVjclVyaSA9IHRlbmFudE1hbmFnZW1lbnRTZXJ2aWNlUmVwby5yZXBvc2l0b3J5VXJpO1xuICAgIC8vIGNvbnN0IHVzZXJNYW5hZ2VtZW50U2VydmljZVJlcG8gPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ1VzZXJNYW5hZ2VtZW50U2VydmljZVJlcG8nLCB7XG4gICAgLy8gICByZXBvc2l0b3J5TmFtZTogYHVzZXItbWFuYWdlbWVudC1zZXJ2aWNlLSR7dGltZVN0cn1gLFxuICAgIC8vICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgIC8vIH0pO1xuICAgIC8vIHRoaXMudXNlck1hbmFnZW1lbnRFY3JVcmkgPSB1c2VyTWFuYWdlbWVudFNlcnZpY2VSZXBvLnJlcG9zaXRvcnlVcmk7XG4gICAgLy8gY29uc3QgYXBwbGljYXRpb25TaXRlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnQXBwbGljYXRpb25TaXRlUmVwbycsIHtcbiAgICAvLyAgIHJlcG9zaXRvcnlOYW1lOiBgYXBwbGljYXRpb24tc2l0ZS0ke3RpbWVTdHJ9YCxcbiAgICAvLyAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAvLyB9KTtcbiAgICAvLyB0aGlzLmFwcFNpdGVFY3JVcmkgPSBhcHBsaWNhdGlvblNpdGVSZXBvLnJlcG9zaXRvcnlVcmk7XG5cbiAgICBjb25zdCBwcm9kdWN0U2VydmljZVJlcG8gPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ1Byb2R1Y3RTZXJ2aWNlUmVwbycsIHtcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiBgcHJvZHVjdC1zZXJ2aWNlLSR7dGltZVN0cn1gLFxuICAgICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgIH0pO1xuICAgIHRoaXMucHJvZHVjdFNlcnZpY2VVcmkgPSBwcm9kdWN0U2VydmljZVJlcG8ucmVwb3NpdG9yeVVyaTtcblxuICAgIC8vIGNvbnN0IG9yZGVyU2VydmljZVJlcG8gPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ09yZGVyU2VydmljZVJlcG8nLCB7XG4gICAgLy8gICByZXBvc2l0b3J5TmFtZTogYG9yZGVyLXNlcnZpY2UtJHt0aW1lU3RyfWAsXG4gICAgLy8gICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgLy8gfSk7XG4gICAgLy8gdGhpcy5vcmRlclNlcnZpY2VVcmkgPSBvcmRlclNlcnZpY2VSZXBvLnJlcG9zaXRvcnlVcmk7XG5cbiAgICBjb25zdCBlY3JSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFY3JQdWJsaWNVc2VyJywge1xuICAgICAgcm9sZU5hbWU6IGBFY3JQdWJsaWNVc2VyLSR7dGltZVN0cn1gLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKCksXG4gICAgfSk7XG5cbiAgICBlY3IuQXV0aG9yaXphdGlvblRva2VuLmdyYW50UmVhZChlY3JSb2xlKTtcbiAgICBlY3IuUHVibGljR2FsbGVyeUF1dGhvcml6YXRpb25Ub2tlbi5ncmFudFJlYWQoZWNyUm9sZSk7XG5cbiAgICB0aGlzLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0VLUy1TYWFTLVN0YWNrLU1ldGFkYXRhJywge1xuICAgICAgdGFibGVOYW1lOiBgRUtTLVNhYVMtU3RhY2stTWV0YWRhdGFgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdTdGFja05hbWUnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICB9KTtcbiAgICB0aGlzLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGVOYW1lID0gdGhpcy5la3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlLnRhYmxlTmFtZTtcbiAgICB0aGlzLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGUuZ3JhbnRGdWxsQWNjZXNzO1xuXG4gICAgdGhpcy50ZW5hbnRTdGFja01hcHBpbmdUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRUtTLVNhYVMtVGVuYW50LVN0YWNrLU1hcHBpbmcnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBFS1MtU2FhUy1UZW5hbnQtU3RhY2stTWFwcGluZ2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ1RlbmFudE5hbWUnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICB9KTtcbiAgICB0aGlzLnRlbmFudFN0YWNrTWFwcGluZ1RhYmxlTmFtZSA9IHRoaXMudGVuYW50U3RhY2tNYXBwaW5nVGFibGUudGFibGVOYW1lO1xuICAgIC8qdGhpcy50ZW5hbnRTdGFja01hcHBpbmdUYWJsZS5ncmFudFdyaXRlRGF0YShcbiAgICAgIGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdla3NDb2RlQnVpbGRBcm4nLCBwcm9wcyEuRWtzQ29kZUJ1aWxkQXJuKVxuICAgICk7Ki9cbiAgfVxufVxuIl19