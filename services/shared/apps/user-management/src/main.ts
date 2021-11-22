/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NestFactory } from '@nestjs/core';
import {
  Transport,
  MicroserviceOptions,
  TcpOptions,
} from '@nestjs/microservices';
import { UsersModule } from './users/users.module';

async function bootstrap() {
  const options: TcpOptions = {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 3015,
    },
  };
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    options,
  );
  await app.listen(() => {
    console.log('Users microservice is listening...');
  });
}
bootstrap();
