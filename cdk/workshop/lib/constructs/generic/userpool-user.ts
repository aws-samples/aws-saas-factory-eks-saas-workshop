import { Construct } from 'constructs';
import { CfnUserPoolUserToGroupAttachment, IUserPool } from 'aws-cdk-lib/aws-cognito';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Duration } from 'aws-cdk-lib';

export class UserPoolUser extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      userPool: IUserPool;
      username: string;
      /*
       * The user's permanent password.
       *
       * NOTE: this value is passed to an AwsCustomResource, so it is rendered into the
       * synthesized CloudFormation template and delivered to the custom resource's Lambda in
       * its event. Treat it as readable by anyone with CloudFormation read access on the
       * deploying account. Never commit a value; supply it at deploy time.
       */
      password: string;
      attributes?: { Name: string; Value: string }[];
      groupName?: string;
    }
  ) {
    super(scope, id);

    const username = props.username;
    const password = props.password;

    if (!password || password.trim().length === 0) {
      throw new Error(
        `UserPoolUser "${username}" was given an empty password. Supply one at deploy time ` +
          'rather than creating an account without a usable credential.'
      );
    }

    // Create the user inside the Cognito user pool using Lambda backed AWS Custom resource
    const adminCreateUser = new AwsCustomResource(this, 'AwsCustomResource-CreateUser', {
      timeout: Duration.minutes(5),
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminCreateUser',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: username,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: password,
          UserAttributes: [...((props.attributes as any[]) || [])],
        },
        physicalResourceId: PhysicalResourceId.of(`AwsCustomResource-CreateUser-${username}`),
      },
      onDelete: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminDeleteUser',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: username,
        },
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      installLatestAwsSdk: true,
    });

    // Force the password for the user, because by default when new users are created
    // they are in FORCE_PASSWORD_CHANGE status. The newly created user has no way to change it though
    const adminSetUserPassword = new AwsCustomResource(this, 'AwsCustomResource-ForcePassword', {
      timeout: Duration.minutes(5),
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          Username: username,
          Password: password,
          Permanent: true,
        },
        physicalResourceId: PhysicalResourceId.of(`AwsCustomResource-ForcePassword-${username}`),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      installLatestAwsSdk: true,
    });
    adminSetUserPassword.node.addDependency(adminCreateUser);

    // If a Group Name is provided, also add the user to this Cognito UserPool Group
    if (props.groupName) {
      const userToAdminsGroupAttachment = new CfnUserPoolUserToGroupAttachment(
        this,
        'AttachAdminToAdminsGroup',
        {
          userPoolId: props.userPool.userPoolId,
          groupName: props.groupName,
          username: username,
        }
      );
      userToAdminsGroupAttachment.node.addDependency(adminCreateUser);
      userToAdminsGroupAttachment.node.addDependency(adminSetUserPassword);
      userToAdminsGroupAttachment.node.addDependency(props.userPool);
    }
  }
}
