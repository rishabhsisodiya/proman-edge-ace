import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ManufacturingService } from './manufacturing.service';

// Mirrors PROMAN/backend/src/routes/manufacturing.ts's endpoints — same
// paths, same response shape ({ success, data } / { success, error }).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANUFACTURING_HEAD') // Admin bypasses this automatically (see RolesGuard)
@Controller('dashboards/manufacturing')
export class ManufacturingController {
  constructor(private readonly manufacturing: ManufacturingService) {}

  @Get('homepage')
  async homepage() {
    const data = await this.manufacturing.getManufacturingHomepage();
    return { success: true, data };
  }

  @Get('material-request/:mr')
  async materialRequest(@Param('mr') mr: string) {
    const detail = await this.manufacturing.getMaterialRequestDetail(mr);
    if (!detail) throw new NotFoundException({ success: false, error: 'Material request not found' });
    return { success: true, data: detail };
  }

  @Get('work-order/:wo')
  async workOrder(@Param('wo') wo: string) {
    const detail = await this.manufacturing.getWorkOrderDetail(wo);
    if (!detail) throw new NotFoundException({ success: false, error: 'Work order not found' });
    return { success: true, data: detail };
  }

  @Get('pipeline-orders/:stage')
  async pipelineOrdersByStage(@Param('stage') stage: string) {
    const orders = await this.manufacturing.getPipelineOrdersByStage(stage);
    return { success: true, data: orders };
  }

  @Get('pipeline-orders-all')
  async allPipelineOrders(@Query('page') page?: string, @Query('search') search?: string) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const orders = await this.manufacturing.getAllPipelineOrders(pageNum, search ?? '');
    return { success: true, data: orders };
  }
}
