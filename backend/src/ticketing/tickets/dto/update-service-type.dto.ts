import { IsEnum, IsISO8601, ValidateIf } from 'class-validator';
import { ServiceType } from '@prisma/client';
import { SLA_TARGET_DATE_SERVICE_TYPES } from '../sla-policy.constants';

export class UpdateServiceTypeDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  // Required (ISO 8601) only when serviceType is being set to one of the 3
  // SLA-Target-Date types and the ticket doesn't already have one — see
  // TicketsService.updateServiceType().
  @ValidateIf((o) => SLA_TARGET_DATE_SERVICE_TYPES.includes(o.serviceType))
  @IsISO8601()
  slaTargetDate?: string;
}
