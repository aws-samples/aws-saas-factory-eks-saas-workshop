/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { v4 as uuid } from 'uuid';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ClientFactoryService } from '@app/client-factory';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PolicyType } from '@app/auth/credential-vendor';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class ProductsService {
  constructor(
    private clientFac: ClientFactoryService,
    @InjectMetric('api_products_requests_total')
    public counter: Counter<string>,
  ) {}
  tableName: string = process.env.PRODUCT_TABLE_NAME;

  async create(createProductDto: CreateProductDto, tenantId: string) {
    this.counter.labels({ tenantId: tenantId, method: 'create' }).inc();
    const newProduct = {
      ...createProductDto,
      product_id: uuid(),
      tenant_id: tenantId,
    };
    console.log('Creating product:', newProduct);
    const client = await this.fetchClient(tenantId);
    const cmd = new PutCommand({
      Item: newProduct,
      TableName: this.tableName,
    });
    client.send(cmd);
  }

  async findAll(tenantId: string) {
    this.counter.labels({ tenantId: tenantId, method: 'findAll' }).inc();
    console.log('Getting All Products for Tenant:', tenantId);
    const client = await this.fetchClient(tenantId);
    const cmd = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'tenant_id=:t_id',
      ExpressionAttributeValues: {
        ':t_id': tenantId,
      },
    });
    const response = await client.send(cmd);
    return JSON.stringify(response.Items);
  }

  async findOne(id: string, tenantId: string) {
    this.counter.labels({ tenantId: tenantId, method: 'findOne' }).inc();
    console.log('Getting Product: ', id);
    const client = await this.fetchClient(tenantId);
    const cmd = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'tenant_id=:t_id AND product_id=:p_id',
      ExpressionAttributeValues: {
        ':t_id': tenantId,
        ':p_id': id,
      },
    });
    const response = await client.send(cmd);
    return JSON.stringify(response.Items && response.Items[0]);
  }

  async update(
    id: string,
    tenantId: string,
    updateProductDto: UpdateProductDto,
  ) {
    this.counter.labels({ tenantId: tenantId, method: 'update' }).inc();
    console.log('Updating Product: ', id);
    const client = await this.fetchClient(tenantId);
    const cmd = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        tenant_id: tenantId,
        product_id: id,
      },
      UpdateExpression: 'set #name = :n, #price = :p, #description = :d',
      ExpressionAttributeValues: {
        ':n': updateProductDto.name,
        ':p': updateProductDto.price,
        ':d': updateProductDto.description,
      },
      ExpressionAttributeNames: {
        '#name': 'name',
        '#price': 'price',
        '#description': 'description',
      },
    });
    const response = await client.send(cmd);
    console.log('Update Response:', response);
    return JSON.stringify(updateProductDto);
  }

  async fetchClient(tenantId: string) {
    return DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  perf(tenantId: string, baseNumber: number = 8): number {
    this.counter.labels({ tenantId: tenantId, method: 'perf' }).inc();
    const start = performance.now();
    const num = Math.min(Math.abs(baseNumber), 12);
    let result = 0;
    for (let i = Math.pow(num, 7); i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      result += Math.atan(i) * Math.tan(i);
    }
    const end = performance.now();
    console.log('Perf result:', end - start);
    return end - start;
  }
}
