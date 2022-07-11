/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NestFactory } from '@nestjs/core';
import { UsersModule } from './users/users.module';

async function bootstrap() {
  const app = await NestFactory.create(UsersModule);
  app.setGlobalPrefix('/*/api');
  await app.listen(3003);
}
bootstrap();
