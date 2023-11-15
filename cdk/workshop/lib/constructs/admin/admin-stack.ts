/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { NestedStackProps, NestedStack, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { UserPoolUser } from '../generic/userpool-user';

export interface AdminStackProps extends NestedStackProps {
  elbUrl: string;
}

export class AdminStack extends NestedStack {
  userPoolId: string;
  appClientId: string;
  issuer: string;

  constructor(scope: Construct, id: string, props?: AdminStackProps) {
    super(scope, id, props);

    const adminPool = new cognito.UserPool(this, 'AdminUserPool', {
      removalPolicy: RemovalPolicy.DESTROY,
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

    const adminUser = new UserPoolUser(this, 'AdminUser', {
      username: 'admin@saas.com',
      password: 'Admin123*',
      userPool: adminPool,
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

    this.userPoolId = adminPool.userPoolId;
    this.appClientId = appClient.userPoolClientId;
    this.issuer = adminPool.userPoolProviderUrl;
  }
}
