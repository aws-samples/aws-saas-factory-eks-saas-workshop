import { Module } from '@nestjs/common';
import { Application/userController } from './application/user.controller';
import { Application/userService } from './application/user.service';

@Module({
  imports: [],
  controllers: [Application/userController],
  providers: [Application/userService],
})
export class Application/userModule {}
