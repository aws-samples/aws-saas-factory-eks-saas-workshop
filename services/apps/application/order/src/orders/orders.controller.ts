/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TenantCredentials } from '@app/auth/auth.decorator';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import * as fs from 'fs';
import * as os from 'os';
@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {
    console.debug();
    console.debug('Configuration');
    console.debug('-----------------------------------------------------');
    console.debug('PORT=' + process.env.PORT);
    console.debug('KUBERNETES_NAMESPACE=' + process.env.KUBERNETES_NAMESPACE);
    console.debug('KUBERNETES_POD_NAME=' + process.env.KUBERNETES_POD_NAME);
    console.debug('KUBERNETES_NODE_NAME=' + process.env.KUBERNETES_NODE_NAME);
    console.debug('CONTAINER_IMAGE=' + process.env.CONTAINER_IMAGE);
    console.debug('ORDER_TABLE_NAME', process.env.ORDER_TABLE_NAME);
  }

  @Get('perf')
  @UseGuards(JwtAuthGuard)
  perf(
    @TenantCredentials() tenant,
    @Query('basenumber', new ParseIntPipe({ optional: true })) basenum?: number,
  ) {
    const ms = this.ordersService.perf(tenant.tenantId, basenum);
    return {
      elapsed: ms,
      podname: process.env.KUBERNETES_POD_NAME || os.hostname(),
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createOrderDto: CreateOrderDto, @TenantCredentials() tenant) {
    return this.ordersService.create(createOrderDto, tenant.tenantId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@TenantCredentials() tenant) {
    return this.ordersService.findAll(tenant?.tenantId);
  }

  @Get('health')
  healthCheck() {
    console.log('Receved health check');
    const namespace = process.env.KUBERNETES_NAMESPACE || '-';
    const podName = process.env.KUBERNETES_POD_NAME || os.hostname();
    const nodeName = process.env.KUBERNETES_NODE_NAME || '-';
    const nodeOS = os.type() + ' ' + os.release();
    const applicationVersion = JSON.parse(
      fs.readFileSync('package.json', 'utf8'),
    ).version;
    return {
      mesage: 'Hello from Order service!',
      namespace,
      podName,
      nodeName,
      nodeOS,
      applicationVersion,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @TenantCredentials() tenant) {
    return this.ordersService.findOne(id, tenant?.tenantId);
  }
}
