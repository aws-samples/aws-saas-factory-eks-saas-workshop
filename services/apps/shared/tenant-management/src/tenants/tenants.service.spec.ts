/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
