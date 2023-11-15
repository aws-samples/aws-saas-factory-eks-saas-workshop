import { CfnOutput, NestedStack, NestedStackProps, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class InstanceManagementStack extends NestedStack {
  instanceRoleArn: string;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);
    // Create an EC2 instance role for the Cloud9 environment. This instance
    // role is powerful, allowing the participant to have unfettered access to
    // the provisioned account. This might be too broad. It's possible to
    // tighten this down, but there may be unintended consequences.
    // We'll need this role later when we run aws eks update-kubeconfig
    const instanceRole = new iam.Role(this, 'WorkspaceInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      description: 'Workspace EC2 instance role',
    });
    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    this.instanceRoleArn = instanceRole.roleArn;
    new CfnOutput(this, 'InstanceRoleArn', { value: this.instanceRoleArn });
    new CfnOutput(this, 'WorkspaceInstanceRoleName', { value: instanceRole.roleName });
  }
}
