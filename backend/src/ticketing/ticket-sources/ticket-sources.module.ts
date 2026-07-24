import { Module } from '@nestjs/common';
import { TicketSourcesController } from './ticket-sources.controller';
import { PartnerApiKeyController } from './partner-api-key.controller';
import { PartnerApiKeyService } from './partner-api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [TicketSourcesController, PartnerApiKeyController],
  providers: [PartnerApiKeyService, ApiKeyGuard],
  exports: [PartnerApiKeyService],
})
export class TicketSourcesModule {}
