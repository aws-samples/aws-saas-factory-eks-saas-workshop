"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantInfraStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const cognito = require("aws-cdk-lib/aws-cognito");
const codecommit = require("aws-cdk-lib/aws-codecommit");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const aws_codepipeline_actions_1 = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild_role_policy_doc_1 = require("./codebuild-role-policy-doc");
class TenantInfraStack extends aws_cdk_lib_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const pooledTenantPool = new cognito.UserPool(this, 'PooledTenantsPool', {
            userInvitation: {
                emailSubject: 'Temporary password for environment EKS SaaS Application',
                emailBody: `<b>Welcome to the SaaS Application for EKS Workshop!</b> <br>
    <br>
    You can log into the app <a href="http://${props === null || props === void 0 ? void 0 : props.elbUrl}/app/index.html">here</a>. If that link doesn't work, you can copy this URL into your browser: http://${props === null || props === void 0 ? void 0 : props.elbUrl}/app/index.html
    <br>
    Your username is: <b>{username}</b>
    <br>
    Your temporary password is: <b>{####}</b>
    <br>`,
            },
            userPoolName: 'eks-ws-pooled',
            customAttributes: {
                'tenant-id': new cognito.StringAttribute({ mutable: false }),
                'company-name': new cognito.StringAttribute({ mutable: false }),
                email: new cognito.StringAttribute({ mutable: true }),
            },
        });
        const pooledTenantAppClient = pooledTenantPool.addClient('PooledUserPoolClient', {
            generateSecret: false,
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    implicitCodeGrant: true,
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PHONE,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [`https://${props === null || props === void 0 ? void 0 : props.elbUrl}/app`],
            },
            preventUserExistenceErrors: true,
        });
        this.pooledTenantUserPoolId = pooledTenantPool.userPoolId;
        this.pooledTenantAppClientId = pooledTenantAppClient.userPoolClientId;
        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `eks-saas-tenant-onboarding-pipeline`,
        });
        // Import existing CodeCommit sam-app repository
        const codeRepo = codecommit.Repository.fromRepositoryName(this, 'AppRepository', 'aws-saas-factory-eks-workshop');
        // Declare source code as an artifact
        const sourceOutput = new codepipeline.Artifact();
        // Add source stage to pipeline
        pipeline.addStage({
            stageName: 'Source',
            actions: [
                new aws_codepipeline_actions_1.CodeCommitSourceAction({
                    actionName: 'CodeCommit_Source',
                    repository: codeRepo,
                    branch: 'feature-workshop-prep',
                    output: sourceOutput,
                    variablesNamespace: 'SourceVariables',
                }),
            ],
        });
        // Declare build output as artifacts
        new codepipeline.Artifact();
        // Add the Lambda invoke stage to our pipeline
        const pipelinePolicy = new iam.PolicyDocument({
            assignSids: false,
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['codepipeline:PutJobSuccessResult', 'codepipeline:PutJobFailureResult'],
                    resources: ['*'],
                }),
            ],
        });
        const lambdaRole = new iam.Role(this, 'EksTenantStackLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                inlinePolicy: pipelinePolicy,
            },
        });
        this.pipelineFunction = new lambda.Function(this, 'Func', {
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
          var assert = require('assert');
          var AWS = require('aws-sdk');
          var http = require('http');
          var codepipeline = new AWS.CodePipeline();
    
          exports.handler = async (event, context) => {
            var outputParams;
            var tenantName,appClientId,userPoolId,elbUrl,codeBuildArn,iamRoleArn;
            var region = process.env.AWS_REGION;
            
            console.log('event:', event);
            
            // Retrieve the Job ID from the Lambda action
            var jobId = event["CodePipeline.job"].id;
    
            // Retrieve the tenant data from Tenant-Stack-Mapping table
            const result = await getTenantStackData();
            console.log("result====>", result);
    
              result.Items.forEach(function (element, index, array) {
                tenantName = element.TenantName.S;
                appClientId = element.AppClientId.S;
                userPoolId = element.UserPoolId.S;
              });
      
              console.log("TenantName====>", tenantName);
              console.log("appClientId====>", appClientId);
              console.log("userPoolId====>", userPoolId);
              console.log("region====>", region);
            
            // Retrieve the stack data from the EKS-SaaS-Stack-Metadata table
            const stackMetadata = await getStackMetadata();
            console.log("stackMetadata====>", stackMetadata);
              stackMetadata.Items.forEach(function (element, index, array) {
                elbUrl = element.ELBURL.S;
                codeBuildArn = element.CODEBUILD_ARN.S;
                iamRoleArn = element.IAM_ROLE_ARN.S;
              });
              
              console.log("ELBURL====>", elbUrl);
              console.log("CODEBUILD_ARN====>", codeBuildArn);
              console.log("IAM_ROLE_ARN====>", iamRoleArn);
      
    
            outputParams = {
                jobId: jobId,
                outputVariables: {
                    TENANT_PATH: tenantName,
                    COGNITO_USER_POOL_ID: userPoolId,
                    COGNITO_CLIENT_ID: appClientId,
                    ELBURL: elbUrl,
                    CODEBUILDARN: codeBuildArn,
                    IAM_ROLE_ARN: iamRoleArn,
                    Region: region,
                    dateTime: Date(Date.now()).toString(),
                }
            };
            
            // Notify AWS CodePipeline of a successful job
            await putJobSuccess(outputParams);
          }
     
          async function putJobSuccess(params) {
             return codepipeline.putJobSuccessResult(params).promise();
            };
    
          async function getTenantStackData() {
            //Query DynamoDB table for tenant stack data
            var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
    
            var params = {
              ExpressionAttributeValues: {
                ':s': {S: 'Provisioning'},
              },
              FilterExpression: 'DeploymentStatus = :s',
              TableName: 'EKS-SaaS-Tenant-Stack-Mapping',
    
            };
            
            return ddb.scan(params).promise();
          }
          
          async function getStackMetadata() {
            //Query DynamoDB table for EKS SaaS stack metadadata
            var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
            var params = {
              ExpressionAttributeValues: {
                ':s': {S: 'eks-saas'},
              },
              KeyConditionExpression: 'StackName = :s',
              TableName: 'EKS-SaaS-Stack-Metadata',
            };
            return ddb.query(params).promise();
          }     
          `),
        });
        const lambdaInvokeAction = new aws_codepipeline_actions_1.LambdaInvokeAction({
            actionName: 'Lambda',
            lambda: this.pipelineFunction,
            variablesNamespace: 'LambdaVariables',
        });
        pipeline.addStage({
            stageName: 'Lambda',
            actions: [lambdaInvokeAction],
        });
        // Declare build output as artifacts
        const buildOutput = new codepipeline.Artifact();
        //Declare a new CodeBuild project
        const codeBuildRole = codebuild_role_policy_doc_1.getCodeBuildRole(this, this.account, this.region);
        const buildProject = new codebuild.PipelineProject(this, 'Build', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'),
            role: codeBuildRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
                privileged: true,
            },
        });
        const codeBuildAction = new aws_codepipeline_actions_1.CodeBuildAction({
            actionName: 'Build-And-Deploy-Tenant-K8s-resources',
            project: buildProject,
            input: sourceOutput,
            outputs: [buildOutput],
            environmentVariables: {
                TENANT_PATH: { value: lambdaInvokeAction.variable('TENANT_PATH') },
                COGNITO_USER_POOL_ID: { value: lambdaInvokeAction.variable('COGNITO_USER_POOL_ID') },
                COGNITO_CLIENT_ID: { value: lambdaInvokeAction.variable('COGNITO_CLIENT_ID') },
                ELBURL: { value: lambdaInvokeAction.variable('ELBURL') },
                CODEBUILDARN: { value: lambdaInvokeAction.variable('CODEBUILDARN') },
                IAM_ROLE_ARN: { value: lambdaInvokeAction.variable('IAM_ROLE_ARN') },
            },
        });
        // Add the build stage to our pipeline
        pipeline.addStage({
            stageName: 'Build',
            actions: [codeBuildAction],
        });
    }
}
exports.TenantInfraStack = TenantInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVuYW50LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVuYW50LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILDZDQUE0RDtBQUc1RCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHVEQUF1RDtBQUN2RCxtRkFJOEM7QUFDOUMsMkVBQStEO0FBTS9ELE1BQWEsZ0JBQWlCLFNBQVEseUJBQVc7SUFNL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkUsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSx5REFBeUQ7Z0JBQ3ZFLFNBQVMsRUFBRTs7K0NBRTRCLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNLHlHQUF5RyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsTUFBTTs7Ozs7U0FLeks7YUFDRjtZQUNELFlBQVksRUFBRSxlQUFlO1lBQzdCLGdCQUFnQixFQUFFO2dCQUNoQixXQUFXLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUM1RCxjQUFjLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUMvRCxLQUFLLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDO2FBQ3REO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxxQkFBcUIsR0FBRyxnQkFBZ0Is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LEVBQUU7Z0JBQ3BCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUU7Z0JBQ2xFLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO2dCQUNwRixpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsRUFBRTtnQkFDOUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDeEQsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRTtnQkFDcEUsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRTthQUNyRTtTQUNGLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ2hCLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLE9BQU8sRUFBRSxDQUFDLGVBQWUsQ0FBQztTQUMzQixDQUFDLENBQUM7SUFFVCxDQUFDO0NBQ0Y7QUE5UEQsNENBOFBDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG4gKi9cblxuaW1wb3J0IHsgTmVzdGVkU3RhY2ssIE5lc3RlZFN0YWNrUHJvcHMgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBjb2RlY29tbWl0IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlY29tbWl0JztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCB7XG4gIENvZGVDb21taXRTb3VyY2VBY3Rpb24sXG4gIExhbWJkYUludm9rZUFjdGlvbixcbiAgQ29kZUJ1aWxkQWN0aW9uLFxufSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0IHsgZ2V0Q29kZUJ1aWxkUm9sZSB9IGZyb20gJy4vY29kZWJ1aWxkLXJvbGUtcG9saWN5LWRvYyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVuYW50SW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgTmVzdGVkU3RhY2tQcm9wcyB7XG4gIGVsYlVybDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVGVuYW50SW5mcmFTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgbm9kZVJvbGU6IGlhbS5JUm9sZTtcbiAgcGlwZWxpbmVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwb29sZWRUZW5hbnRVc2VyUG9vbElkOiBzdHJpbmc7XG4gIHBvb2xlZFRlbmFudEFwcENsaWVudElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBUZW5hbnRJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHBvb2xlZFRlbmFudFBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUG9vbGVkVGVuYW50c1Bvb2wnLCB7XG4gICAgICB1c2VySW52aXRhdGlvbjoge1xuICAgICAgICBlbWFpbFN1YmplY3Q6ICdUZW1wb3JhcnkgcGFzc3dvcmQgZm9yIGVudmlyb25tZW50IEVLUyBTYWFTIEFwcGxpY2F0aW9uJyxcbiAgICAgICAgZW1haWxCb2R5OiBgPGI+V2VsY29tZSB0byB0aGUgU2FhUyBBcHBsaWNhdGlvbiBmb3IgRUtTIFdvcmtzaG9wITwvYj4gPGJyPlxuICAgIDxicj5cbiAgICBZb3UgY2FuIGxvZyBpbnRvIHRoZSBhcHAgPGEgaHJlZj1cImh0dHA6Ly8ke3Byb3BzPy5lbGJVcmx9L2FwcC9pbmRleC5odG1sXCI+aGVyZTwvYT4uIElmIHRoYXQgbGluayBkb2Vzbid0IHdvcmssIHlvdSBjYW4gY29weSB0aGlzIFVSTCBpbnRvIHlvdXIgYnJvd3NlcjogaHR0cDovLyR7cHJvcHM/LmVsYlVybH0vYXBwL2luZGV4Lmh0bWxcbiAgICA8YnI+XG4gICAgWW91ciB1c2VybmFtZSBpczogPGI+e3VzZXJuYW1lfTwvYj5cbiAgICA8YnI+XG4gICAgWW91ciB0ZW1wb3JhcnkgcGFzc3dvcmQgaXM6IDxiPnsjIyMjfTwvYj5cbiAgICA8YnI+YCxcbiAgICAgIH0sXG4gICAgICB1c2VyUG9vbE5hbWU6ICdla3Mtd3MtcG9vbGVkJyxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgJ3RlbmFudC1pZCc6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IGZhbHNlIH0pLFxuICAgICAgICAnY29tcGFueS1uYW1lJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogZmFsc2UgfSksXG4gICAgICAgIGVtYWlsOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBvb2xlZFRlbmFudEFwcENsaWVudCA9IHBvb2xlZFRlbmFudFBvb2wuYWRkQ2xpZW50KCdQb29sZWRVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QSE9ORSxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtgaHR0cHM6Ly8ke3Byb3BzPy5lbGJVcmx9L2FwcGBdLFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgIH0pO1xuICAgIHRoaXMucG9vbGVkVGVuYW50VXNlclBvb2xJZCA9IHBvb2xlZFRlbmFudFBvb2wudXNlclBvb2xJZDtcbiAgICB0aGlzLnBvb2xlZFRlbmFudEFwcENsaWVudElkID0gcG9vbGVkVGVuYW50QXBwQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQ7XG5cbiAgICBjb25zdCBwaXBlbGluZSA9IG5ldyBjb2RlcGlwZWxpbmUuUGlwZWxpbmUodGhpcywgJ1BpcGVsaW5lJywge1xuICAgICAgcGlwZWxpbmVOYW1lOiBgZWtzLXNhYXMtdGVuYW50LW9uYm9hcmRpbmctcGlwZWxpbmVgLFxuICAgIH0pO1xuXG4gICAgICAgIC8vIEltcG9ydCBleGlzdGluZyBDb2RlQ29tbWl0IHNhbS1hcHAgcmVwb3NpdG9yeVxuICAgICAgICBjb25zdCBjb2RlUmVwbyA9IGNvZGVjb21taXQuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeU5hbWUoXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICAnQXBwUmVwb3NpdG9yeScsXG4gICAgICAgICAgJ2F3cy1zYWFzLWZhY3RvcnktZWtzLXdvcmtzaG9wJ1xuICAgICAgICApO1xuICAgIFxuICAgICAgICAvLyBEZWNsYXJlIHNvdXJjZSBjb2RlIGFzIGFuIGFydGlmYWN0XG4gICAgICAgIGNvbnN0IHNvdXJjZU91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBcbiAgICAgICAgLy8gQWRkIHNvdXJjZSBzdGFnZSB0byBwaXBlbGluZVxuICAgICAgICBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgQ29kZUNvbW1pdFNvdXJjZUFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdDb2RlQ29tbWl0X1NvdXJjZScsXG4gICAgICAgICAgICAgIHJlcG9zaXRvcnk6IGNvZGVSZXBvLFxuICAgICAgICAgICAgICBicmFuY2g6ICdmZWF0dXJlLXdvcmtzaG9wLXByZXAnLFxuICAgICAgICAgICAgICBvdXRwdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgdmFyaWFibGVzTmFtZXNwYWNlOiAnU291cmNlVmFyaWFibGVzJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICAvLyBEZWNsYXJlIGJ1aWxkIG91dHB1dCBhcyBhcnRpZmFjdHNcbiAgICAgICAgbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuICAgIFxuICAgICAgICAvLyBBZGQgdGhlIExhbWJkYSBpbnZva2Ugc3RhZ2UgdG8gb3VyIHBpcGVsaW5lXG4gICAgICAgIGNvbnN0IHBpcGVsaW5lUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgYXNzaWduU2lkczogZmFsc2UsXG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnY29kZXBpcGVsaW5lOlB1dEpvYlN1Y2Nlc3NSZXN1bHQnLCAnY29kZXBpcGVsaW5lOlB1dEpvYkZhaWx1cmVSZXN1bHQnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFa3NUZW5hbnRTdGFja0xhbWJkYVJvbGUnLCB7XG4gICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICAgIGlubGluZVBvbGljeTogcGlwZWxpbmVQb2xpY3ksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIHRoaXMucGlwZWxpbmVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0Z1bmMnLCB7XG4gICAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICAgIHZhciBhc3NlcnQgPSByZXF1aXJlKCdhc3NlcnQnKTtcbiAgICAgICAgICB2YXIgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuICAgICAgICAgIHZhciBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xuICAgICAgICAgIHZhciBjb2RlcGlwZWxpbmUgPSBuZXcgQVdTLkNvZGVQaXBlbGluZSgpO1xuICAgIFxuICAgICAgICAgIGV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIChldmVudCwgY29udGV4dCkgPT4ge1xuICAgICAgICAgICAgdmFyIG91dHB1dFBhcmFtcztcbiAgICAgICAgICAgIHZhciB0ZW5hbnROYW1lLGFwcENsaWVudElkLHVzZXJQb29sSWQsZWxiVXJsLGNvZGVCdWlsZEFybixpYW1Sb2xlQXJuO1xuICAgICAgICAgICAgdmFyIHJlZ2lvbiA9IHByb2Nlc3MuZW52LkFXU19SRUdJT047XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdldmVudDonLCBldmVudCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFJldHJpZXZlIHRoZSBKb2IgSUQgZnJvbSB0aGUgTGFtYmRhIGFjdGlvblxuICAgICAgICAgICAgdmFyIGpvYklkID0gZXZlbnRbXCJDb2RlUGlwZWxpbmUuam9iXCJdLmlkO1xuICAgIFxuICAgICAgICAgICAgLy8gUmV0cmlldmUgdGhlIHRlbmFudCBkYXRhIGZyb20gVGVuYW50LVN0YWNrLU1hcHBpbmcgdGFibGVcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFRlbmFudFN0YWNrRGF0YSgpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJyZXN1bHQ9PT09PlwiLCByZXN1bHQpO1xuICAgIFxuICAgICAgICAgICAgICByZXN1bHQuSXRlbXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbWVudCwgaW5kZXgsIGFycmF5KSB7XG4gICAgICAgICAgICAgICAgdGVuYW50TmFtZSA9IGVsZW1lbnQuVGVuYW50TmFtZS5TO1xuICAgICAgICAgICAgICAgIGFwcENsaWVudElkID0gZWxlbWVudC5BcHBDbGllbnRJZC5TO1xuICAgICAgICAgICAgICAgIHVzZXJQb29sSWQgPSBlbGVtZW50LlVzZXJQb29sSWQuUztcbiAgICAgICAgICAgICAgfSk7XG4gICAgICBcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJUZW5hbnROYW1lPT09PT5cIiwgdGVuYW50TmFtZSk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiYXBwQ2xpZW50SWQ9PT09PlwiLCBhcHBDbGllbnRJZCk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwidXNlclBvb2xJZD09PT0+XCIsIHVzZXJQb29sSWQpO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInJlZ2lvbj09PT0+XCIsIHJlZ2lvbik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFJldHJpZXZlIHRoZSBzdGFjayBkYXRhIGZyb20gdGhlIEVLUy1TYWFTLVN0YWNrLU1ldGFkYXRhIHRhYmxlXG4gICAgICAgICAgICBjb25zdCBzdGFja01ldGFkYXRhID0gYXdhaXQgZ2V0U3RhY2tNZXRhZGF0YSgpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJzdGFja01ldGFkYXRhPT09PT5cIiwgc3RhY2tNZXRhZGF0YSk7XG4gICAgICAgICAgICAgIHN0YWNrTWV0YWRhdGEuSXRlbXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbWVudCwgaW5kZXgsIGFycmF5KSB7XG4gICAgICAgICAgICAgICAgZWxiVXJsID0gZWxlbWVudC5FTEJVUkwuUztcbiAgICAgICAgICAgICAgICBjb2RlQnVpbGRBcm4gPSBlbGVtZW50LkNPREVCVUlMRF9BUk4uUztcbiAgICAgICAgICAgICAgICBpYW1Sb2xlQXJuID0gZWxlbWVudC5JQU1fUk9MRV9BUk4uUztcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVMQlVSTD09PT0+XCIsIGVsYlVybCk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQ09ERUJVSUxEX0FSTj09PT0+XCIsIGNvZGVCdWlsZEFybik7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiSUFNX1JPTEVfQVJOPT09PT5cIiwgaWFtUm9sZUFybik7XG4gICAgICBcbiAgICBcbiAgICAgICAgICAgIG91dHB1dFBhcmFtcyA9IHtcbiAgICAgICAgICAgICAgICBqb2JJZDogam9iSWQsXG4gICAgICAgICAgICAgICAgb3V0cHV0VmFyaWFibGVzOiB7XG4gICAgICAgICAgICAgICAgICAgIFRFTkFOVF9QQVRIOiB0ZW5hbnROYW1lLFxuICAgICAgICAgICAgICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2xJZCxcbiAgICAgICAgICAgICAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IGFwcENsaWVudElkLFxuICAgICAgICAgICAgICAgICAgICBFTEJVUkw6IGVsYlVybCxcbiAgICAgICAgICAgICAgICAgICAgQ09ERUJVSUxEQVJOOiBjb2RlQnVpbGRBcm4sXG4gICAgICAgICAgICAgICAgICAgIElBTV9ST0xFX0FSTjogaWFtUm9sZUFybixcbiAgICAgICAgICAgICAgICAgICAgUmVnaW9uOiByZWdpb24sXG4gICAgICAgICAgICAgICAgICAgIGRhdGVUaW1lOiBEYXRlKERhdGUubm93KCkpLnRvU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gTm90aWZ5IEFXUyBDb2RlUGlwZWxpbmUgb2YgYSBzdWNjZXNzZnVsIGpvYlxuICAgICAgICAgICAgYXdhaXQgcHV0Sm9iU3VjY2VzcyhvdXRwdXRQYXJhbXMpO1xuICAgICAgICAgIH1cbiAgICAgXG4gICAgICAgICAgYXN5bmMgZnVuY3Rpb24gcHV0Sm9iU3VjY2VzcyhwYXJhbXMpIHtcbiAgICAgICAgICAgICByZXR1cm4gY29kZXBpcGVsaW5lLnB1dEpvYlN1Y2Nlc3NSZXN1bHQocGFyYW1zKS5wcm9taXNlKCk7XG4gICAgICAgICAgICB9O1xuICAgIFxuICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIGdldFRlbmFudFN0YWNrRGF0YSgpIHtcbiAgICAgICAgICAgIC8vUXVlcnkgRHluYW1vREIgdGFibGUgZm9yIHRlbmFudCBzdGFjayBkYXRhXG4gICAgICAgICAgICB2YXIgZGRiID0gbmV3IEFXUy5EeW5hbW9EQih7YXBpVmVyc2lvbjogJzIwMTItMDgtMTAnfSk7XG4gICAgXG4gICAgICAgICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICAgICAgICAgJzpzJzoge1M6ICdQcm92aXNpb25pbmcnfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogJ0RlcGxveW1lbnRTdGF0dXMgPSA6cycsXG4gICAgICAgICAgICAgIFRhYmxlTmFtZTogJ0VLUy1TYWFTLVRlbmFudC1TdGFjay1NYXBwaW5nJyxcbiAgICBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBkZGIuc2NhbihwYXJhbXMpLnByb21pc2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgYXN5bmMgZnVuY3Rpb24gZ2V0U3RhY2tNZXRhZGF0YSgpIHtcbiAgICAgICAgICAgIC8vUXVlcnkgRHluYW1vREIgdGFibGUgZm9yIEVLUyBTYWFTIHN0YWNrIG1ldGFkYWRhdGFcbiAgICAgICAgICAgIHZhciBkZGIgPSBuZXcgQVdTLkR5bmFtb0RCKHthcGlWZXJzaW9uOiAnMjAxMi0wOC0xMCd9KTtcbiAgICAgICAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAgICAgICAnOnMnOiB7UzogJ2Vrcy1zYWFzJ30sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdTdGFja05hbWUgPSA6cycsXG4gICAgICAgICAgICAgIFRhYmxlTmFtZTogJ0VLUy1TYWFTLVN0YWNrLU1ldGFkYXRhJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZGRiLnF1ZXJ5KHBhcmFtcykucHJvbWlzZSgpO1xuICAgICAgICAgIH0gICAgIFxuICAgICAgICAgIGApLFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGFtYmRhSW52b2tlQWN0aW9uID0gbmV3IExhbWJkYUludm9rZUFjdGlvbih7XG4gICAgICAgICAgYWN0aW9uTmFtZTogJ0xhbWJkYScsXG4gICAgICAgICAgbGFtYmRhOiB0aGlzLnBpcGVsaW5lRnVuY3Rpb24sXG4gICAgICAgICAgdmFyaWFibGVzTmFtZXNwYWNlOiAnTGFtYmRhVmFyaWFibGVzJyxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIHBpcGVsaW5lLmFkZFN0YWdlKHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdMYW1iZGEnLFxuICAgICAgICAgIGFjdGlvbnM6IFtsYW1iZGFJbnZva2VBY3Rpb25dLFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gRGVjbGFyZSBidWlsZCBvdXRwdXQgYXMgYXJ0aWZhY3RzXG4gICAgICAgIGNvbnN0IGJ1aWxkT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuICAgIFxuICAgICAgICAvL0RlY2xhcmUgYSBuZXcgQ29kZUJ1aWxkIHByb2plY3RcbiAgICBcbiAgICAgICAgY29uc3QgY29kZUJ1aWxkUm9sZSA9IGdldENvZGVCdWlsZFJvbGUodGhpcywgdGhpcy5hY2NvdW50LCB0aGlzLnJlZ2lvbik7XG4gICAgXG4gICAgICAgIGNvbnN0IGJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0KHRoaXMsICdCdWlsZCcsIHtcbiAgICAgICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbVNvdXJjZUZpbGVuYW1lKCdidWlsZHNwZWMueWFtbCcpLFxuICAgICAgICAgIHJvbGU6IGNvZGVCdWlsZFJvbGUsXG4gICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuU1RBTkRBUkRfNF8wLFxuICAgICAgICAgICAgcHJpdmlsZWdlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgY29kZUJ1aWxkQWN0aW9uID0gbmV3IENvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgYWN0aW9uTmFtZTogJ0J1aWxkLUFuZC1EZXBsb3ktVGVuYW50LUs4cy1yZXNvdXJjZXMnLFxuICAgICAgICAgIHByb2plY3Q6IGJ1aWxkUHJvamVjdCxcbiAgICAgICAgICBpbnB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgIG91dHB1dHM6IFtidWlsZE91dHB1dF0sXG4gICAgICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgIFRFTkFOVF9QQVRIOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ1RFTkFOVF9QQVRIJykgfSxcbiAgICAgICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0NPR05JVE9fVVNFUl9QT09MX0lEJykgfSxcbiAgICAgICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0NPR05JVE9fQ0xJRU5UX0lEJykgfSxcbiAgICAgICAgICAgIEVMQlVSTDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdFTEJVUkwnKSB9LFxuICAgICAgICAgICAgQ09ERUJVSUxEQVJOOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0NPREVCVUlMREFSTicpIH0sXG4gICAgICAgICAgICBJQU1fUk9MRV9BUk46IHsgdmFsdWU6IGxhbWJkYUludm9rZUFjdGlvbi52YXJpYWJsZSgnSUFNX1JPTEVfQVJOJykgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gQWRkIHRoZSBidWlsZCBzdGFnZSB0byBvdXIgcGlwZWxpbmVcbiAgICAgICAgcGlwZWxpbmUuYWRkU3RhZ2Uoe1xuICAgICAgICAgIHN0YWdlTmFtZTogJ0J1aWxkJyxcbiAgICAgICAgICBhY3Rpb25zOiBbY29kZUJ1aWxkQWN0aW9uXSxcbiAgICAgICAgfSk7XG4gICAgXG4gIH1cbn1cbiJdfQ==