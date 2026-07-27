import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { AmcContractController } from './amc-contract.controller';
import { AmcContractService } from './amc-contract.service';
import { AmcVisitCron } from './amc-visit.cron';

@Module({
  imports: [TicketsModule],
  controllers: [AmcContractController],
  providers: [AmcContractService, AmcVisitCron],
  exports: [AmcContractService],
})
export class AmcModule {}
