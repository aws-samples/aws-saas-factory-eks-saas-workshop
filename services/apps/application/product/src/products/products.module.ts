/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { AuthModule } from '@app/auth';
import { ClientFactoryModule } from '@app/client-factory';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  PrometheusModule,
  makeCounterProvider,
} from '@willsoto/nestjs-prometheus';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ClientFactoryModule,
    PrometheusModule.register({
      path: '/products/metrics',
      customMetricPrefix: 'saas',
    }),
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    makeCounterProvider({
      name: 'api_products_requests_total',
      help: 'The number of total API Requests to this products service endpoint',
      labelNames: ['tenantId', 'method'],
    }),
  ],
  exports: [PrometheusModule],
})
export class ProductsModule {}
