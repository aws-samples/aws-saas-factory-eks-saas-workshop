import { Injectable } from '@nestjs/common';

@Injectable()
export class Shared/userManagementService {
  getHello(): string {
    return 'Hello World!';
  }
}
