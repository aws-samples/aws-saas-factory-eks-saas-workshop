/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { ClientFactoryService } from '@app/client-factory';
import { Test, TestingModule } from '@nestjs/testing';
import { IdpService } from './idp.service';

describe('IdpService', () => {
  let service: IdpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IdpService, ClientFactoryService],
    }).compile();

    service = module.get<IdpService>(IdpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
