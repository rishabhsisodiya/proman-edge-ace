import { IsISO8601, IsString, ValidateIf } from 'class-validator';
import { SLA_TARGET_DATE_SERVICE_TYPES } from '../sla-policy.constants';

export class UpdateServiceTypeDto {
  // Free string (2026-08-02, Service Types Tier 1) — was `@IsEnum(ServiceType)`;
  // validated against ServiceTypeConfig in TicketsService.updateServiceType().
  @IsString()
  serviceType!: string;

  // Required (ISO 8601) only when serviceType is being set to one of the 3
  // SLA-Target-Date types and the ticket doesn't already have one — see
  // TicketsService.updateServiceType().
  @ValidateIf((o) => SLA_TARGET_DATE_SERVICE_TYPES.includes(o.serviceType))
  @IsISO8601()
  slaTargetDate?: string;
}
