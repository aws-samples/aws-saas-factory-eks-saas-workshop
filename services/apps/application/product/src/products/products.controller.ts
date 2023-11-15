/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import { TenantCredentials } from '@app/auth/auth.decorator';
import * as fs from 'fs';
import * as os from 'os';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {
    console.debug();
    console.debug('Configuration');
    console.debug('-----------------------------------------------------');
    console.debug('PORT=' + process.env.PORT);
    console.debug('KUBERNETES_NAMESPACE=' + process.env.KUBERNETES_NAMESPACE);
    console.debug('KUBERNETES_POD_NAME=' + process.env.KUBERNETES_POD_NAME);
    console.debug('KUBERNETES_NODE_NAME=' + process.env.KUBERNETES_NODE_NAME);
    console.debug('CONTAINER_IMAGE=' + process.env.CONTAINER_IMAGE);
    console.debug('PRODUCT_TABLE_NAME', process.env.PRODUCT_TABLE_NAME);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createProductDto: CreateProductDto,
    @TenantCredentials() tenant,
  ) {
    console.log('Create product', tenant);
    return this.productsService.create(createProductDto, tenant.tenantId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@TenantCredentials() tenant) {
    console.log('Get products', tenant);
    const tenantId = tenant.tenantId;
    return this.productsService.findAll(tenantId);
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
      message: 'Hello from Products service!',
      namespace,
      podName,
      nodeName,
      nodeOS,
      applicationVersion,
    };
  }

  @Get('perf')
  @UseGuards(JwtAuthGuard)
  perf(
    @TenantCredentials() tenant,
    @Query('basenumber', new ParseIntPipe({ optional: true })) basenum?: number,
  ) {
    const ms = this.productsService.perf(tenant.tenantId, basenum);
    return {
      elapsed: ms,
      podname: process.env.KUBERNETES_POD_NAME || os.hostname(),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @TenantCredentials() tenant) {
    return this.productsService.findOne(id, tenant.tenantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @TenantCredentials() tenant,
  ) {
    console.log(tenant);
    return this.productsService.update(id, tenant.tenantId, updateProductDto);
  }
}
