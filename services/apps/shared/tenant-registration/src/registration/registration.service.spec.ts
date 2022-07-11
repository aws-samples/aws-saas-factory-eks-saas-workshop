/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { IdpService } from '../idp-service/idp.service';
import { RegistrationService } from './registration.service';
import { ClientFactoryService } from '@app/client-factory';

describe('RegistrationService', () => {
  let service: RegistrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        IdpService,
        ClientFactoryService,
        UsersService,
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
