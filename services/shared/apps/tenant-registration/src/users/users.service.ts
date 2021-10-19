/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  async addFirstUser(
    userPoolId: string,
    email: string,
    tenantId: string,
    companyName: string,
  ) {
    console.log('Adding first user', userPoolId, email, tenantId);
    const client = new CognitoIdentityProviderClient({});
    const cmd = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'custom:tenant-id', Value: tenantId },
        { Name: 'custom:company-name', Value: companyName },
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
    });
    const res = await client.send(cmd);
    console.log('Successfully added user:', res.User);
  }
}
