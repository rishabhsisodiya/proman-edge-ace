import { IsEnum, IsString, MinLength } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class RegularizeTicketDto {
  @IsEnum(TicketStatus)
  targetStatus!: TicketStatus;

  @IsString()
  @MinLength(1)
  reason!: string;
}
