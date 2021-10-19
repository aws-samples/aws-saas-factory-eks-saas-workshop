/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

describe('UserManagementController', () => {
  let userManagementController: UserManagementController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UserManagementController],
      providers: [UserManagementService],
    }).compile();

    userManagementController = app.get<UserManagementController>(
      UserManagementController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(userManagementController.getHello()).toBe('Hello World!');
    });
  });
});
