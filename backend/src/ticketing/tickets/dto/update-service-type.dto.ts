import { IsEnum } from 'class-validator';
import { ServiceType } from '@prisma/client';

export class UpdateServiceTypeDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;
}
