import { IsString, MinLength } from 'class-validator';

export class UpdateTicketStatusLabelDto {
  @IsString()
  @MinLength(1)
  label!: string;
}
