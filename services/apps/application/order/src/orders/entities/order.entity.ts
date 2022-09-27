import { Product } from './product.entity';

/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
export interface Order {
  products: Product[];
  lineItems?: number;
  tax?: number;
}
