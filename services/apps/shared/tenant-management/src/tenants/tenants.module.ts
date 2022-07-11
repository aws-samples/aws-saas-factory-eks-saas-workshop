/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ClientFactoryModule } from 'libs/client-factory/src';

@Module({
  imports: [ClientFactoryModule, ConfigModule.forRoot()],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
