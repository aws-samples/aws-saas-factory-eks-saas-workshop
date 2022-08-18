"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClusterStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const bootstrap_stack_1 = require("./bootstrap-stack");
const eks_stack_1 = require("./eks-stack");
const admin_stack_1 = require("./admin-stack");
const baseline_infra_stack_1 = require("./baseline-infra-stack");
const tenant_infra_stack_1 = require("./tenant-infra-stack");
const utils_1 = require("./utils");
class ClusterStack extends aws_cdk_lib_1.Stack {
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
        baseline.tenantStackMappingTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
        baseline.eksSaaSStackMetadataTable.grantReadData(tenantInfra.pipelineFunction.grantPrincipal);
        new aws_cdk_lib_1.CfnOutput(this, 'AdminUserPoolId', { value: userPoolId });
        new aws_cdk_lib_1.CfnOutput(this, 'AdminAppClientId', { value: appClientId });
        new aws_cdk_lib_1.CfnOutput(this, 'IssuerURL', { value: issuer });
        new aws_cdk_lib_1.CfnOutput(this, 'AWSRegion', { value: this.region });
        /*
         * Outputs from the BaselineInfraStack
        */
        new aws_cdk_lib_1.CfnOutput(this, 'ProductServiceECR', { value: baseline.productServiceUri });
        new aws_cdk_lib_1.CfnOutput(this, 'ProductTable', { value: baseline.productTableName });
        new aws_cdk_lib_1.CfnOutput(this, 'OrderTable', { value: baseline.orderTableName });
        new aws_cdk_lib_1.CfnOutput(this, 'TenantTable', { value: baseline.tenantTableName });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthInfoTable', { value: baseline.authInfoTableName });
        new aws_cdk_lib_1.CfnOutput(this, 'EksSaaSStackMetadataTable', {
            value: baseline.eksSaaSStackMetadataTableName,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'TenantStackMappingTable', { value: baseline.tenantStackMappingTableName });
        /*
         * Outputs from the TenantInfraStack
        */
        new aws_cdk_lib_1.CfnOutput(this, 'PooledTenantUserPoolId', { value: tenantInfra.pooledTenantUserPoolId });
        new aws_cdk_lib_1.CfnOutput(this, 'PooledTenantAppClientId', { value: tenantInfra.pooledTenantAppClientId });
        /*
         * Outputs from the EksStack
        */
        new aws_cdk_lib_1.CfnOutput(this, 'ELBURL', { value: eksStack.elbUrl });
        new aws_cdk_lib_1.CfnOutput(this, 'EksCodebuildArn', { value: eksStack.codeBuildRole.roleArn });
        new aws_cdk_lib_1.CfnOutput(this, 'RoleUsedByTVM', { value: eksStack.roleUsedByTokenVendingMachine.roleArn });
    }
}
exports.ClusterStack = ClusterStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2x1c3Rlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsdXN0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsNkNBQTJEO0FBRzNELHVEQUFtRDtBQUNuRCwyQ0FBdUM7QUFDdkMsK0NBQTJDO0FBQzNDLGlFQUE0RDtBQUM1RCw2REFBd0Q7QUFFeEQsbUNBQW9DO0FBRXBDLE1BQWEsWUFBYSxTQUFRLG1CQUFLO0lBQ3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0I7UUFDMUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxPQUFPLEdBQUcsZUFBYSxFQUFFLENBQUM7UUFFaEMsSUFBSSxnQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN6QyxhQUFhLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksNEJBQTRCO1lBQ2xFLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLElBQUksRUFBRTtTQUMxRCxDQUFDLENBQUM7UUFHSCxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUM5QyxLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksZ0JBQWdCO1lBQzdDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLElBQUksK0JBQStCO1lBQ3pGLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLHdDQUF3QztTQUN6RixDQUFDLENBQUM7UUFFSCxNQUFNLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxHQUFHLFFBQVEsQ0FBQztRQUUzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUFVLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwRCxNQUFNLEVBQUUsTUFBTTtT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QkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDbEYsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFHbEcsQ0FBQztDQUNGO0FBOUVELG9DQThFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuICovXG5cbmltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW1wb3J0IHsgQm9vdHN0cmFwU3RhY2sgfSBmcm9tICcuL2Jvb3RzdHJhcC1zdGFjayc7XG5pbXBvcnQgeyBFa3NTdGFjayB9IGZyb20gJy4vZWtzLXN0YWNrJztcbmltcG9ydCB7IEFkbWluU3RhY2sgfSBmcm9tICcuL2FkbWluLXN0YWNrJztcbmltcG9ydCB7IEJhc2VsaW5lSW5mcmFTdGFjayB9IGZyb20gJy4vYmFzZWxpbmUtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgVGVuYW50SW5mcmFTdGFjayB9IGZyb20gJy4vdGVuYW50LWluZnJhLXN0YWNrJztcblxuaW1wb3J0IGdldFRpbWVTdHJpbmcgZnJvbSAnLi91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBDbHVzdGVyU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgdGltZVN0ciA9IGdldFRpbWVTdHJpbmcoKTtcblxuICAgIG5ldyBCb290c3RyYXBTdGFjayh0aGlzLCAnQm9vdHN0cmFwU3RhY2snLCB7XG4gICAgICBzb3VyY2VaaXBGaWxlOiBwcm9jZXNzLmVudi5aSVBGSUxFIHx8ICdla3Mtd29ya3Nob3Atc3RhY2stYXBwLnppcCcsXG4gICAgICBzb3VyY2VaaXBGaWxlQ2hlY2tzdW06IHByb2Nlc3MuZW52LlpJUEZJTEVfQ0hFQ0tTVU0gfHwgJycsXG4gICAgfSk7XG4gICAgXG4gICAgXG4gICAgY29uc3QgZWtzU3RhY2sgPSBuZXcgRWtzU3RhY2sodGhpcywgJ0Vrc1N0YWNrJywge1xuICAgICAgdnBjSWQ6IHByb2Nlc3MuZW52LlZQQ19JRCB8fCAnVlBDX0lEX05PVF9TRVQnLFxuICAgICAgY2xvdWQ5RW52aXJvbm1lbnRJZDogcHJvY2Vzcy5lbnYuQ0xPVUQ5X0VOVklST05NRU5UX0lEIHx8ICdDTE9VRDlfRU5WSVJPTk1FTlRfSURfTk9UX1NFVCcsXG4gICAgICBjb2RlQnVpbGRSb2xlQXJuOiBwcm9jZXNzLmVudi5CVUlMRF9ST0xFX0FSTiB8fCAnYXJuOmF3czoxMjM0NTY3ODkwMTI6OmlhbTpyb2xlL05PVF9TRVQnXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgeyBlbGJVcmwsIGNvZGVCdWlsZFJvbGUgfSA9IGVrc1N0YWNrO1xuICAgICAgICBcbiAgICBjb25zdCBhZG1pblN0YWNrID0gbmV3IEFkbWluU3RhY2sodGhpcywgJ0FkbWluU3RhY2snLCB7XG4gICAgICBlbGJVcmw6IGVsYlVybCxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCB7IHVzZXJQb29sSWQsIGFwcENsaWVudElkLCBpc3N1ZXIgfSA9IGFkbWluU3RhY2s7XG4gICAgXG4gICAgY29uc3QgYmFzZWxpbmUgPSBuZXcgQmFzZWxpbmVJbmZyYVN0YWNrKHRoaXMsICdCYXNlbGluZVN0YWNrJywge1xuICAgICAgQXBwQ2xpZW50SWQ6IGFwcENsaWVudElkLFxuICAgICAgZWxiVXJsOiBlbGJVcmwsXG4gICAgICBVc2VyUG9vbElkOiB1c2VyUG9vbElkLFxuICAgICAgVGltZVN0cmluZzogdGltZVN0cixcbiAgICAgIEVrc0NvZGVCdWlsZEFybjogY29kZUJ1aWxkUm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGVuYW50SW5mcmEgPSBuZXcgVGVuYW50SW5mcmFTdGFjayh0aGlzLCAnVGVuYW50SW5mcmFTdGFjaycsIHtcbiAgICAgIGVsYlVybDogZWxiVXJsLFxuICAgIH0pO1xuXG4gICAgLyogVGVuYW50SW5mcmEgQ29kZSBwaXBlbGluZSBuZWVkcyBhIGRpZmZlcmVudCB2ZXJzaW9uIG9mIENESy4gUmVzZWFyY2hpbmcuIENvbW1lbnRpbmcgb3V0IGZvciBub3cgdW50aWxcbiAgICAgKiB3ZSBmaWd1cmUgdGhhdCBvdXQuXG4gICAgKi9cbiAgICBiYXNlbGluZS50ZW5hbnRTdGFja01hcHBpbmdUYWJsZS5ncmFudFJlYWREYXRhKHRlbmFudEluZnJhLnBpcGVsaW5lRnVuY3Rpb24uZ3JhbnRQcmluY2lwYWwpO1xuICAgIGJhc2VsaW5lLmVrc1NhYVNTdGFja01ldGFkYXRhVGFibGUuZ3JhbnRSZWFkRGF0YSh0ZW5hbnRJbmZyYS5waXBlbGluZUZ1bmN0aW9uLmdyYW50UHJpbmNpcGFsKTtcblxuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQWRtaW5Vc2VyUG9vbElkJywgeyB2YWx1ZTogdXNlclBvb2xJZCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBZG1pbkFwcENsaWVudElkJywgeyB2YWx1ZTogYXBwQ2xpZW50SWQgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnSXNzdWVyVVJMJywgeyB2YWx1ZTogaXNzdWVyIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0FXU1JlZ2lvbicsIHsgdmFsdWU6IHRoaXMucmVnaW9uIH0pO1xuXG4gICAgLypcbiAgICAgKiBPdXRwdXRzIGZyb20gdGhlIEJhc2VsaW5lSW5mcmFTdGFja1xuICAgICovXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUHJvZHVjdFNlcnZpY2VFQ1InLCB7IHZhbHVlOiBiYXNlbGluZS5wcm9kdWN0U2VydmljZVVyaSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0VGFibGUnLCB7IHZhbHVlOiBiYXNlbGluZS5wcm9kdWN0VGFibGVOYW1lIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ09yZGVyVGFibGUnLCB7IHZhbHVlOiBiYXNlbGluZS5vcmRlclRhYmxlTmFtZSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLnRlbmFudFRhYmxlTmFtZSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoSW5mb1RhYmxlJywgeyB2YWx1ZTogYmFzZWxpbmUuYXV0aEluZm9UYWJsZU5hbWUgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZScsIHtcbiAgICAgIHZhbHVlOiBiYXNlbGluZS5la3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlTmFtZSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRTdGFja01hcHBpbmdUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLnRlbmFudFN0YWNrTWFwcGluZ1RhYmxlTmFtZSB9KTtcblxuICAgIC8qXG4gICAgICogT3V0cHV0cyBmcm9tIHRoZSBUZW5hbnRJbmZyYVN0YWNrXG4gICAgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQb29sZWRUZW5hbnRVc2VyUG9vbElkJywgeyB2YWx1ZTogdGVuYW50SW5mcmEucG9vbGVkVGVuYW50VXNlclBvb2xJZCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQb29sZWRUZW5hbnRBcHBDbGllbnRJZCcsIHsgdmFsdWU6IHRlbmFudEluZnJhLnBvb2xlZFRlbmFudEFwcENsaWVudElkIH0pO1xuXG4gICAgLypcbiAgICAgKiBPdXRwdXRzIGZyb20gdGhlIEVrc1N0YWNrXG4gICAgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFTEJVUkwnLCB7IHZhbHVlOiBla3NTdGFjay5lbGJVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzQ29kZWJ1aWxkQXJuJywgeyB2YWx1ZTogZWtzU3RhY2suY29kZUJ1aWxkUm9sZS5yb2xlQXJuIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JvbGVVc2VkQnlUVk0nLCB7IHZhbHVlOiBla3NTdGFjay5yb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZS5yb2xlQXJuIH0pO1xuXG5cbiAgfVxufVxuIl19