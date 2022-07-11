import { Test, TestingModule } from '@nestjs/testing';
import { ClientFactoryService } from './client-factory.service';

describe('ClientFactoryService', () => {
  let service: ClientFactoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientFactoryService],
    }).compile();

    service = module.get<ClientFactoryService>(ClientFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
