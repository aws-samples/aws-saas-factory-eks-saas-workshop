/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { Injectable } from '@nestjs/common';
import { PLAN_TYPE, USERPOOL_TYPE } from '../models/types';
import { ClientFactoryService } from 'libs/client-factory/src';

@Injectable()
export class IdpService {
  authTableName = process.env.AUTH_TENANT_TABLE_NAME;
  tenantStackMappingTable = process.env.TENANT_STACK_MAPPING_TABLE_NAME;
  constructor(private clientFac: ClientFactoryService) {}

  // This pool was created as part of our baseline infrastructure
  // Just return it to start with
  async getPooledUserPool(): Promise<string> {
    const existingPoolId = await this.fetchForPath('app');
    return existingPoolId;
  }

  async getPlanBasedUserPool(tenantId: string, path: string, plan: PLAN_TYPE) {
    // Our pool type is based solely on Plan
    const poolType =
      plan === PLAN_TYPE.Basic ? USERPOOL_TYPE.Pooled : USERPOOL_TYPE.Siloed;
    // Our incoming 'Path' parameter is a shortened version of the company name
    // It's only used in the case this tenant is siloed.
    // All non-premium tenants will use the pooled compute which runs at http://abc.com/app
    // Premium tenants will run at http://abc.com/{pathToUse}
    const pathToUse = plan === PLAN_TYPE.Basic ? 'app' : path;
    console.log('Fetching pool for this path:', pathToUse);
    // See if we have an existing entry based on the path.
    const existingPoolId = await this.fetchForPath(pathToUse);
    console.log('existingPoolId:', existingPoolId);
    if (!!existingPoolId) {
      return existingPoolId;
    }

    console.log('Existing pool not found. Creating new siloed pool');
    // If we get here, we're only interested in creating a siloed
    // tenant's user pool
    const poolName = `eks-ws-siloed-${tenantId}`;
    const userPool = await this.createUserPool(poolName, pathToUse);
    const userPoolClient = await this.createUserPoolClient(
      tenantId,
      userPool.Id,
    );
    await this.storeForPath(
      pathToUse,
      poolType,
      userPool.Id,
      userPoolClient.ClientId,
    );
    await this.storeTenantStackMappingData(
      path,
      userPool.Id,
      userPoolClient.ClientId,
    );
    return userPool.Id;
  }

  private async fetchForPath(path: string) {
    const client = this.clientFac.client;
    const cmd = new GetCommand({
      Key: {
        tenant_path: path,
      },
      TableName: this.authTableName,
    });
    return (await client.send(cmd)).Item?.user_pool_id;
  }

  private async storeForPath(
    path: string,
    poolType: USERPOOL_TYPE,
    userPoolId: string,
    userPoolClientId: string,
  ) {
    const authInfo = {
      tenant_path: path,
      user_pool_type: poolType,
      user_pool_id: userPoolId,
      client_id: userPoolClientId,
    };

    const client = this.clientFac.client;
    const cmd = new PutCommand({
      Item: authInfo,
      TableName: this.authTableName,
    });
    await client.send(cmd);
  }

  private async storeTenantStackMappingData(
    tenantName: string,
    userPoolId: string,
    userPoolClientId: string,
  ) {
    const tenantStackMapping = {
      TenantName: tenantName,
      UserPoolId: userPoolId,
      AppClientId: userPoolClientId,
      DeploymentStatus: 'Provisioning',
    };

    const client = this.clientFac.client;
    const cmd = new PutCommand({
      Item: tenantStackMapping,
      TableName: this.tenantStackMappingTable,
    });
    await client.send(cmd);
  }

  private async createUserPool(poolName: string, path: string) {
    const host = process.env.SERVICE_ADDRESS;
    const client = new CognitoIdentityProviderClient({});

    const command = new CreateUserPoolCommand({
      PoolName: poolName,
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
        InviteMessageTemplate: {
          EmailMessage: `<b>Welcome to the SaaS Application for EKS Workshop!</b> <br>
    <br>
    The URL for your application is here: <a href="http://${host}/${path}/index.html">http://${host}/${path}/index.html</a>. 
    <br>
    <br>
    Please note that it may take a few minutes to provision your tenant. If you get a 404 when hitting the link above
    please try again in a few minutes. You can also check the AWS CodePipeline project that's in your environment
    for status.
    <br>
    Your username is: <b>{username}</b>
    <br>
    Your temporary password is: <b>{####}</b>
    <br>`,
          EmailSubject:
            'Temporary password for environment EKS SaaS Application',
        },
      },
      UsernameAttributes: ['email'],
      Schema: [
        {
          AttributeDataType: 'String',
          Name: 'email',
          Required: true,
          Mutable: true,
        },
        {
          AttributeDataType: 'String',
          Name: 'tenant-id',
          Required: false,
          Mutable: false,
        },
        {
          AttributeDataType: 'String',
          Name: 'company-name',
          Required: false,
          Mutable: false,
        },
      ],
    });
    const response = await client.send(command);
    return response.UserPool;
  }

  private async createUserPoolClient(tenantId: string, userPoolId: string) {
    const client = new CognitoIdentityProviderClient({});
    const command = new CreateUserPoolClientCommand({
      ClientName: tenantId,
      UserPoolId: userPoolId,
      ExplicitAuthFlows: [
        'ALLOW_ADMIN_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      RefreshTokenValidity: 30,
      SupportedIdentityProviders: ['COGNITO'],
    });
    const response = await client.send(command);

    return response.UserPoolClient;
  }
}
