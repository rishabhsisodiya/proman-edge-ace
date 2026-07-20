import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RegionMappingService } from './region-mapping.service';
import { CreateRegionMappingDto, UpdateRegionMappingDto } from './dto/region-mapping.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/region-mappings')
export class RegionMappingController {
  constructor(private readonly regionMappings: RegionMappingService) {}

  @Get()
  list() {
    return this.regionMappings.list();
  }

  @Post()
  create(@Body() dto: CreateRegionMappingDto) {
    return this.regionMappings.create(dto.erpTerritory, dto.region);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRegionMappingDto) {
    return this.regionMappings.update(id, dto.region);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.regionMappings.remove(id);
  }
}
