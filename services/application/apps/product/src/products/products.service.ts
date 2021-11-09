/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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

@Injectable()
export class ProductsService {
  constructor(private clientFac: ClientFactoryService) {}
  tableName: string = process.env.PRODUCT_TABLE_NAME;

  async create(createProductDto: CreateProductDto, tenantId: string) {
    const newProduct = {
      ...createProductDto,
      product_id: uuid(),
      tenant_id: tenantId,
    };
    console.log('Creating product:', newProduct);

    try {
      const client = await this.fetchClient(tenantId);
      const cmd = new PutCommand({
        Item: newProduct,
        TableName: this.tableName,
      });
      client.send(cmd);
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(tenantId: string) {
    console.log('Getting All Products for Tenant:', tenantId);
    try {
      const client = await this.fetchClient(tenantId);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenant_id=:t_id',
        ExpressionAttributeValues: {
          ':t_id': 'tenantId',
        },
      });

      const response = await client.send(cmd);
      return JSON.stringify(response.Items);
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string, tenantId: string) {
    try {
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
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(
    id: string,
    tenantId: string,
    updateProductDto: UpdateProductDto,
  ) {
    try {
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
    } catch (error) {
      console.error(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async fetchClient(tenantId: string) {
    return DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
}
