import { ScheduledReportFrequency } from '@prisma/client';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { PDF_SUPPORTED, REPORT_KEYS, ReportKey } from '../report-registry';

export class CreateScheduledReportDto {
  @IsIn(REPORT_KEYS)
  reportKey!: ReportKey;

  @IsObject()
  filters!: Record<string, string>;

  // Only meaningful if `filters` would otherwise carry dateFrom/dateTo — the
  // cron recomputes the actual range at send time so the schedule never
  // goes stale (2026-07-31 client decision). Null/omitted for reports with
  // no date-range filter.
  @IsOptional()
  @IsInt()
  @Min(1)
  relativeWindowDays?: number;

  @IsIn(['excel', 'pdf'])
  format!: 'excel' | 'pdf';

  @IsArray()
  @IsEmail({}, { each: true })
  recipients!: string[];

  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency!: ScheduledReportFrequency;

  @ValidateIf((o) => o.frequency === 'WEEKLY')
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ValidateIf((o) => o.frequency === 'MONTHLY')
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsInt()
  @Min(0)
  @Max(23)
  sendHour!: number;
}

export class UpdateScheduledReportDto {
  @IsOptional()
  @IsObject()
  filters?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  relativeWindowDays?: number;

  @IsOptional()
  @IsIn(['excel', 'pdf'])
  format?: 'excel' | 'pdf';

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  frequency?: ScheduledReportFrequency;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendHour?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Re-exported for the service's own runtime cross-check (format vs. PDF_SUPPORTED
// isn't a class-validator-expressible rule since it depends on reportKey).
export { PDF_SUPPORTED };
