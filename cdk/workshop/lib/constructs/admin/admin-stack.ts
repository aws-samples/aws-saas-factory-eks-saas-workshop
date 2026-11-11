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

    /*
     * The administrator password. There is deliberately no default.
     *
     * This account administers every tenant in the deployment, so any value committed here
     * would be an administrator credential published in a public repository and identical in
     * every deployment of this workshop. Supply it at deploy time instead:
     *
     *   cdk deploy -c adminPassword='<a value you choose>'
     *
     * It must satisfy the user pool's password policy. See the security notice in the
     * repository README for where this value remains visible after deployment.
     */
    const adminPassword = this.node.tryGetContext('adminPassword');
    if (typeof adminPassword !== 'string' || adminPassword.trim().length === 0) {
      throw new Error(
        'Missing required context value "adminPassword". It has no default, because a default ' +
          'would be an administrator credential published in this repository.\n\n' +
          "Deploy with:  cdk deploy -c adminPassword='<a value you choose>'\n"
      );
    }

    // The username is not a secret, so a default is fine here.
    const adminUsername = this.node.tryGetContext('adminUsername') ?? 'admin@saas.com';

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
      username: adminUsername,
      password: adminPassword,
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
