/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '@app/auth';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ClientFactoryModule } from 'libs/client-factory/src';

@Module({
  // AuthModule is required, not optional. It is what provides JwtStrategy and registers
  // PassportModule with defaultStrategy 'jwt'. The @UseGuards(JwtAuthGuard) decorators on
  // TenantsController resolve to AuthGuard('jwt'), which asks Passport for a strategy
  // registered under that name -- and tenant-management runs as its own process bootstrapping
  // only this module, so without this import no strategy is ever instantiated. Passport then
  // throws "Unknown authentication strategy \"jwt\"" and every guarded route returns 500 for
  // every caller, including a correctly authenticated admin. The guard would look present and
  // protect nothing while breaking the page it guards.
  //
  // orders.module.ts and products.module.ts already import AuthModule for the same reason;
  // this brings tenant-management into line rather than introducing a new pattern.
  //
  // The pod already receives COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID and COGNITO_REGION
  // (tenant-artifacts/helm/core-services/templates/tenant-management.yaml), which is all
  // AuthConfig reads, and those are the same values core-services/templates/admin.yaml hands
  // the admin web app's Amplify config -- so the issuer and audience the strategy validates
  // against are the pool the operations user actually signs in to.
  imports: [AuthModule, ClientFactoryModule, ConfigModule.forRoot()],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
