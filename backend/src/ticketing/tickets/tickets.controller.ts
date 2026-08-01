import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { RejectTicketDto } from './dto/reject-ticket.dto';
import { AsmRejectResolutionDto } from './dto/asm-reject-resolution.dto';
import { MarkPendingDto } from './dto/mark-pending.dto';
import { EngineerResolveDto } from './dto/engineer-resolve.dto';
import { RegularizeTicketDto } from './dto/regularize-ticket.dto';
import { CommentDto } from './dto/comment.dto';
import { ReachedSiteDto } from './dto/reached-site.dto';
import { OverrideWarrantyDto } from './dto/override-warranty.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { UpdateCustomerCategoryDto } from './dto/update-customer-category.dto';
import { UpdateTicketTagsDto } from './dto/update-ticket-tags.dto';
import { ResolveDuplicateDto } from './dto/resolve-duplicate.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post()
  create(@Body() dto: CreateTicketDto, @Req() req: any) {
    return this.tickets.create(dto, { userId: req.user.userId, role: req.user.role });
  }

  // Restricted 2026-08-01: this endpoint previously had no @Roles at all, so
  // any authenticated role passed — including CS_SUPPORT, whose dashboard
  // (§16) is documented as read/link-through only on its own two work
  // queues, not full unscoped ticket visibility like Manager/ASM/Call Center.
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ADMIN', 'ENGINEER')
  @Get()
  list(@Query() filters: Record<string, string>, @Req() req: any) {
    return this.tickets.list({ userId: req.user.userId, role: req.user.role }, filters);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('bulk-import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  bulkImport(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('No CSV file uploaded');
    return this.tickets.bulkImport(file.buffer, { userId: req.user.userId, role: req.user.role });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.tickets.findOne(id, { userId: req.user.userId, role: req.user.role });
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.tickets.timeline(id);
  }

  @Roles('ASM', 'MANAGER')
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @Req() req: any) {
    return this.tickets.assign(id, dto.engineerId, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ASM', 'MANAGER', 'ADMIN')
  @Post(':id/retry-routing')
  retryAutoRouting(@Param('id') id: string, @Req() req: any) {
    return this.tickets.retryAutoRouting(id, { userId: req.user.userId, role: req.user.role });
  }

  // Client request: service type may not be known at creation — ASM/Engineer/
  // Manager/Admin can set it once it's actually diagnosed. Not Call Center —
  // they're not the ones diagnosing the issue.
  @Roles('ASM', 'ENGINEER', 'MANAGER', 'ADMIN')
  @Post(':id/service-type')
  updateServiceType(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto, @Req() req: any) {
    return this.tickets.updateServiceType(id, dto.serviceType, dto.slaTargetDate, { userId: req.user.userId, role: req.user.role });
  }

  // Client request (2026-07-25): set at creation by Call Center, editable
  // anytime after by ASM/Manager — same edit-permission shape as Service Type.
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ADMIN')
  @Post(':id/customer-category')
  updateCustomerCategory(@Param('id') id: string, @Body() dto: UpdateCustomerCategoryDto, @Req() req: any) {
    return this.tickets.updateCustomerCategory(id, dto.customerCategory, { userId: req.user.userId, role: req.user.role });
  }

  // Free-text tags (client decision, 2026-08-01) — same entry roles as
  // customer-category; search happens via the `tags` filter on GET /tickets.
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ADMIN')
  @Post(':id/tags')
  updateTags(@Param('id') id: string, @Body() dto: UpdateTicketTagsDto, @Req() req: any) {
    return this.tickets.updateTags(id, dto.tags, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ENGINEER')
  @Post(':id/accept')
  accept(@Param('id') id: string, @Req() req: any) {
    return this.tickets.accept(id, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ENGINEER')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectTicketDto, @Req() req: any) {
    return this.tickets.reject(id, dto.reason, { userId: req.user.userId, role: req.user.role });
  }

  // ASM reject-after-Engineer-Resolved (Ashwath feedback 2026-07-25) —
  // engineerId is either the same engineer (redo) or a different one
  // (reassign), both handled by the same method.
  @Roles('ASM', 'MANAGER')
  @Post(':id/reject-resolution')
  rejectResolution(@Param('id') id: string, @Body() dto: AsmRejectResolutionDto, @Req() req: any) {
    return this.tickets.asmRejectResolution(id, dto.engineerId, dto.reason, { userId: req.user.userId, role: req.user.role });
  }

  // FSD §15.1 permission matrix — "Override warranty flag" is Manager/Admin only.
  @Roles('MANAGER', 'ADMIN')
  @Post(':id/override-warranty')
  overrideWarranty(@Param('id') id: string, @Body() dto: OverrideWarrantyDto, @Req() req: any) {
    return this.tickets.overrideWarrantyEligible(id, dto.warrantyEligible, dto.overrideReason, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }

  @Roles('ENGINEER')
  @Post(':id/reached-site')
  reachedSite(@Param('id') id: string, @Body() dto: ReachedSiteDto, @Req() req: any) {
    return this.tickets.reachedSite(id, { userId: req.user.userId, role: req.user.role }, dto.comment, dto.gpsLat, dto.gpsLong);
  }

  @Roles('ENGINEER')
  @Post(':id/start-working')
  startWorking(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: any) {
    return this.tickets.startWorking(id, { userId: req.user.userId, role: req.user.role }, dto.comment);
  }

  @Roles('ENGINEER')
  @Post(':id/pending')
  markPending(@Param('id') id: string, @Body() dto: MarkPendingDto, @Req() req: any) {
    return this.tickets.markPending(id, dto.pendingReason, dto.pendingNotes, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }

  // Client feedback (2026-08-01) — separate resolve step, own screen outside
  // the FSV form. FSV is still mandatory first (service-layer gate checks at
  // least one SUBMITTED FSV exists for this ticket).
  @Roles('ENGINEER')
  @Post(':id/engineer-resolve')
  engineerResolve(@Param('id') id: string, @Body() dto: EngineerResolveDto, @Req() req: any) {
    return this.tickets.engineerResolve(id, dto.resolutionSummary, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ENGINEER')
  @Post(':id/resume')
  resume(@Param('id') id: string, @Req() req: any) {
    return this.tickets.resume(id, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ASM', 'MANAGER')
  @Post(':id/asm-resolve')
  asmResolve(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: any) {
    return this.tickets.asmResolve(id, { userId: req.user.userId, role: req.user.role }, dto.comment);
  }

  @Roles('CALL_CENTER', 'MANAGER')
  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: any) {
    return this.tickets.close(id, { userId: req.user.userId, role: req.user.role }, dto.comment);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ADMIN')
  @Post(':id/resend-csat')
  resendCsat(@Param('id') id: string) {
    return this.tickets.resendCsatSurvey(id);
  }

  @Roles('ADMIN')
  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Req() req: any) {
    return this.tickets.reopen(id, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('ADMIN', 'CALL_CENTER')
  @Post(':id/regularize')
  regularize(@Param('id') id: string, @Body() dto: RegularizeTicketDto, @Req() req: any) {
    return this.tickets.regularize(id, dto.targetStatus, dto.reason, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ADMIN')
  @Post(':id/duplicate/resolve')
  resolveDuplicate(@Param('id') id: string, @Body() dto: ResolveDuplicateDto, @Req() req: any) {
    return this.tickets.resolveDuplicate(id, dto.action, { userId: req.user.userId, role: req.user.role }, dto.reason);
  }
}
