import { Module } from '@nestjs/common';
import { RegionMappingModule } from '../region-mapping/region-mapping.module';
import { CustomerSyncService } from './customer-sync.service';
import { CustomerSyncCron } from './customer-sync.cron';
import { SyncAdminService } from './sync-admin.service';
import { SyncAdminController } from './sync-admin.controller';

@Module({
  imports: [RegionMappingModule],
  controllers: [SyncAdminController],
  providers: [CustomerSyncService, CustomerSyncCron, SyncAdminService],
  exports: [CustomerSyncService],
})
export class SyncModule {}
