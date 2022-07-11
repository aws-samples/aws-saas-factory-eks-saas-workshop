import { Test, TestingModule } from '@nestjs/testing';
import { TenantManagementController } from './Tenant-management.controller';
import { TenantManagementService } from './Tenant-management.service';

describe('TenantManagementController', () => {
  let tenantManagementController: TenantManagementController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [TenantManagementController],
      providers: [TenantManagementService],
    }).compile();

    tenantManagementController = app.get<TenantManagementController>(
      TenantManagementController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(tenantManagementController.getHello()).toBe('Hello World!');
    });
  });
});
