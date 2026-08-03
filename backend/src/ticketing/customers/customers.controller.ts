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

  /** Static route — must stay above `:id` or Nest would try to resolve "browse" as a customer id. */
  @Get('browse')
  browse(@Query() filters: { region?: string; accountStatus?: string; search?: string; page?: string; pageSize?: string }) {
    return this.customers.browse({
      region: filters.region,
      accountStatus: filters.accountStatus,
      search: filters.search,
      page: filters.page ? Number(filters.page) : undefined,
      pageSize: filters.pageSize ? Number(filters.pageSize) : undefined,
    });
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
