/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Controller, Get, Post, Body } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    console.log('Received new registration', createRegistrationDto);
    return this.registrationService.create(createRegistrationDto);
  }

  @Get()
  healthCheck() {
    console.log('Received healthcheck');
    return JSON.stringify({
      status: 'OK',
      message: 'Tenant Registration Service is live.',
    });
  }
}
