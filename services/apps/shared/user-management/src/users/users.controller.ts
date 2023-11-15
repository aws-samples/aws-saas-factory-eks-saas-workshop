import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto.ts';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {
    console.debug();
    console.debug('Configuration');
    console.debug('-----------------------------------------------------');
    console.debug('PORT=' + process.env.PORT);
    console.debug('KUBERNETES_NAMESPACE=' + process.env.KUBERNETES_NAMESPACE);
    console.debug('KUBERNETES_POD_NAME=' + process.env.KUBERNETES_POD_NAME);
    console.debug('KUBERNETES_NODE_NAME=' + process.env.KUBERNETES_NODE_NAME);
  }

  @MessagePattern('createTenantUser')
  createTenantUser(@Payload() createTenantUserDto: CreateTenantUserDto) {
    return this.usersService.createTenantUser(createTenantUserDto);
  }
}
