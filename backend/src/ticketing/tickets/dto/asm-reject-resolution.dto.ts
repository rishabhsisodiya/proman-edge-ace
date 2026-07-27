import { IsString, IsUUID, MinLength } from 'class-validator';

export class AsmRejectResolutionDto {
  @IsUUID()
  engineerId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
