import { NestFactory } from '@nestjs/core';
import { Application/productModule } from './application/product.module';

async function bootstrap() {
  const app = await NestFactory.create(Application/productModule);
  await app.listen(3000);
}
bootstrap();
