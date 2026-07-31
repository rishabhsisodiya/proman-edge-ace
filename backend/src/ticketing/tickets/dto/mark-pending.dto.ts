import { IsEnum, IsString, MinLength } from 'class-validator';
import { PendingReason } from '@prisma/client';

// pendingNotes made mandatory (client feedback, 2026-07-31) — was optional,
// meaning a ticket could sit Pending with only a reason code and no actual
// explanation of what's actually being waited on.
export class MarkPendingDto {
  @IsEnum(PendingReason)
  pendingReason!: PendingReason;

  @IsString()
  @MinLength(1)
  pendingNotes!: string;
}
