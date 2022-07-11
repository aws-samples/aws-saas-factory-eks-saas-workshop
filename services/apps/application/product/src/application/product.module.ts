import { Module } from '@nestjs/common';
import { Application/productController } from './application/product.controller';
import { Application/productService } from './application/product.service';

@Module({
  imports: [],
  controllers: [Application/productController],
  providers: [Application/productService],
})
export class Application/productModule {}
