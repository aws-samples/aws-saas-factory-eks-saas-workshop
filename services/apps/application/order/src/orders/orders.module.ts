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
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ClientFactoryModule,
    PrometheusModule.register({
      path: '/orders/metrics',
      customMetricPrefix: 'saas',
    }),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    makeCounterProvider({
      name: 'api_order_requests_total',
      help: 'The number of total API Requests to this order service endpoint',
      labelNames: ['tenantId', 'method'],
    }),
  ],
  exports: [PrometheusModule],
})
export class OrdersModule {}
