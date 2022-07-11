/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateRegistrationDto } from './create-registration.dto';

export class UpdateRegistrationDto extends PartialType(CreateRegistrationDto) {}
