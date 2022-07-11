import { Injectable } from '@nestjs/common';

@Injectable()
export class Application/userService {
  getHello(): string {
    return 'Hello World!';
  }
}
