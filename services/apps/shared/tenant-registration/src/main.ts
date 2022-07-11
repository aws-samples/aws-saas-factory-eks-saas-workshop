import { NestFactory } from '@nestjs/core';
import { Shared/tenantRegistrationModule } from './shared/tenant-registration.module';

async function bootstrap() {
  const app = await NestFactory.create(Shared/tenantRegistrationModule);
  await app.listen(3000);
}
bootstrap();
