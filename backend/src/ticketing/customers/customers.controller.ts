import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CustomersService } from './customers.service';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() filters: { region?: string; search?: string }) {
    return this.customers.list(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Get(':id/equipment')
  equipmentFor(@Param('id') id: string) {
    return this.customers.equipmentFor(id);
  }
}
