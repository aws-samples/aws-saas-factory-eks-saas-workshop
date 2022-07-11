import { Controller, Get } from '@nestjs/common';
import { Application/productService } from './application/product.service';

@Controller()
export class Application/productController {
  constructor(private readonly application/productService: Application/productService) {}

  @Get()
  getHello(): string {
    return this.application/productService.getHello();
  }
}
