import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post('failures/:id/retry')
  retryFailure(@Param('id') id: string) {
    return this.syncAdmin.retryFailure(id);
  }

  @Post('customer/run')
  triggerRun() {
    return this.syncAdmin.triggerRun();
  }
}
