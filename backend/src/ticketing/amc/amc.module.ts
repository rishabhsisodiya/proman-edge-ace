import { Module } from '@nestjs/common';
import { AmcContractController } from './amc-contract.controller';
import { AmcContractService } from './amc-contract.service';

@Module({
  controllers: [AmcContractController],
  providers: [AmcContractService],
  exports: [AmcContractService],
})
export class AmcModule {}
