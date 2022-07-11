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
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import { TenantCredentials } from '@app/auth/auth.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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

  @Delete(':id')
  remove(@Param('id') id: string) {
    // return this.productsService.remove(+id);
  }
}
