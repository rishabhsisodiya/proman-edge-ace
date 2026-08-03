import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AmcEngineSettingsService } from './amc-engine-settings.service';
import { UpdateAmcEngineSettingsDto } from './dto/amc-engine-settings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/amc-engine-settings')
export class AmcEngineSettingsController {
  constructor(private readonly settings: AmcEngineSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateAmcEngineSettingsDto) {
    return this.settings.update(dto.lookAheadDays);
  }
}
