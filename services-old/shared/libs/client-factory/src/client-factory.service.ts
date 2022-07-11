import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClientFactoryService {
  public get client(): DynamoDBDocumentClient {
    console.log('REGION:', process.env.AWS_REGION);
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION }),
    );
    return client;
  }
}
