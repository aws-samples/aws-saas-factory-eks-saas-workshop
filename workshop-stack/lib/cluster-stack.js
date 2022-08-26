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
        new aws_cdk_lib_1.CfnOutput(this, 'TenantRegistrationServiceECR', { value: baseline.tenantRegistrationEcrUri });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2x1c3Rlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsdXN0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsNkNBQTJEO0FBRzNELHVEQUFtRDtBQUNuRCwyQ0FBdUM7QUFDdkMsK0NBQTJDO0FBQzNDLGlFQUE0RDtBQUM1RCw2REFBd0Q7QUFFeEQsbUNBQW9DO0FBRXBDLE1BQWEsWUFBYSxTQUFRLG1CQUFLO0lBQ3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0I7UUFDMUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxPQUFPLEdBQUcsZUFBYSxFQUFFLENBQUM7UUFFaEMsSUFBSSxnQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN6QyxhQUFhLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksNEJBQTRCO1lBQ2xFLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLElBQUksRUFBRTtTQUMxRCxDQUFDLENBQUM7UUFHSCxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUM5QyxLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksZ0JBQWdCO1lBQzdDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLElBQUksK0JBQStCO1lBQ3pGLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLHdDQUF3QztTQUN6RixDQUFDLENBQUM7UUFFSCxNQUFNLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxHQUFHLFFBQVEsQ0FBQztRQUUzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUFVLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwRCxNQUFNLEVBQUUsTUFBTTtT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QUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzFELElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBR2xHLENBQUM7Q0FDRjtBQS9FRCxvQ0ErRUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcbiAqL1xuXG5pbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgQ2ZuT3V0cHV0IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmltcG9ydCB7IEJvb3RzdHJhcFN0YWNrIH0gZnJvbSAnLi9ib290c3RyYXAtc3RhY2snO1xuaW1wb3J0IHsgRWtzU3RhY2sgfSBmcm9tICcuL2Vrcy1zdGFjayc7XG5pbXBvcnQgeyBBZG1pblN0YWNrIH0gZnJvbSAnLi9hZG1pbi1zdGFjayc7XG5pbXBvcnQgeyBCYXNlbGluZUluZnJhU3RhY2sgfSBmcm9tICcuL2Jhc2VsaW5lLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IFRlbmFudEluZnJhU3RhY2sgfSBmcm9tICcuL3RlbmFudC1pbmZyYS1zdGFjayc7XG5cbmltcG9ydCBnZXRUaW1lU3RyaW5nIGZyb20gJy4vdXRpbHMnO1xuXG5leHBvcnQgY2xhc3MgQ2x1c3RlclN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHRpbWVTdHIgPSBnZXRUaW1lU3RyaW5nKCk7XG5cbiAgICBuZXcgQm9vdHN0cmFwU3RhY2sodGhpcywgJ0Jvb3RzdHJhcFN0YWNrJywge1xuICAgICAgc291cmNlWmlwRmlsZTogcHJvY2Vzcy5lbnYuWklQRklMRSB8fCAnZWtzLXdvcmtzaG9wLXN0YWNrLWFwcC56aXAnLFxuICAgICAgc291cmNlWmlwRmlsZUNoZWNrc3VtOiBwcm9jZXNzLmVudi5aSVBGSUxFX0NIRUNLU1VNIHx8ICcnLFxuICAgIH0pO1xuICAgIFxuICAgIFxuICAgIGNvbnN0IGVrc1N0YWNrID0gbmV3IEVrc1N0YWNrKHRoaXMsICdFa3NTdGFjaycsIHtcbiAgICAgIHZwY0lkOiBwcm9jZXNzLmVudi5WUENfSUQgfHwgJ1ZQQ19JRF9OT1RfU0VUJyxcbiAgICAgIGNsb3VkOUVudmlyb25tZW50SWQ6IHByb2Nlc3MuZW52LkNMT1VEOV9FTlZJUk9OTUVOVF9JRCB8fCAnQ0xPVUQ5X0VOVklST05NRU5UX0lEX05PVF9TRVQnLFxuICAgICAgY29kZUJ1aWxkUm9sZUFybjogcHJvY2Vzcy5lbnYuQlVJTERfUk9MRV9BUk4gfHwgJ2Fybjphd3M6MTIzNDU2Nzg5MDEyOjppYW06cm9sZS9OT1RfU0VUJ1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHsgZWxiVXJsLCBjb2RlQnVpbGRSb2xlIH0gPSBla3NTdGFjaztcbiAgICAgICAgXG4gICAgY29uc3QgYWRtaW5TdGFjayA9IG5ldyBBZG1pblN0YWNrKHRoaXMsICdBZG1pblN0YWNrJywge1xuICAgICAgZWxiVXJsOiBlbGJVcmwsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgeyB1c2VyUG9vbElkLCBhcHBDbGllbnRJZCwgaXNzdWVyIH0gPSBhZG1pblN0YWNrO1xuICAgIFxuICAgIGNvbnN0IGJhc2VsaW5lID0gbmV3IEJhc2VsaW5lSW5mcmFTdGFjayh0aGlzLCAnQmFzZWxpbmVTdGFjaycsIHtcbiAgICAgIEFwcENsaWVudElkOiBhcHBDbGllbnRJZCxcbiAgICAgIGVsYlVybDogZWxiVXJsLFxuICAgICAgVXNlclBvb2xJZDogdXNlclBvb2xJZCxcbiAgICAgIFRpbWVTdHJpbmc6IHRpbWVTdHIsXG4gICAgICBFa3NDb2RlQnVpbGRBcm46IGNvZGVCdWlsZFJvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlbmFudEluZnJhID0gbmV3IFRlbmFudEluZnJhU3RhY2sodGhpcywgJ1RlbmFudEluZnJhU3RhY2snLCB7XG4gICAgICBlbGJVcmw6IGVsYlVybCxcbiAgICB9KTtcblxuICAgIC8qIFRlbmFudEluZnJhIENvZGUgcGlwZWxpbmUgbmVlZHMgYSBkaWZmZXJlbnQgdmVyc2lvbiBvZiBDREsuIFJlc2VhcmNoaW5nLiBDb21tZW50aW5nIG91dCBmb3Igbm93IHVudGlsXG4gICAgICogd2UgZmlndXJlIHRoYXQgb3V0LlxuICAgICovXG4gICAgYmFzZWxpbmUudGVuYW50U3RhY2tNYXBwaW5nVGFibGUuZ3JhbnRSZWFkRGF0YSh0ZW5hbnRJbmZyYS5waXBlbGluZUZ1bmN0aW9uLmdyYW50UHJpbmNpcGFsKTtcbiAgICBiYXNlbGluZS5la3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlLmdyYW50UmVhZERhdGEodGVuYW50SW5mcmEucGlwZWxpbmVGdW5jdGlvbi5ncmFudFByaW5jaXBhbCk7XG5cblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0FkbWluVXNlclBvb2xJZCcsIHsgdmFsdWU6IHVzZXJQb29sSWQgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQWRtaW5BcHBDbGllbnRJZCcsIHsgdmFsdWU6IGFwcENsaWVudElkIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0lzc3VlclVSTCcsIHsgdmFsdWU6IGlzc3VlciB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBV1NSZWdpb24nLCB7IHZhbHVlOiB0aGlzLnJlZ2lvbiB9KTtcblxuICAgIC8qXG4gICAgICogT3V0cHV0cyBmcm9tIHRoZSBCYXNlbGluZUluZnJhU3RhY2tcbiAgICAqL1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1RlbmFudFJlZ2lzdHJhdGlvblNlcnZpY2VFQ1InLCB7IHZhbHVlOiBiYXNlbGluZS50ZW5hbnRSZWdpc3RyYXRpb25FY3JVcmkgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUHJvZHVjdFNlcnZpY2VFQ1InLCB7IHZhbHVlOiBiYXNlbGluZS5wcm9kdWN0U2VydmljZVVyaSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0VGFibGUnLCB7IHZhbHVlOiBiYXNlbGluZS5wcm9kdWN0VGFibGVOYW1lIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ09yZGVyVGFibGUnLCB7IHZhbHVlOiBiYXNlbGluZS5vcmRlclRhYmxlTmFtZSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLnRlbmFudFRhYmxlTmFtZSB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoSW5mb1RhYmxlJywgeyB2YWx1ZTogYmFzZWxpbmUuYXV0aEluZm9UYWJsZU5hbWUgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzU2FhU1N0YWNrTWV0YWRhdGFUYWJsZScsIHtcbiAgICAgIHZhbHVlOiBiYXNlbGluZS5la3NTYWFTU3RhY2tNZXRhZGF0YVRhYmxlTmFtZSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRTdGFja01hcHBpbmdUYWJsZScsIHsgdmFsdWU6IGJhc2VsaW5lLnRlbmFudFN0YWNrTWFwcGluZ1RhYmxlTmFtZSB9KTtcblxuICAgIC8qXG4gICAgICogT3V0cHV0cyBmcm9tIHRoZSBUZW5hbnRJbmZyYVN0YWNrXG4gICAgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQb29sZWRUZW5hbnRVc2VyUG9vbElkJywgeyB2YWx1ZTogdGVuYW50SW5mcmEucG9vbGVkVGVuYW50VXNlclBvb2xJZCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdQb29sZWRUZW5hbnRBcHBDbGllbnRJZCcsIHsgdmFsdWU6IHRlbmFudEluZnJhLnBvb2xlZFRlbmFudEFwcENsaWVudElkIH0pO1xuXG4gICAgLypcbiAgICAgKiBPdXRwdXRzIGZyb20gdGhlIEVrc1N0YWNrXG4gICAgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFTEJVUkwnLCB7IHZhbHVlOiBla3NTdGFjay5lbGJVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzQ29kZWJ1aWxkQXJuJywgeyB2YWx1ZTogZWtzU3RhY2suY29kZUJ1aWxkUm9sZS5yb2xlQXJuIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JvbGVVc2VkQnlUVk0nLCB7IHZhbHVlOiBla3NTdGFjay5yb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZS5yb2xlQXJuIH0pO1xuXG5cbiAgfVxufVxuIl19