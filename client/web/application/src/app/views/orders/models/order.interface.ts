/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { OrderProduct } from './orderproduct.interface';

export interface Order {
  id: string;
  name: string;
  products: OrderProduct[];
}
