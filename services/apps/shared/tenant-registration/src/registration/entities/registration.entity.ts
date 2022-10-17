/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { PLAN_TYPE } from '../../models/types';

export class Registration {
  constructor(
    public tenantId: string,
    public email: string,
    public plan: PLAN_TYPE,
    public companyName: string,
  ) {}
  userPoolType: string;

  public get Path() {
    return this.companyName?.replace(/\W/g, '').toLowerCase() || '';
  }
}
