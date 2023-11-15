/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Controller, Get, Post, Body } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import * as fs from 'fs';
import * as os from 'os';

@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {
    console.debug();
    console.debug('Configuration');
    console.debug('-----------------------------------------------------');
    console.debug('PORT=' + process.env.PORT);
    console.debug('KUBERNETES_NAMESPACE=' + process.env.KUBERNETES_NAMESPACE);
    console.debug('KUBERNETES_POD_NAME=' + process.env.KUBERNETES_POD_NAME);
    console.debug('KUBERNETES_NODE_NAME=' + process.env.KUBERNETES_NODE_NAME);
    console.debug('CONTAINER_IMAGE=' + process.env.CONTAINER_IMAGE);
    console.debug('TENANT_TABLE_NAME', process.env.TENANT_TABLE_NAME);
    console.debug('AWS_REGION', process.env.AWS_REGION);
  }

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    console.log('Received new registration', createRegistrationDto);
    return this.registrationService.create(createRegistrationDto);
  }

  @Get('health')
  healthCheck() {
    console.log('Receved health check');
    const namespace = process.env.KUBERNETES_NAMESPACE || '-';
    const podName = process.env.KUBERNETES_POD_NAME || os.hostname();
    const nodeName = process.env.KUBERNETES_NODE_NAME || '-';
    const nodeOS = os.type() + ' ' + os.release();
    const applicationVersion = JSON.parse(
      fs.readFileSync('package.json', 'utf8'),
    ).version;
    return {
      message: 'Hello from Registration service!',
      namespace,
      podName,
      nodeName,
      nodeOS,
      applicationVersion,
    };
  }
}
