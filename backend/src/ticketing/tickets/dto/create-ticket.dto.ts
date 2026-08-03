import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Source, Priority, CustomerCategory } from '@prisma/client';
import { SLA_TARGET_DATE_SERVICE_TYPES } from '../sla-policy.constants';

export class CreateTicketDto {
  @IsEnum(Source)
  source!: Source;

  // Manual field, separate from the auto-calculated warranty/AMC chargeability
  // check — see CustomerCategory enum doc in schema.prisma.
  @IsOptional()
  @IsEnum(CustomerCategory)
  customerCategory?: CustomerCategory;

  // Free string (2026-08-02, Service Types Tier 1) — was `@IsEnum(ServiceType)`.
  // Actual existence/active-status validation against ServiceTypeConfig now
  // happens in TicketsService.create(), not at the DTO layer, since the set
  // of valid values is Admin-configurable, not a fixed TS enum anymore.
  @IsOptional()
  @IsString()
  serviceType?: string; // auto-classified if omitted for auto-sources

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority; // auto-assigned from priority matrix if omitted

  @IsString()
  description!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string; // required unless Spares Supply ticket (FSD §5.3)

  // FSD §5.3 — 200-char cap on the manual subject (free text, no structured
  // format enforced for manual entry per FSD-Analysis Q11). Auto-generated
  // fallback when omitted is always well under this, so no cap needed there.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  // Required (ISO 8601) only when serviceType is one of the 3 SLA-Target-Date
  // types; ignored otherwise. Per-type UI label: Planned Date/Agreed Date/
  // Quotation Schedule Date — one underlying field.
  @ValidateIf((o) => SLA_TARGET_DATE_SERVICE_TYPES.includes(o.serviceType))
  @IsISO8601()
  slaTargetDate?: string;

  // FSD §14.1 rule 17 (2026-08-03 fix) — "A ticket cannot be created for a
  // customer with account_status = 'Blacklisted' without explicit
  // Manager-level approval (override flag in the create request)." Was
  // previously an unconditional role-based bypass for Manager, no flag at
  // all — replaced with this explicit opt-in, required every time,
  // Manager or not.
  @IsOptional()
  @IsBoolean()
  overrideBlacklistApproval?: boolean;

  @ValidateIf((o) => o.overrideBlacklistApproval === true)
  @IsString()
  @MinLength(1)
  overrideReason?: string;
}
