import { IsString, MinLength } from 'class-validator';

export class CreateSkillTagDto {
  @IsString()
  @MinLength(1)
  label!: string;
}
