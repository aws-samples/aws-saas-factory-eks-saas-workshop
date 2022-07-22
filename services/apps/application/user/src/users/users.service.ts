/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

@Injectable()
export class UsersService {  
  async create(
    tenantId: string,
    userPoolId: string,
    createUserDto: CreateUserDto) {    
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION,
    });
    const cmd = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: createUserDto.email,
      UserAttributes: [{ Name: 'custom:tenant-id', Value: tenantId }],
    });
    await client.send(cmd);
    return JSON.stringify('success');
  }

  async findAll(userPoolId: string, tenantId: string) {
    console.log(
      'Finding all users for userpoolId:',
      userPoolId,
      'and tenantId:',
      tenantId,
    );    
    const client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION,
    });
    const cmd = new ListUsersCommand({
      UserPoolId: userPoolId,
    });
    const res = await client.send(cmd);
    const allUsers = res.Users;
    const users = allUsers
      .filter((user) => {
        user.Attributes.some(
          (attr) =>
            attr.Name === 'custom:tenant-id' && attr.Value === tenantId,
        );
      })
      .map((user) => {
        return {
          email: user.Attributes.find((a) => a.Name === 'email').Value,
          enabled: user.Enabled,
          createdDate: user.UserCreateDate,
          modifiedDate: user.UserLastModifiedDate,
          status: user.UserStatus,
        };
      });
    return users;    
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
