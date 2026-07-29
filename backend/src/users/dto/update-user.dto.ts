import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Region, Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  // Present only when Admin is actually changing the role — UsersService
  // blocks this if the user has any open (non-Closed) ticket assigned to
  // them as ASM or Engineer.
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsEnum(Region, { each: true })
  regions?: Region[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillTags?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyIds?: string[];

  @IsOptional()
  @IsString()
  engineerLevel?: string;

  // Deactivating is blocked under the same open-ticket condition as a role
  // change (client decision, 2026-07-28) — reactivating (true) is never blocked.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
