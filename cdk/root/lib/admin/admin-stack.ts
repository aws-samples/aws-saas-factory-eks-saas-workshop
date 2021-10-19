/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito';
import { CfnUserPoolUser } from '@aws-cdk/aws-cognito';

export interface AdminStackProps extends cdk.NestedStackProps {
  adminEmailAddress: string;
  elbUrl: string;
}

export class AdminStack extends cdk.NestedStack {
  userPoolId: string;
  appClientId: string;
  issuer: string;

  constructor(scope: cdk.Construct, id: string, props?: AdminStackProps) {
    super(scope, id, props);

    const adminPool = new cognito.UserPool(this, 'AdminUserPool', {
      userInvitation: {
        emailSubject: 'SaaS Admin temporary password for environment EKS SaaS Solution',
        emailBody: `<b>Welcome to SaaS Admin App for EKS!</b> <br>
        <br>
        You can log into the app <a href="http://${props?.elbUrl}/admin">here</a>.
        <br>
        Your username is: <b>{username}</b>
        <br>
        Your temporary password is: <b>{####}</b>
        <br>`,
      },
    });

    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: adminPool,
      cognitoDomain: {
        domainPrefix: `admin-pool-${this.account}`,
      },
    });

    const appClient = adminPool.addClient('AdminUserPoolClient', {
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          implicitCodeGrant: true,
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PHONE,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [`https://${props?.elbUrl}/admin`],
      },
      preventUserExistenceErrors: true,
    });

    new CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: adminPool.userPoolId,
      desiredDeliveryMediums: ['EMAIL'],
      forceAliasCreation: false,
      userAttributes: [
        { name: 'email', value: props?.adminEmailAddress },
        { name: 'email_verified', value: 'true' },
      ],
      username: props?.adminEmailAddress,
    });
    this.userPoolId = adminPool.userPoolId;
    this.appClientId = appClient.userPoolClientId;
    this.issuer = adminPool.userPoolProviderUrl;
  }
}
