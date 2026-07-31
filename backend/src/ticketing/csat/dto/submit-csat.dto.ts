import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitCsatDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  responseText?: string;
}
