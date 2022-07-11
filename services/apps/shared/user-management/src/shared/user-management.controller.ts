import { Controller, Get } from '@nestjs/common';
import { Shared/userManagementService } from './shared/user-management.service';

@Controller()
export class Shared/userManagementController {
  constructor(private readonly shared/userManagementService: Shared/userManagementService) {}

  @Get()
  getHello(): string {
    return this.shared/userManagementService.getHello();
  }
}
