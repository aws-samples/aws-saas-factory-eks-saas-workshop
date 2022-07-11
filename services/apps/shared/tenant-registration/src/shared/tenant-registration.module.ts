import { Module } from '@nestjs/common';
import { Shared/tenantRegistrationController } from './shared/tenant-registration.controller';
import { Shared/tenantRegistrationService } from './shared/tenant-registration.service';

@Module({
  imports: [],
  controllers: [Shared/tenantRegistrationController],
  providers: [Shared/tenantRegistrationService],
})
export class Shared/tenantRegistrationModule {}
