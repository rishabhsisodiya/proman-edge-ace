import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { PartnerTicketDto } from './dto/partner-ticket.dto';
import { TicketsService } from '../tickets/tickets.service';

/**
 * Partner/IoT ticket-creation webhook (Build Plan Phase 2 item 7) —
 * scaffolding only: endpoint + API-key auth + routing into the same
 * CreateTicket engine every other source uses. No real IoT/partner adapter
 * exists yet since no external caller is confirmed; this proves the
 * contract works, ready for a real adapter once a partner is named.
 */
@UseGuards(ApiKeyGuard)
@Controller('webhooks/ticket-sources')
export class TicketSourcesController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@Body() dto: PartnerTicketDto) {
    return this.tickets.createFromPartner(dto);
  }
}
