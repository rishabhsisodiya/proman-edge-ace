import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Priority, ServiceType } from '@prisma/client';

// responseHours/resolutionHours are optional (2026-07-30) — a policy row can
// be created/left blank when the FSD doesn't define a target yet (e.g.
// Breakdown/Low), for Admin to fill in later via this same endpoint.
export class CreateSlaPolicyDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsEnum(Priority)
  priority!: Priority;

  @IsOptional()
  @IsInt()
  @Min(1)
  responseHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  resolutionHours?: number;
}

export class UpdateSlaPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  responseHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  resolutionHours?: number;
}
