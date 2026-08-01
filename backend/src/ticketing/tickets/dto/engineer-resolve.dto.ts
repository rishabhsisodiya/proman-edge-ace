import { IsString, MinLength } from 'class-validator';

export class EngineerResolveDto {
  @IsString()
  @MinLength(20)
  resolutionSummary!: string;
}
