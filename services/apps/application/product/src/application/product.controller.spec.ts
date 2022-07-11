import { Test, TestingModule } from '@nestjs/testing';
import { Application/productController } from './application/product.controller';
import { Application/productService } from './application/product.service';

describe('Application/productController', () => {
  let application/productController: Application/productController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [Application/productController],
      providers: [Application/productService],
    }).compile();

    application/productController = app.get<Application/productController>(Application/productController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(application/productController.getHello()).toBe('Hello World!');
    });
  });
});
