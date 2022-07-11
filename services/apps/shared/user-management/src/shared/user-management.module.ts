import { Module } from '@nestjs/common';
import { Shared/userManagementController } from './shared/user-management.controller';
import { Shared/userManagementService } from './shared/user-management.service';

@Module({
  imports: [],
  controllers: [Shared/userManagementController],
  providers: [Shared/userManagementService],
})
export class Shared/userManagementModule {}
