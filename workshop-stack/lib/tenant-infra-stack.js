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
                    TenantName: tenantName,
                    UserPoolId: userPoolId,
                    AppClientId: appClientId,
                    ElbUrl: elbUrl,
                    CodeBuildArn: codeBuildArn,
                    IamRoleArn: iamRoleArn,
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
                TenantName: { value: lambdaInvokeAction.variable('TenantName') },
                UserPoolId: { value: lambdaInvokeAction.variable('UserPoolId') },
                AppClientId: { value: lambdaInvokeAction.variable('AppClientId') },
                ElbUrl: { value: lambdaInvokeAction.variable('ElbUrl') },
                CodeBuildArn: { value: lambdaInvokeAction.variable('CodeBuildArn') },
                IamRoleArn: { value: lambdaInvokeAction.variable('IamRoleArn') },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVuYW50LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVuYW50LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILDZDQUE0RDtBQUc1RCwyQ0FBMkM7QUFDM0MsaURBQWlEO0FBQ2pELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHVEQUF1RDtBQUN2RCxtRkFJOEM7QUFDOUMsMkVBQStEO0FBTS9ELE1BQWEsZ0JBQWlCLFNBQVEseUJBQVc7SUFNL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLGdCQUFnQixHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkUsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSx5REFBeUQ7Z0JBQ3ZFLFNBQVMsRUFBRTs7K0NBRTRCLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNLHlHQUF5RyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsTUFBTTs7Ozs7U0FLeks7YUFDRjtZQUNELFlBQVksRUFBRSxlQUFlO1lBQzdCLGdCQUFnQixFQUFFO2dCQUNoQixXQUFXLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUM1RCxjQUFjLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUMvRCxLQUFLLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDO2FBQ3REO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxxQkFBcUIsR0FBRyxnQkFBZ0Is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QUU7Z0JBQ3BCLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUU7Z0JBQ2hFLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUU7Z0JBQ2hFLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUU7Z0JBQ2xFLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQ3hELFlBQVksRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUU7Z0JBQ3BFLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUU7YUFDakU7U0FDRixDQUFDLENBQUM7UUFFSCxzQ0FBc0M7UUFDdEMsUUFBUSxDQUFDLFFBQVEsQ0FBQztZQUNoQixTQUFTLEVBQUUsT0FBTztZQUNsQixPQUFPLEVBQUUsQ0FBQyxlQUFlLENBQUM7U0FDM0IsQ0FBQyxDQUFDO0lBRVQsQ0FBQztDQUNGO0FBOVBELDRDQThQQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuICovXG5cbmltcG9ydCB7IE5lc3RlZFN0YWNrLCBOZXN0ZWRTdGFja1Byb3BzIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgY29kZWNvbW1pdCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWNvbW1pdCc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQge1xuICBDb2RlQ29tbWl0U291cmNlQWN0aW9uLFxuICBMYW1iZGFJbnZva2VBY3Rpb24sXG4gIENvZGVCdWlsZEFjdGlvbixcbn0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcbmltcG9ydCB7IGdldENvZGVCdWlsZFJvbGUgfSBmcm9tICcuL2NvZGVidWlsZC1yb2xlLXBvbGljeS1kb2MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlbmFudEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICBlbGJVcmw6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFRlbmFudEluZnJhU3RhY2sgZXh0ZW5kcyBOZXN0ZWRTdGFjayB7XG4gIG5vZGVSb2xlOiBpYW0uSVJvbGU7XG4gIHBpcGVsaW5lRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcG9vbGVkVGVuYW50VXNlclBvb2xJZDogc3RyaW5nO1xuICBwb29sZWRUZW5hbnRBcHBDbGllbnRJZDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogVGVuYW50SW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwb29sZWRUZW5hbnRQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1Bvb2xlZFRlbmFudHNQb29sJywge1xuICAgICAgdXNlckludml0YXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnVGVtcG9yYXJ5IHBhc3N3b3JkIGZvciBlbnZpcm9ubWVudCBFS1MgU2FhUyBBcHBsaWNhdGlvbicsXG4gICAgICAgIGVtYWlsQm9keTogYDxiPldlbGNvbWUgdG8gdGhlIFNhYVMgQXBwbGljYXRpb24gZm9yIEVLUyBXb3Jrc2hvcCE8L2I+IDxicj5cbiAgICA8YnI+XG4gICAgWW91IGNhbiBsb2cgaW50byB0aGUgYXBwIDxhIGhyZWY9XCJodHRwOi8vJHtwcm9wcz8uZWxiVXJsfS9hcHAvaW5kZXguaHRtbFwiPmhlcmU8L2E+LiBJZiB0aGF0IGxpbmsgZG9lc24ndCB3b3JrLCB5b3UgY2FuIGNvcHkgdGhpcyBVUkwgaW50byB5b3VyIGJyb3dzZXI6IGh0dHA6Ly8ke3Byb3BzPy5lbGJVcmx9L2FwcC9pbmRleC5odG1sXG4gICAgPGJyPlxuICAgIFlvdXIgdXNlcm5hbWUgaXM6IDxiPnt1c2VybmFtZX08L2I+XG4gICAgPGJyPlxuICAgIFlvdXIgdGVtcG9yYXJ5IHBhc3N3b3JkIGlzOiA8Yj57IyMjI308L2I+XG4gICAgPGJyPmAsXG4gICAgICB9LFxuICAgICAgdXNlclBvb2xOYW1lOiAnZWtzLXdzLXBvb2xlZCcsXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgICd0ZW5hbnQtaWQnOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiBmYWxzZSB9KSxcbiAgICAgICAgJ2NvbXBhbnktbmFtZSc6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IGZhbHNlIH0pLFxuICAgICAgICBlbWFpbDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwb29sZWRUZW5hbnRBcHBDbGllbnQgPSBwb29sZWRUZW5hbnRQb29sLmFkZENsaWVudCgnUG9vbGVkVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIGN1c3RvbTogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUEhPTkUsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbYGh0dHBzOi8vJHtwcm9wcz8uZWxiVXJsfS9hcHBgXSxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICB9KTtcbiAgICB0aGlzLnBvb2xlZFRlbmFudFVzZXJQb29sSWQgPSBwb29sZWRUZW5hbnRQb29sLnVzZXJQb29sSWQ7XG4gICAgdGhpcy5wb29sZWRUZW5hbnRBcHBDbGllbnRJZCA9IHBvb2xlZFRlbmFudEFwcENsaWVudC51c2VyUG9vbENsaWVudElkO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYGVrcy1zYWFzLXRlbmFudC1vbmJvYXJkaW5nLXBpcGVsaW5lYCxcbiAgICB9KTtcblxuICAgICAgICAvLyBJbXBvcnQgZXhpc3RpbmcgQ29kZUNvbW1pdCBzYW0tYXBwIHJlcG9zaXRvcnlcbiAgICAgICAgY29uc3QgY29kZVJlcG8gPSBjb2RlY29tbWl0LlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlOYW1lKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ0FwcFJlcG9zaXRvcnknLFxuICAgICAgICAgICdhd3Mtc2Fhcy1mYWN0b3J5LWVrcy13b3Jrc2hvcCdcbiAgICAgICAgKTtcbiAgICBcbiAgICAgICAgLy8gRGVjbGFyZSBzb3VyY2UgY29kZSBhcyBhbiBhcnRpZmFjdFxuICAgICAgICBjb25zdCBzb3VyY2VPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG4gICAgXG4gICAgICAgIC8vIEFkZCBzb3VyY2Ugc3RhZ2UgdG8gcGlwZWxpbmVcbiAgICAgICAgcGlwZWxpbmUuYWRkU3RhZ2Uoe1xuICAgICAgICAgIHN0YWdlTmFtZTogJ1NvdXJjZScsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IENvZGVDb21taXRTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnQ29kZUNvbW1pdF9Tb3VyY2UnLFxuICAgICAgICAgICAgICByZXBvc2l0b3J5OiBjb2RlUmVwbyxcbiAgICAgICAgICAgICAgYnJhbmNoOiAnbWFpbicsXG4gICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICB2YXJpYWJsZXNOYW1lc3BhY2U6ICdTb3VyY2VWYXJpYWJsZXMnLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIC8vIERlY2xhcmUgYnVpbGQgb3V0cHV0IGFzIGFydGlmYWN0c1xuICAgICAgICBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG4gICAgXG4gICAgICAgIC8vIEFkZCB0aGUgTGFtYmRhIGludm9rZSBzdGFnZSB0byBvdXIgcGlwZWxpbmVcbiAgICAgICAgY29uc3QgcGlwZWxpbmVQb2xpY3kgPSBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBhc3NpZ25TaWRzOiBmYWxzZSxcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydjb2RlcGlwZWxpbmU6UHV0Sm9iU3VjY2Vzc1Jlc3VsdCcsICdjb2RlcGlwZWxpbmU6UHV0Sm9iRmFpbHVyZVJlc3VsdCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0Vrc1RlbmFudFN0YWNrTGFtYmRhUm9sZScsIHtcbiAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICAgICAgaW5saW5lUG9saWN5OiBwaXBlbGluZVBvbGljeSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgdGhpcy5waXBlbGluZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRnVuYycsIHtcbiAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG4gICAgICAgICAgdmFyIGFzc2VydCA9IHJlcXVpcmUoJ2Fzc2VydCcpO1xuICAgICAgICAgIHZhciBBV1MgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XG4gICAgICAgICAgdmFyIGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG4gICAgICAgICAgdmFyIGNvZGVwaXBlbGluZSA9IG5ldyBBV1MuQ29kZVBpcGVsaW5lKCk7XG4gICAgXG4gICAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50LCBjb250ZXh0KSA9PiB7XG4gICAgICAgICAgICB2YXIgb3V0cHV0UGFyYW1zO1xuICAgICAgICAgICAgdmFyIHRlbmFudE5hbWUsYXBwQ2xpZW50SWQsdXNlclBvb2xJZCxlbGJVcmwsY29kZUJ1aWxkQXJuLGlhbVJvbGVBcm47XG4gICAgICAgICAgICB2YXIgcmVnaW9uID0gcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc29sZS5sb2coJ2V2ZW50OicsIGV2ZW50KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUmV0cmlldmUgdGhlIEpvYiBJRCBmcm9tIHRoZSBMYW1iZGEgYWN0aW9uXG4gICAgICAgICAgICB2YXIgam9iSWQgPSBldmVudFtcIkNvZGVQaXBlbGluZS5qb2JcIl0uaWQ7XG4gICAgXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgdGVuYW50IGRhdGEgZnJvbSBUZW5hbnQtU3RhY2stTWFwcGluZyB0YWJsZVxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0VGVuYW50U3RhY2tEYXRhKCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcInJlc3VsdD09PT0+XCIsIHJlc3VsdCk7XG4gICAgXG4gICAgICAgICAgICAgIHJlc3VsdC5JdGVtcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtZW50LCBpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgICAgICAgICB0ZW5hbnROYW1lID0gZWxlbWVudC5UZW5hbnROYW1lLlM7XG4gICAgICAgICAgICAgICAgYXBwQ2xpZW50SWQgPSBlbGVtZW50LkFwcENsaWVudElkLlM7XG4gICAgICAgICAgICAgICAgdXNlclBvb2xJZCA9IGVsZW1lbnQuVXNlclBvb2xJZC5TO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgIFxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlRlbmFudE5hbWU9PT09PlwiLCB0ZW5hbnROYW1lKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJhcHBDbGllbnRJZD09PT0+XCIsIGFwcENsaWVudElkKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJ1c2VyUG9vbElkPT09PT5cIiwgdXNlclBvb2xJZCk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwicmVnaW9uPT09PT5cIiwgcmVnaW9uKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUmV0cmlldmUgdGhlIHN0YWNrIGRhdGEgZnJvbSB0aGUgRUtTLVNhYVMtU3RhY2stTWV0YWRhdGEgdGFibGVcbiAgICAgICAgICAgIGNvbnN0IHN0YWNrTWV0YWRhdGEgPSBhd2FpdCBnZXRTdGFja01ldGFkYXRhKCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcInN0YWNrTWV0YWRhdGE9PT09PlwiLCBzdGFja01ldGFkYXRhKTtcbiAgICAgICAgICAgICAgc3RhY2tNZXRhZGF0YS5JdGVtcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtZW50LCBpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgICAgICAgICBlbGJVcmwgPSBlbGVtZW50LkVMQlVSTC5TO1xuICAgICAgICAgICAgICAgIGNvZGVCdWlsZEFybiA9IGVsZW1lbnQuQ09ERUJVSUxEX0FSTi5TO1xuICAgICAgICAgICAgICAgIGlhbVJvbGVBcm4gPSBlbGVtZW50LklBTV9ST0xFX0FSTi5TO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRUxCVVJMPT09PT5cIiwgZWxiVXJsKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJDT0RFQlVJTERfQVJOPT09PT5cIiwgY29kZUJ1aWxkQXJuKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJJQU1fUk9MRV9BUk49PT09PlwiLCBpYW1Sb2xlQXJuKTtcbiAgICAgIFxuICAgIFxuICAgICAgICAgICAgb3V0cHV0UGFyYW1zID0ge1xuICAgICAgICAgICAgICAgIGpvYklkOiBqb2JJZCxcbiAgICAgICAgICAgICAgICBvdXRwdXRWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgVGVuYW50TmFtZTogdGVuYW50TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgVXNlclBvb2xJZDogdXNlclBvb2xJZCxcbiAgICAgICAgICAgICAgICAgICAgQXBwQ2xpZW50SWQ6IGFwcENsaWVudElkLFxuICAgICAgICAgICAgICAgICAgICBFbGJVcmw6IGVsYlVybCxcbiAgICAgICAgICAgICAgICAgICAgQ29kZUJ1aWxkQXJuOiBjb2RlQnVpbGRBcm4sXG4gICAgICAgICAgICAgICAgICAgIElhbVJvbGVBcm46IGlhbVJvbGVBcm4sXG4gICAgICAgICAgICAgICAgICAgIFJlZ2lvbjogcmVnaW9uLFxuICAgICAgICAgICAgICAgICAgICBkYXRlVGltZTogRGF0ZShEYXRlLm5vdygpKS50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIE5vdGlmeSBBV1MgQ29kZVBpcGVsaW5lIG9mIGEgc3VjY2Vzc2Z1bCBqb2JcbiAgICAgICAgICAgIGF3YWl0IHB1dEpvYlN1Y2Nlc3Mob3V0cHV0UGFyYW1zKTtcbiAgICAgICAgICB9XG4gICAgIFxuICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIHB1dEpvYlN1Y2Nlc3MocGFyYW1zKSB7XG4gICAgICAgICAgICAgcmV0dXJuIGNvZGVwaXBlbGluZS5wdXRKb2JTdWNjZXNzUmVzdWx0KHBhcmFtcykucHJvbWlzZSgpO1xuICAgICAgICAgICAgfTtcbiAgICBcbiAgICAgICAgICBhc3luYyBmdW5jdGlvbiBnZXRUZW5hbnRTdGFja0RhdGEoKSB7XG4gICAgICAgICAgICAvL1F1ZXJ5IER5bmFtb0RCIHRhYmxlIGZvciB0ZW5hbnQgc3RhY2sgZGF0YVxuICAgICAgICAgICAgdmFyIGRkYiA9IG5ldyBBV1MuRHluYW1vREIoe2FwaVZlcnNpb246ICcyMDEyLTA4LTEwJ30pO1xuICAgIFxuICAgICAgICAgICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICAgICAgICc6cyc6IHtTOiAnUHJvdmlzaW9uaW5nJ30sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZpbHRlckV4cHJlc3Npb246ICdEZXBsb3ltZW50U3RhdHVzID0gOnMnLFxuICAgICAgICAgICAgICBUYWJsZU5hbWU6ICdFS1MtU2FhUy1UZW5hbnQtU3RhY2stTWFwcGluZycsXG4gICAgXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gZGRiLnNjYW4ocGFyYW1zKS5wcm9taXNlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGFzeW5jIGZ1bmN0aW9uIGdldFN0YWNrTWV0YWRhdGEoKSB7XG4gICAgICAgICAgICAvL1F1ZXJ5IER5bmFtb0RCIHRhYmxlIGZvciBFS1MgU2FhUyBzdGFjayBtZXRhZGFkYXRhXG4gICAgICAgICAgICB2YXIgZGRiID0gbmV3IEFXUy5EeW5hbW9EQih7YXBpVmVyc2lvbjogJzIwMTItMDgtMTAnfSk7XG4gICAgICAgICAgICB2YXIgcGFyYW1zID0ge1xuICAgICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICAgICAgICAgJzpzJzoge1M6ICdla3Mtc2Fhcyd9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnU3RhY2tOYW1lID0gOnMnLFxuICAgICAgICAgICAgICBUYWJsZU5hbWU6ICdFS1MtU2FhUy1TdGFjay1NZXRhZGF0YScsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGRkYi5xdWVyeShwYXJhbXMpLnByb21pc2UoKTtcbiAgICAgICAgICB9ICAgICBcbiAgICAgICAgICBgKSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxhbWJkYUludm9rZUFjdGlvbiA9IG5ldyBMYW1iZGFJbnZva2VBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6ICdMYW1iZGEnLFxuICAgICAgICAgIGxhbWJkYTogdGhpcy5waXBlbGluZUZ1bmN0aW9uLFxuICAgICAgICAgIHZhcmlhYmxlc05hbWVzcGFjZTogJ0xhbWJkYVZhcmlhYmxlcycsXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnTGFtYmRhJyxcbiAgICAgICAgICBhY3Rpb25zOiBbbGFtYmRhSW52b2tlQWN0aW9uXSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIC8vIERlY2xhcmUgYnVpbGQgb3V0cHV0IGFzIGFydGlmYWN0c1xuICAgICAgICBjb25zdCBidWlsZE91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBcbiAgICAgICAgLy9EZWNsYXJlIGEgbmV3IENvZGVCdWlsZCBwcm9qZWN0XG4gICAgXG4gICAgICAgIGNvbnN0IGNvZGVCdWlsZFJvbGUgPSBnZXRDb2RlQnVpbGRSb2xlKHRoaXMsIHRoaXMuYWNjb3VudCwgdGhpcy5yZWdpb24pO1xuICAgIFxuICAgICAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGQnLCB7XG4gICAgICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21Tb3VyY2VGaWxlbmFtZSgnYnVpbGRzcGVjLnlhbWwnKSxcbiAgICAgICAgICByb2xlOiBjb2RlQnVpbGRSb2xlLFxuICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzRfMCxcbiAgICAgICAgICAgIHByaXZpbGVnZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGNvZGVCdWlsZEFjdGlvbiA9IG5ldyBDb2RlQnVpbGRBY3Rpb24oe1xuICAgICAgICAgIGFjdGlvbk5hbWU6ICdCdWlsZC1BbmQtRGVwbG95LVRlbmFudC1LOHMtcmVzb3VyY2VzJyxcbiAgICAgICAgICBwcm9qZWN0OiBidWlsZFByb2plY3QsXG4gICAgICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICBvdXRwdXRzOiBbYnVpbGRPdXRwdXRdLFxuICAgICAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgICAgICBUZW5hbnROYW1lOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ1RlbmFudE5hbWUnKSB9LFxuICAgICAgICAgICAgVXNlclBvb2xJZDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdVc2VyUG9vbElkJykgfSxcbiAgICAgICAgICAgIEFwcENsaWVudElkOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0FwcENsaWVudElkJykgfSxcbiAgICAgICAgICAgIEVsYlVybDogeyB2YWx1ZTogbGFtYmRhSW52b2tlQWN0aW9uLnZhcmlhYmxlKCdFbGJVcmwnKSB9LFxuICAgICAgICAgICAgQ29kZUJ1aWxkQXJuOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0NvZGVCdWlsZEFybicpIH0sXG4gICAgICAgICAgICBJYW1Sb2xlQXJuOiB7IHZhbHVlOiBsYW1iZGFJbnZva2VBY3Rpb24udmFyaWFibGUoJ0lhbVJvbGVBcm4nKSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICAvLyBBZGQgdGhlIGJ1aWxkIHN0YWdlIHRvIG91ciBwaXBlbGluZVxuICAgICAgICBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxuICAgICAgICAgIGFjdGlvbnM6IFtjb2RlQnVpbGRBY3Rpb25dLFxuICAgICAgICB9KTtcbiAgICBcbiAgfVxufVxuIl19