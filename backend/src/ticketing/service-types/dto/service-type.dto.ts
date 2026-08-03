import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateServiceTypeDto {
  // Uppercase-with-underscores, matching the shape of the original 8 enum
  // values — kept consistent since this is the literal stored value on
  // Ticket.serviceType, not a separate display key.
  @IsString()
  @MinLength(1)
  @Matches(/^[A-Z0-9_]+$/, { message: 'code must be uppercase letters, numbers, and underscores only (e.g. ONSITE_TRAINING)' })
  code!: string;

  @IsString()
  @MinLength(1)
  label!: string;
}

export class UpdateServiceTypeConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
