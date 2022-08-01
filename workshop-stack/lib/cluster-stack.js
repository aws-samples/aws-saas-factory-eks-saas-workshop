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
    }
}
exports.ClusterStack = ClusterStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2x1c3Rlci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsdXN0ZXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsd0NBQXdFO0FBRXhFLHVEQUFtRDtBQUNuRCwyQ0FBdUM7QUFDdkMsK0NBQTJDO0FBQzNDLGlFQUE0RDtBQUU1RCxtQ0FBb0M7QUFFcEMsTUFBYSxZQUFhLFNBQVEsWUFBSztJQUNyQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWtCO1FBQzFELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sT0FBTyxHQUFHLGVBQWEsRUFBRSxDQUFDO1FBRWhDLElBQUksZ0NBQWMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDekMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLDRCQUE0QjtZQUNsRSxxQkFBcUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLEVBQUU7U0FDMUQsQ0FBQyxDQUFDO1FBR0gsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDOUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLGdCQUFnQjtZQUM3QyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixJQUFJLCtCQUErQjtZQUN6RixnQkFBZ0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSx3Q0FBd0M7U0FDekYsQ0FBQyxDQUFDO1FBRUgsTUFBTSxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxRQUFRLENBQUM7UUFFM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSx3QkFBVSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEQsTUFBTSxFQUFFLE1BQU07U0FDZixDQUFDLENBQUM7UUFFSCxNQUFNLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUM7UUFFdkQsTUFBTSxRQUFRLEdBQUcsSUFBSSx5Q0FBa0IsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzdELFdBQVcsRUFBRSxXQUFXO1lBQ3hCLE1BQU0sRUFBRSxNQUFNO1lBQ2QsVUFBVSxFQUFFLFVBQVU7WUFDdEIsVUFBVSxFQUFFLE9BQU87WUFDbkIsZUFBZSxFQUFFLGFBQWEsQ0FBQyxPQUFPO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWxDRCxvQ0FrQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcbiAqL1xuXG5pbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgQ29uc3RydWN0LCBDZm5PdXRwdXQgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcblxuaW1wb3J0IHsgQm9vdHN0cmFwU3RhY2sgfSBmcm9tICcuL2Jvb3RzdHJhcC1zdGFjayc7XG5pbXBvcnQgeyBFa3NTdGFjayB9IGZyb20gJy4vZWtzLXN0YWNrJztcbmltcG9ydCB7IEFkbWluU3RhY2sgfSBmcm9tICcuL2FkbWluLXN0YWNrJztcbmltcG9ydCB7IEJhc2VsaW5lSW5mcmFTdGFjayB9IGZyb20gJy4vYmFzZWxpbmUtaW5mcmEtc3RhY2snO1xuXG5pbXBvcnQgZ2V0VGltZVN0cmluZyBmcm9tICcuL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIENsdXN0ZXJTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB0aW1lU3RyID0gZ2V0VGltZVN0cmluZygpO1xuXG4gICAgbmV3IEJvb3RzdHJhcFN0YWNrKHRoaXMsICdCb290c3RyYXBTdGFjaycsIHtcbiAgICAgIHNvdXJjZVppcEZpbGU6IHByb2Nlc3MuZW52LlpJUEZJTEUgfHwgJ2Vrcy13b3Jrc2hvcC1zdGFjay1hcHAuemlwJyxcbiAgICAgIHNvdXJjZVppcEZpbGVDaGVja3N1bTogcHJvY2Vzcy5lbnYuWklQRklMRV9DSEVDS1NVTSB8fCAnJyxcbiAgICB9KTtcbiAgICBcbiAgICBcbiAgICBjb25zdCBla3NTdGFjayA9IG5ldyBFa3NTdGFjayh0aGlzLCAnRWtzU3RhY2snLCB7XG4gICAgICB2cGNJZDogcHJvY2Vzcy5lbnYuVlBDX0lEIHx8ICdWUENfSURfTk9UX1NFVCcsXG4gICAgICBjbG91ZDlFbnZpcm9ubWVudElkOiBwcm9jZXNzLmVudi5DTE9VRDlfRU5WSVJPTk1FTlRfSUQgfHwgJ0NMT1VEOV9FTlZJUk9OTUVOVF9JRF9OT1RfU0VUJyxcbiAgICAgIGNvZGVCdWlsZFJvbGVBcm46IHByb2Nlc3MuZW52LkJVSUxEX1JPTEVfQVJOIHx8ICdhcm46YXdzOjEyMzQ1Njc4OTAxMjo6aWFtOnJvbGUvTk9UX1NFVCdcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCB7IGVsYlVybCwgY29kZUJ1aWxkUm9sZSB9ID0gZWtzU3RhY2s7XG4gICAgICAgIFxuICAgIGNvbnN0IGFkbWluU3RhY2sgPSBuZXcgQWRtaW5TdGFjayh0aGlzLCAnQWRtaW5TdGFjaycsIHtcbiAgICAgIGVsYlVybDogZWxiVXJsLFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHsgdXNlclBvb2xJZCwgYXBwQ2xpZW50SWQsIGlzc3VlciB9ID0gYWRtaW5TdGFjaztcbiAgICBcbiAgICBjb25zdCBiYXNlbGluZSA9IG5ldyBCYXNlbGluZUluZnJhU3RhY2sodGhpcywgJ0Jhc2VsaW5lU3RhY2snLCB7XG4gICAgICBBcHBDbGllbnRJZDogYXBwQ2xpZW50SWQsXG4gICAgICBlbGJVcmw6IGVsYlVybCxcbiAgICAgIFVzZXJQb29sSWQ6IHVzZXJQb29sSWQsXG4gICAgICBUaW1lU3RyaW5nOiB0aW1lU3RyLFxuICAgICAgRWtzQ29kZUJ1aWxkQXJuOiBjb2RlQnVpbGRSb2xlLnJvbGVBcm4sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==