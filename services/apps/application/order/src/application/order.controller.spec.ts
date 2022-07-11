import { Test, TestingModule } from '@nestjs/testing';
import { Application/orderController } from './application/order.controller';
import { Application/orderService } from './application/order.service';

describe('Application/orderController', () => {
  let application/orderController: Application/orderController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [Application/orderController],
      providers: [Application/orderService],
    }).compile();

    application/orderController = app.get<Application/orderController>(Application/orderController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(application/orderController.getHello()).toBe('Hello World!');
    });
  });
});
