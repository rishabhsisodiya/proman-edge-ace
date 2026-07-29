import { IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Region, Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  // Full complexity rule (8+ chars, upper, number, special) enforced in
  // UsersService against AuthService's PASSWORD_POLICY_REGEX — one source of
  // truth for the actual policy, same convention as ChangePasswordDto.
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  mobile!: string;

  @IsEnum(Role)
  role!: Role;

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

  // Set when this User is being created from the "Prefill from ERP Employee"
  // picker — the ERPNext Employee ID (e.g. "PR1170"), not a UUID.
  @IsOptional()
  @IsString()
  erpEmployeeId?: string;
}
