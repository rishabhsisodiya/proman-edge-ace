import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowModule } from './ticketing/workflow/workflow.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './ticketing/customers/customers.module';
import { RegionMappingModule } from './ticketing/region-mapping/region-mapping.module';
import { SlaPolicyModule } from './ticketing/sla-policy/sla-policy.module';
import { SlaPauseStateModule } from './ticketing/sla-pause-state/sla-pause-state.module';
import { HolidayModule } from './ticketing/holiday/holiday.module';
import { CsatModule } from './ticketing/csat/csat.module';
import { PredictiveRuleModule } from './ticketing/predictive-rules/predictive-rule.module';
import { ReportsModule } from './reports/reports.module';
import { SyncModule } from './ticketing/sync/sync.module';
import { EquipmentModule } from './ticketing/equipment/equipment.module';
import { AmcModule } from './ticketing/amc/amc.module';
import { ItemsModule } from './ticketing/items/items.module';
import { TicketsModule } from './ticketing/tickets/tickets.module';
import { TicketSourcesModule } from './ticketing/ticket-sources/ticket-sources.module';
import { FsvModule } from './ticketing/fsv/fsv.module';
import { QuotationModule } from './ticketing/quotations/quotation.module';
import { BillingRateModule } from './ticketing/billing-rates/billing-rate.module';
import { PriceListModule } from './ticketing/price-lists/price-list.module';
import { ErpWebhooksModule } from './ticketing/erp-webhooks/erp-webhooks.module';
import { ErpModule } from './erp/erp.module';
import { NotificationModule } from './notifications/notification.module';
import { ManufacturingModule } from './dashboards/manufacturing/manufacturing.module';
import { SalesModule } from './dashboards/sales/sales.module';
import { FinanceModule } from './dashboards/finance/finance.module';
import { ProcurementModule } from './dashboards/procurement/procurement.module';
import { StoresModule } from './dashboards/stores/stores.module';
import { DispatchModule } from './dashboards/dispatch/dispatch.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ErpModule,
    NotificationModule,
    AuthModule,
    WorkflowModule,
    UsersModule,
    CustomersModule,
    RegionMappingModule,
    SlaPolicyModule,
    SlaPauseStateModule,
    HolidayModule,
    CsatModule,
    PredictiveRuleModule,
    ReportsModule,
    SyncModule,
    EquipmentModule,
    AmcModule,
    ItemsModule,
    TicketsModule,
    TicketSourcesModule,
    FsvModule,
    QuotationModule,
    BillingRateModule,
    PriceListModule,
    ErpWebhooksModule,
    ManufacturingModule,
    SalesModule,
    FinanceModule,
    ProcurementModule,
    StoresModule,
    DispatchModule,
  ],
})
export class AppModule {}
