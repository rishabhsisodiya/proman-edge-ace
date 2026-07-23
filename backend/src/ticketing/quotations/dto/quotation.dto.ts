import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { DeliveryStatus } from '@prisma/client';

export class CreateQuotationDto {
  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsNumber()
  labourCharges?: number;

  @IsOptional()
  @IsString()
  notesToCustomer?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsUUID()
  amcContractId?: string;
}

export class UpdateQuotationDto {
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsNumber()
  labourCharges?: number;

  @IsOptional()
  @IsString()
  notesToCustomer?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;
}

export class AddQuotationItemDto {
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

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;
}

export class UpdateDeliveryDto {
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @IsString()
  trackingNotes?: string;

  @IsOptional()
  @IsString()
  erpnextDeliveryNoteId?: string;
}
