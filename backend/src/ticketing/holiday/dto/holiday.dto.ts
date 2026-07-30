import { IsISO8601, IsString, MinLength } from 'class-validator';

export class CreateHolidayDto {
  @IsISO8601()
  date!: string;

  @IsString()
  @MinLength(1)
  label!: string;
}
