import { Module } from '@nestjs/common';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingSnapshotStore } from './kpi-snapshot.store';
import { ManufacturingSnapshotCron } from './manufacturing-snapshot.cron';

@Module({
  controllers: [ManufacturingController],
  providers: [ManufacturingService, ManufacturingSnapshotStore, ManufacturingSnapshotCron],
})
export class ManufacturingModule {}
