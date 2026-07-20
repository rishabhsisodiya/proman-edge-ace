import { IsEnum, IsString, MinLength } from 'class-validator';
import { Region } from '@prisma/client';

export class CreateRegionMappingDto {
  @IsString()
  @MinLength(1)
  erpTerritory!: string;

  @IsEnum(Region)
  region!: Region;
}

export class UpdateRegionMappingDto {
  @IsEnum(Region)
  region!: Region;
}
