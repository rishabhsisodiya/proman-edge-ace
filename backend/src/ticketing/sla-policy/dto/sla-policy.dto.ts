import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Priority, ServiceType } from '@prisma/client';

// responseHours/resolutionHours are optional (2026-07-30) — a policy row can
// be created/left blank when the FSD doesn't define a target yet (e.g.
// Breakdown/Low), for Admin to fill in later via this same endpoint.
// level2DelayHours/level3DelayHours (2026-08-06) — 3-level SLA breach
// escalation ladder, cumulative delays after the Response/Resolution
// breach itself. Also optional/nullable, same reasoning.
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

  @IsOptional()
  @IsInt()
  @Min(1)
  level2DelayHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  level3DelayHours?: number;
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

  @IsOptional()
  @IsInt()
  @Min(1)
  level2DelayHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  level3DelayHours?: number;
}
