import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BillingRateService } from './billing-rate.service';
import { CreateBillingRateDto, UpdateBillingRateDto } from './dto/billing-rate.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/billing-rates')
export class BillingRateController {
  constructor(private readonly billingRates: BillingRateService) {}

  @Get()
  list() {
    return this.billingRates.list();
  }

  @Post()
  create(@Body() dto: CreateBillingRateDto) {
    return this.billingRates.create(dto.level, dto.hourlyRate);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBillingRateDto) {
    return this.billingRates.update(id, dto.hourlyRate);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.billingRates.remove(id);
  }
}
