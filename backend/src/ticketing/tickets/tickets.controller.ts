import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { RejectTicketDto } from './dto/reject-ticket.dto';
import { MarkPendingDto } from './dto/mark-pending.dto';
import { RegularizeTicketDto } from './dto/regularize-ticket.dto';
import { CommentDto } from './dto/comment.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
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

  @Get()
  list(@Query() filters: Record<string, string>, @Req() req: any) {
    return this.tickets.list({ userId: req.user.userId, role: req.user.role }, filters);
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

  // Client request: service type may not be known at creation — ASM/Engineer/
  // Manager/Admin can set it once it's actually diagnosed. Not Call Center —
  // they're not the ones diagnosing the issue.
  @Roles('ASM', 'ENGINEER', 'MANAGER', 'ADMIN')
  @Post(':id/service-type')
  updateServiceType(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto, @Req() req: any) {
    return this.tickets.updateServiceType(id, dto.serviceType, { userId: req.user.userId, role: req.user.role });
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

  @Roles('ENGINEER')
  @Post(':id/reached-site')
  reachedSite(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: any) {
    return this.tickets.reachedSite(id, { userId: req.user.userId, role: req.user.role }, dto.comment);
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
