/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NestFactory } from '@nestjs/core';
import { UserManagementModule } from './user-management.module';

async function bootstrap() {
  const app = await NestFactory.create(UserManagementModule);
  await app.listen(3000);
}
bootstrap();
