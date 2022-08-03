"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClusterStack = void 0;
const core_1 = require("@aws-cdk/core");
const bootstrap_stack_1 = require("./bootstrap-stack");
const eks_stack_1 = require("./eks-stack");
const admin_stack_1 = require("./admin-stack");
const baseline_infra_stack_1 = require("./baseline-infra-stack");
const tenant_infra_stack_1 = require("./tenant-infra-stack");
const utils_1 = require("./utils");
class ClusterStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const timeStr = utils_1.default();
        new bootstrap_stack_1.BootstrapStack(this, 'BootstrapStack', {
            sourceZipFile: process.env.ZIPFILE || 'eks-workshop-stack-app.zip',
            sourceZipFileChecksum: process.env.ZIPFILE_CHECKSUM || '',
        });
        const eksStack = new eks_stack_1.EksStack(this, 'EksStack', {
            vpcId: process.env.VPC_ID || 'VPC_ID_NOT_SET',
            cloud9EnvironmentId: process.env.CLOUD9_ENVIRONMENT_ID || 'CLOUD9_ENVIRONMENT_ID_NOT_SET',
            codeBuildRoleArn: process.env.BUILD_ROLE_ARN || 'arn:aws:123456789012::iam:role/NOT_SET'
        });
        const { elbUrl, codeBuildRole } = eksStack;
        const adminStack = new admin_stack_1.AdminStack(this, 'AdminStack', {
            elbUrl: elbUrl,
        });
        const { userPoolId, appClientId, issuer } = adminStack;
        const baseline = new baseline_infra_stack_1.BaselineInfraStack(this, 'BaselineStack', {
            AppClientId: appClientId,
            elbUrl: elbUrl,
            UserPoolId: userPoolId,
            TimeString: timeStr,
            EksCodeBuildArn: codeBuildRole.roleArn,
        });
        const tenantInfra = new tenant_infra_stack_1.TenantInfraStack(this, 'TenantInfraStack', {
            elbUrl: elbUrl,
        });
        /* TenantInfra Code pipeline needs a different version of CDK. Researching. Commenting out for now until
         * we figure that out.
        */
        //baseline.tenantStackMappingTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
        //baseline.eksSaaSStackMetadataTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
        new core_1.CfnOutput(this, 'AdminUserPoolId', { value: userPoolId });
        new core_1.CfnOutput(this, 'AdminAppClientId', { value: appClientId });
        new core_1.CfnOutput(this, 'IssuerURL', { value: issuer });
        new core_1.CfnOutput(this, 'AWSRegion', { value: this.region });
        /*
         * Outputs from the BaselineInfraStack
        */
        new core_1.CfnOutput(this, 'ProductServiceECR', { value: baseline.productServiceUri });
        new core_1.CfnOutput(this, 'ProductTable', { value: baseline.productTableName });
        new core_1.CfnOutput(this, 'OrderTable', { value: baseline.orderTableName });
        new core_1.CfnOutput(this, 'TenantTable', { value: baseline.tenantTableName });
        new core_1.CfnOutput(this, 'AuthInfoTable', { value: baseline.authInfoTableName });
        new core_1.CfnOutput(this, 'EksSaaSStackMetadataTable', {
            value: baseline.eksSaaSStackMetadataTableName,
        });
        new core_1.CfnOutput(this, 'TenantStackMappingTable', { value: baseline.tenantStackMappingTableName });
        /*
         * Outputs from the TenantInfraStack
        */
        new core_1.CfnOutput(this, 'PooledTenantUserPoolId', { value: tenantInfra.pooledTenantUserPoolId });
        new core_1.CfnOutput(this, 'PooledTenantAppClientId', { value: tenantInfra.pooledTenantAppClientId });
    }
}
exports.ClusterStack = ClusterStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2x1c3Rlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsdXN0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsd0NBQXdFO0FBRXhFLHVEQUFtRDtBQUNuRCwyQ0FBdUM7QUFDdkMsK0NBQTJDO0FBQzNDLGlFQUE0RDtBQUM1RCw2REFBd0Q7QUFFeEQsbUNBQW9DO0FBRXBDLE1BQWEsWUFBYSxTQUFRLFlBQUs7SUFDckMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUMxRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLE9BQU8sR0FBRyxlQUFhLEVBQUUsQ0FBQztRQUVoQyxJQUFJLGdDQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3pDLGFBQWEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSw0QkFBNEI7WUFDbEUscUJBQXFCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFO1NBQzFELENBQUMsQ0FBQztRQUdILE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzlDLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxnQkFBZ0I7WUFDN0MsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsSUFBSSwrQkFBK0I7WUFDekYsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksd0NBQXdDO1NBQ3pGLENBQUMsQ0FBQztRQUVILE1BQU0sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsUUFBUSxDQUFDO1FBRTNDLE1BQU0sVUFBVSxHQUFHLElBQUksd0JBQVUsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BELE1BQU0sRUFBRSxNQUFNO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsVUFBVSxDQUFDO1FBRXZELE1BQU0sUUFBUSxHQUFHLElBQUkseUNBQWtCLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3RCxXQUFXLEVBQUUsV0FBVztZQUN4QixNQUFNLEVBQUUsTUFBTTtZQUNkLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLFVBQVUsRUFBRSxPQUFPO1lBQ25CLGVBQWUsRUFBRSxhQUFhLENBQUMsT0FBTztTQUN2QyxDQUFDLENBQUM7UUFFSCxNQUFNLFdBQVcsR0FBRyxJQUFJLHFDQUFnQixDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNqRSxNQUFNLEVBQUUsTUFBTTtTQUNmLENBQUMsQ0FBQztRQUVIOztVQUVFO1FBQ0YsOEZBQThGO1FBQzlGLGdHQUFnRztRQUdoRyxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDOUQsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDcEQsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFekQ7O1VBRUU7UUFDRixJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDaEYsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztRQUMxRSxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUN0RSxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUN4RSxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkI7U0FDOUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxDQUFDO1FBRWhHOztVQUVFO1FBQ0YsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQzdGLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUVqRyxDQUFDO0NBQ0Y7QUF0RUQsb0NBc0VDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG4gKi9cblxuaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIENvbnN0cnVjdCwgQ2ZuT3V0cHV0IH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbmltcG9ydCB7IEJvb3RzdHJhcFN0YWNrIH0gZnJvbSAnLi9ib290c3RyYXAtc3RhY2snO1xuaW1wb3J0IHsgRWtzU3RhY2sgfSBmcm9tICcuL2Vrcy1zdGFjayc7XG5pbXBvcnQgeyBBZG1pblN0YWNrIH0gZnJvbSAnLi9hZG1pbi1zdGFjayc7XG5pbXBvcnQgeyBCYXNlbGluZUluZnJhU3RhY2sgfSBmcm9tICcuL2Jhc2VsaW5lLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFRlbmFudEluZnJhU3RhY2sgfSBmcm9tICcuL3RlbmFudC1pbmZyYS1zdGFjayc7XG5cbmltcG9ydCBnZXRUaW1lU3RyaW5nIGZyb20gJy4vdXRpbHMnO1xuXG5leHBvcnQgY2xhc3MgQ2x1c3RlclN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHRpbWVTdHIgPSBnZXRUaW1lU3RyaW5nKCk7XG5cbiAgICBuZXcgQm9vdHN0cmFwU3RhY2sodGhpcywgJ0Jvb3RzdHJhcFN0YWNrJywge1xuICAgICAgc291cmNlWmlwRmlsZTogcHJvY2Vzcy5lbnYuWklQRklMRSB8fCAnZWtzLXdvcmtzaG9wLXN0YWNrLWFwcC56aXAnLFxuICAgICAgc291cmNlWmlwRmlsZUNoZWNrc3VtOiBwcm9jZXNzLmVudi5aSVBGSUxFX0NIRUNLU1VNIHx8ICcnLFxuICAgIH0pO1xuICAgIFxuICAgIFxuICAgIGNvbnN0IGVrc1N0YWNrID0gbmV3IEVrc1N0YWNrKHRoaXMsICdFa3NTdGFjaycsIHtcbiAgICAgIHZwY0lkOiBwcm9jZXNzLmVudi5WUENfSUQgfHwgJ1ZQQ19JRF9OT1RfU0VUJyxcbiAgICAgIGNsb3VkOUVudmlyb25tZW50SWQ6IHByb2Nlc3MuZW52LkNMT1VEOV9FTlZJUk9OTUVOVF9JRCB8fCAnQ0xPVUQ5X0VOVklST05NRU5UX0lEX05PVF9TRVQnLFxuICAgICAgY29kZUJ1aWxkUm9sZUFybjogcHJvY2Vzcy5lbnYuQlVJTERfUk9MRV9BUk4gfHwgJ2Fybjphd3M6MTIzNDU2Nzg5MDEyOjppYW06cm9sZS9OT1RfU0VUJ1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHsgZWxiVXJsLCBjb2RlQnVpbGRSb2xlIH0gPSBla3NTdGFjaztcbiAgICAgICAgXG4gICAgY29uc3QgYWRtaW5TdGFjayA9IG5ldyBBZG1pblN0YWNrKHRoaXMsICdBZG1pblN0YWNrJywge1xuICAgICAgZWxiVXJsOiBlbGJVcmwsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgeyB1c2VyUG9vbElkLCBhcHBDbGllbnRJZCwgaXNzdWVyIH0gPSBhZG1pblN0YWNrO1xuICAgIFxuICAgIGNvbnN0IGJhc2VsaW5lID0gbmV3IEJhc2VsaW5lSW5mcmFTdGFjayh0aGlzLCAnQmFzZWxpbmVTdGFjaycsIHtcbiAgICAgIEFwcENsaWVudElkOiBhcHBDbGllbnRJZCxcbiAgICAgIGVsYlVybDogZWxiVXJsLFxuICAgICAgVXNlclBvb2xJZDogdXNlclBvb2xJZCxcbiAgICAgIFRpbWVTdHJpbmc6IHRpbWVTdHIsXG4gICAgICBFa3NDb2RlQnVpbGRBcm46IGNvZGVCdWlsZFJvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlbmFudEluZnJhID0gbmV3IFRlbmFudEluZnJhU3RhY2sodGhpcywgJ1RlbmFudEluZnJhU3RhY2snLCB7XG4gICAgICBlbGJVcmw6IGVsYlVybCxcbiAgICB9KTtcblxuICAgIC8qIFRlbmFudEluZnJhIENvZGUgcGlwZWxpbmUgbmVlZHMgYSBkaWZmZXJlbnQgdmVyc2lvbiBvZiBDREsuIFJlc2VhcmNoaW5nLiBDb21tZW50aW5nIG91dCBmb3Igbm93IHVudGlsXG4gICAgICogd2UgZmlndXJlIHRoYXQgb3V0LlxuICAgICovXG4gICAgLy9iYXNlbGluZS50ZW5hbnRTdGFja01hcHBpbmdUYWJsZS5ncmFudFJlYWREYXRhKHRlbmFudEluZnJhLnBpcGVsaW5lRnVuY3Rpb24uZ3JhbnRQcmluY2lwYWwpO1xuICAgIC8vYmFzZWxpbmUuZWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZS5ncmFudFJlYWREYXRhKHRlbmFudEluZnJhLnBpcGVsaW5lRnVuY3Rpb24uZ3JhbnRQcmluY2lwYWwpO1xuXG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBZG1pblVzZXJQb29sSWQnLCB7IHZhbHVlOiB1c2VyUG9vbElkIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0FkbWluQXBwQ2xpZW50SWQnLCB7IHZhbHVlOiBhcHBDbGllbnRJZCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdJc3N1ZXJVUkwnLCB7IHZhbHVlOiBpc3N1ZXIgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQVdTUmVnaW9uJywgeyB2YWx1ZTogdGhpcy5yZWdpb24gfSk7XG5cbiAgICAvKlxuICAgICAqIE91dHB1dHMgZnJvbSB0aGUgQmFzZWxpbmVJbmZyYVN0YWNrXG4gICAgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0U2VydmljZUVDUicsIHsgdmFsdWU6IGJhc2VsaW5lLnByb2R1Y3RTZXJ2aWNlVXJpIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3RUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLnByb2R1Y3RUYWJsZU5hbWUgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnT3JkZXJUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLm9yZGVyVGFibGVOYW1lIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1RlbmFudFRhYmxlJywgeyB2YWx1ZTogYmFzZWxpbmUudGVuYW50VGFibGVOYW1lIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhJbmZvVGFibGUnLCB7IHZhbHVlOiBiYXNlbGluZS5hdXRoSW5mb1RhYmxlTmFtZSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFa3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlJywge1xuICAgICAgdmFsdWU6IGJhc2VsaW5lLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGVOYW1lLFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1RlbmFudFN0YWNrTWFwcGluZ1RhYmxlJywgeyB2YWx1ZTogYmFzZWxpbmUudGVuYW50U3RhY2tNYXBwaW5nVGFibGVOYW1lIH0pO1xuXG4gICAgLypcbiAgICAgKiBPdXRwdXRzIGZyb20gdGhlIFRlbmFudEluZnJhU3RhY2tcbiAgICAqL1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1Bvb2xlZFRlbmFudFVzZXJQb29sSWQnLCB7IHZhbHVlOiB0ZW5hbnRJbmZyYS5wb29sZWRUZW5hbnRVc2VyUG9vbElkIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1Bvb2xlZFRlbmFudEFwcENsaWVudElkJywgeyB2YWx1ZTogdGVuYW50SW5mcmEucG9vbGVkVGVuYW50QXBwQ2xpZW50SWQgfSk7XG5cbiAgfVxufVxuIl19