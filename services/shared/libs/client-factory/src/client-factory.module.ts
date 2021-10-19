import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientFactoryService } from './client-factory.service';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [ClientFactoryService],
  exports: [ClientFactoryService],
})
export class ClientFactoryModule {}
