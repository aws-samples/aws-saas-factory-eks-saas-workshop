"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootstrapStack = void 0;
const cdk = require("aws-cdk-lib");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const iam = require("aws-cdk-lib/aws-iam");
const cloud9 = require("aws-cdk-lib/aws-cloud9");
const ec2 = require("aws-cdk-lib/aws-ec2");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const aws_events_targets_1 = require("aws-cdk-lib/aws-events-targets");
// This function is based on the cfnresponse JS module that is published
// by CloudFormation. It's an async function that makes coding much easier.
const respondFunction = `
const respond = async function(event, context, responseStatus, responseData, physicalResourceId, noEcho) {
  return new Promise((resolve, reject) => {
    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: "See the details in CloudWatch Log Stream: " + context.logGroupName + " " + context.logStreamName,
        PhysicalResourceId: physicalResourceId || context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        NoEcho: noEcho || false,
        Data: responseData
    });

    console.log("Response body:\\n", responseBody);

    var https = require("https");
    var url = require("url");

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: "PUT",
        headers: {
            "content-type": "",
            "content-length": responseBody.length
        }
    };

    var request = https.request(options, function(response) {
        console.log("Status code: " + response.statusCode);
        console.log("Status message: " + response.statusMessage);
        resolve();
    });

    request.on("error", function(error) {
        console.log("respond(..) failed executing https.request(..): " + error);
        resolve();
    });

    request.write(responseBody);
    request.end();
  });
};
`;
class BootstrapStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // These parameters appear to be supplied by Event Engine. We'll
        // take advantage of them to locate the Zip file containing this
        // source code.
        const assetBucketName = new cdk.CfnParameter(this, 'EEAssetsBucket', {
            default: 'BucketNameNotSet',
            type: 'String'
        });
        const assetPrefix = new cdk.CfnParameter(this, 'EEAssetsKeyPrefix', {
            default: 'KeyPrefixNotSet',
            type: 'String'
        });
        const teamRoleArn = new cdk.CfnParameter(this, 'EETeamRoleArn', {
            default: 'RoleArnNotSet',
            type: 'String'
        });
        // We supply the value of this parameter ourselves via the ZIPFILE
        // environment variable. It will be automatically rendered into the
        // generated YAML template.
        const sourceZipFile = new cdk.CfnParameter(this, 'SourceZipFile', {
            default: props.sourceZipFile,
            type: 'String'
        });
        const sourceZipFileChecksum = new cdk.CfnParameter(this, 'SourceZipFileChecksum', {
            default: props.sourceZipFileChecksum,
            type: 'String'
        });
        const assetBucket = s3.Bucket.fromBucketName(this, 'SourceBucket', assetBucketName.valueAsString);
        // We need to create the Cloud9 environment here, instead of in the cluster stack
        // created in CodeBuild, so that the stack creator can access the environment.
        // (CodeBuild builds perform in a different role context, which makes the
        // environment inaccessible.)
        //
        // First, we need a VPC to put it in.
        const vpc = new ec2.Vpc(this, 'VPC', {
            maxAzs: 2,
            cidr: '10.0.0.0/16',
            natGateways: 1,
            subnetConfiguration: [
                {
                    subnetType: ec2.SubnetType.PUBLIC,
                    name: 'Public',
                    cidrMask: 18,
                },
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
                    name: 'Private',
                    cidrMask: 18,
                }
            ]
        });
        // See https://docs.aws.amazon.com/eks/latest/userguide/network-load-balancing.html
        vpc.privateSubnets.forEach(subnet => cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1'));
        vpc.publicSubnets.forEach(subnet => cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1'));
        // Create the Cloud9 Environment.
        const workspace = new cloud9.CfnEnvironmentEC2(this, 'Workspace', {
            name: 'eks-saas-workshop',
            description: 'EKS SaaS Workshop',
            instanceType: 'm5.large',
        });
        const updateWorkspaceMembershipFunction = new lambda.Function(this, 'UpdateWorkspaceMembershipFunction', {
            code: lambda.Code.fromInline(respondFunction + `
exports.handler = async function (event, context) {
  console.log(JSON.stringify(event, null, 4));
  const AWS = require('aws-sdk');

  try {

    const environmentArn = event.ResourceProperties.EnvironmentId;
    const arnSplit = environmentArn.split(':');
    const environmentId = arnSplit[6];
    console.log("EnvironmentId =====>" + environmentId);

    if (event.RequestType === "Create" || event.RequestType === "Update") {
      const eeTeamRoleArn = event.ResourceProperties.EETeamRoleArn;

      if (!!eeTeamRoleArn && eeTeamRoleArn !== 'RoleArnNotSet') {
        const arnSplit = eeTeamRoleArn.split(':');
        const accountNumber = arnSplit[4];
        const resourceName = arnSplit[5].split('/')[1];
        const eeTeamAssumedRoleArn = \`arn:aws:sts::\${accountNumber}:assumed-role/\${resourceName}/MasterKey\`;

        console.log('Resolved EE Team Assumed Role ARN: ' + eeTeamAssumedRoleArn);

        const cloud9 = new AWS.Cloud9();

        const { membership } = await cloud9.createEnvironmentMembership({
            environmentId,
            permissions: 'read-write',
            userArn: eeTeamAssumedRoleArn,
        }).promise();
        console.log(JSON.stringify(membership, null, 4));
      }
    }
    console.log('Sending SUCCESS response');
    await respond(event, context, 'SUCCESS', {}, environmentId);
  } catch (error) {
      console.error(error);
      await respond(event, context, 'FAILED', { Error: error });
  }
};
          `),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(1),
        });
        updateWorkspaceMembershipFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['cloud9:createEnvironmentMembership'],
            resources: ['*']
        }));
        //const length = workspace.attrName.length;
        //const envId = workspace.attrName.substring(length - 32);
        new cdk.CustomResource(this, 'UpdateWorkspaceMembership', {
            serviceToken: updateWorkspaceMembershipFunction.functionArn,
            properties: {
                EnvironmentId: workspace.attrArn,
                EETeamRoleArn: teamRoleArn.valueAsString
            }
        });
        // Most of the resources will be provisioned via CDK. To accomplish this,
        // we will leverage CodeBuild as the execution engine for a Custom Resource.
        const buildProjectRole = new iam.Role(this, 'BuildProjectRole', {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
        });
        const buildProjectPolicy = new iam.Policy(this, 'BuildProjectPolicy', {
            statements: [
                new iam.PolicyStatement({
                    actions: ['*'],
                    resources: ['*']
                })
            ]
        });
        buildProjectRole.attachInlinePolicy(buildProjectPolicy);
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            role: buildProjectRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
                computeType: codebuild.ComputeType.SMALL,
            },
            source: codebuild.Source.s3({
                bucket: assetBucket,
                path: `${assetPrefix.valueAsString}${sourceZipFile.valueAsString}`
            }),
            timeout: cdk.Duration.minutes(90),
        });
        // Custom resource function to start a build. The "application" being built
        // deploys our CDK app, specifically the EKS ClusterStack.
        const startBuildFunction = new lambda.Function(this, 'StartBuildFunction', {
            code: lambda.Code.fromInline(respondFunction + `
const AWS = require('aws-sdk');

exports.handler = async function (event, context) {
  console.log(JSON.stringify(event, null, 4));
  try {
    const projectName = event.ResourceProperties.ProjectName;
    const codebuild = new AWS.CodeBuild();

    console.log(\`Starting new build of project \${projectName}\`);

    const { build } = await codebuild.startBuild({
      projectName,
      // Pass CFN related parameters through the build for extraction by the
      // completion handler.
      buildspecOverride: event.RequestType === 'Delete' ? 'workshop-stack/buildspec-destroy.yml' : 'workshop-stack/buildspec.yml',
      environmentVariablesOverride: [
        {
          name: 'CFN_RESPONSE_URL',
          value: event.ResponseURL
        },
        {
          name: 'CFN_STACK_ID',
          value: event.StackId
        },
        {
          name: 'CFN_REQUEST_ID',
          value: event.RequestId
        },
        {
          name: 'CFN_LOGICAL_RESOURCE_ID',
          value: event.LogicalResourceId
        },
        {
          name: 'VPC_ID',
          value: event.ResourceProperties.VpcId
        },
        {
          name: 'CLOUD9_ENVIRONMENT_ID',
          value: event.ResourceProperties.Cloud9EnvironmentId
        },
        {
          name: 'BUILD_ROLE_ARN',
          value: event.ResourceProperties.BuildRoleArn
        }
      ]
    }).promise();
    console.log(\`Build id \${build.id} started - resource completion handled by EventBridge\`);
  } catch(error) {
    console.error(error);
    await respond(event, context, 'FAILED', { Error: error });
  }
};
      `),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(1)
        });
        startBuildFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['codebuild:StartBuild'],
            resources: [buildProject.projectArn]
        }));
        // Lambda function to execute once CodeBuild has finished producing a build.
        // This will signal CloudFormation that the build (i.e., deploying the actual
        // EKS stack) has completed.
        const reportBuildFunction = new lambda.Function(this, 'ReportBuildFunction', {
            code: lambda.Code.fromInline(respondFunction + `
const AWS = require('aws-sdk');

exports.handler = async function (event, context) {
  console.log(JSON.stringify(event, null, 4));

  const projectName = event['detail']['project-name'];

  const codebuild = new AWS.CodeBuild();

  const buildId = event['detail']['build-id'];
  const { builds } = await codebuild.batchGetBuilds({
    ids: [ buildId ]
  }).promise();

  console.log(JSON.stringify(builds, null, 4));

  const build = builds[0];
  // Fetch the CFN resource and response parameters from the build environment.
  const environment = {};
  build.environment.environmentVariables.forEach(e => environment[e.name] = e.value);

  const response = {
    ResponseURL: environment.CFN_RESPONSE_URL,
    StackId: environment.CFN_STACK_ID,
    LogicalResourceId: environment.CFN_LOGICAL_RESOURCE_ID,
    RequestId: environment.CFN_REQUEST_ID
  };

  if (event['detail']['build-status'] === 'SUCCEEDED') {
    await respond(response, context, 'SUCCESS', {}, 'build');
  } else {
    await respond(response, context, 'FAILED', { Error: 'Build failed' });
  }
};
      `),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(1)
        });
        reportBuildFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'codebuild:BatchGetBuilds',
                'codebuild:ListBuildsForProject'
            ],
            resources: [buildProject.projectArn]
        }));
        // Trigger the CloudFormation notification function upon build completion.
        const buildCompleteRule = new events.Rule(this, 'BuildCompleteRule', {
            description: 'Build complete',
            eventPattern: {
                source: ['aws.codebuild'],
                detailType: ['CodeBuild Build State Change'],
                detail: {
                    'build-status': ['SUCCEEDED', 'FAILED', 'STOPPED'],
                    'project-name': [buildProject.projectName]
                }
            },
            targets: [
                new aws_events_targets_1.LambdaFunction(reportBuildFunction)
            ]
        });
        const cloud9EnvironmentArn = workspace.attrArn;
        const components = cdk.Arn.split(cloud9EnvironmentArn, cdk.ArnFormat.COLON_RESOURCE_NAME);
        // Kick off the build (CDK deployment).
        const clusterStack = new cdk.CustomResource(this, 'ClusterStack', {
            serviceToken: startBuildFunction.functionArn,
            properties: {
                ProjectName: buildProject.projectName,
                VpcId: vpc.vpcId,
                Cloud9EnvironmentId: components.resourceName,
                BuildRoleArn: buildProjectRole.roleArn,
                ZipFileChecksum: sourceZipFileChecksum.valueAsString,
            }
        });
        clusterStack.node.addDependency(buildCompleteRule, buildProjectPolicy, vpc);
    }
}
exports.BootstrapStack = BootstrapStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYm9vdHN0cmFwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx1REFBdUQ7QUFDdkQseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxpREFBaUQ7QUFDakQsdUVBQWdGO0FBRWhGLHdFQUF3RTtBQUN4RSwyRUFBMkU7QUFDM0UsTUFBTSxlQUFlLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0E4Q3ZCLENBQUM7QUFNRixNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdFQUFnRTtRQUNoRSxnRUFBZ0U7UUFDaEUsZUFBZTtRQUNmLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDbkUsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbEUsT0FBTyxFQUFFLGlCQUFpQjtZQUMxQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELE9BQU8sRUFBRSxlQUFlO1lBQ3hCLElBQUksRUFBRSxRQUFRO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsa0VBQWtFO1FBQ2xFLG1FQUFtRTtRQUNu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WTtnQkFDNUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLE9BQU87Z0JBQ3RDLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxhQUFhO2FBQ3JEO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNGO0FBelRELHdDQXlUQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjbG91ZDkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkOSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgeyBMYW1iZGFGdW5jdGlvbiBhcyBMYW1iZGFUYXJnZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuXG4vLyBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIHRoZSBjZm5yZXNwb25zZSBKUyBtb2R1bGUgdGhhdCBpcyBwdWJsaXNoZWRcbi8vIGJ5IENsb3VkRm9ybWF0aW9uLiBJdCdzIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgbWFrZXMgY29kaW5nIG11Y2ggZWFzaWVyLlxuY29uc3QgcmVzcG9uZEZ1bmN0aW9uID0gYFxuY29uc3QgcmVzcG9uZCA9IGFzeW5jIGZ1bmN0aW9uKGV2ZW50LCBjb250ZXh0LCByZXNwb25zZVN0YXR1cywgcmVzcG9uc2VEYXRhLCBwaHlzaWNhbFJlc291cmNlSWQsIG5vRWNobykge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHZhciByZXNwb25zZUJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIFN0YXR1czogcmVzcG9uc2VTdGF0dXMsXG4gICAgICAgIFJlYXNvbjogXCJTZWUgdGhlIGRldGFpbHMgaW4gQ2xvdWRXYXRjaCBMb2cgU3RyZWFtOiBcIiArIGNvbnRleHQubG9nR3JvdXBOYW1lICsgXCIgXCIgKyBjb250ZXh0LmxvZ1N0cmVhbU5hbWUsXG4gICAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogcGh5c2ljYWxSZXNvdXJjZUlkIHx8IGNvbnRleHQubG9nU3RyZWFtTmFtZSxcbiAgICAgICAgU3RhY2tJZDogZXZlbnQuU3RhY2tJZCxcbiAgICAgICAgUmVxdWVzdElkOiBldmVudC5SZXF1ZXN0SWQsXG4gICAgICAgIExvZ2ljYWxSZXNvdXJjZUlkOiBldmVudC5Mb2dpY2FsUmVzb3VyY2VJZCxcbiAgICAgICAgTm9FY2hvOiBub0VjaG8gfHwgZmFsc2UsXG4gICAgICAgIERhdGE6IHJlc3BvbnNlRGF0YVxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coXCJSZXNwb25zZSBib2R5OlxcXFxuXCIsIHJlc3BvbnNlQm9keSk7XG5cbiAgICB2YXIgaHR0cHMgPSByZXF1aXJlKFwiaHR0cHNcIik7XG4gICAgdmFyIHVybCA9IHJlcXVpcmUoXCJ1cmxcIik7XG5cbiAgICB2YXIgcGFyc2VkVXJsID0gdXJsLnBhcnNlKGV2ZW50LlJlc3BvbnNlVVJMKTtcbiAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICAgICAgcG9ydDogNDQzLFxuICAgICAgICBwYXRoOiBwYXJzZWRVcmwucGF0aCxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBcImNvbnRlbnQtdHlwZVwiOiBcIlwiLFxuICAgICAgICAgICAgXCJjb250ZW50LWxlbmd0aFwiOiByZXNwb25zZUJvZHkubGVuZ3RoXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHJlcXVlc3QgPSBodHRwcy5yZXF1ZXN0KG9wdGlvbnMsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhdHVzIGNvZGU6IFwiICsgcmVzcG9uc2Uuc3RhdHVzQ29kZSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhdHVzIG1lc3NhZ2U6IFwiICsgcmVzcG9uc2Uuc3RhdHVzTWVzc2FnZSk7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICB9KTtcblxuICAgIHJlcXVlc3Qub24oXCJlcnJvclwiLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgICBjb25zb2xlLmxvZyhcInJlc3BvbmQoLi4pIGZhaWxlZCBleGVjdXRpbmcgaHR0cHMucmVxdWVzdCguLik6IFwiICsgZXJyb3IpO1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgfSk7XG5cbiAgICByZXF1ZXN0LndyaXRlKHJlc3BvbnNlQm9keSk7XG4gICAgcmVxdWVzdC5lbmQoKTtcbiAgfSk7XG59O1xuYDtcbmV4cG9ydCBpbnRlcmZhY2UgQm9vdHN0cmFwU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc291cmNlWmlwRmlsZTogc3RyaW5nXG4gIHNvdXJjZVppcEZpbGVDaGVja3N1bTogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBCb290c3RyYXBTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBCb290c3RyYXBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBUaGVzZSBwYXJhbWV0ZXJzIGFwcGVhciB0byBiZSBzdXBwbGllZCBieSBFdmVudCBFbmdpbmUuIFdlJ2xsXG4gICAgLy8gdGFrZSBhZHZhbnRhZ2Ugb2YgdGhlbSB0byBsb2NhdGUgdGhlIFppcCBmaWxlIGNvbnRhaW5pbmcgdGhpc1xuICAgIC8vIHNvdXJjZSBjb2RlLlxuICAgIGNvbnN0IGFzc2V0QnVja2V0TmFtZSA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0J1Y2tldCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdCdWNrZXROYW1lTm90U2V0JyxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldFByZWZpeCA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0tleVByZWZpeCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdLZXlQcmVmaXhOb3RTZXQnLFxuICAgICAgdHlwZTogJ1N0cmluZydcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlYW1Sb2xlQXJuID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ0VFVGVhbVJvbGVBcm4nLCB7XG4gICAgICBkZWZhdWx0OiAnUm9sZUFybk5vdFNldCcsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgLy8gV2Ugc3VwcGx5IHRoZSB2YWx1ZSBvZiB0aGlzIHBhcmFtZXRlciBvdXJzZWx2ZXMgdmlhIHRoZSBaSVBGSUxFXG4gICAgLy8gZW52aXJvbm1lbnQgdmFyaWFibGUuIEl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW5kZXJlZCBpbnRvIHRoZVxuICAgIC8vIGdlbmVyYXRlZCBZQU1MIHRlbXBsYXRlLlxuICAgIGNvbnN0IHNvdXJjZVppcEZpbGUgPSBuZXcgY2RrLkNmblBhcmFtZXRlcih0aGlzLCAnU291cmNlWmlwRmlsZScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGUsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc291cmNlWmlwRmlsZUNoZWNrc3VtID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ1NvdXJjZVppcEZpbGVDaGVja3N1bScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGVDaGVja3N1bSxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldEJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnU291cmNlQnVja2V0JywgYXNzZXRCdWNrZXROYW1lLnZhbHVlQXNTdHJpbmcpO1xuXG4gICAgLy8gV2UgbmVlZCB0byBjcmVhdGUgdGhlIENsb3VkOSBlbnZpcm9ubWVudCBoZXJlLCBpbnN0ZWFkIG9mIGluIHRoZSBjbHVzdGVyIHN0YWNrXG4gICAgLy8gY3JlYXRlZCBpbiBDb2RlQnVpbGQsIHNvIHRoYXQgdGhlIHN0YWNrIGNyZWF0b3IgY2FuIGFjY2VzcyB0aGUgZW52aXJvbm1lbnQuXG4gICAgLy8gKENvZGVCdWlsZCBidWlsZHMgcGVyZm9ybSBpbiBhIGRpZmZlcmVudCByb2xlIGNvbnRleHQsIHdoaWNoIG1ha2VzIHRoZVxuICAgIC8vIGVudmlyb25tZW50IGluYWNjZXNzaWJsZS4pXG4gICAgLy9cbiAgICAvLyBGaXJzdCwgd2UgbmVlZCBhIFZQQyB0byBwdXQgaXQgaW4uXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1ZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIGNpZHI6ICcxMC4wLjAuMC8xNicsXG4gICAgICBuYXRHYXRld2F5czogMSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfTkFULFxuICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIFNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vZWtzL2xhdGVzdC91c2VyZ3VpZGUvbmV0d29yay1sb2FkLWJhbGFuY2luZy5odG1sXG4gICAgdnBjLnByaXZhdGVTdWJuZXRzLmZvckVhY2goc3VibmV0ID0+IGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdrdWJlcm5ldGVzLmlvL3JvbGUvaW50ZXJuYWwtZWxiJywgJzEnKSk7XG4gICAgdnBjLnB1YmxpY1N1Ym5ldHMuZm9yRWFjaChzdWJuZXQgPT4gY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9lbGInLCAnMScpKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgQ2xvdWQ5IEVudmlyb25tZW50LlxuICAgIGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBjbG91ZDkuQ2ZuRW52aXJvbm1lbnRFQzIodGhpcywgJ1dvcmtzcGFjZScsIHtcbiAgICAgIG5hbWU6ICdla3Mtc2Fhcy13b3Jrc2hvcCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VLUyBTYWFTIFdvcmtzaG9wJyxcbiAgICAgIGluc3RhbmNlVHlwZTogJ201LmxhcmdlJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXBGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXBGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUocmVzcG9uZEZ1bmN0aW9uICsgYFxuZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgZnVuY3Rpb24gKGV2ZW50LCBjb250ZXh0KSB7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCA0KSk7XG4gIGNvbnN0IEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcblxuICB0cnkge1xuXG4gICAgY29uc3QgZW52aXJvbm1lbnRBcm4gPSBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuRW52aXJvbm1lbnRJZDtcbiAgICBjb25zdCBhcm5TcGxpdCA9IGVudmlyb25tZW50QXJuLnNwbGl0KCc6Jyk7XG4gICAgY29uc3QgZW52aXJvbm1lbnRJZCA9IGFyblNwbGl0WzZdO1xuICAgIGNvbnNvbGUubG9nKFwiRW52aXJvbm1lbnRJZCA9PT09PT5cIiArIGVudmlyb25tZW50SWQpO1xuXG4gICAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSBcIkNyZWF0ZVwiIHx8IGV2ZW50LlJlcXVlc3RUeXBlID09PSBcIlVwZGF0ZVwiKSB7XG4gICAgICBjb25zdCBlZVRlYW1Sb2xlQXJuID0gZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkVFVGVhbVJvbGVBcm47XG5cbiAgICAgIGlmICghIWVlVGVhbVJvbGVBcm4gJiYgZWVUZWFtUm9sZUFybiAhPT0gJ1JvbGVBcm5Ob3RTZXQnKSB7XG4gICAgICAgIGNvbnN0IGFyblNwbGl0ID0gZWVUZWFtUm9sZUFybi5zcGxpdCgnOicpO1xuICAgICAgICBjb25zdCBhY2NvdW50TnVtYmVyID0gYXJuU3BsaXRbNF07XG4gICAgICAgIGNvbnN0IHJlc291cmNlTmFtZSA9IGFyblNwbGl0WzVdLnNwbGl0KCcvJylbMV07XG4gICAgICAgIGNvbnN0IGVlVGVhbUFzc3VtZWRSb2xlQXJuID0gXFxgYXJuOmF3czpzdHM6OlxcJHthY2NvdW50TnVtYmVyfTphc3N1bWVkLXJvbGUvXFwke3Jlc291cmNlTmFtZX0vTWFzdGVyS2V5XFxgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdSZXNvbHZlZCBFRSBUZWFtIEFzc3VtZWQgUm9sZSBBUk46ICcgKyBlZVRlYW1Bc3N1bWVkUm9sZUFybik7XG5cbiAgICAgICAgY29uc3QgY2xvdWQ5ID0gbmV3IEFXUy5DbG91ZDkoKTtcblxuICAgICAgICBjb25zdCB7IG1lbWJlcnNoaXAgfSA9IGF3YWl0IGNsb3VkOS5jcmVhdGVFbnZpcm9ubWVudE1lbWJlcnNoaXAoe1xuICAgICAgICAgICAgZW52aXJvbm1lbnRJZCxcbiAgICAgICAgICAgIHBlcm1pc3Npb25zOiAncmVhZC13cml0ZScsXG4gICAgICAgICAgICB1c2VyQXJuOiBlZVRlYW1Bc3N1bWVkUm9sZUFybixcbiAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShtZW1iZXJzaGlwLCBudWxsLCA0KSk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKCdTZW5kaW5nIFNVQ0NFU1MgcmVzcG9uc2UnKTtcbiAgICBhd2FpdCByZXNwb25kKGV2ZW50LCBjb250ZXh0LCAnU1VDQ0VTUycsIHt9LCBlbnZpcm9ubWVudElkKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgYXdhaXQgcmVzcG9uZChldmVudCwgY29udGV4dCwgJ0ZBSUxFRCcsIHsgRXJyb3I6IGVycm9yIH0pO1xuICB9XG59O1xuICAgICAgICAgIGApLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICB9KTtcbiAgICB1cGRhdGVXb3Jrc3BhY2VNZW1iZXJzaGlwRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnY2xvdWQ5OmNyZWF0ZUVudmlyb25tZW50TWVtYmVyc2hpcCddLFxuICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgIH0pKTtcblxuICAgIC8vY29uc3QgbGVuZ3RoID0gd29ya3NwYWNlLmF0dHJOYW1lLmxlbmd0aDtcbiAgICAvL2NvbnN0IGVudklkID0gd29ya3NwYWNlLmF0dHJOYW1lLnN1YnN0cmluZyhsZW5ndGggLSAzMik7XG5cbiAgICBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdVcGRhdGVXb3Jrc3BhY2VNZW1iZXJzaGlwJywge1xuICAgICAgc2VydmljZVRva2VuOiB1cGRhdGVXb3Jrc3BhY2VNZW1iZXJzaGlwRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEVudmlyb25tZW50SWQ6IHdvcmtzcGFjZS5hdHRyQXJuLFxuICAgICAgICBFRVRlYW1Sb2xlQXJuOiB0ZWFtUm9sZUFybi52YWx1ZUFzU3RyaW5nXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBNb3N0IG9mIHRoZSByZXNvdXJjZXMgd2lsbCBiZSBwcm92aXNpb25lZCB2aWEgQ0RLLiBUbyBhY2NvbXBsaXNoIHRoaXMsXG4gICAgLy8gd2Ugd2lsbCBsZXZlcmFnZSBDb2RlQnVpbGQgYXMgdGhlIGV4ZWN1dGlvbiBlbmdpbmUgZm9yIGEgQ3VzdG9tIFJlc291cmNlLlxuICAgIGNvbnN0IGJ1aWxkUHJvamVjdFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0J1aWxkUHJvamVjdFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY29kZWJ1aWxkLmFtYXpvbmF3cy5jb20nKVxuICAgIH0pO1xuICAgIGNvbnN0IGJ1aWxkUHJvamVjdFBvbGljeSA9IG5ldyBpYW0uUG9saWN5KHRoaXMsICdCdWlsZFByb2plY3RQb2xpY3knLCB7XG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbJyonXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgICAgIH0pXG4gICAgICBdXG4gICAgfSk7XG4gICAgYnVpbGRQcm9qZWN0Um9sZS5hdHRhY2hJbmxpbmVQb2xpY3koYnVpbGRQcm9qZWN0UG9saWN5KTtcblxuICAgIGNvbnN0IGJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcm9sZTogYnVpbGRQcm9qZWN0Um9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuU1RBTkRBUkRfNV8wLFxuICAgICAgICBjb21wdXRlVHlwZTogY29kZWJ1aWxkLkNvbXB1dGVUeXBlLlNNQUxMLFxuICAgICAgfSxcbiAgICAgIHNvdXJjZTogY29kZWJ1aWxkLlNvdXJjZS5zMyh7XG4gICAgICAgIGJ1Y2tldDogYXNzZXRCdWNrZXQsXG4gICAgICAgIHBhdGg6IGAke2Fzc2V0UHJlZml4LnZhbHVlQXNTdHJpbmd9JHtzb3VyY2VaaXBGaWxlLnZhbHVlQXNTdHJpbmd9YFxuICAgICAgfSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg5MCksXG4gICAgfSk7XG5cblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZSBmdW5jdGlvbiB0byBzdGFydCBhIGJ1aWxkLiBUaGUgXCJhcHBsaWNhdGlvblwiIGJlaW5nIGJ1aWx0XG4gICAgLy8gZGVwbG95cyBvdXIgQ0RLIGFwcCwgc3BlY2lmaWNhbGx5IHRoZSBFS1MgQ2x1c3RlclN0YWNrLlxuICAgIGNvbnN0IHN0YXJ0QnVpbGRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0YXJ0QnVpbGRGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUocmVzcG9uZEZ1bmN0aW9uICsgYFxuY29uc3QgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuXG5leHBvcnRzLmhhbmRsZXIgPSBhc3luYyBmdW5jdGlvbiAoZXZlbnQsIGNvbnRleHQpIHtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDQpKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9qZWN0TmFtZSA9IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5Qcm9qZWN0TmFtZTtcbiAgICBjb25zdCBjb2RlYnVpbGQgPSBuZXcgQVdTLkNvZGVCdWlsZCgpO1xuXG4gICAgY29uc29sZS5sb2coXFxgU3RhcnRpbmcgbmV3IGJ1aWxkIG9mIHByb2plY3QgXFwke3Byb2plY3ROYW1lfVxcYCk7XG5cbiAgICBjb25zdCB7IGJ1aWxkIH0gPSBhd2FpdCBjb2RlYnVpbGQuc3RhcnRCdWlsZCh7XG4gICAgICBwcm9qZWN0TmFtZSxcbiAgICAgIC8vIFBhc3MgQ0ZOIHJlbGF0ZWQgcGFyYW1ldGVycyB0aHJvdWdoIHRoZSBidWlsZCBmb3IgZXh0cmFjdGlvbiBieSB0aGVcbiAgICAgIC8vIGNvbXBsZXRpb24gaGFuZGxlci5cbiAgICAgIGJ1aWxkc3BlY092ZXJyaWRlOiBldmVudC5SZXF1ZXN0VHlwZSA9PT0gJ0RlbGV0ZScgPyAnd29ya3Nob3Atc3RhY2svYnVpbGRzcGVjLWRlc3Ryb3kueW1sJyA6ICd3b3Jrc2hvcC1zdGFjay9idWlsZHNwZWMueW1sJyxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzT3ZlcnJpZGU6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdDRk5fUkVTUE9OU0VfVVJMJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuUmVzcG9uc2VVUkxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdDRk5fU1RBQ0tfSUQnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5TdGFja0lkXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQ0ZOX1JFUVVFU1RfSUQnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5SZXF1ZXN0SWRcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdDRk5fTE9HSUNBTF9SRVNPVVJDRV9JRCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LkxvZ2ljYWxSZXNvdXJjZUlkXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnVlBDX0lEJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLlZwY0lkXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQ0xPVUQ5X0VOVklST05NRU5UX0lEJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkNsb3VkOUVudmlyb25tZW50SWRcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdCVUlMRF9ST0xFX0FSTicsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5CdWlsZFJvbGVBcm5cbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pLnByb21pc2UoKTtcbiAgICBjb25zb2xlLmxvZyhcXGBCdWlsZCBpZCBcXCR7YnVpbGQuaWR9IHN0YXJ0ZWQgLSByZXNvdXJjZSBjb21wbGV0aW9uIGhhbmRsZWQgYnkgRXZlbnRCcmlkZ2VcXGApO1xuICB9IGNhdGNoKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgYXdhaXQgcmVzcG9uZChldmVudCwgY29udGV4dCwgJ0ZBSUxFRCcsIHsgRXJyb3I6IGVycm9yIH0pO1xuICB9XG59O1xuICAgICAgYCksXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpXG4gICAgfSk7XG4gICAgc3RhcnRCdWlsZEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2NvZGVidWlsZDpTdGFydEJ1aWxkJ10sXG4gICAgICByZXNvdXJjZXM6IFtidWlsZFByb2plY3QucHJvamVjdEFybl1cbiAgICB9KSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gdG8gZXhlY3V0ZSBvbmNlIENvZGVCdWlsZCBoYXMgZmluaXNoZWQgcHJvZHVjaW5nIGEgYnVpbGQuXG4gICAgLy8gVGhpcyB3aWxsIHNpZ25hbCBDbG91ZEZvcm1hdGlvbiB0aGF0IHRoZSBidWlsZCAoaS5lLiwgZGVwbG95aW5nIHRoZSBhY3R1YWxcbiAgICAvLyBFS1Mgc3RhY2spIGhhcyBjb21wbGV0ZWQuXG4gICAgY29uc3QgcmVwb3J0QnVpbGRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1JlcG9ydEJ1aWxkRnVuY3Rpb24nLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKHJlc3BvbmRGdW5jdGlvbiArIGBcbmNvbnN0IEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcblxuZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgZnVuY3Rpb24gKGV2ZW50LCBjb250ZXh0KSB7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCA0KSk7XG5cbiAgY29uc3QgcHJvamVjdE5hbWUgPSBldmVudFsnZGV0YWlsJ11bJ3Byb2plY3QtbmFtZSddO1xuXG4gIGNvbnN0IGNvZGVidWlsZCA9IG5ldyBBV1MuQ29kZUJ1aWxkKCk7XG5cbiAgY29uc3QgYnVpbGRJZCA9IGV2ZW50WydkZXRhaWwnXVsnYnVpbGQtaWQnXTtcbiAgY29uc3QgeyBidWlsZHMgfSA9IGF3YWl0IGNvZGVidWlsZC5iYXRjaEdldEJ1aWxkcyh7XG4gICAgaWRzOiBbIGJ1aWxkSWQgXVxuICB9KS5wcm9taXNlKCk7XG5cbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoYnVpbGRzLCBudWxsLCA0KSk7XG5cbiAgY29uc3QgYnVpbGQgPSBidWlsZHNbMF07XG4gIC8vIEZldGNoIHRoZSBDRk4gcmVzb3VyY2UgYW5kIHJlc3BvbnNlIHBhcmFtZXRlcnMgZnJvbSB0aGUgYnVpbGQgZW52aXJvbm1lbnQuXG4gIGNvbnN0IGVudmlyb25tZW50ID0ge307XG4gIGJ1aWxkLmVudmlyb25tZW50LmVudmlyb25tZW50VmFyaWFibGVzLmZvckVhY2goZSA9PiBlbnZpcm9ubWVudFtlLm5hbWVdID0gZS52YWx1ZSk7XG5cbiAgY29uc3QgcmVzcG9uc2UgPSB7XG4gICAgUmVzcG9uc2VVUkw6IGVudmlyb25tZW50LkNGTl9SRVNQT05TRV9VUkwsXG4gICAgU3RhY2tJZDogZW52aXJvbm1lbnQuQ0ZOX1NUQUNLX0lELFxuICAgIExvZ2ljYWxSZXNvdXJjZUlkOiBlbnZpcm9ubWVudC5DRk5fTE9HSUNBTF9SRVNPVVJDRV9JRCxcbiAgICBSZXF1ZXN0SWQ6IGVudmlyb25tZW50LkNGTl9SRVFVRVNUX0lEXG4gIH07XG5cbiAgaWYgKGV2ZW50WydkZXRhaWwnXVsnYnVpbGQtc3RhdHVzJ10gPT09ICdTVUNDRUVERUQnKSB7XG4gICAgYXdhaXQgcmVzcG9uZChyZXNwb25zZSwgY29udGV4dCwgJ1NVQ0NFU1MnLCB7fSwgJ2J1aWxkJyk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgcmVzcG9uZChyZXNwb25zZSwgY29udGV4dCwgJ0ZBSUxFRCcsIHsgRXJyb3I6ICdCdWlsZCBmYWlsZWQnIH0pO1xuICB9XG59O1xuICAgICAgYCksXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpXG4gICAgfSk7XG4gICAgcmVwb3J0QnVpbGRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnY29kZWJ1aWxkOkJhdGNoR2V0QnVpbGRzJyxcbiAgICAgICAgJ2NvZGVidWlsZDpMaXN0QnVpbGRzRm9yUHJvamVjdCdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtidWlsZFByb2plY3QucHJvamVjdEFybl1cbiAgICB9KSk7XG5cbiAgICAvLyBUcmlnZ2VyIHRoZSBDbG91ZEZvcm1hdGlvbiBub3RpZmljYXRpb24gZnVuY3Rpb24gdXBvbiBidWlsZCBjb21wbGV0aW9uLlxuICAgIGNvbnN0IGJ1aWxkQ29tcGxldGVSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdCdWlsZENvbXBsZXRlUnVsZScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnVpbGQgY29tcGxldGUnLFxuICAgICAgZXZlbnRQYXR0ZXJuOiB7XG4gICAgICAgIHNvdXJjZTogWydhd3MuY29kZWJ1aWxkJ10sXG4gICAgICAgIGRldGFpbFR5cGU6IFsnQ29kZUJ1aWxkIEJ1aWxkIFN0YXRlIENoYW5nZSddLFxuICAgICAgICBkZXRhaWw6IHtcbiAgICAgICAgICAnYnVpbGQtc3RhdHVzJzogWydTVUNDRUVERUQnLCAnRkFJTEVEJywgJ1NUT1BQRUQnXSxcbiAgICAgICAgICAncHJvamVjdC1uYW1lJzogW2J1aWxkUHJvamVjdC5wcm9qZWN0TmFtZV1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHRhcmdldHM6IFtcbiAgICAgICAgbmV3IExhbWJkYVRhcmdldChyZXBvcnRCdWlsZEZ1bmN0aW9uKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgY29uc3QgY2xvdWQ5RW52aXJvbm1lbnRBcm4gPSB3b3Jrc3BhY2UuYXR0ckFybjtcbiAgICBjb25zdCBjb21wb25lbnRzID0gY2RrLkFybi5zcGxpdChjbG91ZDlFbnZpcm9ubWVudEFybixjZGsuQXJuRm9ybWF0LkNPTE9OX1JFU09VUkNFX05BTUUpO1xuXG4gICAgLy8gS2ljayBvZmYgdGhlIGJ1aWxkIChDREsgZGVwbG95bWVudCkuXG4gICAgY29uc3QgY2x1c3RlclN0YWNrID0gbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnQ2x1c3RlclN0YWNrJywge1xuICAgICAgc2VydmljZVRva2VuOiBzdGFydEJ1aWxkRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIFByb2plY3ROYW1lOiBidWlsZFByb2plY3QucHJvamVjdE5hbWUsXG4gICAgICAgIFZwY0lkOiB2cGMudnBjSWQsXG4gICAgICAgIENsb3VkOUVudmlyb25tZW50SWQ6IGNvbXBvbmVudHMucmVzb3VyY2VOYW1lLFxuICAgICAgICBCdWlsZFJvbGVBcm46IGJ1aWxkUHJvamVjdFJvbGUucm9sZUFybixcbiAgICAgICAgWmlwRmlsZUNoZWNrc3VtOiBzb3VyY2VaaXBGaWxlQ2hlY2tzdW0udmFsdWVBc1N0cmluZyxcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjbHVzdGVyU3RhY2subm9kZS5hZGREZXBlbmRlbmN5KGJ1aWxkQ29tcGxldGVSdWxlLCBidWlsZFByb2plY3RQb2xpY3ksIHZwYyk7XG4gIH1cbn0iXX0=