import { IsEnum } from 'class-validator';
import { CustomerType } from '@prisma/client';

export class UpdateCustomerTypeDto {
  @IsEnum(CustomerType)
  customerType!: CustomerType;
}
