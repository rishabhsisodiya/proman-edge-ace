import { IsEnum } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class CreateSlaPauseStateDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}
