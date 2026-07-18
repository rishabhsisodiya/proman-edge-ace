import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { FinanceService } from './finance.service';
import { FinanceSettingsStore } from './finance-settings.store';

// Mirrors PROMAN/backend/src/routes/finance.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('FINANCE_HEAD')
@Controller('dashboards/finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly settingsStore: FinanceSettingsStore,
  ) {}

  @Get('settings')
  async settings() {
    return { success: true, data: await this.settingsStore.readFinanceSettings() };
  }

  @Put('settings/gross-margin-target')
  async updateGmTarget(@Body() body: { entity: string | null; value: number }) {
    if (typeof body.value !== 'number' || body.value < 0 || body.value > 100) {
      throw new BadRequestException('value must be a number between 0 and 100');
    }
    return { success: true, data: await this.settingsStore.setGmTargetPct(body.entity ?? null, body.value) };
  }

  @Delete('settings/gross-margin-target/:entity')
  async clearGmTargetOverride(@Param('entity') entity: string) {
    return { success: true, data: await this.settingsStore.clearGmTargetPctOverride(entity) };
  }

  @Get('homepage')
  async homepage(@Query('fy_start') fyStart?: string, @Query('fy_end') fyEnd?: string) {
    if ((fyStart && !fyEnd) || (!fyStart && fyEnd)) {
      throw new BadRequestException('fy_start and fy_end must be provided together');
    }
    const data = await this.finance.getFinanceHomepage(fyStart, fyEnd);
    return { success: true, data };
  }

  @Post('action-queue/release')
  async release(@Body() body: { invoiceNo?: string }) {
    if (!body.invoiceNo) throw new BadRequestException('invoiceNo is required');
    const result = await this.finance.releasePayment(body.invoiceNo);
    return { success: true, data: result };
  }

  @Post('po-approval/approve')
  async approvePo(@Body() body: { poNo?: string }) {
    if (!body.poNo) throw new BadRequestException('poNo is required');
    const result = await this.finance.approvePurchaseOrder(body.poNo);
    return { success: true, data: result };
  }

  @Post('action-queue/approve-je')
  async approveJe(@Body() body: { journalEntry?: string }) {
    if (!body.journalEntry) throw new BadRequestException('journalEntry is required');
    const result = await this.finance.submitJournalEntry(body.journalEntry);
    return { success: true, data: result };
  }
}
