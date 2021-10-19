/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { PLAN_TYPE } from '../../models/types';

export class CreateRegistrationDto {
  email: string;
  companyName: string;
  plan: PLAN_TYPE;
}
