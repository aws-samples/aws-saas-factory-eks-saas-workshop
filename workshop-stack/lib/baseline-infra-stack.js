"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaselineInfraStack = void 0;
const core_1 = require("@aws-cdk/core");
const dynamodb = require("@aws-cdk/aws-dynamodb");
const iam = require("@aws-cdk/aws-iam");
const ecr = require("@aws-cdk/aws-ecr");
class BaselineInfraStack extends core_1.NestedStack {
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
exports.BaselineInfraStack = BaselineInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZWxpbmUtaW5mcmEtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiYXNlbGluZS1pbmZyYS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUFHSCx3Q0FBeUU7QUFDekUsa0RBQWtEO0FBQ2xELHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFVeEMsTUFBYSxrQkFBbUIsU0FBUSxrQkFBVztJQXVCakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLE9BQU8sR0FBRyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsVUFBVSxDQUFDO1FBRWxDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDcEQsU0FBUyxFQUFFLFdBQVcsT0FBTyxFQUFFO1lBQy9CLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hFLFlBQVksRUFBRSxDQUFDO1lBQ2YsYUFBYSxFQUFFLENBQUM7U0FDakIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQztRQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQztRQUVqQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxZQUFZLE9BQU8sRUFBRTtZQUNoQyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUMxRSxZQUFZLEVBQUUs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Q25GLFNBQVMsRUFBRSx5QkFBeUI7WUFDcEMsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDeEUsWUFBWSxFQUFFLENBQUM7WUFDZixhQUFhLEVBQUUsQ0FBQztTQUNqQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsNkJBQTZCLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFNBQVMsQ0FBQztRQUM5RSxJQUFJLENBQUMseUJBQXlCLENBQUMsZUFBZSxDQUFDO1FBRS9DLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQ3ZGLFNBQVMsRUFBRSwrQkFBK0I7WUFDMUMsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDekUsWUFBWSxFQUFFLENBQUM7WUFDZixhQUFhLEVBQUUsQ0FBQztTQUNqQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQztRQUMxRTs7WUFFSTtJQUNOLENBQUM7Q0FDRjtBQXJJRCxnREFxSUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcbiAqL1xuXG5cbmltcG9ydCB7IENvbnN0cnVjdCwgTmVzdGVkU3RhY2ssIE5lc3RlZFN0YWNrUHJvcHMgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ0Bhd3MtY2RrL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnQGF3cy1jZGsvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnQGF3cy1jZGsvYXdzLWVjcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZWxpbmVTdGFja1Byb3BzIGV4dGVuZHMgTmVzdGVkU3RhY2tQcm9wcyB7XG4gIFVzZXJQb29sSWQ6IHN0cmluZztcbiAgQXBwQ2xpZW50SWQ6IHN0cmluZztcbiAgZWxiVXJsOiBzdHJpbmc7XG4gIFRpbWVTdHJpbmc6IHN0cmluZztcbiAgRWtzQ29kZUJ1aWxkQXJuOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCYXNlbGluZUluZnJhU3RhY2sgZXh0ZW5kcyBOZXN0ZWRTdGFjayB7XG4gIHRlbmFudFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdGVuYW50VGFibGVOYW1lOiBzdHJpbmc7XG4gIGF1dGhJbmZvVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBhdXRoSW5mb1RhYmxlTmFtZTogc3RyaW5nO1xuICBwcm9kdWN0VGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwcm9kdWN0VGFibGVOYW1lOiBzdHJpbmc7XG4gIG9yZGVyVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBvcmRlclRhYmxlTmFtZTogc3RyaW5nO1xuICBla3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZU5hbWU6IHN0cmluZztcbiAgdGVuYW50U3RhY2tNYXBwaW5nVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICB0ZW5hbnRTdGFja01hcHBpbmdUYWJsZU5hbWU6IHN0cmluZztcbiAgLy8gYWRtaW5TaXRlRWNyVXJpOiBzdHJpbmc7XG4gIC8vIHRlbmFudFJlZ2lzdHJhdGlvbkVjclVyaTogc3RyaW5nO1xuICAvLyB0ZW5hbnRNYW5hZ2VtZW50RWNyVXJpOiBzdHJpbmc7XG4gIC8vIHVzZXJNYW5hZ2VtZW50RWNyVXJpOiBzdHJpbmc7XG4gIC8vIGFwcFNpdGVFY3JVcmk6IHN0cmluZztcbiAgY29kZUJ1aWxkUm9sZTogaWFtLlJvbGU7XG4gIHByb2R1Y3RTZXJ2aWNlVXJpOiBzdHJpbmc7XG4gIC8vIG9yZGVyU2VydmljZVVyaTogc3RyaW5nO1xuICBkeW5hbWljQXNzdW1lUm9sZUFybjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogQmFzZWxpbmVTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB0aW1lU3RyID0gcHJvcHM/LlRpbWVTdHJpbmc7XG5cbiAgICB0aGlzLnRlbmFudFRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdUZW5hbnQnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBUZW5hbnRzLSR7dGltZVN0cn1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZW5hbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICB9KTtcbiAgICB0aGlzLnRlbmFudFRhYmxlTmFtZSA9IHRoaXMudGVuYW50VGFibGUudGFibGVOYW1lO1xuICAgIHRoaXMudGVuYW50VGFibGUuZ3JhbnRGdWxsQWNjZXNzO1xuXG4gICAgdGhpcy5hdXRoSW5mb1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdBdXRoSW5mbycsIHtcbiAgICAgIHRhYmxlTmFtZTogYEF1dGhJbmZvLSR7dGltZVN0cn1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZW5hbnRfcGF0aCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMuYXV0aEluZm9UYWJsZU5hbWUgPSB0aGlzLmF1dGhJbmZvVGFibGUudGFibGVOYW1lO1xuXG4gICAgdGhpcy5wcm9kdWN0VGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1Byb2R1Y3RzJywge1xuICAgICAgdGFibGVOYW1lOiBgUHJvZHVjdHMtUG9vbGVkLSR7dGltZVN0cn1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZW5hbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAncHJvZHVjdF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMucHJvZHVjdFRhYmxlTmFtZSA9IHRoaXMucHJvZHVjdFRhYmxlLnRhYmxlTmFtZTtcblxuICAgIHRoaXMub3JkZXJUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnT3JkZXJzJywge1xuICAgICAgdGFibGVOYW1lOiBgT3JkZXJzLVBvb2xlZC0ke3RpbWVTdHJ9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ29yZGVyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHJlYWRDYXBhY2l0eTogNSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDUsXG4gICAgfSk7XG4gICAgdGhpcy5vcmRlclRhYmxlTmFtZSA9IHRoaXMub3JkZXJUYWJsZS50YWJsZU5hbWU7XG5cbiAgICAvLyBjb25zdCBhZG1pblNpdGVSZXBvID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdBZG1pblNpdGVSZXBvJywge1xuICAgIC8vICAgcmVwb3NpdG9yeU5hbWU6IGBhZG1pbi1zaXRlLSR7dGltZVN0cn1gLFxuICAgIC8vICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgIC8vIH0pO1xuICAgIC8vIHRoaXMuYWRtaW5TaXRlRWNyVXJpID0gYWRtaW5TaXRlUmVwby5yZXBvc2l0b3J5VXJpO1xuICAgIC8vIGNvbnN0IHRlbmFudFJlZ2lzdHJhdGlvblNlcnZpY2VSZXBvID0gbmV3IGVjci5SZXBvc2l0b3J5KFxuICAgIC8vICAgdGhpcyxcbiAgICAvLyAgICdUZW5hbnRSZWdpc3RyYXRpb25TZXJ2aWNlUmVwbycsXG4gICAgLy8gICB7XG4gICAgLy8gICAgIHJlcG9zaXRvcnlOYW1lOiBgdGVuYW50LXJlZ2lzdHJhdGlvbi1zZXJ2aWNlLSR7dGltZVN0cn1gLFxuICAgIC8vICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgLy8gICB9XG4gICAgLy8gKTtcbiAgICAvLyB0aGlzLnRlbmFudFJlZ2lzdHJhdGlvbkVjclVyaSA9IHRlbmFudFJlZ2lzdHJhdGlvblNlcnZpY2VSZXBvLnJlcG9zaXRvcnlVcmk7XG4gICAgLy8gY29uc3QgdGVuYW50TWFuYWdlbWVudFNlcnZpY2VSZXBvID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdUZW5hbnRNYW5hZ2VtZW50U2VydmljZVJlcG8nLCB7XG4gICAgLy8gICByZXBvc2l0b3J5TmFtZTogYHRlbmFudC1tYW5hZ2VtZW50LXNlcnZpY2UtJHt0aW1lU3RyfWAsXG4gICAgLy8gICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgLy8gfSk7XG4gICAgLy8gdGhpcy50ZW5hbnRNYW5hZ2VtZW50RWNyVXJpID0gdGVuYW50TWFuYWdlbWVudFNlcnZpY2VSZXBvLnJlcG9zaXRvcnlVcmk7XG4gICAgLy8gY29uc3QgdXNlck1hbmFnZW1lbnRTZXJ2aWNlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnVXNlck1hbmFnZW1lbnRTZXJ2aWNlUmVwbycsIHtcbiAgICAvLyAgIHJlcG9zaXRvcnlOYW1lOiBgdXNlci1tYW5hZ2VtZW50LXNlcnZpY2UtJHt0aW1lU3RyfWAsXG4gICAgLy8gICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgLy8gfSk7XG4gICAgLy8gdGhpcy51c2VyTWFuYWdlbWVudEVjclVyaSA9IHVzZXJNYW5hZ2VtZW50U2VydmljZVJlcG8ucmVwb3NpdG9yeVVyaTtcbiAgICAvLyBjb25zdCBhcHBsaWNhdGlvblNpdGVSZXBvID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdBcHBsaWNhdGlvblNpdGVSZXBvJywge1xuICAgIC8vICAgcmVwb3NpdG9yeU5hbWU6IGBhcHBsaWNhdGlvbi1zaXRlLSR7dGltZVN0cn1gLFxuICAgIC8vICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgIC8vIH0pO1xuICAgIC8vIHRoaXMuYXBwU2l0ZUVjclVyaSA9IGFwcGxpY2F0aW9uU2l0ZVJlcG8ucmVwb3NpdG9yeVVyaTtcblxuICAgIGNvbnN0IHByb2R1Y3RTZXJ2aWNlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnUHJvZHVjdFNlcnZpY2VSZXBvJywge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6IGBwcm9kdWN0LXNlcnZpY2UtJHt0aW1lU3RyfWAsXG4gICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgfSk7XG4gICAgdGhpcy5wcm9kdWN0U2VydmljZVVyaSA9IHByb2R1Y3RTZXJ2aWNlUmVwby5yZXBvc2l0b3J5VXJpO1xuXG4gICAgLy8gY29uc3Qgb3JkZXJTZXJ2aWNlUmVwbyA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnT3JkZXJTZXJ2aWNlUmVwbycsIHtcbiAgICAvLyAgIHJlcG9zaXRvcnlOYW1lOiBgb3JkZXItc2VydmljZS0ke3RpbWVTdHJ9YCxcbiAgICAvLyAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAvLyB9KTtcbiAgICAvLyB0aGlzLm9yZGVyU2VydmljZVVyaSA9IG9yZGVyU2VydmljZVJlcG8ucmVwb3NpdG9yeVVyaTtcblxuICAgIGNvbnN0IGVjclJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0VjclB1YmxpY1VzZXInLCB7XG4gICAgICByb2xlTmFtZTogYEVjclB1YmxpY1VzZXItJHt0aW1lU3RyfWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uQWNjb3VudFJvb3RQcmluY2lwYWwoKSxcbiAgICB9KTtcblxuICAgIGVjci5BdXRob3JpemF0aW9uVG9rZW4uZ3JhbnRSZWFkKGVjclJvbGUpO1xuICAgIGVjci5QdWJsaWNHYWxsZXJ5QXV0aG9yaXphdGlvblRva2VuLmdyYW50UmVhZChlY3JSb2xlKTtcblxuICAgIHRoaXMuZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRUtTLVNhYVMtU3RhY2stTWV0YWRhdGEnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBFS1MtU2FhUy1TdGFjay1NZXRhZGF0YWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ1N0YWNrTmFtZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMuZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZU5hbWUgPSB0aGlzLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGUudGFibGVOYW1lO1xuICAgIHRoaXMuZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZS5ncmFudEZ1bGxBY2Nlc3M7XG5cbiAgICB0aGlzLnRlbmFudFN0YWNrTWFwcGluZ1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdFS1MtU2FhUy1UZW5hbnQtU3RhY2stTWFwcGluZycsIHtcbiAgICAgIHRhYmxlTmFtZTogYEVLUy1TYWFTLVRlbmFudC1TdGFjay1NYXBwaW5nYCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnVGVuYW50TmFtZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMudGVuYW50U3RhY2tNYXBwaW5nVGFibGVOYW1lID0gdGhpcy50ZW5hbnRTdGFja01hcHBpbmdUYWJsZS50YWJsZU5hbWU7XG4gICAgLyp0aGlzLnRlbmFudFN0YWNrTWFwcGluZ1RhYmxlLmdyYW50V3JpdGVEYXRhKFxuICAgICAgaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ2Vrc0NvZGVCdWlsZEFybicsIHByb3BzIS5Fa3NDb2RlQnVpbGRBcm4pXG4gICAgKTsqL1xuICB9XG59XG4iXX0=