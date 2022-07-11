import { NestFactory } from '@nestjs/core';
import { Application/userModule } from './application/user.module';

async function bootstrap() {
  const app = await NestFactory.create(Application/userModule);
  await app.listen(3000);
}
bootstrap();
