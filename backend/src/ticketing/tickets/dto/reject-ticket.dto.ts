import { IsString, MinLength } from 'class-validator';

export class RejectTicketDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
