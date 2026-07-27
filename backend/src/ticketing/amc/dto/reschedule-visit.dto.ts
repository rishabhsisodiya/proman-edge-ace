import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RescheduleVisitDto {
  @IsDateString()
  plannedDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
