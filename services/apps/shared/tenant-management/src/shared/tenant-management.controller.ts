import { Controller, Get } from '@nestjs/common';
import { TenantManagementService } from './Tenant-management.service';

@Controller()
export class TenantManagementController {
  constructor(
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  @Get()
  getHello(): string {
    return this.tenantManagementService.getHello();
  }
}
