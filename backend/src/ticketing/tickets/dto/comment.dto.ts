import { IsOptional, IsString } from 'class-validator';

/** Optional free-text comment accepted on any post-Accepted stage transition. */
export class CommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
