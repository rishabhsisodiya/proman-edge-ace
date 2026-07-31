import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFsvDto {
  @IsDateString()
  visitDate!: string;

  // Optional — defaults to the Admin's default SellingPriceList if omitted
  // (same as Quotation's CreateQuotationDto.priceListName; client feedback
  // 2026-07-31: "Quotation has this, why doesn't FSV?").
  @IsOptional()
  @IsString()
  priceListName?: string;

  // Best-effort GPS captured client-side the moment the engineer opens/
  // creates this FSV ("check-in") — same best-effort pattern as the ticket's
  // Reached Site GPS capture (2026-07-31: this field existed on the schema
  // since day one but nothing ever set it — a dead field until now).
  @IsOptional()
  @IsNumber()
  gpsLatAtCheckin?: number;

  @IsOptional()
  @IsNumber()
  gpsLongAtCheckin?: number;
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

// All optional — same "any subset" PATCH pattern as UpdateFsvDto. Added
// 2026-07-31 (client feedback: "Items cannot be edited in the FSV" — only
// add/remove existed before).
export class UpdateFsvPartDto {
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  warehouse?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingRate?: number;
}

export class AddFsvPhotoDto {
  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
