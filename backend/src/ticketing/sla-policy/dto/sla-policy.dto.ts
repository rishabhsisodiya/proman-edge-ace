import { IsEnum, IsInt, Min } from 'class-validator';
import { Priority, ServiceType } from '@prisma/client';

export class CreateSlaPolicyDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsEnum(Priority)
  priority!: Priority;

  @IsInt()
  @Min(1)
  responseHours!: number;

  @IsInt()
  @Min(1)
  resolutionHours!: number;
}

export class UpdateSlaPolicyDto {
  @IsInt()
  @Min(1)
  responseHours!: number;

  @IsInt()
  @Min(1)
  resolutionHours!: number;
}
