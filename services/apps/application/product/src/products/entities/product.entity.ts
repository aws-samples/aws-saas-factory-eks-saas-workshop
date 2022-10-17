/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
export class Product {
  constructor(
    private id: string,
    private price: number,
    private name: string,
    private description: string,
  ) {}
}
