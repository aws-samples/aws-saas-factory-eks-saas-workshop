/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { ClientFactoryService } from '@app/client-factory';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, ClientFactoryService],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
