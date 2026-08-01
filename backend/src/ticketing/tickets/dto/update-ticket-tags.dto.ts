import { IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateTicketTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags!: string[];
}
