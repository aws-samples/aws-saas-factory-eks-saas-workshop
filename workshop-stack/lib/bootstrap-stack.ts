import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloud9 from 'aws-cdk-lib/aws-cloud9';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import { LambdaFunction as LambdaTarget } from 'aws-cdk-lib/aws-events-targets';

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
export interface BootstrapStackProps extends cdk.StackProps {
  sourceZipFile: string
  sourceZipFileChecksum: string
}

export class BootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
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
        new LambdaTarget(reportBuildFunction)
      ]
    });

    const cloud9EnvironmentArn = workspace.attrArn;
    const components = cdk.Arn.split(cloud9EnvironmentArn,cdk.ArnFormat.COLON_RESOURCE_NAME);

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