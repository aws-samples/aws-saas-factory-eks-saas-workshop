/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { passportJwtSecret } from 'jwks-rsa';
import { AuthConfig } from './auth-config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authConfig: AuthConfig) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authConfig.authority}/.well-known/jwks.json`,
      }),

      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: authConfig.clientId,
      issuer: authConfig.authority,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    const match = payload.iss.match(/([a-z\d\_\-]+)(\/*|)$/gi);
    return {
      userId: payload.sub,
      username: payload['cognito:username'],
      tenantId: payload['custom:tenant-id'],
      email: payload.email,
      userPoolId: match && match[0],
      appClientId: payload.aud,
    };
  }
}
