import { IsNumber, IsOptional } from 'class-validator';
import { CommentDto } from './comment.dto';

/** GPS point capture (2026-07-31) — best-effort, both fields optional so a
 * denied/unavailable location never blocks the "Reached Site" transition. */
export class ReachedSiteDto extends CommentDto {
  @IsOptional()
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  gpsLong?: number;
}
