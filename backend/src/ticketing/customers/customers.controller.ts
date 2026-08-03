import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CustomersService } from './customers.service';
import { UpdateCustomerTypeDto } from './dto/update-customer-type.dto';

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
  browse(
    @Query() filters: { region?: string; accountStatus?: string; search?: string; page?: string; pageSize?: string },
    @Req() req: any,
  ) {
    return this.customers.browse(
      {
        region: filters.region,
        accountStatus: filters.accountStatus,
        search: filters.search,
        page: filters.page ? Number(filters.page) : undefined,
        pageSize: filters.pageSize ? Number(filters.pageSize) : undefined,
      },
      { userId: req.user.userId, role: req.user.role },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Get(':id/equipment')
  equipmentFor(@Param('id') id: string) {
    return this.customers.equipmentFor(id);
  }

  /** Resolves the "customerType defaulted to DIRECT" Needs Review reason (§10.1 W-18). */
  @Patch(':id/customer-type')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  setCustomerType(@Param('id') id: string, @Body() dto: UpdateCustomerTypeDto) {
    return this.customers.setCustomerType(id, dto.customerType);
  }

  /** "Sync from ERP" button on Customer Detail — resyncs this customer, its sites, and its equipment. */
  @Post(':id/sync')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  syncFromErp(@Param('id') id: string) {
    return this.customers.syncFromErp(id);
  }
}
