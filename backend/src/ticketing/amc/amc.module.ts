import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { AmcContractController } from './amc-contract.controller';
import { AmcContractService } from './amc-contract.service';
import { AmcVisitCron } from './amc-visit.cron';
import { AmcRenewalCron } from './amc-renewal.cron';
import { AmcEngineSettingsController } from './amc-engine-settings.controller';
import { AmcEngineSettingsService } from './amc-engine-settings.service';

@Module({
  imports: [TicketsModule],
  controllers: [AmcContractController, AmcEngineSettingsController],
  providers: [AmcContractService, AmcVisitCron, AmcRenewalCron, AmcEngineSettingsService],
  exports: [AmcContractService],
})
export class AmcModule {}
