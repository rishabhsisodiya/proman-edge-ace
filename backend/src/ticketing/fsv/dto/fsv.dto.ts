import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFsvDto {
  @IsDateString()
  visitDate!: string;
}

// All optional — this is the "live autosave" draft PATCH, any subset of
// fields can be sent as the engineer fills the form in over time.
export class UpdateFsvDto {
  @IsOptional()
  @IsDateString()
  travelStartTime?: string;

  @IsOptional()
  @IsDateString()
  siteArrivalTime?: string;

  @IsOptional()
  @IsDateString()
  workStartTime?: string;

  @IsOptional()
  @IsDateString()
  workEndTime?: string;

  @IsOptional()
  @IsString()
  workPerformed?: string;

  @IsOptional()
  @IsString()
  findingsRootCause?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  customerRepName?: string;

  @IsOptional()
  @IsString()
  customerRepDesignation?: string;

  @IsOptional()
  @IsBoolean()
  customerSignOff?: boolean;

  @IsOptional()
  @IsString()
  customerSignatureUrl?: string;

  @IsOptional()
  @IsBoolean()
  noPartsUsed?: boolean;

  @IsOptional()
  @IsNumber()
  gpsLatAtCheckin?: number;

  @IsOptional()
  @IsNumber()
  gpsLongAtCheckin?: number;
}

export class AddFsvPartDto {
  @IsString()
  @MinLength(1)
  itemCode!: string;

  @IsString()
  @MinLength(1)
  itemName!: string;

  @IsNumber()
  @Min(0.001)
  qty!: number;

  @IsString()
  uom!: string;

  @IsString()
  @MinLength(1)
  warehouse!: string;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsNumber()
  @Min(0)
  sellingRate!: number;
}

export class AddFsvPhotoDto {
  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
