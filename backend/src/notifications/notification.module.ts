import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationTemplateController } from './notification-template.controller';

// Global — needed as a cross-cutting concern by many feature modules
// (Tickets, Workflow, Quotation, FSV, the SLA cron) once triggers are wired,
// same convention as ErpModule.
@Global()
@Module({
  controllers: [NotificationTemplateController],
  providers: [NotificationService, NotificationTemplateService],
  exports: [NotificationService, NotificationTemplateService],
})
export class NotificationModule {}
