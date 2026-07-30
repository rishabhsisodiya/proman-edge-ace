import { IsOptional, IsString } from 'class-validator';

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;
}
