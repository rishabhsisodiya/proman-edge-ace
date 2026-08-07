import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { DashboardAccessModule } from '../dashboard-access/dashboard-access.module';

@Module({
  imports: [DashboardAccessModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
