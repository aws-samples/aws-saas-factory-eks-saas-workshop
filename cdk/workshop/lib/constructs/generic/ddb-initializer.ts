import { Construct } from 'constructs';
import { CfnUserPoolUserToGroupAttachment, IUserPool } from 'aws-cdk-lib/aws-cognito';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  AwsSdkCall,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';

export class DynamoDbInitializer extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: { tableName: string; tableArn: string; records: any }
  ) {
    super(scope, id);
    this.insertRecord(props.tableName, props.tableArn, props.records);
  }

  private insertRecord(tableName: string, tableArn: string, item: any) {
    const awsSdkCall: AwsSdkCall = {
      service: 'DynamoDB',
      action: 'putItem',
      physicalResourceId: PhysicalResourceId.of(tableName + '_insert'),
      parameters: {
        TableName: tableName,
        Item: item,
      },
    };
    const customResource: AwsCustomResource = new AwsCustomResource(
      this,
      tableName + '_custom_resource',
      {
        onCreate: awsSdkCall,
        onUpdate: awsSdkCall,
        logRetention: RetentionDays.ONE_WEEK,
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            sid: 'DynamoWriteAccess',
            effect: Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [tableArn],
          }),
        ]),
        timeout: Duration.minutes(5),
      }
    );
  }
}
