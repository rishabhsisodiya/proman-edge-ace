import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PendingReason } from '@prisma/client';

export class MarkPendingDto {
  @IsEnum(PendingReason)
  pendingReason!: PendingReason;

  @IsOptional()
  @IsString()
  pendingNotes?: string;
}
