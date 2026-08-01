import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { DeliveryStatus } from '@prisma/client';

// Client decision (2026-08-01): Customer PO capture is manual entry in ACE
// (Call Center/ASM/CS Support types it in once the customer sends it via
// email/phone) — not synced from ERPNext. Kept as its own DTO/endpoint,
// separate from UpdateQuotationDto, since a PO typically arrives AFTER the
// quotation has already been pushed to ERPNext (that's the point of a PO —
// confirming a negotiated deal), so it must stay settable even when the
// quotation itself is otherwise locked (assertEditable/erpnextQuotationId).
export class UpdateCustomerPoDto {
  @IsOptional()
  @IsString()
  customerPoNumber?: string;

  @IsOptional()
  @IsDateString()
  customerPoDate?: string;
}

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

  @IsOptional()
  @IsString()
  priceListName?: string;
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

  @IsOptional()
  @IsString()
  priceListName?: string;
}

export class UpdateQuotationItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

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
