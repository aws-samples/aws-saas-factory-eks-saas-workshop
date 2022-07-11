import { Controller, Get } from '@nestjs/common';
import { Shared/tenantRegistrationService } from './shared/tenant-registration.service';

@Controller()
export class Shared/tenantRegistrationController {
  constructor(private readonly shared/tenantRegistrationService: Shared/tenantRegistrationService) {}

  @Get()
  getHello(): string {
    return this.shared/tenantRegistrationService.getHello();
  }
}
