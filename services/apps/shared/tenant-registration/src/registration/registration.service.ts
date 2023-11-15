/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import {
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from '@aws-sdk/client-codepipeline';

import { CreateRegistrationDto } from './dto/create-registration.dto';
import { IdpService } from '../idp-service/idp.service';
import { Registration } from './entities/registration.entity';
import { ClientFactoryService } from 'libs/client-factory/src';
import { PLAN_TYPE } from '../models/types';
import { getTimeString } from '../utils/utils';
import { CREATE_TENANT_USER, USER_SERVICE } from './constants';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class RegistrationService {
  tableName: string = process.env.TENANT_TABLE_NAME;

  constructor(
    private clientFac: ClientFactoryService,
    private idpSvc: IdpService,
    @Inject(USER_SERVICE) private userSvc: ClientProxy,
  ) {}

  async create(dto: CreateRegistrationDto) {
    console.log('Creating tenant:', dto);
    const tenant = await this.store(dto);
    this.register(tenant, dto.plan);
    this.provision(dto.plan);
  }

  private async store(dto: CreateRegistrationDto) {
    const tenantId = uuid();
    const newTenant = new Registration(
      tenantId,
      dto.email,
      dto.plan,
      dto.companyName,
    );
    const client = this.clientFac.client;
    const item = {
      tenant_id: newTenant.tenantId,
      email: newTenant.email,
      plan: newTenant.plan.toString(),
      companyName: newTenant.companyName,
    };
    const cmd = new PutCommand({
      Item: item,
      TableName: this.tableName,
    });
    const res = await client.send(cmd);
    console.log('Successfully stored tenant', res.Attributes);
    return newTenant;
  }

  private async register(registration: Registration, plan: PLAN_TYPE) {
    console.log('Registering tenant:', registration);

    console.log('plan:', plan);
    const planToUse = plan === PLAN_TYPE.Basic ? 'basic' : 'other';
    console.log('planToUse:', planToUse);

    let userPoolId = null;

    if (planToUse == 'basic') {
      console.log('Inside basic:');
      userPoolId = await this.idpSvc.getPooledUserPool();
    } else {
      console.log('Inside other plans:');
      userPoolId = await this.idpSvc.getPlanBasedUserPool(
        registration.tenantId,
        registration.Path,
        registration.plan,
      );
    }

    const user = {
      userPoolId: userPoolId.toString(),
      email: registration.email,
      tenantId: registration.tenantId,
      companyName: registration.companyName,
    };
    console.log('Creating User:', user);
    this.userSvc.send(CREATE_TENANT_USER, user).subscribe(
      (success) => console.log(success),
      (err) => console.log(err),
    );
  }

  private async provision(plan: PLAN_TYPE) {
    //testing - move to switch case
    if (plan == PLAN_TYPE.Basic) return;

    if (plan == PLAN_TYPE.Standard) {
      console.log('Provisioning Standard tenant:');
      // TODO - Add this to the ClientFactory
      const client = new CodePipelineClient({ region: process.env.AWS_REGION });

      const params = {
        //name: 'standard-tenant-onboarding-pipeline',
        name: 'eks-saas-tenant-onboarding-pipeline',
        clientRequestToken: 'requestToken-' + getTimeString(),
      };

      const command = new StartPipelineExecutionCommand(params);
      const response = await client.send(command);
      console.log(
        'Successfully started standard tenant onboarding pipeline. Response:',
        response,
      );
    }

    if (plan == PLAN_TYPE.Premium) {
      //TRIGGER Karpenter provisioning process

      console.log('Provisioning Premium tenant:');
      // TODO - Add this to the ClientFactory
      const client = new CodePipelineClient({ region: process.env.AWS_REGION });

      const params = {
        name: 'premium-tenant-onboarding-pipeline',
        clientRequestToken: 'requestToken-' + getTimeString(),
      };

      const command = new StartPipelineExecutionCommand(params);
      const response = await client.send(command);
      console.log(
        'Successfully started premium tenant onboarding pipeline. Response:',
        response,
      );
    }
  }
}
