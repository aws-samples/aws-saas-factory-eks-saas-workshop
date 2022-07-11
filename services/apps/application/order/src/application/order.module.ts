import { Module } from '@nestjs/common';
import { Application/orderController } from './application/order.controller';
import { Application/orderService } from './application/order.service';

@Module({
  imports: [],
  controllers: [Application/orderController],
  providers: [Application/orderService],
})
export class Application/orderModule {}
