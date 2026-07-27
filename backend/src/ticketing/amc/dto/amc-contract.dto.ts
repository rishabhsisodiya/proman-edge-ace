import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { PartsCoverage } from '@prisma/client';

export class CreateAmcContractDto {
  @IsString()
  @MinLength(1)
  contractReferenceNo!: string;

  @IsUUID()
  customerId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  contractValue!: number;

  @IsInt()
  @Min(0)
  visitsIncluded!: number;

  @IsEnum(PartsCoverage)
  partsCoverage!: PartsCoverage;

  @IsOptional()
  @IsString()
  scopeOfServices?: string;

  @IsOptional()
  @IsString()
  exclusions?: string;

  @IsOptional()
  @IsUUID()
  owningAsmId?: string;

  @IsOptional()
  @IsUUID()
  previousContractId?: string;

  @IsOptional()
  @IsString()
  signedAgreementUrl?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  // ≥1 required per §5.1.5, enforced in the service (class-validator's
  // ArrayMinSize would also work, kept as a service-level check alongside
  // the overlapping-contract warning logic).
  @IsArray()
  @IsUUID('4', { each: true })
  coveredEquipmentIds!: string[];

  // One planned date per visit, from the Visit Schedule editor's
  // Monthly/Quarterly-cadence-or-custom picker — length must equal
  // visitsIncluded (checked in the service, not here, since it's a
  // cross-field rule). Optional for API robustness (falls back to
  // even-spacing if omitted), though the UI always sends it now.
  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  visitDates?: string[];
}

export class UpdateAmcContractDto extends CreateAmcContractDto {}
