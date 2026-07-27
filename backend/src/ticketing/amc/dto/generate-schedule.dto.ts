import { IsArray, IsDateString } from 'class-validator';

export class GenerateScheduleDto {
  @IsArray()
  @IsDateString({}, { each: true })
  visitDates!: string[];
}
