"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodeBuildRole = void 0;
const iam = require("@aws-cdk/aws-iam");
function getCodeBuildRole(parent, account, region) {
    return new iam.Role(parent, 'CodeBuildRole', {
        assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
        description: 'Role assigned to our tenant onboarding code build project',
        inlinePolicies: {
            TenantOnboardingPolicy: getCodeBuildPolicyDoc(account, region),
        },
    });
}
exports.getCodeBuildRole = getCodeBuildRole;
function getCodeBuildPolicyDoc(account, region) {
    return new iam.PolicyDocument({
        assignSids: false,
        statements: [
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['sts:AssumeRole'],
                resources: [`arn:aws:iam::${account}:role/*`],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['cloudformation:DescribeStacks'],
                resources: [`arn:aws:cloudformation:${region}:${account}:stack/*`],
            }),
        ],
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWJ1aWxkLXJvbGUtcG9saWN5LWRvYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZGVidWlsZC1yb2xlLXBvbGljeS1kb2MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBR0gsd0NBQXdDO0FBRXhDLFNBQWdCLGdCQUFnQixDQUFDLE1BQWlCLEVBQUUsT0FBZSxFQUFFLE1BQWM7SUFDakYsT0FBTyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGVBQWUsRUFBRTtRQUMzQyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMseUJBQXlCLENBQUM7UUFDOUQsV0FBVyxFQUFFLDJEQUEyRDtRQUN4RSxjQUFjLEVBQUU7WUFDZCxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDO1NBQy9EO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQVJELDRDQVFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxPQUFlLEVBQUUsTUFBYztJQUM1RCxPQUFPLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztRQUM1QixVQUFVLEVBQUUsS0FBSztRQUNqQixVQUFVLEVBQUU7WUFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7Z0JBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7Z0JBQ3hCLE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixTQUFTLEVBQUUsQ0FBQyxnQkFBZ0IsT0FBTyxTQUFTLENBQUM7YUFDOUMsQ0FBQztZQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztnQkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztnQkFDeEIsT0FBTyxFQUFFLENBQUMsK0JBQStCLENBQUM7Z0JBQzFDLFNBQVMsRUFBRSxDQUFDLDBCQUEwQixNQUFNLElBQUksT0FBTyxVQUFVLENBQUM7YUFDbkUsQ0FBQztTQUNIO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuICovXG5cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29kZUJ1aWxkUm9sZShwYXJlbnQ6IENvbnN0cnVjdCwgYWNjb3VudDogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IGlhbS5Sb2xlIHtcbiAgcmV0dXJuIG5ldyBpYW0uUm9sZShwYXJlbnQsICdDb2RlQnVpbGRSb2xlJywge1xuICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlYnVpbGQuYW1hem9uYXdzLmNvbScpLFxuICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBhc3NpZ25lZCB0byBvdXIgdGVuYW50IG9uYm9hcmRpbmcgY29kZSBidWlsZCBwcm9qZWN0JyxcbiAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgVGVuYW50T25ib2FyZGluZ1BvbGljeTogZ2V0Q29kZUJ1aWxkUG9saWN5RG9jKGFjY291bnQsIHJlZ2lvbiksXG4gICAgfSxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldENvZGVCdWlsZFBvbGljeURvYyhhY2NvdW50OiBzdHJpbmcsIHJlZ2lvbjogc3RyaW5nKTogaWFtLlBvbGljeURvY3VtZW50IHtcbiAgcmV0dXJuIG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgIGFzc2lnblNpZHM6IGZhbHNlLFxuICAgIHN0YXRlbWVudHM6IFtcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ3N0czpBc3N1bWVSb2xlJ10sXG4gICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmlhbTo6JHthY2NvdW50fTpyb2xlLypgXSxcbiAgICAgIH0pLFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVTdGFja3MnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6Y2xvdWRmb3JtYXRpb246JHtyZWdpb259OiR7YWNjb3VudH06c3RhY2svKmBdLFxuICAgICAgfSksXG4gICAgXSxcbiAgfSk7XG59XG4iXX0=