"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootstrapStack = void 0;
const cdk = require("@aws-cdk/core");
const codebuild = require("@aws-cdk/aws-codebuild");
const s3 = require("@aws-cdk/aws-s3");
const iam = require("@aws-cdk/aws-iam");
const cloud9 = require("@aws-cdk/aws-cloud9");
const ec2 = require("@aws-cdk/aws-ec2");
const lambda = require("@aws-cdk/aws-lambda");
const events = require("@aws-cdk/aws-events");
const aws_events_targets_1 = require("@aws-cdk/aws-events-targets");
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
        const workspace = new cloud9.Ec2Environment(this, 'Workspace', {
            vpc: vpc,
            ec2EnvironmentName: 'eks-saas-workshop',
            description: 'EKS SaaS Workshop',
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
            subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
        });
        const updateWorkspaceMembershipFunction = new lambda.Function(this, 'UpdateWorkspaceMembershipFunction', {
            code: lambda.Code.fromInline(respondFunction + `
exports.handler = async function (event, context) {
  console.log(JSON.stringify(event, null, 4));
  const AWS = require('aws-sdk');

  try {
    const environmentId = event.ResourceProperties.EnvironmentId;

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
        new cdk.CustomResource(this, 'UpdateWorkspaceMembership', {
            serviceToken: updateWorkspaceMembershipFunction.functionArn,
            properties: {
                EnvironmentId: workspace.environmentId,
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
        // Kick off the build (CDK deployment).
        const clusterStack = new cdk.CustomResource(this, 'ClusterStack', {
            serviceToken: startBuildFunction.functionArn,
            properties: {
                ProjectName: buildProject.projectName,
                VpcId: vpc.vpcId,
                Cloud9EnvironmentId: workspace.environmentId,
                BuildRoleArn: buildProjectRole.roleArn,
                ZipFileChecksum: sourceZipFileChecksum.valueAsString,
            }
        });
        clusterStack.node.addDependency(buildCompleteRule, buildProjectPolicy, vpc);
    }
}
exports.BootstrapStack = BootstrapStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYm9vdHN0cmFwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFDQUFxQztBQUNyQyxvREFBb0Q7QUFDcEQsc0NBQXNDO0FBQ3RDLHdDQUF3QztBQUN4Qyw4Q0FBOEM7QUFDOUMsd0NBQXdDO0FBQ3hDLDhDQUE4QztBQUM5Qyw4Q0FBOEM7QUFDOUMsb0VBQTZFO0FBRTdFLHdFQUF3RTtBQUN4RSwyRUFBMkU7QUFDM0UsTUFBTSxlQUFlLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0E4Q3ZCLENBQUM7QUFNRixNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQW9CLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ3RFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdFQUFnRTtRQUNoRSxnRUFBZ0U7UUFDaEUsZUFBZTtRQUNmLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDbkUsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbEUsT0FBTyxFQUFFLGlCQUFpQjtZQUMxQixJQUFJLEVBQUUsUUFBUTtTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELE9BQU8sRUFBRSxlQUFlO1lBQ3hCLElBQUksRUFBRSxRQUFRO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsa0VBQWtFO1FBQ2xFLG1FQUFtRTtRQUNu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QyxZQUFZLEVBQUUsZ0JBQWdCLENBQUMsT0FBTztnQkFDdEMsZUFBZSxFQUFFLHFCQUFxQixDQUFDLGFBQWE7YUFDckQ7U0FDRixDQUFDLENBQUM7UUFDSCxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM5RSxDQUFDO0NBQ0Y7QUFqVEQsd0NBaVRDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnQGF3cy1jZGsvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdAYXdzLWNkay9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNsb3VkOSBmcm9tICdAYXdzLWNkay9hd3MtY2xvdWQ5JztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdAYXdzLWNkay9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdAYXdzLWNkay9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdAYXdzLWNkay9hd3MtZXZlbnRzJztcbmltcG9ydCB7IExhbWJkYUZ1bmN0aW9uIGFzIExhbWJkYVRhcmdldCB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5cbi8vIFRoaXMgZnVuY3Rpb24gaXMgYmFzZWQgb24gdGhlIGNmbnJlc3BvbnNlIEpTIG1vZHVsZSB0aGF0IGlzIHB1Ymxpc2hlZFxuLy8gYnkgQ2xvdWRGb3JtYXRpb24uIEl0J3MgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBtYWtlcyBjb2RpbmcgbXVjaCBlYXNpZXIuXG5jb25zdCByZXNwb25kRnVuY3Rpb24gPSBgXG5jb25zdCByZXNwb25kID0gYXN5bmMgZnVuY3Rpb24oZXZlbnQsIGNvbnRleHQsIHJlc3BvbnNlU3RhdHVzLCByZXNwb25zZURhdGEsIHBoeXNpY2FsUmVzb3VyY2VJZCwgbm9FY2hvKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgdmFyIHJlc3BvbnNlQm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgU3RhdHVzOiByZXNwb25zZVN0YXR1cyxcbiAgICAgICAgUmVhc29uOiBcIlNlZSB0aGUgZGV0YWlscyBpbiBDbG91ZFdhdGNoIExvZyBTdHJlYW06IFwiICsgY29udGV4dC5sb2dHcm91cE5hbWUgKyBcIiBcIiArIGNvbnRleHQubG9nU3RyZWFtTmFtZSxcbiAgICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiBwaHlzaWNhbFJlc291cmNlSWQgfHwgY29udGV4dC5sb2dTdHJlYW1OYW1lLFxuICAgICAgICBTdGFja0lkOiBldmVudC5TdGFja0lkLFxuICAgICAgICBSZXF1ZXN0SWQ6IGV2ZW50LlJlcXVlc3RJZCxcbiAgICAgICAgTG9naWNhbFJlc291cmNlSWQ6IGV2ZW50LkxvZ2ljYWxSZXNvdXJjZUlkLFxuICAgICAgICBOb0VjaG86IG5vRWNobyB8fCBmYWxzZSxcbiAgICAgICAgRGF0YTogcmVzcG9uc2VEYXRhXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhcIlJlc3BvbnNlIGJvZHk6XFxcXG5cIiwgcmVzcG9uc2VCb2R5KTtcblxuICAgIHZhciBodHRwcyA9IHJlcXVpcmUoXCJodHRwc1wiKTtcbiAgICB2YXIgdXJsID0gcmVxdWlyZShcInVybFwiKTtcblxuICAgIHZhciBwYXJzZWRVcmwgPSB1cmwucGFyc2UoZXZlbnQuUmVzcG9uc2VVUkwpO1xuICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICBob3N0bmFtZTogcGFyc2VkVXJsLmhvc3RuYW1lLFxuICAgICAgICBwb3J0OiA0NDMsXG4gICAgICAgIHBhdGg6IHBhcnNlZFVybC5wYXRoLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIFwiY29udGVudC10eXBlXCI6IFwiXCIsXG4gICAgICAgICAgICBcImNvbnRlbnQtbGVuZ3RoXCI6IHJlc3BvbnNlQm9keS5sZW5ndGhcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgcmVxdWVzdCA9IGh0dHBzLnJlcXVlc3Qob3B0aW9ucywgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJTdGF0dXMgY29kZTogXCIgKyByZXNwb25zZS5zdGF0dXNDb2RlKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJTdGF0dXMgbWVzc2FnZTogXCIgKyByZXNwb25zZS5zdGF0dXNNZXNzYWdlKTtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgIH0pO1xuXG4gICAgcmVxdWVzdC5vbihcImVycm9yXCIsIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwicmVzcG9uZCguLikgZmFpbGVkIGV4ZWN1dGluZyBodHRwcy5yZXF1ZXN0KC4uKTogXCIgKyBlcnJvcik7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICB9KTtcblxuICAgIHJlcXVlc3Qud3JpdGUocmVzcG9uc2VCb2R5KTtcbiAgICByZXF1ZXN0LmVuZCgpO1xuICB9KTtcbn07XG5gO1xuZXhwb3J0IGludGVyZmFjZSBCb290c3RyYXBTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzb3VyY2VaaXBGaWxlOiBzdHJpbmdcbiAgc291cmNlWmlwRmlsZUNoZWNrc3VtOiBzdHJpbmdcbn1cblxuZXhwb3J0IGNsYXNzIEJvb3RzdHJhcFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBCb290c3RyYXBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBUaGVzZSBwYXJhbWV0ZXJzIGFwcGVhciB0byBiZSBzdXBwbGllZCBieSBFdmVudCBFbmdpbmUuIFdlJ2xsXG4gICAgLy8gdGFrZSBhZHZhbnRhZ2Ugb2YgdGhlbSB0byBsb2NhdGUgdGhlIFppcCBmaWxlIGNvbnRhaW5pbmcgdGhpc1xuICAgIC8vIHNvdXJjZSBjb2RlLlxuICAgIGNvbnN0IGFzc2V0QnVja2V0TmFtZSA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0J1Y2tldCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdCdWNrZXROYW1lTm90U2V0JyxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldFByZWZpeCA9IG5ldyBjZGsuQ2ZuUGFyYW1ldGVyKHRoaXMsICdFRUFzc2V0c0tleVByZWZpeCcsIHtcbiAgICAgIGRlZmF1bHQ6ICdLZXlQcmVmaXhOb3RTZXQnLFxuICAgICAgdHlwZTogJ1N0cmluZydcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlYW1Sb2xlQXJuID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ0VFVGVhbVJvbGVBcm4nLCB7XG4gICAgICBkZWZhdWx0OiAnUm9sZUFybk5vdFNldCcsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgLy8gV2Ugc3VwcGx5IHRoZSB2YWx1ZSBvZiB0aGlzIHBhcmFtZXRlciBvdXJzZWx2ZXMgdmlhIHRoZSBaSVBGSUxFXG4gICAgLy8gZW52aXJvbm1lbnQgdmFyaWFibGUuIEl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW5kZXJlZCBpbnRvIHRoZVxuICAgIC8vIGdlbmVyYXRlZCBZQU1MIHRlbXBsYXRlLlxuICAgIGNvbnN0IHNvdXJjZVppcEZpbGUgPSBuZXcgY2RrLkNmblBhcmFtZXRlcih0aGlzLCAnU291cmNlWmlwRmlsZScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGUsXG4gICAgICB0eXBlOiAnU3RyaW5nJ1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc291cmNlWmlwRmlsZUNoZWNrc3VtID0gbmV3IGNkay5DZm5QYXJhbWV0ZXIodGhpcywgJ1NvdXJjZVppcEZpbGVDaGVja3N1bScsIHtcbiAgICAgIGRlZmF1bHQ6IHByb3BzLnNvdXJjZVppcEZpbGVDaGVja3N1bSxcbiAgICAgIHR5cGU6ICdTdHJpbmcnXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3NldEJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnU291cmNlQnVja2V0JywgYXNzZXRCdWNrZXROYW1lLnZhbHVlQXNTdHJpbmcpO1xuXG4gICAgLy8gV2UgbmVlZCB0byBjcmVhdGUgdGhlIENsb3VkOSBlbnZpcm9ubWVudCBoZXJlLCBpbnN0ZWFkIG9mIGluIHRoZSBjbHVzdGVyIHN0YWNrXG4gICAgLy8gY3JlYXRlZCBpbiBDb2RlQnVpbGQsIHNvIHRoYXQgdGhlIHN0YWNrIGNyZWF0b3IgY2FuIGFjY2VzcyB0aGUgZW52aXJvbm1lbnQuXG4gICAgLy8gKENvZGVCdWlsZCBidWlsZHMgcGVyZm9ybSBpbiBhIGRpZmZlcmVudCByb2xlIGNvbnRleHQsIHdoaWNoIG1ha2VzIHRoZVxuICAgIC8vIGVudmlyb25tZW50IGluYWNjZXNzaWJsZS4pXG4gICAgLy9cbiAgICAvLyBGaXJzdCwgd2UgbmVlZCBhIFZQQyB0byBwdXQgaXQgaW4uXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1ZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIGNpZHI6ICcxMC4wLjAuMC8xNicsXG4gICAgICBuYXRHYXRld2F5czogMSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfTkFULFxuICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcbiAgICAgICAgICBjaWRyTWFzazogMTgsXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIFNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vZWtzL2xhdGVzdC91c2VyZ3VpZGUvbmV0d29yay1sb2FkLWJhbGFuY2luZy5odG1sXG4gICAgdnBjLnByaXZhdGVTdWJuZXRzLmZvckVhY2goc3VibmV0ID0+IGNkay5UYWdzLm9mKHN1Ym5ldCkuYWRkKCdrdWJlcm5ldGVzLmlvL3JvbGUvaW50ZXJuYWwtZWxiJywgJzEnKSk7XG4gICAgdnBjLnB1YmxpY1N1Ym5ldHMuZm9yRWFjaChzdWJuZXQgPT4gY2RrLlRhZ3Mub2Yoc3VibmV0KS5hZGQoJ2t1YmVybmV0ZXMuaW8vcm9sZS9lbGInLCAnMScpKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgQ2xvdWQ5IEVudmlyb25tZW50LlxuICAgIGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBjbG91ZDkuRWMyRW52aXJvbm1lbnQodGhpcywgJ1dvcmtzcGFjZScsIHtcbiAgICAgIHZwYzogdnBjLFxuICAgICAgZWMyRW52aXJvbm1lbnROYW1lOiAnZWtzLXNhYXMtd29ya3Nob3AnLFxuICAgICAgZGVzY3JpcHRpb246ICdFS1MgU2FhUyBXb3Jrc2hvcCcsXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuTTUsIGVjMi5JbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgc3VibmV0U2VsZWN0aW9uOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXBkYXRlV29ya3NwYWNlTWVtYmVyc2hpcEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXBkYXRlV29ya3NwYWNlTWVtYmVyc2hpcEZ1bmN0aW9uJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShyZXNwb25kRnVuY3Rpb24gKyBgXG5leHBvcnRzLmhhbmRsZXIgPSBhc3luYyBmdW5jdGlvbiAoZXZlbnQsIGNvbnRleHQpIHtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDQpKTtcbiAgY29uc3QgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgZW52aXJvbm1lbnRJZCA9IGV2ZW50LlJlc291cmNlUHJvcGVydGllcy5FbnZpcm9ubWVudElkO1xuXG4gICAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSBcIkNyZWF0ZVwiIHx8IGV2ZW50LlJlcXVlc3RUeXBlID09PSBcIlVwZGF0ZVwiKSB7XG4gICAgICBjb25zdCBlZVRlYW1Sb2xlQXJuID0gZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkVFVGVhbVJvbGVBcm47XG5cbiAgICAgIGlmICghIWVlVGVhbVJvbGVBcm4gJiYgZWVUZWFtUm9sZUFybiAhPT0gJ1JvbGVBcm5Ob3RTZXQnKSB7XG4gICAgICAgIGNvbnN0IGFyblNwbGl0ID0gZWVUZWFtUm9sZUFybi5zcGxpdCgnOicpO1xuICAgICAgICBjb25zdCBhY2NvdW50TnVtYmVyID0gYXJuU3BsaXRbNF07XG4gICAgICAgIGNvbnN0IHJlc291cmNlTmFtZSA9IGFyblNwbGl0WzVdLnNwbGl0KCcvJylbMV07XG4gICAgICAgIGNvbnN0IGVlVGVhbUFzc3VtZWRSb2xlQXJuID0gXFxgYXJuOmF3czpzdHM6OlxcJHthY2NvdW50TnVtYmVyfTphc3N1bWVkLXJvbGUvXFwke3Jlc291cmNlTmFtZX0vTWFzdGVyS2V5XFxgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdSZXNvbHZlZCBFRSBUZWFtIEFzc3VtZWQgUm9sZSBBUk46ICcgKyBlZVRlYW1Bc3N1bWVkUm9sZUFybik7XG5cbiAgICAgICAgY29uc3QgY2xvdWQ5ID0gbmV3IEFXUy5DbG91ZDkoKTtcblxuICAgICAgICBjb25zdCB7IG1lbWJlcnNoaXAgfSA9IGF3YWl0IGNsb3VkOS5jcmVhdGVFbnZpcm9ubWVudE1lbWJlcnNoaXAoe1xuICAgICAgICAgICAgZW52aXJvbm1lbnRJZCxcbiAgICAgICAgICAgIHBlcm1pc3Npb25zOiAncmVhZC13cml0ZScsXG4gICAgICAgICAgICB1c2VyQXJuOiBlZVRlYW1Bc3N1bWVkUm9sZUFybixcbiAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShtZW1iZXJzaGlwLCBudWxsLCA0KSk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKCdTZW5kaW5nIFNVQ0NFU1MgcmVzcG9uc2UnKTtcbiAgICBhd2FpdCByZXNwb25kKGV2ZW50LCBjb250ZXh0LCAnU1VDQ0VTUycsIHt9LCBlbnZpcm9ubWVudElkKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgYXdhaXQgcmVzcG9uZChldmVudCwgY29udGV4dCwgJ0ZBSUxFRCcsIHsgRXJyb3I6IGVycm9yIH0pO1xuICB9XG59O1xuICAgICAgICAgIGApLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICB9KTtcbiAgICB1cGRhdGVXb3Jrc3BhY2VNZW1iZXJzaGlwRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnY2xvdWQ5OmNyZWF0ZUVudmlyb25tZW50TWVtYmVyc2hpcCddLFxuICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgIH0pKTtcblxuICAgIG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1VwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXAnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHVwZGF0ZVdvcmtzcGFjZU1lbWJlcnNoaXBGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgRW52aXJvbm1lbnRJZDogd29ya3NwYWNlLmVudmlyb25tZW50SWQsXG4gICAgICAgIEVFVGVhbVJvbGVBcm46IHRlYW1Sb2xlQXJuLnZhbHVlQXNTdHJpbmdcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIE1vc3Qgb2YgdGhlIHJlc291cmNlcyB3aWxsIGJlIHByb3Zpc2lvbmVkIHZpYSBDREsuIFRvIGFjY29tcGxpc2ggdGhpcyxcbiAgICAvLyB3ZSB3aWxsIGxldmVyYWdlIENvZGVCdWlsZCBhcyB0aGUgZXhlY3V0aW9uIGVuZ2luZSBmb3IgYSBDdXN0b20gUmVzb3VyY2UuXG4gICAgY29uc3QgYnVpbGRQcm9qZWN0Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQnVpbGRQcm9qZWN0Um9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2RlYnVpbGQuYW1hem9uYXdzLmNvbScpXG4gICAgfSk7XG4gICAgY29uc3QgYnVpbGRQcm9qZWN0UG9saWN5ID0gbmV3IGlhbS5Qb2xpY3kodGhpcywgJ0J1aWxkUHJvamVjdFBvbGljeScsIHtcbiAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGFjdGlvbnM6IFsnKiddLFxuICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgfSlcbiAgICAgIF1cbiAgICB9KTtcbiAgICBidWlsZFByb2plY3RSb2xlLmF0dGFjaElubGluZVBvbGljeShidWlsZFByb2plY3RQb2xpY3kpO1xuXG4gICAgY29uc3QgYnVpbGRQcm9qZWN0ID0gbmV3IGNvZGVidWlsZC5Qcm9qZWN0KHRoaXMsICdCdWlsZFByb2plY3QnLCB7XG4gICAgICByb2xlOiBidWlsZFByb2plY3RSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF81XzAsXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTEwsXG4gICAgICB9LFxuICAgICAgc291cmNlOiBjb2RlYnVpbGQuU291cmNlLnMzKHtcbiAgICAgICAgYnVja2V0OiBhc3NldEJ1Y2tldCxcbiAgICAgICAgcGF0aDogYCR7YXNzZXRQcmVmaXgudmFsdWVBc1N0cmluZ30ke3NvdXJjZVppcEZpbGUudmFsdWVBc1N0cmluZ31gXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDkwKSxcbiAgICB9KTtcblxuXG4gICAgLy8gQ3VzdG9tIHJlc291cmNlIGZ1bmN0aW9uIHRvIHN0YXJ0IGEgYnVpbGQuIFRoZSBcImFwcGxpY2F0aW9uXCIgYmVpbmcgYnVpbHRcbiAgICAvLyBkZXBsb3lzIG91ciBDREsgYXBwLCBzcGVjaWZpY2FsbHkgdGhlIEVLUyBDbHVzdGVyU3RhY2suXG4gICAgY29uc3Qgc3RhcnRCdWlsZEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3RhcnRCdWlsZEZ1bmN0aW9uJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShyZXNwb25kRnVuY3Rpb24gKyBgXG5jb25zdCBBV1MgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XG5cbmV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIGZ1bmN0aW9uIChldmVudCwgY29udGV4dCkge1xuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgNCkpO1xuICB0cnkge1xuICAgIGNvbnN0IHByb2plY3ROYW1lID0gZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLlByb2plY3ROYW1lO1xuICAgIGNvbnN0IGNvZGVidWlsZCA9IG5ldyBBV1MuQ29kZUJ1aWxkKCk7XG5cbiAgICBjb25zb2xlLmxvZyhcXGBTdGFydGluZyBuZXcgYnVpbGQgb2YgcHJvamVjdCBcXCR7cHJvamVjdE5hbWV9XFxgKTtcblxuICAgIGNvbnN0IHsgYnVpbGQgfSA9IGF3YWl0IGNvZGVidWlsZC5zdGFydEJ1aWxkKHtcbiAgICAgIHByb2plY3ROYW1lLFxuICAgICAgLy8gUGFzcyBDRk4gcmVsYXRlZCBwYXJhbWV0ZXJzIHRocm91Z2ggdGhlIGJ1aWxkIGZvciBleHRyYWN0aW9uIGJ5IHRoZVxuICAgICAgLy8gY29tcGxldGlvbiBoYW5kbGVyLlxuICAgICAgYnVpbGRzcGVjT3ZlcnJpZGU6IGV2ZW50LlJlcXVlc3RUeXBlID09PSAnRGVsZXRlJyA/ICd3b3Jrc2hvcC1zdGFjay9idWlsZHNwZWMtZGVzdHJveS55bWwnIDogJ3dvcmtzaG9wLXN0YWNrL2J1aWxkc3BlYy55bWwnLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXNPdmVycmlkZTogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0NGTl9SRVNQT05TRV9VUkwnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5SZXNwb25zZVVSTFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0NGTl9TVEFDS19JRCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlN0YWNrSWRcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdDRk5fUkVRVUVTVF9JRCcsXG4gICAgICAgICAgdmFsdWU6IGV2ZW50LlJlcXVlc3RJZFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0NGTl9MT0dJQ0FMX1JFU09VUkNFX0lEJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuTG9naWNhbFJlc291cmNlSWRcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdWUENfSUQnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuVnBjSWRcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdDTE9VRDlfRU5WSVJPTk1FTlRfSUQnLFxuICAgICAgICAgIHZhbHVlOiBldmVudC5SZXNvdXJjZVByb3BlcnRpZXMuQ2xvdWQ5RW52aXJvbm1lbnRJZFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0JVSUxEX1JPTEVfQVJOJyxcbiAgICAgICAgICB2YWx1ZTogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkJ1aWxkUm9sZUFyblxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSkucHJvbWlzZSgpO1xuICAgIGNvbnNvbGUubG9nKFxcYEJ1aWxkIGlkIFxcJHtidWlsZC5pZH0gc3RhcnRlZCAtIHJlc291cmNlIGNvbXBsZXRpb24gaGFuZGxlZCBieSBFdmVudEJyaWRnZVxcYCk7XG4gIH0gY2F0Y2goZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICBhd2FpdCByZXNwb25kKGV2ZW50LCBjb250ZXh0LCAnRkFJTEVEJywgeyBFcnJvcjogZXJyb3IgfSk7XG4gIH1cbn07XG4gICAgICBgKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSlcbiAgICB9KTtcbiAgICBzdGFydEJ1aWxkRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnY29kZWJ1aWxkOlN0YXJ0QnVpbGQnXSxcbiAgICAgIHJlc291cmNlczogW2J1aWxkUHJvamVjdC5wcm9qZWN0QXJuXVxuICAgIH0pKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiB0byBleGVjdXRlIG9uY2UgQ29kZUJ1aWxkIGhhcyBmaW5pc2hlZCBwcm9kdWNpbmcgYSBidWlsZC5cbiAgICAvLyBUaGlzIHdpbGwgc2lnbmFsIENsb3VkRm9ybWF0aW9uIHRoYXQgdGhlIGJ1aWxkIChpLmUuLCBkZXBsb3lpbmcgdGhlIGFjdHVhbFxuICAgIC8vIEVLUyBzdGFjaykgaGFzIGNvbXBsZXRlZC5cbiAgICBjb25zdCByZXBvcnRCdWlsZEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVwb3J0QnVpbGRGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUocmVzcG9uZEZ1bmN0aW9uICsgYFxuY29uc3QgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuXG5leHBvcnRzLmhhbmRsZXIgPSBhc3luYyBmdW5jdGlvbiAoZXZlbnQsIGNvbnRleHQpIHtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDQpKTtcblxuICBjb25zdCBwcm9qZWN0TmFtZSA9IGV2ZW50WydkZXRhaWwnXVsncHJvamVjdC1uYW1lJ107XG5cbiAgY29uc3QgY29kZWJ1aWxkID0gbmV3IEFXUy5Db2RlQnVpbGQoKTtcblxuICBjb25zdCBidWlsZElkID0gZXZlbnRbJ2RldGFpbCddWydidWlsZC1pZCddO1xuICBjb25zdCB7IGJ1aWxkcyB9ID0gYXdhaXQgY29kZWJ1aWxkLmJhdGNoR2V0QnVpbGRzKHtcbiAgICBpZHM6IFsgYnVpbGRJZCBdXG4gIH0pLnByb21pc2UoKTtcblxuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShidWlsZHMsIG51bGwsIDQpKTtcblxuICBjb25zdCBidWlsZCA9IGJ1aWxkc1swXTtcbiAgLy8gRmV0Y2ggdGhlIENGTiByZXNvdXJjZSBhbmQgcmVzcG9uc2UgcGFyYW1ldGVycyBmcm9tIHRoZSBidWlsZCBlbnZpcm9ubWVudC5cbiAgY29uc3QgZW52aXJvbm1lbnQgPSB7fTtcbiAgYnVpbGQuZW52aXJvbm1lbnQuZW52aXJvbm1lbnRWYXJpYWJsZXMuZm9yRWFjaChlID0+IGVudmlyb25tZW50W2UubmFtZV0gPSBlLnZhbHVlKTtcblxuICBjb25zdCByZXNwb25zZSA9IHtcbiAgICBSZXNwb25zZVVSTDogZW52aXJvbm1lbnQuQ0ZOX1JFU1BPTlNFX1VSTCxcbiAgICBTdGFja0lkOiBlbnZpcm9ubWVudC5DRk5fU1RBQ0tfSUQsXG4gICAgTG9naWNhbFJlc291cmNlSWQ6IGVudmlyb25tZW50LkNGTl9MT0dJQ0FMX1JFU09VUkNFX0lELFxuICAgIFJlcXVlc3RJZDogZW52aXJvbm1lbnQuQ0ZOX1JFUVVFU1RfSURcbiAgfTtcblxuICBpZiAoZXZlbnRbJ2RldGFpbCddWydidWlsZC1zdGF0dXMnXSA9PT0gJ1NVQ0NFRURFRCcpIHtcbiAgICBhd2FpdCByZXNwb25kKHJlc3BvbnNlLCBjb250ZXh0LCAnU1VDQ0VTUycsIHt9LCAnYnVpbGQnKTtcbiAgfSBlbHNlIHtcbiAgICBhd2FpdCByZXNwb25kKHJlc3BvbnNlLCBjb250ZXh0LCAnRkFJTEVEJywgeyBFcnJvcjogJ0J1aWxkIGZhaWxlZCcgfSk7XG4gIH1cbn07XG4gICAgICBgKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSlcbiAgICB9KTtcbiAgICByZXBvcnRCdWlsZEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjb2RlYnVpbGQ6QmF0Y2hHZXRCdWlsZHMnLFxuICAgICAgICAnY29kZWJ1aWxkOkxpc3RCdWlsZHNGb3JQcm9qZWN0J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2J1aWxkUHJvamVjdC5wcm9qZWN0QXJuXVxuICAgIH0pKTtcblxuICAgIC8vIFRyaWdnZXIgdGhlIENsb3VkRm9ybWF0aW9uIG5vdGlmaWNhdGlvbiBmdW5jdGlvbiB1cG9uIGJ1aWxkIGNvbXBsZXRpb24uXG4gICAgY29uc3QgYnVpbGRDb21wbGV0ZVJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0J1aWxkQ29tcGxldGVSdWxlJywge1xuICAgICAgZGVzY3JpcHRpb246ICdCdWlsZCBjb21wbGV0ZScsXG4gICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgc291cmNlOiBbJ2F3cy5jb2RlYnVpbGQnXSxcbiAgICAgICAgZGV0YWlsVHlwZTogWydDb2RlQnVpbGQgQnVpbGQgU3RhdGUgQ2hhbmdlJ10sXG4gICAgICAgIGRldGFpbDoge1xuICAgICAgICAgICdidWlsZC1zdGF0dXMnOiBbJ1NVQ0NFRURFRCcsICdGQUlMRUQnLCAnU1RPUFBFRCddLFxuICAgICAgICAgICdwcm9qZWN0LW5hbWUnOiBbYnVpbGRQcm9qZWN0LnByb2plY3ROYW1lXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgdGFyZ2V0czogW1xuICAgICAgICBuZXcgTGFtYmRhVGFyZ2V0KHJlcG9ydEJ1aWxkRnVuY3Rpb24pXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBLaWNrIG9mZiB0aGUgYnVpbGQgKENESyBkZXBsb3ltZW50KS5cbiAgICBjb25zdCBjbHVzdGVyU3RhY2sgPSBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdDbHVzdGVyU3RhY2snLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHN0YXJ0QnVpbGRGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgUHJvamVjdE5hbWU6IGJ1aWxkUHJvamVjdC5wcm9qZWN0TmFtZSxcbiAgICAgICAgVnBjSWQ6IHZwYy52cGNJZCxcbiAgICAgICAgQ2xvdWQ5RW52aXJvbm1lbnRJZDogd29ya3NwYWNlLmVudmlyb25tZW50SWQsXG4gICAgICAgIEJ1aWxkUm9sZUFybjogYnVpbGRQcm9qZWN0Um9sZS5yb2xlQXJuLFxuICAgICAgICBaaXBGaWxlQ2hlY2tzdW06IHNvdXJjZVppcEZpbGVDaGVja3N1bS52YWx1ZUFzU3RyaW5nLFxuICAgICAgfVxuICAgIH0pO1xuICAgIGNsdXN0ZXJTdGFjay5ub2RlLmFkZERlcGVuZGVuY3koYnVpbGRDb21wbGV0ZVJ1bGUsIGJ1aWxkUHJvamVjdFBvbGljeSwgdnBjKTtcbiAgfVxufSJdfQ==