import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AmcContractService } from './amc-contract.service';
import { CreateAmcContractDto, UpdateAmcContractDto } from './dto/amc-contract.dto';

@UseGuards(JwtAuthGuard)
@Controller('amc-contracts')
export class AmcContractController {
  constructor(private readonly amc: AmcContractService) {}

  @Get()
  list(@Query('customerId') customerId?: string) {
    return this.amc.list(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.amc.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateAmcContractDto) {
    return this.amc.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAmcContractDto) {
    return this.amc.update(id, dto);
  }
}
