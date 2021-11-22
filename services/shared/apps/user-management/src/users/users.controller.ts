import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto.ts';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('createTenantUser')
  createTenantUser(@Payload() createTenantUserDto: CreateTenantUserDto) {
    return this.usersService.createTenantUser(createTenantUserDto);
  }
}
