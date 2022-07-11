import { Test, TestingModule } from '@nestjs/testing';
import { Application/userController } from './application/user.controller';
import { Application/userService } from './application/user.service';

describe('Application/userController', () => {
  let application/userController: Application/userController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [Application/userController],
      providers: [Application/userService],
    }).compile();

    application/userController = app.get<Application/userController>(Application/userController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(application/userController.getHello()).toBe('Hello World!');
    });
  });
});
