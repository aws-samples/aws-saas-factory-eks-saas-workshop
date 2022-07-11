import { NestFactory } from '@nestjs/core';
import { TenantManagementModule } from './shared/tenant-management.module';

async function bootstrap() {
  const app = await NestFactory.create(TenantManagementModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    methods: '*',
  });
  await app.listen(3001);
}
bootstrap();
