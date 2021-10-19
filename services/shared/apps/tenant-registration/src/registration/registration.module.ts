/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientFactoryModule } from 'libs/client-factory/src';

import { IdpService } from '../idp-service/idp.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { UsersService } from '../users/users.service';

@Module({
  imports: [ClientFactoryModule, ConfigModule.forRoot()],
  controllers: [RegistrationController],
  providers: [RegistrationService, IdpService, UsersService],
})
export class RegistrationModule {}
