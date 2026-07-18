import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  // Full complexity rule (8+ chars, upper, number, special) is enforced in
  // AuthService against the FSD's exact policy — kept out of the decorator so
  // the one regex source of truth lives with the business rule, not the DTO.
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
