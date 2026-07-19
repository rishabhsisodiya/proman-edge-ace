import { IsString, MinLength } from 'class-validator';

export class ResolveTicketDto {
  @IsString()
  @MinLength(1)
  resolutionSummary!: string;
}
