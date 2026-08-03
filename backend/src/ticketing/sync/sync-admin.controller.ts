import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SyncAdminService } from './sync-admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/sync')
export class SyncAdminController {
  constructor(private readonly syncAdmin: SyncAdminService) {}

  @Get('runs')
  runs(@Query('entity') entity?: string) {
    return this.syncAdmin.runs(entity);
  }

  @Get('failures')
  failures() {
    return this.syncAdmin.failures();
  }

  @Get('skipped')
  skipped() {
    return this.syncAdmin.skipped();
  }

  @Get('needs-review')
  needsReview() {
    return this.syncAdmin.needsReview();
  }

  @Get('employees')
  employees() {
    return this.syncAdmin.employees();
  }

  @Get('equipment-skipped')
  equipmentSkipped() {
    return this.syncAdmin.equipmentSkipped();
  }

  @Post('failures/:id/retry')
  retryFailure(@Param('id') id: string) {
    return this.syncAdmin.retryFailure(id);
  }

  /** "View Details" on a Sync Failure — raw ERPNext row + stored failure reason, before retrying. */
  @Get('failures/:id')
  failureDetail(@Param('id') id: string) {
    return this.syncAdmin.failureDetail(id);
  }

  /**
   * Runs the night job — Customer (+ CustomerSite), Item, Employee, and
   * Equipment Tracking. Pass { force: true } to ignore each sync's watermark
   * and reprocess every record from scratch (one-off full resync, not
   * routine use). Pass { entity: 'customer' | 'item' | 'employee' |
   * 'equipmentTracking' } to run just that one instead of all 4
   * (2026-08-04) — omitted runs everything, same as before.
   */
  @Post('run')
  triggerRun(@Body('force') force?: boolean, @Body('entity') entity?: string) {
    return this.syncAdmin.triggerRun(force ?? false, entity);
  }
}
