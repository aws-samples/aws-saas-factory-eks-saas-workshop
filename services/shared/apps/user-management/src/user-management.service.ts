/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserManagementService {
  getHello(): string {
    return 'Hello World!';
  }
}
