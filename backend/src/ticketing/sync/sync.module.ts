import { Module } from '@nestjs/common';
import { RegionMappingModule } from '../region-mapping/region-mapping.module';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';
import { NightlySyncCron } from './nightly-sync.cron';
import { SyncAdminService } from './sync-admin.service';
import { SyncAdminController } from './sync-admin.controller';

@Module({
  imports: [RegionMappingModule],
  controllers: [SyncAdminController],
  providers: [CustomerSyncService, ItemSyncService, NightlySyncCron, SyncAdminService],
  exports: [CustomerSyncService, ItemSyncService],
})
export class SyncModule {}
