import { Controller, Get, NotFoundException, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { DispatchService } from './dispatch.service';

// Mirrors PROMAN/backend/src/routes/dispatch.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DISPATCH_HEAD')
@Controller('dashboards/dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('homepage')
  async homepage(@Query('fy_start') fyStart?: string, @Query('fy_end') fyEnd?: string) {
    if ((fyStart && !fyEnd) || (!fyStart && fyEnd)) {
      throw new BadRequestException('fy_start and fy_end must be provided together');
    }
    const data = await this.dispatch.getDispatchHomepage(fyStart, fyEnd);
    return { success: true, data };
  }

  @Get('checklist/:dn')
  async checklist(@Param('dn') dn: string) {
    const data = await this.dispatch.getDocumentationChecklist(dn);
    if (!data) throw new NotFoundException({ success: false, error: 'Delivery Note not found' });
    return { success: true, data };
  }

  @Get('ewaybills')
  async ewaybills() {
    const data = await this.dispatch.getEwayBillStatus();
    return { success: true, data };
  }
}
