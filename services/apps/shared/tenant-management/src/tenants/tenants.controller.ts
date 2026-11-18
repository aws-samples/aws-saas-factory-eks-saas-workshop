/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Request } from 'express';
import * as fs from 'fs';
import * as os from 'os';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {
    console.debug();
    console.debug('Configuration');
    console.debug('-----------------------------------------------------');
    console.debug('PORT=' + process.env.PORT);
    console.debug('KUBERNETES_NAMESPACE=' + process.env.KUBERNETES_NAMESPACE);
    console.debug('KUBERNETES_POD_NAME=' + process.env.KUBERNETES_POD_NAME);
    console.debug('KUBERNETES_NODE_NAME=' + process.env.KUBERNETES_NODE_NAME);
    console.debug('CONTAINER_IMAGE=' + process.env.CONTAINER_IMAGE);
    console.debug('AUTH_TENANT_TABLE_NAME', process.env.AUTH_TENANT_TABLE_NAME);
    console.debug('TENANT_TABLE_NAME', process.env.TENANT_TABLE_NAME);
    console.debug('AWS_REGION', process.env.AWS_REGION);
  }

  // Guards are applied per method rather than to the whole controller, deliberately.
  // Two routes below must stay reachable without a token:
  //   - getAuthInfo, because the clients call it BEFORE they can authenticate. The tenant
  //     app fetches /api/tenants/auth-info from an Angular APP_INITIALIZER and feeds the
  //     result to Amplify.configure(), so guarding it would make login impossible.
  //   - healthCheck, which is a liveness/readiness endpoint.
  // A controller-level @UseGuards would have broken both.
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('/auth-info')
  getAuthInfo(@Req() req: Request) {
    return this.tenantsService.getAuthInfo(req.headers.referer);
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
      message: 'Hello from Tenants service!',
      namespace,
      podName,
      nodeName,
      nodeOS,
      applicationVersion,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(+id, updateTenantDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(+id);
  }
}
