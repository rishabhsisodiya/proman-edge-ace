import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveDuplicateDto {
  @IsIn(['MERGE', 'DISMISS'])
  action!: 'MERGE' | 'DISMISS';

  @IsOptional()
  @IsString()
  reason?: string;
}
