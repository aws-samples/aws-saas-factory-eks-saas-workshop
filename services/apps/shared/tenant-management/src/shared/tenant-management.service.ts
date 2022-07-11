import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantManagementService {
  getHello(): string {
    return 'Hello World!';
  }
}
