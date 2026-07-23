import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateBillingRateDto {
  @IsString()
  @MinLength(1)
  level!: string;

  @IsNumber()
  @Min(0)
  hourlyRate!: number;
}

export class UpdateBillingRateDto {
  @IsNumber()
  @Min(0)
  hourlyRate!: number;
}
