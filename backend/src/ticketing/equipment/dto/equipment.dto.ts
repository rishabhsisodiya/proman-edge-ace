import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { EquipCategory, EquipStatus } from '@prisma/client';

export class CreateEquipmentDto {
  @IsString()
  @MinLength(1)
  serialNo!: string;

  @IsString()
  @MinLength(1)
  itemCode!: string;

  @IsString()
  @MinLength(1)
  itemName!: string;

  @IsEnum(EquipCategory)
  equipmentCategory!: EquipCategory;

  @IsOptional()
  @IsString()
  modelNumber?: string;

  @IsUUID()
  customerId!: string;

  // Required in principle, optional for now (§ decision — sites may not be
  // known yet at manual-entry time).
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsNumber()
  gpsLat?: number;

  @IsOptional()
  @IsNumber()
  gpsLong?: number;

  @IsDateString()
  installationDate!: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsDateString()
  warrantyStartDate!: string;

  @IsDateString()
  warrantyEndDate!: string;

  @IsInt()
  @Min(0)
  warrantyPeriodMonths!: number;

  @IsOptional()
  @IsNumber()
  operatingHoursMeter?: number;

  @IsOptional()
  @IsEnum(EquipStatus)
  status?: EquipStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillTagsRequired?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  amcContractIds?: string[];
}

export class UpdateEquipmentDto extends CreateEquipmentDto {}
