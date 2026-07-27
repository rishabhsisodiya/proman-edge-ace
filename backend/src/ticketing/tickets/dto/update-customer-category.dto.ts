import { IsEnum } from 'class-validator';
import { CustomerCategory } from '@prisma/client';

export class UpdateCustomerCategoryDto {
  @IsEnum(CustomerCategory)
  customerCategory!: CustomerCategory;
}
