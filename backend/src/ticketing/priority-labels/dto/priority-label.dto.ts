import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePriorityLabelDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  definition?: string;
}
