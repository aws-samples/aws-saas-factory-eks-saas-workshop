/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TenantCredentials } from '@app/auth/auth.decorator';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @TenantCredentials() tenant) {
    return this.ordersService.findOne(id, tenant?.tenantId);
  }
}
