import { Controller, Get } from '@nestjs/common';
import { Application/userService } from './application/user.service';

@Controller()
export class Application/userController {
  constructor(private readonly application/userService: Application/userService) {}

  @Get()
  getHello(): string {
    return this.application/userService.getHello();
  }
}
