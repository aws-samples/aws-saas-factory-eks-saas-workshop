import { Controller, Get } from '@nestjs/common';
import { Application/orderService } from './application/order.service';

@Controller()
export class Application/orderController {
  constructor(private readonly application/orderService: Application/orderService) {}

  @Get()
  getHello(): string {
    return this.application/orderService.getHello();
  }
}
