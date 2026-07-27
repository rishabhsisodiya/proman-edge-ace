import { IsDateString, IsUUID } from 'class-validator';

export class AddVisitDto {
  @IsUUID()
  equipmentId!: string;

  @IsDateString()
  plannedDate!: string;
}
