/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Controller, Get } from '@nestjs/common';
import { UserManagementService } from './user-management.service';

@Controller()
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  @Get()
  getHello(): string {
    return this.userManagementService.getHello();
  }
}
