/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { Construct, NestedStack, NestedStackProps } from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cognito from '@aws-cdk/aws-cognito';

export interface TenantInfraStackProps extends NestedStackProps {
  elbUrl: string;
}

export class TenantInfraStack extends NestedStack {
  nodeRole: iam.IRole;
  pipelineFunction: lambda.Function;
  pooledTenantUserPoolId: string;
  pooledTenantAppClientId: string;

  constructor(scope: Construct, id: string, props?: TenantInfraStackProps) {
    super(scope, id, props);

    const pooledTenantPool = new cognito.UserPool(this, 'PooledTenantsPool', {
      userInvitation: {
        emailSubject: 'Temporary password for environment EKS SaaS Application',
        emailBody: `<b>Welcome to the SaaS Application for EKS Workshop!</b> <br>
    <br>
    You can log into the app <a href="http://${props?.elbUrl}/app/index.html">here</a>. If that link doesn't work, you can copy this URL into your browser: http://${props?.elbUrl}/app/index.html
    <br>
    Your username is: <b>{username}</b>
    <br>
    Your temporary password is: <b>{####}</b>
    <br>`,
      },
      userPoolName: 'eks-ws-pooled',
      customAttributes: {
        'tenant-id': new cognito.StringAttribute({ mutable: false }),
        'company-name': new cognito.StringAttribute({ mutable: false }),
        email: new cognito.StringAttribute({ mutable: true }),
      },
    });

    const pooledTenantAppClient = pooledTenantPool.addClient('PooledUserPoolClient', {
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
        callbackUrls: [`https://${props?.elbUrl}/app`],
      },
      preventUserExistenceErrors: true,
    });
    this.pooledTenantUserPoolId = pooledTenantPool.userPoolId;
    this.pooledTenantAppClientId = pooledTenantAppClient.userPoolClientId;

  }
}
