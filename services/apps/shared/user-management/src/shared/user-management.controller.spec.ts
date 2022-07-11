import { Test, TestingModule } from '@nestjs/testing';
import { Shared/userManagementController } from './shared/user-management.controller';
import { Shared/userManagementService } from './shared/user-management.service';

describe('Shared/userManagementController', () => {
  let shared/userManagementController: Shared/userManagementController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [Shared/userManagementController],
      providers: [Shared/userManagementService],
    }).compile();

    shared/userManagementController = app.get<Shared/userManagementController>(Shared/userManagementController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(shared/userManagementController.getHello()).toBe('Hello World!');
    });
  });
});
