import { NestFactory } from '@nestjs/core';
import { Shared/userManagementModule } from './shared/user-management.module';

async function bootstrap() {
  const app = await NestFactory.create(Shared/userManagementModule);
  await app.listen(3000);
}
bootstrap();
