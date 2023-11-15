import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface Cloud9StackProps extends cdk.NestedStackProps {
  clusterName: string;
  instanceRoleArn: string;
  cloud9EnvironmentName: string;
}

export class Cloud9Stack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: Cloud9StackProps) {
    super(scope, id, props);

    const instanceRole = iam.Role.fromRoleArn(this, 'instanceRoleArn', props.instanceRoleArn);

    const instanceProfile = new iam.CfnInstanceProfile(this, 'WorkspaceInstanceProfile', {
      roles: [instanceRole.roleName],
    });

    const updateInstanceProfileFunction = new PythonFunction(
      this,
      'UpdateInstanceProfileFunction',
      {
        entry: 'lib/update_instance_profile',
        runtime: lambda.Runtime.PYTHON_3_10,
        index: 'index.py',
        handler: 'lambda_handler',
        timeout: cdk.Duration.seconds(60),
        functionName: 'updateInstanceProfileFunction',
      }
    );
    updateInstanceProfileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloud9:DescribeEnvironments',
          'cloud9:ListEnvironments',
          'ec2:AssociateIamInstanceProfile',
          'ec2:DescribeIamInstanceProfileAssociations',
          'ec2:DescribeInstances',
          'ec2:ReplaceIamInstanceProfileAssociation',
          'iam:PassRole',
        ],
        resources: ['*'], // TODO: use specific instance ARN
      })
    );

    const updateInstanceResource = new cdk.CustomResource(this, 'UpdateInstanceProfile', {
      serviceToken: updateInstanceProfileFunction.functionArn,
      properties: {
        EnvironmentName: props.cloud9EnvironmentName,
        InstanceProfileArn: instanceProfile.attrArn,
      },
    });

    const instanceId = updateInstanceResource.getAttString('InstanceId');

    // Since Cloud9 has the SSM agent on it, we'll take advantage of its
    // presence to prepare the instance. This includes installing kubectl,
    // setting up the kubeconfig file, and installing the SSH private key
    // into the default user's home directory. We can add more steps later
    // if we like.

    // First, allow SSM to write Run Command logs to CloudWatch Logs. This
    // will allow us to diagnose problems later.
    // const runCommandRole = new iam.Role(this, 'RunCommandRole', {
    //   assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
    // });
    // const runCommandLogGroup = new logs.LogGroup(this, 'RunCommandLogs');
    // runCommandLogGroup.grantWrite(runCommandRole);

    const updateCloud9InstanceFunction = new PythonFunction(this, 'InstancePrep', {
      entry: 'lib/send_cloud9_ssm',
      runtime: lambda.Runtime.PYTHON_3_10,
      index: 'index.py',
      handler: 'lambda_handler',
      timeout: cdk.Duration.seconds(300),
      functionName: 'updateCloud9InstanceFunction',
    });
    updateCloud9InstanceFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloud9:DescribeEnvironments',
          'cloud9:ListEnvironments',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceStatus',
          'iam:PassRole',
          'ssm:SendCommand',
          'ssm:GetCommandInvocation',
          'cloudwatch:*',
        ],
        resources: ['*'], // TODO: use specific instance ARN
      })
    );

    new cdk.CustomResource(this, 'UpdateCloud9Instance', {
      serviceToken: updateCloud9InstanceFunction.functionArn,
      properties: {
        clusterName: props.clusterName,
        instanceId: instanceId,
        instanceRoleArn: instanceRole.roleArn,
        region: this.region,
      },
    });
  }
}
