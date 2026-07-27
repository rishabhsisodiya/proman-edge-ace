import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Source, ServiceType, Priority, CustomerCategory } from '@prisma/client';

export class CreateTicketDto {
  @IsEnum(Source)
  source!: Source;

  // Manual field, separate from the auto-calculated warranty/AMC chargeability
  // check — see CustomerCategory enum doc in schema.prisma.
  @IsOptional()
  @IsEnum(CustomerCategory)
  customerCategory?: CustomerCategory;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType; // auto-classified if omitted for auto-sources

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

  @IsOptional()
  @IsString()
  subject?: string; // auto-generated from equipment+serviceType+site if omitted
}
