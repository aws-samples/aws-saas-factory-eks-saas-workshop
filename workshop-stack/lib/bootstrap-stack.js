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
    console.log("EnvironmentId =====> + environmentId);

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYm9vdHN0cmFwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx1REFBdUQ7QUFDdkQseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxpREFBaUQ7QUFDakQsdUVBQWdGO0FBRWhGLHdFQUF3RTtBQUN4RSwyRUFBMkU7QUFDM0UsTUFBTSxlQUFlLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0E4Q3ZCLENBQUM7QUFNRixNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdFQUFnRTtRQUNoRSxnRUFBZ0U7UUFDaEUsZUFBZTtRQUNmLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDbkUsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbEUsT0FBTyxFQUFFLGlCQUFpQjtZQUMxQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELE9BQU8sRUFBRSxlQUFlO1lBQ3hCLElBQUksRUFBRSxRQUFRO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsa0VBQWtFO1FBQ2xFLG1FQUFtRTtRQUNu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WTtnQkFDNUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLE9BQU87Z0JBQ3RDLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxhQUFhO2FBQ3JEO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNGO0FBelRELHdDQXlUQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjbG91ZDkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkOSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgeyBMYW1iZGFGdW5jdGlvbiBhcyBMYW1iZGFUYXJnZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuXG4vLyBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIHRoZSBjZm5yZXNwb25zZSBKUyBtb2R1bGUgdGhhdCBpcyBwdWJsaXNoZWRcbi8vIGJ5IENsb3VkRm9ybWF0aW9uLiBJdCdzIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgbWFrZXMgY29kaW5nIG11Y2ggZWFzaWVyLlxuY29uc3QgcmVzcG9uZEZ1bmN0aW9uID0gYFxuY29uc3QgcmVzcG9uZCA9IGFzeW5jIGZ1bmN0aW9uKGV2ZW50LCBjb250ZXh0LCByZXNwb25zZVN0YXR1cywgcmVzcG9uc2VEYXRhLCBwaHlzaWNhbFJlc291cmNlSWQsIG5vRWNobykge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHZhciByZXNwb25zZUJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIFN0YXR1czogcmVzcG9uc2VTdGF0dXMsXG4gICAgICAgIFJlYXNvbjogXCJTZWUgdGhlIGRldGFpbHMgaW4gQ2xvdWRXYXRjaCBMb2cgU3RyZWFtOiBcIiArIGNvbnRleHQubG9nR3JvdXBOYW1lICsgXCIgXCIgKyBjb250ZXh0LmxvZ1N0cmVhbU5hbWUsXG4gICAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogcGh5c2ljYWxSZXNvdXJjZUlkIHx8IGNvbnRleHQubG9nU3RyZWFtTmFtZSxcbiAgICAgICAgU3RhY2tJZDogZXZlbnQuU3RhY2tJZCxcbiAgICAgICAgUmVxdWVzdElkOiBldmVudC5SZXF1ZXN0SWQsXG4gICAgICAgIExvZ2ljYWxSZXNvdXJjZUlkOiBldmVudC5Mb2dpY2FsUmVzb3VyY2VJZCxcbiAgICAgICAgTm9FY2hvOiBub0VjaG8gfHwgZmFsc2UsXG4gICAgICAgIERhdGE6IHJlc3BvbnNlRGF0YVxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coXCJSZXNwb25zZSBib2R5OlxcXFxuXCIsIHJlc3BvbnNlQm9keSk7XG5cbiAgICB2YXIgaHR0cHMgPSByZXF1aXJlKFwiaHR0cHNcIik7XG4gICAgdmFyIHVybCA9IHJlcXVpcmUoXCJ1cmxcIik7XG5cbiAgICB2YXIgcGFyc2VkVXJsID0gdXJsLnBhcnNlKGV2ZW50LlJlc3BvbnNlVVJMKTtcbiAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICAgICAgcG9ydDogNDQzLFxuICAgICAgICBwYXRoOiBwYXJzZWRVcmwucGF0aCxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBcImNvbnRlbnQtdHlwZVwiOiBcIlwiLFxuICAgICAgICAgICAgXCJjb250ZW50LWxlbmd0aFwiOiByZXNwb25zZUJvZHkubGVuZ3RoXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHJlcXVlc3QgPSBodHRwcy5yZXF1ZXN0KG9wdGlvbnMsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhdHVzIGNvZGU6IFwiICsgcmVzcG9uc2Uuc3RhdHVzQ29kZSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhdHVzIG1lc3NhZ2U6IFwiICsgcmVzcG9uc2Uuc3RhdHVzTWVzc2FnZSk7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICB9KTtcblxuICAgIHJlcXVlc3Qub24oXCJlcnJvclwiLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgICBjb25zb2xlLmxvZyhcInJlc3BvbmQoLi4pIGZhaWxlZCBleGVjdXRpbmcgaHR0cHMucmVxdWVzdCguLik6IFwiICsgZXJyb3IpO1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgfSk7XG5cbiAgICByZXF1ZXN0LndyaXRlKHJlc3BvbnNlQm9keSk7XG4gICAgcmVxdWVzdC5lbmQoKTtcbiAgfSk7XG59O1xuYDtcbmV4cG9ydCBpbnRlcmZhY2UgQm9vdHN0cmFwU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc291cmNlWmlwRmlsZTogc3RyaW5nXG4gIHNvdXJjZVppcEZpbGVDaGVja3N1bTogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBCb290c3RyYXBTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBCb290c3RyYXBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBUaGVzZSBwYXJhbWV0ZXJzIGFwcGVhciB0byBiZSBzdXBwbGllZCBieSBFdmVudCBFbmdpbmUuIFdlJ2xsXG4gICAgLy8gdGFrZSBhZHZhbnRhZ2Ugb2YgdGhlbSB0byBsb2NhdGUgdGhlIFppcCBmaWxlIGNvbnRhaW5pbmcgdGhpc1xuICAgIC8vIHNvdXJjZSBjb2RlLlxuICAgIGNvbnN0IGFzc2V0QnVja2V0TmFtZSA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0J1Y2tldCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdCdWNrZXROYW1lTm90U2V0JyxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldFByZWZpeCA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0tleVByZWZpeCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdLZXlQcmVmaXhOb3RTZXQnLFxuICAgICAgdHlwZTogJ1N0cmluZydcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlYW1Sb2xlQXJuID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ0VFVGVhbVJvbGVBcm4nLCB7XG4gICAgICBkZWZhdWx0OiAnUm9sZUFybk5vdFNldCcsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgLy8gV2Ugc3VwcGx5IHRoZSB2YWx1ZSBvZiB0aGlzIHBhcmFtZXRlciBvdXJzZWx2ZXMgdmlhIHRoZSBaSVBGSUxFXG4gICAgLy8gZW52aXJvbm1lbnQgdmFyaWFibGUuIEl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW5kZXJlZCBpbnRvIHRoZVxuICAgIC8vIGdlbmVyYXRlZCBZQU1MIHRlbXBsYXRlLlxuICAgIGNvbnN0IHNvdXJjZVppcEZpbGUgPSBuZXcgY2RrLkNmblBhcmFtZXRlcih0aGlzLCAnU291cmNlWmlwRmlsZScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGUsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc291cmNlWmlwRmlsZUNoZWNrc3VtID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ1NvdXJjZVppcEZpbGVDaGVja3N1bScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGVDaGVja3N1bSxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldEJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnU291cmNlQnVja2V0JywgYXNzZXRCdWNrZXROYW1lLnZhbHVlQXNTdHJpbmcpO1xuXG4gICAgLy8gV2UgbmVlZCB0byBjcmVhdGUgdGhlIENsb3VkOSBlbnZpcm9ubWVudCBoZXJlLCBpbnN0ZWFkIG9mIGluIHRoZSBjbHVzdGVyIHN0YWNrXG4gICAgLy8gY3JlYXRlZCBpbiBDb2RlQnVpbGQsIHNvIHRoYXQgdGhlIHN0YWNrIGNyZWF0b3IgY2FuIGFjY2VzcyB0aGUgZW52aXJvbm1lbnQuXG4gICAgLy8gKENvZGVCdWlsZCBidWlsZHMgcGVyZm9ybSBpbiBhIGRpZmZlcmVudCByb2xlIGNvbnRleHQsIHdoaWNoIG1ha2VzIHRoZVxuICAgIC8vIGVudmlyb25tZW50IGluYWNjZXNzaWJsZS4pXG4gICAgLy9cbiAgICAvLyBGaXJzdCwgd2UgbmVlZCBhIFZQQyB0byBwdXQgaXQgaW4uXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1ZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIGNpZHI6ICcxMC4wLjAuMC8xNicsXG4gICAgICBuYXRHYXRld2F5czogMSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfTkFULFxuICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIFNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vZWtzL2xhdGVzdC91c2VyZ3VpZGUvbmV0d29yay1sb2FkLWJhbGFuY2luZy5odG1sXG4gICAgdnBjLnByaXZhdGVTdWJuZXRzLmZvckVhY2goc3VibmV0ID0+IGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdrdWJlcm5ldGVzLmlvL3JvbGUvaW50ZXJuYWwtZWxiJywgJzEnKSk7XG4gICAgdnBjLnB1YmxpY1N1Ym5ldHMuZm9yRWFjaChzdWJuZXQgPT4gY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9lbGInLCAnMScpKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgQ2xvdWQ5IEVudmlyb25tZW50LlxuICAgIGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBjbG91ZDkuQ2ZuRW52aXJvbm1lbnRFQzIodGhpcywgJ1dvcmtzcGFjZScsIHtcbiAgICAgIG5hbWU6ICdla3Mtc2Fhcy13b3Jrc2hvcCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VLUyBTYWFTIFdvcmtzaG9wJyxcbiAgICAgIGluc3RhbmNlVHlwZTogJ201LmxhcmdlJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXBGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXBGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUocmVzcG9uZEZ1bmN0aW9uICsgYFxuZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgZnVuY3Rpb24gKGV2ZW50LCBjb250ZXh0KSB7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCA0KSk7XG4gIGNvbnN0IEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcblxuICB0cnkge1xuXG4gICAgY29uc3QgZW52aXJvbm1lbnRBcm4gPSBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuRW52aXJvbm1lbnRJZDtcbiAgICBjb25zdCBhcm5TcGxpdCA9IGVudmlyb25tZW50QXJuLnNwbGl0KCc6Jyk7XG4gICAgY29uc3QgZW52aXJvbm1lbnRJZCA9IGFyblNwbGl0WzZdO1xuICAgIGNvbnNvbGUubG9nKFwiRW52aXJvbm1lbnRJZCA9PT09PT4gKyBlbnZpcm9ubWVudElkKTtcblxuICAgIGlmIChldmVudC5SZXF1ZXN0VHlwZSA9PT0gXCJDcmVhdGVcIiB8fCBldmVudC5SZXF1ZXN0VHlwZSA9PT0gXCJVcGRhdGVcIikge1xuICAgICAgY29uc3QgZWVUZWFtUm9sZUFybiA9IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5FRVRlYW1Sb2xlQXJuO1xuXG4gICAgICBpZiAoISFlZVRlYW1Sb2xlQXJuICYmIGVlVGVhbVJvbGVBcm4gIT09ICdSb2xlQXJuTm90U2V0Jykge1xuICAgICAgICBjb25zdCBhcm5TcGxpdCA9IGVlVGVhbVJvbGVBcm4uc3BsaXQoJzonKTtcbiAgICAgICAgY29uc3QgYWNjb3VudE51bWJlciA9IGFyblNwbGl0WzRdO1xuICAgICAgICBjb25zdCByZXNvdXJjZU5hbWUgPSBhcm5TcGxpdFs1XS5zcGxpdCgnLycpWzFdO1xuICAgICAgICBjb25zdCBlZVRlYW1Bc3N1bWVkUm9sZUFybiA9IFxcYGFybjphd3M6c3RzOjpcXCR7YWNjb3VudE51bWJlcn06YXNzdW1lZC1yb2xlL1xcJHtyZXNvdXJjZU5hbWV9L01hc3RlcktleVxcYDtcblxuICAgICAgICBjb25zb2xlLmxvZygnUmVzb2x2ZWQgRUUgVGVhbSBBc3N1bWVkIFJvbGUgQVJOOiAnICsgZWVUZWFtQXNzdW1lZFJvbGVBcm4pO1xuXG4gICAgICAgIGNvbnN0IGNsb3VkOSA9IG5ldyBBV1MuQ2xvdWQ5KCk7XG5cbiAgICAgICAgY29uc3QgeyBtZW1iZXJzaGlwIH0gPSBhd2FpdCBjbG91ZDkuY3JlYXRlRW52aXJvbm1lbnRNZW1iZXJzaGlwKHtcbiAgICAgICAgICAgIGVudmlyb25tZW50SWQsXG4gICAgICAgICAgICBwZXJtaXNzaW9uczogJ3JlYWQtd3JpdGUnLFxuICAgICAgICAgICAgdXNlckFybjogZWVUZWFtQXNzdW1lZFJvbGVBcm4sXG4gICAgICAgIH0pLnByb21pc2UoKTtcbiAgICAgICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkobWVtYmVyc2hpcCwgbnVsbCwgNCkpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLmxvZygnU2VuZGluZyBTVUNDRVNTIHJlc3BvbnNlJyk7XG4gICAgYXdhaXQgcmVzcG9uZChldmVudCwgY29udGV4dCwgJ1NVQ0NFU1MnLCB7fSwgZW52aXJvbm1lbnRJZCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIGF3YWl0IHJlc3BvbmQoZXZlbnQsIGNvbnRleHQsICdGQUlMRUQnLCB7IEVycm9yOiBlcnJvciB9KTtcbiAgfVxufTtcbiAgICAgICAgICBgKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgfSk7XG4gICAgdXBkYXRlV29ya3NwYWNlTWVtYmVyc2hpcEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2Nsb3VkOTpjcmVhdGVFbnZpcm9ubWVudE1lbWJlcnNoaXAnXSxcbiAgICAgIHJlc291cmNlczogWycqJ11cbiAgICB9KSk7XG5cbiAgICAvL2NvbnN0IGxlbmd0aCA9IHdvcmtzcGFjZS5hdHRyTmFtZS5sZW5ndGg7XG4gICAgLy9jb25zdCBlbnZJZCA9IHdvcmtzcGFjZS5hdHRyTmFtZS5zdWJzdHJpbmcobGVuZ3RoIC0gMzIpO1xuXG4gICAgbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnVXBkYXRlV29ya3NwYWNlTWVtYmVyc2hpcCcsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogdXBkYXRlV29ya3NwYWNlTWVtYmVyc2hpcEZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBFbnZpcm9ubWVudElkOiB3b3Jrc3BhY2UuYXR0ckFybixcbiAgICAgICAgRUVUZWFtUm9sZUFybjogdGVhbVJvbGVBcm4udmFsdWVBc1N0cmluZ1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTW9zdCBvZiB0aGUgcmVzb3VyY2VzIHdpbGwgYmUgcHJvdmlzaW9uZWQgdmlhIENESy4gVG8gYWNjb21wbGlzaCB0aGlzLFxuICAgIC8vIHdlIHdpbGwgbGV2ZXJhZ2UgQ29kZUJ1aWxkIGFzIHRoZSBleGVjdXRpb24gZW5naW5lIGZvciBhIEN1c3RvbSBSZXNvdXJjZS5cbiAgICBjb25zdCBidWlsZFByb2plY3RSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdCdWlsZFByb2plY3RSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZGVidWlsZC5hbWF6b25hd3MuY29tJylcbiAgICB9KTtcbiAgICBjb25zdCBidWlsZFByb2plY3RQb2xpY3kgPSBuZXcgaWFtLlBvbGljeSh0aGlzLCAnQnVpbGRQcm9qZWN0UG9saWN5Jywge1xuICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogWycqJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KVxuICAgICAgXVxuICAgIH0pO1xuICAgIGJ1aWxkUHJvamVjdFJvbGUuYXR0YWNoSW5saW5lUG9saWN5KGJ1aWxkUHJvamVjdFBvbGljeSk7XG5cbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlByb2plY3QodGhpcywgJ0J1aWxkUHJvamVjdCcsIHtcbiAgICAgIHJvbGU6IGJ1aWxkUHJvamVjdFJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzVfMCxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTCxcbiAgICAgIH0sXG4gICAgICBzb3VyY2U6IGNvZGVidWlsZC5Tb3VyY2UuczMoe1xuICAgICAgICBidWNrZXQ6IGFzc2V0QnVja2V0LFxuICAgICAgICBwYXRoOiBgJHthc3NldFByZWZpeC52YWx1ZUFzU3RyaW5nfSR7c291cmNlWmlwRmlsZS52YWx1ZUFzU3RyaW5nfWBcbiAgICAgIH0pLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoOTApLFxuICAgIH0pO1xuXG5cbiAgICAvLyBDdXN0b20gcmVzb3VyY2UgZnVuY3Rpb24gdG8gc3RhcnQgYSBidWlsZC4gVGhlIFwiYXBwbGljYXRpb25cIiBiZWluZyBidWlsdFxuICAgIC8vIGRlcGxveXMgb3VyIENESyBhcHAsIHNwZWNpZmljYWxseSB0aGUgRUtTIENsdXN0ZXJTdGFjay5cbiAgICBjb25zdCBzdGFydEJ1aWxkRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTdGFydEJ1aWxkRnVuY3Rpb24nLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKHJlc3BvbmRGdW5jdGlvbiArIGBcbmNvbnN0IEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcblxuZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgZnVuY3Rpb24gKGV2ZW50LCBjb250ZXh0KSB7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCA0KSk7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvamVjdE5hbWUgPSBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuUHJvamVjdE5hbWU7XG4gICAgY29uc3QgY29kZWJ1aWxkID0gbmV3IEFXUy5Db2RlQnVpbGQoKTtcblxuICAgIGNvbnNvbGUubG9nKFxcYFN0YXJ0aW5nIG5ldyBidWlsZCBvZiBwcm9qZWN0IFxcJHtwcm9qZWN0TmFtZX1cXGApO1xuXG4gICAgY29uc3QgeyBidWlsZCB9ID0gYXdhaXQgY29kZWJ1aWxkLnN0YXJ0QnVpbGQoe1xuICAgICAgcHJvamVjdE5hbWUsXG4gICAgICAvLyBQYXNzIENGTiByZWxhdGVkIHBhcmFtZXRlcnMgdGhyb3VnaCB0aGUgYnVpbGQgZm9yIGV4dHJhY3Rpb24gYnkgdGhlXG4gICAgICAvLyBjb21wbGV0aW9uIGhhbmRsZXIuXG4gICAgICBidWlsZHNwZWNPdmVycmlkZTogZXZlbnQuUmVxdWVzdFR5cGUgPT09ICdEZWxldGUnID8gJ3dvcmtzaG9wLXN0YWNrL2J1aWxkc3BlYy1kZXN0cm95LnltbCcgOiAnd29ya3Nob3Atc3RhY2svYnVpbGRzcGVjLnltbCcsXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlc092ZXJyaWRlOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQ0ZOX1JFU1BPTlNFX1VSTCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlJlc3BvbnNlVVJMXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQ0ZOX1NUQUNLX0lEJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuU3RhY2tJZFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0NGTl9SRVFVRVNUX0lEJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuUmVxdWVzdElkXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQ0ZOX0xPR0lDQUxfUkVTT1VSQ0VfSUQnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5Mb2dpY2FsUmVzb3VyY2VJZFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ1ZQQ19JRCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5WcGNJZFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0NMT1VEOV9FTlZJUk9OTUVOVF9JRCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5DbG91ZDlFbnZpcm9ubWVudElkXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQlVJTERfUk9MRV9BUk4nLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuQnVpbGRSb2xlQXJuXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KS5wcm9taXNlKCk7XG4gICAgY29uc29sZS5sb2coXFxgQnVpbGQgaWQgXFwke2J1aWxkLmlkfSBzdGFydGVkIC0gcmVzb3VyY2UgY29tcGxldGlvbiBoYW5kbGVkIGJ5IEV2ZW50QnJpZGdlXFxgKTtcbiAgfSBjYXRjaChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgIGF3YWl0IHJlc3BvbmQoZXZlbnQsIGNvbnRleHQsICdGQUlMRUQnLCB7IEVycm9yOiBlcnJvciB9KTtcbiAgfVxufTtcbiAgICAgIGApLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKVxuICAgIH0pO1xuICAgIHN0YXJ0QnVpbGRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydjb2RlYnVpbGQ6U3RhcnRCdWlsZCddLFxuICAgICAgcmVzb3VyY2VzOiBbYnVpbGRQcm9qZWN0LnByb2plY3RBcm5dXG4gICAgfSkpO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHRvIGV4ZWN1dGUgb25jZSBDb2RlQnVpbGQgaGFzIGZpbmlzaGVkIHByb2R1Y2luZyBhIGJ1aWxkLlxuICAgIC8vIFRoaXMgd2lsbCBzaWduYWwgQ2xvdWRGb3JtYXRpb24gdGhhdCB0aGUgYnVpbGQgKGkuZS4sIGRlcGxveWluZyB0aGUgYWN0dWFsXG4gICAgLy8gRUtTIHN0YWNrKSBoYXMgY29tcGxldGVkLlxuICAgIGNvbnN0IHJlcG9ydEJ1aWxkRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSZXBvcnRCdWlsZEZ1bmN0aW9uJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShyZXNwb25kRnVuY3Rpb24gKyBgXG5jb25zdCBBV1MgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XG5cbmV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIGZ1bmN0aW9uIChldmVudCwgY29udGV4dCkge1xuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgNCkpO1xuXG4gIGNvbnN0IHByb2plY3ROYW1lID0gZXZlbnRbJ2RldGFpbCddWydwcm9qZWN0LW5hbWUnXTtcblxuICBjb25zdCBjb2RlYnVpbGQgPSBuZXcgQVdTLkNvZGVCdWlsZCgpO1xuXG4gIGNvbnN0IGJ1aWxkSWQgPSBldmVudFsnZGV0YWlsJ11bJ2J1aWxkLWlkJ107XG4gIGNvbnN0IHsgYnVpbGRzIH0gPSBhd2FpdCBjb2RlYnVpbGQuYmF0Y2hHZXRCdWlsZHMoe1xuICAgIGlkczogWyBidWlsZElkIF1cbiAgfSkucHJvbWlzZSgpO1xuXG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGJ1aWxkcywgbnVsbCwgNCkpO1xuXG4gIGNvbnN0IGJ1aWxkID0gYnVpbGRzWzBdO1xuICAvLyBGZXRjaCB0aGUgQ0ZOIHJlc291cmNlIGFuZCByZXNwb25zZSBwYXJhbWV0ZXJzIGZyb20gdGhlIGJ1aWxkIGVudmlyb25tZW50LlxuICBjb25zdCBlbnZpcm9ubWVudCA9IHt9O1xuICBidWlsZC5lbnZpcm9ubWVudC5lbnZpcm9ubWVudFZhcmlhYmxlcy5mb3JFYWNoKGUgPT4gZW52aXJvbm1lbnRbZS5uYW1lXSA9IGUudmFsdWUpO1xuXG4gIGNvbnN0IHJlc3BvbnNlID0ge1xuICAgIFJlc3BvbnNlVVJMOiBlbnZpcm9ubWVudC5DRk5fUkVTUE9OU0VfVVJMLFxuICAgIFN0YWNrSWQ6IGVudmlyb25tZW50LkNGTl9TVEFDS19JRCxcbiAgICBMb2dpY2FsUmVzb3VyY2VJZDogZW52aXJvbm1lbnQuQ0ZOX0xPR0lDQUxfUkVTT1VSQ0VfSUQsXG4gICAgUmVxdWVzdElkOiBlbnZpcm9ubWVudC5DRk5fUkVRVUVTVF9JRFxuICB9O1xuXG4gIGlmIChldmVudFsnZGV0YWlsJ11bJ2J1aWxkLXN0YXR1cyddID09PSAnU1VDQ0VFREVEJykge1xuICAgIGF3YWl0IHJlc3BvbmQocmVzcG9uc2UsIGNvbnRleHQsICdTVUNDRVNTJywge30sICdidWlsZCcpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IHJlc3BvbmQocmVzcG9uc2UsIGNvbnRleHQsICdGQUlMRUQnLCB7IEVycm9yOiAnQnVpbGQgZmFpbGVkJyB9KTtcbiAgfVxufTtcbiAgICAgIGApLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKVxuICAgIH0pO1xuICAgIHJlcG9ydEJ1aWxkRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcycsXG4gICAgICAgICdjb2RlYnVpbGQ6TGlzdEJ1aWxkc0ZvclByb2plY3QnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYnVpbGRQcm9qZWN0LnByb2plY3RBcm5dXG4gICAgfSkpO1xuXG4gICAgLy8gVHJpZ2dlciB0aGUgQ2xvdWRGb3JtYXRpb24gbm90aWZpY2F0aW9uIGZ1bmN0aW9uIHVwb24gYnVpbGQgY29tcGxldGlvbi5cbiAgICBjb25zdCBidWlsZENvbXBsZXRlUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnQnVpbGRDb21wbGV0ZVJ1bGUnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0J1aWxkIGNvbXBsZXRlJyxcbiAgICAgIGV2ZW50UGF0dGVybjoge1xuICAgICAgICBzb3VyY2U6IFsnYXdzLmNvZGVidWlsZCddLFxuICAgICAgICBkZXRhaWxUeXBlOiBbJ0NvZGVCdWlsZCBCdWlsZCBTdGF0ZSBDaGFuZ2UnXSxcbiAgICAgICAgZGV0YWlsOiB7XG4gICAgICAgICAgJ2J1aWxkLXN0YXR1cyc6IFsnU1VDQ0VFREVEJywgJ0ZBSUxFRCcsICdTVE9QUEVEJ10sXG4gICAgICAgICAgJ3Byb2plY3QtbmFtZSc6IFtidWlsZFByb2plY3QucHJvamVjdE5hbWVdXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICB0YXJnZXRzOiBbXG4gICAgICAgIG5ldyBMYW1iZGFUYXJnZXQocmVwb3J0QnVpbGRGdW5jdGlvbilcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIGNvbnN0IGNsb3VkOUVudmlyb25tZW50QXJuID0gd29ya3NwYWNlLmF0dHJBcm47XG4gICAgY29uc3QgY29tcG9uZW50cyA9IGNkay5Bcm4uc3BsaXQoY2xvdWQ5RW52aXJvbm1lbnRBcm4sY2RrLkFybkZvcm1hdC5DT0xPTl9SRVNPVVJDRV9OQU1FKTtcblxuICAgIC8vIEtpY2sgb2ZmIHRoZSBidWlsZCAoQ0RLIGRlcGxveW1lbnQpLlxuICAgIGNvbnN0IGNsdXN0ZXJTdGFjayA9IG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0NsdXN0ZXJTdGFjaycsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogc3RhcnRCdWlsZEZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBQcm9qZWN0TmFtZTogYnVpbGRQcm9qZWN0LnByb2plY3ROYW1lLFxuICAgICAgICBWcGNJZDogdnBjLnZwY0lkLFxuICAgICAgICBDbG91ZDlFbnZpcm9ubWVudElkOiBjb21wb25lbnRzLnJlc291cmNlTmFtZSxcbiAgICAgICAgQnVpbGRSb2xlQXJuOiBidWlsZFByb2plY3RSb2xlLnJvbGVBcm4sXG4gICAgICAgIFppcEZpbGVDaGVja3N1bTogc291cmNlWmlwRmlsZUNoZWNrc3VtLnZhbHVlQXNTdHJpbmcsXG4gICAgICB9XG4gICAgfSk7XG4gICAgY2x1c3RlclN0YWNrLm5vZGUuYWRkRGVwZW5kZW5jeShidWlsZENvbXBsZXRlUnVsZSwgYnVpbGRQcm9qZWN0UG9saWN5LCB2cGMpO1xuICB9XG59Il19