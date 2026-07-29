import { Module } from '@nestjs/common';
import { RegionMappingModule } from '../region-mapping/region-mapping.module';
import { PriceListModule } from '../price-lists/price-list.module';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';
import { EmployeeSyncService } from './employee-sync.service';
import { EquipmentTrackingSyncService } from './equipment-tracking-sync.service';
import { NightlySyncCron } from './nightly-sync.cron';
import { SyncAdminService } from './sync-admin.service';
import { SyncAdminController } from './sync-admin.controller';

@Module({
  imports: [RegionMappingModule, PriceListModule],
  controllers: [SyncAdminController],
  providers: [
    CustomerSyncService,
    ItemSyncService,
    EmployeeSyncService,
    EquipmentTrackingSyncService,
    NightlySyncCron,
    SyncAdminService,
  ],
  exports: [CustomerSyncService, ItemSyncService, EmployeeSyncService, EquipmentTrackingSyncService],
})
export class SyncModule {}
