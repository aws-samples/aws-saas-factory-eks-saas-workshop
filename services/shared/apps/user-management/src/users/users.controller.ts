import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto.ts';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('createTenantUser')
  createTenantUser(@Payload() createTenantUserDto: CreateTenantUserDto) {
    return this.usersService.createTenantUser(createTenantUserDto);
  }

  @MessagePattern('findAllUsers')
  findAll() {
    return this.usersService.findAll();
  }

  @MessagePattern('findOneUser')
  findOne(@Payload() id: number) {
    return this.usersService.findOne(id);
  }

  @MessagePattern('updateUser')
  update(@Payload() updateUserDto: UpdateUserDto) {
    return this.usersService.update(updateUserDto.id, updateUserDto);
  }

  @MessagePattern('removeUser')
  remove(@Payload() id: number) {
    return this.usersService.remove(id);
  }
}
