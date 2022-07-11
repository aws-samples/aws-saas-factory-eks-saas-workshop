import { Module } from '@nestjs/common';
import { TenantManagementController } from './Tenant-management.controller';
import { TenantManagementService } from './Tenant-management.service';

@Module({
  imports: [],
  controllers: [TenantManagementController],
  providers: [TenantManagementService],
})
export class TenantManagementModule {}
