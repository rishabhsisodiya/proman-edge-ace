import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePriceListDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePriceListDto {
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
