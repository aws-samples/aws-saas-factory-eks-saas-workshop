import { Test, TestingModule } from '@nestjs/testing';
import { Shared/tenantRegistrationController } from './shared/tenant-registration.controller';
import { Shared/tenantRegistrationService } from './shared/tenant-registration.service';

describe('Shared/tenantRegistrationController', () => {
  let shared/tenantRegistrationController: Shared/tenantRegistrationController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [Shared/tenantRegistrationController],
      providers: [Shared/tenantRegistrationService],
    }).compile();

    shared/tenantRegistrationController = app.get<Shared/tenantRegistrationController>(Shared/tenantRegistrationController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(shared/tenantRegistrationController.getHello()).toBe('Hello World!');
    });
  });
});
