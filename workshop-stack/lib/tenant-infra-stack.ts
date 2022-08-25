/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import {
  CodeCommitSourceAction,
  LambdaInvokeAction,
  CodeBuildAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { getCodeBuildRole } from './codebuild-role-policy-doc';

export interface TenantInfraStackProps extends NestedStackProps {
  elbUrl: string;
}

export class TenantInfraStack extends NestedStack {
  nodeRole: iam.IRole;
  pipelineFunction: lambda.Function;
  pooledTenantUserPoolId: string;
  pooledTenantAppClientId: string;

  constructor(scope: Construct, id: string, props?: TenantInfraStackProps) {
    super(scope, id, props);

    const pooledTenantPool = new cognito.UserPool(this, 'PooledTenantsPool', {
      userInvitation: {
        emailSubject: 'Temporary password for environment EKS SaaS Application',
        emailBody: `<b>Welcome to the SaaS Application for EKS Workshop!</b> <br>
    <br>
    You can log into the app <a href="http://${props?.elbUrl}/app/index.html">here</a>. If that link doesn't work, you can copy this URL into your browser: http://${props?.elbUrl}/app/index.html
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
        callbackUrls: [`https://${props?.elbUrl}/app`],
      },
      preventUserExistenceErrors: true,
    });
    this.pooledTenantUserPoolId = pooledTenantPool.userPoolId;
    this.pooledTenantAppClientId = pooledTenantAppClient.userPoolClientId;

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `eks-saas-tenant-onboarding-pipeline`,
    });

        // Import existing CodeCommit sam-app repository
        const codeRepo = codecommit.Repository.fromRepositoryName(
          this,
          'AppRepository',
          'aws-saas-factory-eks-workshop'
        );
    
        // Declare source code as an artifact
        const sourceOutput = new codepipeline.Artifact();
    
        // Add source stage to pipeline
        pipeline.addStage({
          stageName: 'Source',
          actions: [
            new CodeCommitSourceAction({
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
    
        const lambdaInvokeAction = new LambdaInvokeAction({
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
    
        const codeBuildRole = getCodeBuildRole(this, this.account, this.region);
    
        const buildProject = new codebuild.PipelineProject(this, 'Build', {
          buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'),
          role: codeBuildRole,
          environment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
            privileged: true,
          },
        });
    
        const codeBuildAction = new CodeBuildAction({
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
