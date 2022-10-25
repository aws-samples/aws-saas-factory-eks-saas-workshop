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
                    branch: 'main',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVuYW50LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVuYW50LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILDZDQUE0RDtBQUc1RCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHVEQUF1RDtBQUN2RCxtRkFJOEM7QUFDOUMsMkVBQStEO0FBTS9ELE1BQWEsZ0JBQWlCLFNBQVEseUJBQVc7SUFNL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkUsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSx5REFBeUQ7Z0JBQ3ZFLFNBQVMsRUFBRTs7K0NBRTRCLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNLHlHQUF5RyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsTUFBTTs7Ozs7U0FLeks7YUFDRjtZQUNELFlBQVksRUFBRSxlQUFlO1lBQzdCLGdCQUFnQixFQUFFO2dCQUNoQixXQUFXLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUM1RCxjQUFjLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUMvRCxLQUFLLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDO2FBQ3REO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxxQkFBcUIsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUU7WUFDL0UsY0FBYyxFQUFFLEtBQUs7WUFDckIsU0FBUyxFQUFFO2dCQUNULGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFO29CQUNMLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLHNCQUFzQixFQUFFLElBQUk7aUJBQzdCO2dCQUNELE1BQU0sRUFBRTtvQkFDTixPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUs7b0JBQ3hCLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNO29CQUN6QixPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU87aUJBQzNCO2dCQUNELFlBQVksRUFBRSxDQUFDLFdBQVcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE1BQU0sTUFBTSxDQUFDO2FBQy9DO1lBQ0QsMEJBQTBCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDO1FBQzFELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQztRQUV0RSxNQUFNLFFBQVEsR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUMzRCxZQUFZLEVBQUUscUNBQXFDO1NBQ3BELENBQUMsQ0FBQztRQUVDLGdEQUFnRDtRQUNoRCxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUN2RCxJQUFJLEVBQ0osZUFBZSxFQUNmLCtCQUErQixDQUNoQyxDQUFDO1FBRUYscUNBQXFDO1FBQ3JDLE1BQU0sWUFBWSxHQUFHLElBQUksWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpELCtCQUErQjtRQUMvQixRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ2hCLFNBQVMsRUFBRSxRQUFRO1lBQ25CLE9BQU8sRUFBRTtnQkFDUCxJQUFJLGlEQUFzQixDQUFDO29CQUN6QixVQUFVLEVBQUUsbUJBQW1CO29CQUMvQixVQUFVLEVBQUUsUUFBUTtvQkFDcEIsTUFBTSxFQUFFLE1BQU07b0JBQ2QsTUFBTSxFQUFFLFlBQVk7b0JBQ3BCLGtCQUFrQixFQUFFLGlCQUFpQjtpQkFDdEMsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTVCLDhDQUE4QztRQUM5QyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7WUFDNUMsVUFBVSxFQUFFLEtBQUs7WUFDakIsVUFBVSxFQUFFO2dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztvQkFDeEIsT0FBTyxFQUFFLENBQUMsa0NBQWtDLEVBQUUsa0NBQWtDLENBQUM7b0JBQ2pGLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztpQkFDakIsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNoRSxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSxjQUFjO2FBQzdCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ3hELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLGVBQWU7WUFDeEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztXQStGNUIsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILE1BQU0sa0JBQWtCLEdBQUcsSUFBSSw2Q0FBa0IsQ0FBQztZQUNoRCxVQUFVLEVBQUUsUUFBUTtZQUNwQixNQUFNLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtZQUM3QixrQkFBa0IsRUFBRSxpQkFBaUI7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsUUFBUSxDQUFDLFFBQVEsQ0FBQztZQUNoQixTQUFTLEVBQUUsUUFBUTtZQUNuQixPQUFPLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQztTQUM5QixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFaEQsaUNBQWlDO1FBRWpDLE1BQU0sYUFBYSxHQUFHLDRDQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV4RSxNQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUNoRSxTQUFTLEVBQUUsU0FBUyxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNuRSxJQUFJLEVBQUUsYUFBYTtZQUNuQixXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsWUFBWTtnQkFDbEQsVUFBVSxFQUFFLElBQUk7YUFDakI7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGVBQWUsR0FBRyxJQUFJLDBDQUFlLENBQUM7WUFDMUMsVUFBVSxFQUFFLHVDQUF1QztZQUNuRCxPQUFPLEVBQUUsWUFBWTtZQUNyQixLQUFLLEVBQUUsWUFBWTtZQUNuQixPQUFPLEVBQUUsQ0FBQyxXQUFXLENBQUM7WUFDdEIsb0JBQW9CLEVBQUU7Z0JBQ3BCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUU7Z0JBQ2xFLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO2dCQUNwRixpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsRUFBRTtnQkFDOUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDeEQsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRTtnQkFDcEUsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRTthQUNyRTtTQUNGLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ2hCLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLE9BQU8sRUFBRSxDQUFDLGVBQWUsQ0FBQztTQUMzQixDQUFDLENBQUM7SUFFVCxDQUFDO0NBQ0Y7QUE5UEQsNENBOFBDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG4gKi9cblxuaW1wb3J0IHsgTmVzdGVkU3RhY2ssIE5lc3RlZFN0YWNrUHJvcHMgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBjb2RlY29tbWl0IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlY29tbWl0JztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCB7XG4gIENvZGVDb21taXRTb3VyY2VBY3Rpb24sXG4gIExhbWJkYUludm9rZUFjdGlvbixcbiAgQ29kZUJ1aWxkQWN0aW9uLFxufSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0IHsgZ2V0Q29kZUJ1aWxkUm9sZSB9IGZyb20gJy4vY29kZWJ1aWxkLXJvbGUtcG9saWN5LWRvYyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVuYW50SW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgTmVzdGVkU3RhY2tQcm9wcyB7XG4gIGVsYlVybDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVGVuYW50SW5mcmFTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgbm9kZVJvbGU6IGlhbS5JUm9sZTtcbiAgcGlwZWxpbmVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwb29sZWRUZW5hbnRVc2VyUG9vbElkOiBzdHJpbmc7XG4gIHBvb2xlZFRlbmFudEFwcENsaWVudElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBUZW5hbnRJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHBvb2xlZFRlbmFudFBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUG9vbGVkVGVuYW50c1Bvb2wnLCB7XG4gICAgICB1c2VySW52aXRhdGlvbjoge1xuICAgICAgICBlbWFpbFN1YmplY3Q6ICdUZW1wb3JhcnkgcGFzc3dvcmQgZm9yIGVudmlyb25tZW50IEVLUyBTYWFTIEFwcGxpY2F0aW9uJyxcbiAgICAgICAgZW1haWxCb2R5OiBgPGI+V2VsY29tZSB0byB0aGUgU2FhUyBBcHBsaWNhdGlvbiBmb3IgRUtTIFdvcmtzaG9wITwvYj4gPGJyPlxuICAgIDxicj5cbiAgICBZb3UgY2FuIGxvZyBpbnRvIHRoZSBhcHAgPGEgaHJlZj1cImh0dHA6Ly8ke3Byb3BzPy5lbGJVcmx9L2FwcC9pbmRleC5odG1sXCI+aGVyZTwvYT4uIElmIHRoYXQgbGluayBkb2Vzbid0IHdvcmssIHlvdSBjYW4gY29weSB0aGlzIFVSTCBpbnRvIHlvdXIgYnJvd3NlcjogaHR0cDovLyR7cHJvcHM/LmVsYlVybH0vYXBwL2luZGV4Lmh0bWxcbiAgICA8YnI+XG4gICAgWW91ciB1c2VybmFtZSBpczogPGI+e3VzZXJuYW1lfTwvYj5cbiAgICA8YnI+XG4gICAgWW91ciB0ZW1wb3JhcnkgcGFzc3dvcmQgaXM6IDxiPnsjIyMjfTwvYj5cbiAgICA8YnI+YCxcbiAgICAgIH0sXG4gICAgICB1c2VyUG9vbE5hbWU6ICdla3Mtd3MtcG9vbGVkJyxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgJ3RlbmFudC1pZCc6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IGZhbHNlIH0pLFxuICAgICAgICAnY29tcGFueS1uYW1lJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogZmFsc2UgfSksXG4gICAgICAgIGVtYWlsOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBvb2xlZFRlbmFudEFwcENsaWVudCA9IHBvb2xlZFRlbmFudFBvb2wuYWRkQ2xpZW50KCdQb29sZWRVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QSE9ORSxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtgaHR0cHM6Ly8ke3Byb3BzPy5lbGJVcmx9L2FwcGBdLFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgIH0pO1xuICAgIHRoaXMucG9vbGVkVGVuYW50VXNlclBvb2xJZCA9IHBvb2xlZFRlbmFudFBvb2wudXNlclBvb2xJZDtcbiAgICB0aGlzLnBvb2xlZFRlbmFudEFwcENsaWVudElkID0gcG9vbGVkVGVuYW50QXBwQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQ7XG5cbiAgICBjb25zdCBwaXBlbGluZSA9IG5ldyBjb2RlcGlwZWxpbmUuUGlwZWxpbmUodGhpcywgJ1BpcGVsaW5lJywge1xuICAgICAgcGlwZWxpbmVOYW1lOiBgZWtzLXNhYXMtdGVuYW50LW9uYm9hcmRpbmctcGlwZWxpbmVgLFxuICAgIH0pO1xuXG4gICAgICAgIC8vIEltcG9ydCBleGlzdGluZyBDb2RlQ29tbWl0IHNhbS1hcHAgcmVwb3NpdG9yeVxuICAgICAgICBjb25zdCBjb2RlUmVwbyA9IGNvZGVjb21taXQuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeU5hbWUoXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICAnQXBwUmVwb3NpdG9yeScsXG4gICAgICAgICAgJ2F3cy1zYWFzLWZhY3RvcnktZWtzLXdvcmtzaG9wJ1xuICAgICAgICApO1xuICAgIFxuICAgICAgICAvLyBEZWNsYXJlIHNvdXJjZSBjb2RlIGFzIGFuIGFydGlmYWN0XG4gICAgICAgIGNvbnN0IHNvdXJjZU91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBcbiAgICAgICAgLy8gQWRkIHNvdXJjZSBzdGFnZSB0byBwaXBlbGluZVxuICAgICAgICBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgQ29kZUNvbW1pdFNvdXJjZUFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdDb2RlQ29tbWl0X1NvdXJjZScsXG4gICAgICAgICAgICAgIHJlcG9zaXRvcnk6IGNvZGVSZXBvLFxuICAgICAgICAgICAgICBicmFuY2g6ICdtYWluJyxcbiAgICAgICAgICAgICAgb3V0cHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIHZhcmlhYmxlc05hbWVzcGFjZTogJ1NvdXJjZVZhcmlhYmxlcycsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgLy8gRGVjbGFyZSBidWlsZCBvdXRwdXQgYXMgYXJ0aWZhY3RzXG4gICAgICAgIG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBcbiAgICAgICAgLy8gQWRkIHRoZSBMYW1iZGEgaW52b2tlIHN0YWdlIHRvIG91ciBwaXBlbGluZVxuICAgICAgICBjb25zdCBwaXBlbGluZVBvbGljeSA9IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIGFzc2lnblNpZHM6IGZhbHNlLFxuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2NvZGVwaXBlbGluZTpQdXRKb2JTdWNjZXNzUmVzdWx0JywgJ2NvZGVwaXBlbGluZTpQdXRKb2JGYWlsdXJlUmVzdWx0J10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRWtzVGVuYW50U3RhY2tMYW1iZGFSb2xlJywge1xuICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgICAgICBpbmxpbmVQb2xpY3k6IHBpcGVsaW5lUG9saWN5LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICB0aGlzLnBpcGVsaW5lRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGdW5jJywge1xuICAgICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbiAgICAgICAgICB2YXIgYXNzZXJ0ID0gcmVxdWlyZSgnYXNzZXJ0Jyk7XG4gICAgICAgICAgdmFyIEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcbiAgICAgICAgICB2YXIgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKTtcbiAgICAgICAgICB2YXIgY29kZXBpcGVsaW5lID0gbmV3IEFXUy5Db2RlUGlwZWxpbmUoKTtcbiAgICBcbiAgICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQsIGNvbnRleHQpID0+IHtcbiAgICAgICAgICAgIHZhciBvdXRwdXRQYXJhbXM7XG4gICAgICAgICAgICB2YXIgdGVuYW50TmFtZSxhcHBDbGllbnRJZCx1c2VyUG9vbElkLGVsYlVybCxjb2RlQnVpbGRBcm4saWFtUm9sZUFybjtcbiAgICAgICAgICAgIHZhciByZWdpb24gPSBwcm9jZXNzLmVudi5BV1NfUkVHSU9OO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnZXZlbnQ6JywgZXZlbnQpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgSm9iIElEIGZyb20gdGhlIExhbWJkYSBhY3Rpb25cbiAgICAgICAgICAgIHZhciBqb2JJZCA9IGV2ZW50W1wiQ29kZVBpcGVsaW5lLmpvYlwiXS5pZDtcbiAgICBcbiAgICAgICAgICAgIC8vIFJldHJpZXZlIHRoZSB0ZW5hbnQgZGF0YSBmcm9tIFRlbmFudC1TdGFjay1NYXBwaW5nIHRhYmxlXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRUZW5hbnRTdGFja0RhdGEoKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwicmVzdWx0PT09PT5cIiwgcmVzdWx0KTtcbiAgICBcbiAgICAgICAgICAgICAgcmVzdWx0Lkl0ZW1zLmZvckVhY2goZnVuY3Rpb24gKGVsZW1lbnQsIGluZGV4LCBhcnJheSkge1xuICAgICAgICAgICAgICAgIHRlbmFudE5hbWUgPSBlbGVtZW50LlRlbmFudE5hbWUuUztcbiAgICAgICAgICAgICAgICBhcHBDbGllbnRJZCA9IGVsZW1lbnQuQXBwQ2xpZW50SWQuUztcbiAgICAgICAgICAgICAgICB1c2VyUG9vbElkID0gZWxlbWVudC5Vc2VyUG9vbElkLlM7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiVGVuYW50TmFtZT09PT0+XCIsIHRlbmFudE5hbWUpO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcImFwcENsaWVudElkPT09PT5cIiwgYXBwQ2xpZW50SWQpO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInVzZXJQb29sSWQ9PT09PlwiLCB1c2VyUG9vbElkKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJyZWdpb249PT09PlwiLCByZWdpb24pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgc3RhY2sgZGF0YSBmcm9tIHRoZSBFS1MtU2FhUy1TdGFjay1NZXRhZGF0YSB0YWJsZVxuICAgICAgICAgICAgY29uc3Qgc3RhY2tNZXRhZGF0YSA9IGF3YWl0IGdldFN0YWNrTWV0YWRhdGEoKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic3RhY2tNZXRhZGF0YT09PT0+XCIsIHN0YWNrTWV0YWRhdGEpO1xuICAgICAgICAgICAgICBzdGFja01ldGFkYXRhLkl0ZW1zLmZvckVhY2goZnVuY3Rpb24gKGVsZW1lbnQsIGluZGV4LCBhcnJheSkge1xuICAgICAgICAgICAgICAgIGVsYlVybCA9IGVsZW1lbnQuRUxCVVJMLlM7XG4gICAgICAgICAgICAgICAgY29kZUJ1aWxkQXJuID0gZWxlbWVudC5DT0RFQlVJTERfQVJOLlM7XG4gICAgICAgICAgICAgICAgaWFtUm9sZUFybiA9IGVsZW1lbnQuSUFNX1JPTEVfQVJOLlM7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJFTEJVUkw9PT09PlwiLCBlbGJVcmwpO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNPREVCVUlMRF9BUk49PT09PlwiLCBjb2RlQnVpbGRBcm4pO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIklBTV9ST0xFX0FSTj09PT0+XCIsIGlhbVJvbGVBcm4pO1xuICAgICAgXG4gICAgXG4gICAgICAgICAgICBvdXRwdXRQYXJhbXMgPSB7XG4gICAgICAgICAgICAgICAgam9iSWQ6IGpvYklkLFxuICAgICAgICAgICAgICAgIG91dHB1dFZhcmlhYmxlczoge1xuICAgICAgICAgICAgICAgICAgICBURU5BTlRfUEFUSDogdGVuYW50TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sSWQsXG4gICAgICAgICAgICAgICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiBhcHBDbGllbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgRUxCVVJMOiBlbGJVcmwsXG4gICAgICAgICAgICAgICAgICAgIENPREVCVUlMREFSTjogY29kZUJ1aWxkQXJuLFxuICAgICAgICAgICAgICAgICAgICBJQU1fUk9MRV9BUk46IGlhbVJvbGVBcm4sXG4gICAgICAgICAgICAgICAgICAgIFJlZ2lvbjogcmVnaW9uLFxuICAgICAgICAgICAgICAgICAgICBkYXRlVGltZTogRGF0ZShEYXRlLm5vdygpKS50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIE5vdGlmeSBBV1MgQ29kZVBpcGVsaW5lIG9mIGEgc3VjY2Vzc2Z1bCBqb2JcbiAgICAgICAgICAgIGF3YWl0IHB1dEpvYlN1Y2Nlc3Mob3V0cHV0UGFyYW1zKTtcbiAgICAgICAgICB9XG4gICAgIFxuICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHB1dEpvYlN1Y2Nlc3MocGFyYW1zKSB7XG4gICAgICAgICAgICAgcmV0dXJuIGNvZGVwaXBlbGluZS5wdXRKb2JTdWNjZXNzUmVzdWx0KHBhcmFtcykucHJvbWlzZSgpO1xuICAgICAgICAgICAgfTtcbiAgICBcbiAgICAgICAgICBhc3luYyBmdW5jdGlvbiBnZXRUZW5hbnRTdGFja0RhdGEoKSB7XG4gICAgICAgICAgICAvL1F1ZXJ5IER5bmFtb0RCIHRhYmxlIGZvciB0ZW5hbnQgc3RhY2sgZGF0YVxuICAgICAgICAgICAgdmFyIGRkYiA9IG5ldyBBV1MuRHluYW1vREIoe2FwaVZlcnNpb246ICcyMDEyLTA4LTEwJ30pO1xuICAgIFxuICAgICAgICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICAgICAgICc6cyc6IHtTOiAnUHJvdmlzaW9uaW5nJ30sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZpbHRlckV4cHJlc3Npb246ICdEZXBsb3ltZW50U3RhdHVzID0gOnMnLFxuICAgICAgICAgICAgICBUYWJsZU5hbWU6ICdFS1MtU2FhUy1UZW5hbnQtU3RhY2stTWFwcGluZycsXG4gICAgXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gZGRiLnNjYW4ocGFyYW1zKS5wcm9taXNlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIGdldFN0YWNrTWV0YWRhdGEoKSB7XG4gICAgICAgICAgICAvL1F1ZXJ5IER5bmFtb0RCIHRhYmxlIGZvciBFS1MgU2FhUyBzdGFjayBtZXRhZGFkYXRhXG4gICAgICAgICAgICB2YXIgZGRiID0gbmV3IEFXUy5EeW5hbW9EQih7YXBpVmVyc2lvbjogJzIwMTItMDgtMTAnfSk7XG4gICAgICAgICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICAgICAgICAgJzpzJzoge1M6ICdla3Mtc2Fhcyd9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnU3RhY2tOYW1lID0gOnMnLFxuICAgICAgICAgICAgICBUYWJsZU5hbWU6ICdFS1MtU2FhUy1TdGFjay1NZXRhZGF0YScsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGRkYi5xdWVyeShwYXJhbXMpLnByb21pc2UoKTtcbiAgICAgICAgICB9ICAgICBcbiAgICAgICAgICBgKSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxhbWJkYUludm9rZUFjdGlvbiA9IG5ldyBMYW1iZGFJbnZva2VBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6ICdMYW1iZGEnLFxuICAgICAgICAgIGxhbWJkYTogdGhpcy5waXBlbGluZUZ1bmN0aW9uLFxuICAgICAgICAgIHZhcmlhYmxlc05hbWVzcGFjZTogJ0xhbWJkYVZhcmlhYmxlcycsXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnTGFtYmRhJyxcbiAgICAgICAgICBhY3Rpb25zOiBbbGFtYmRhSW52b2tlQWN0aW9uXSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIC8vIERlY2xhcmUgYnVpbGQgb3V0cHV0IGFzIGFydGlmYWN0c1xuICAgICAgICBjb25zdCBidWlsZE91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBcbiAgICAgICAgLy9EZWNsYXJlIGEgbmV3IENvZGVCdWlsZCBwcm9qZWN0XG4gICAgXG4gICAgICAgIGNvbnN0IGNvZGVCdWlsZFJvbGUgPSBnZXRDb2RlQnVpbGRSb2xlKHRoaXMsIHRoaXMuYWNjb3VudCwgdGhpcy5yZWdpb24pO1xuICAgIFxuICAgICAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGQnLCB7XG4gICAgICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21Tb3VyY2VGaWxlbmFtZSgnYnVpbGRzcGVjLnlhbWwnKSxcbiAgICAgICAgICByb2xlOiBjb2RlQnVpbGRSb2xlLFxuICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzRfMCxcbiAgICAgICAgICAgIHByaXZpbGVnZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGNvZGVCdWlsZEFjdGlvbiA9IG5ldyBDb2RlQnVpbGRBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6ICdCdWlsZC1BbmQtRGVwbG95LVRlbmFudC1LOHMtcmVzb3VyY2VzJyxcbiAgICAgICAgICBwcm9qZWN0OiBidWlsZFByb2plY3QsXG4gICAgICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICBvdXRwdXRzOiBbYnVpbGRPdXRwdXRdLFxuICAgICAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgICAgICBURU5BTlRfUEFUSDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdURU5BTlRfUEFUSCcpIH0sXG4gICAgICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdDT0dOSVRPX1VTRVJfUE9PTF9JRCcpIH0sXG4gICAgICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdDT0dOSVRPX0NMSUVOVF9JRCcpIH0sXG4gICAgICAgICAgICBFTEJVUkw6IHsgdmFsdWU6IGxhbWJkYUludm9rZUFjdGlvbi52YXJpYWJsZSgnRUxCVVJMJykgfSxcbiAgICAgICAgICAgIENPREVCVUlMREFSTjogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdDT0RFQlVJTERBUk4nKSB9LFxuICAgICAgICAgICAgSUFNX1JPTEVfQVJOOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0lBTV9ST0xFX0FSTicpIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIC8vIEFkZCB0aGUgYnVpbGQgc3RhZ2UgdG8gb3VyIHBpcGVsaW5lXG4gICAgICAgIHBpcGVsaW5lLmFkZFN0YWdlKHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW2NvZGVCdWlsZEFjdGlvbl0sXG4gICAgICAgIH0pO1xuICAgIFxuICB9XG59XG4iXX0=