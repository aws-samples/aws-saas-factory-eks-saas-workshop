/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClientFactoryModule } from 'libs/client-factory/src';

import { IdpService } from '../idp-service/idp.service';
import {
  USER_SERVICE,
  USER_SERVICE_HOST,
  USER_SERVICE_PORT,
} from './constants';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [
    ClientFactoryModule,
    ConfigModule.forRoot(),
    ClientsModule.register([
      {
        name: USER_SERVICE,
        transport: Transport.TCP,
        options: {
          port: USER_SERVICE_PORT,
          host: USER_SERVICE_HOST,
        },
      },
    ]),
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService, IdpService],
})
export class RegistrationModule {}
