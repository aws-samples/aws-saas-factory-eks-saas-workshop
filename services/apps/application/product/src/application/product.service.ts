import { Injectable } from '@nestjs/common';

@Injectable()
export class Application/productService {
  getHello(): string {
    return 'Hello World!';
  }
}
