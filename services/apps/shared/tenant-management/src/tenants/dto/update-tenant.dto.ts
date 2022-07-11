/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
