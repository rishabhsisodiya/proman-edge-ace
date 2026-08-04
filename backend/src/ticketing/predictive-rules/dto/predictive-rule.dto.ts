import { IsInt, Min } from 'class-validator';

export class UpdatePredictiveRuleDto {
  @IsInt()
  @Min(1)
  monthsSinceService!: number;

  @IsInt()
  @Min(1)
  operatingHoursInterval!: number;

  @IsInt()
  @Min(1)
  breakdownFrequencyThreshold!: number;

  @IsInt()
  @Min(1)
  breakdownFrequencyWindowMonths!: number;

  @IsInt()
  @Min(1)
  warrantyPmIntervalMonths!: number;
}
