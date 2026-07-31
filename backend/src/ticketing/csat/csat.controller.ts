import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CsatService } from './csat.service';
import { SubmitCsatDto } from './dto/submit-csat.dto';

// Deliberately outside any @UseGuards — public, customer-facing, no login.
// Scoped under /public/* so it's obvious at a glance in routing/logs that
// this path is meant to be reachable without auth, unlike everything else
// under /tickets/*.
@Controller('public/csat')
export class CsatController {
  constructor(private readonly csat: CsatService) {}

  @Get(':ticketId')
  getSurveyState(@Param('ticketId') ticketId: string) {
    return this.csat.getSurveyState(ticketId);
  }

  @Post(':ticketId')
  submit(@Param('ticketId') ticketId: string, @Body() dto: SubmitCsatDto) {
    return this.csat.submit(ticketId, dto.score, dto.responseText);
  }
}
