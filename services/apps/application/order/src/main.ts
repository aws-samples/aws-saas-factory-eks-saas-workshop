import { NestFactory } from '@nestjs/core';
import { Application/orderModule } from './application/order.module';

async function bootstrap() {
  const app = await NestFactory.create(Application/orderModule);
  await app.listen(3000);
}
bootstrap();
