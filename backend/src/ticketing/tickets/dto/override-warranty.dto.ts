import { IsBoolean, IsString, MinLength } from 'class-validator';

// FSD §14.5 rule 34 — "Override warranty flag" (Manager/Admin, §15.1
// permission matrix) with a mandatory reason. Neither the endpoint nor the
// mandatory-reason requirement existed until now (2026-07-31).
export class OverrideWarrantyDto {
  @IsBoolean()
  warrantyEligible!: boolean;

  @IsString()
  @MinLength(1)
  overrideReason!: string;
}
