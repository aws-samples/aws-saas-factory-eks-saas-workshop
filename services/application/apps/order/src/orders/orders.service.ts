/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { v4 as uuid } from 'uuid';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ClientFactoryService } from '@app/client-factory';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

@Injectable()
export class OrdersService {
  constructor(private clientFac: ClientFactoryService) {}
  tableName: string = process.env.ORDER_TABLE_NAME;

  async create(createOrderDto: CreateOrderDto, tenantId: string) {
    const newOrder = {
      name: createOrderDto.name,
      order_id: uuid(),
      tenant_id: tenantId,
      products: JSON.stringify(createOrderDto.products),
    };
    console.log('Creating order:', newOrder);
    try {
      const client = await this.fetchClient(tenantId);
      const cmd = new PutCommand({
        Item: newOrder,
        TableName: this.tableName,
      });
      await client.send(cmd);
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
    console.log('Get all orders:', tenantId, 'Table Name:', this.tableName);
    try {
      const client = await this.fetchClient(tenantId);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenant_id=:t_id',
        ExpressionAttributeValues: {
          ':t_id': tenantId,
        },
      });
      const response = await client.send(cmd);
      console.log('Response:', response);
      const items = response.Items;
      const orders = items.map((i) => {
        return {
          ...i,
          products: JSON.parse(i.products),
        };
      });
      return JSON.stringify(orders);
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
    console.log('Find order:', id, 'TenantId:', tenantId);
    try {
      const client = await this.fetchClient(tenantId);
      const cmd = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'tenant_id=:t_id AND order_id=:o_id',
        ExpressionAttributeValues: {
          ':t_id': tenantId,
          ':o_id': id,
        },
      });
      const result = await client.send(cmd);
      const item = result.Items[0];
      if (!item) {
        return;
      }
      const order = {
        ...item,
        products: JSON.parse(item.products),
      };
      return order;
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
