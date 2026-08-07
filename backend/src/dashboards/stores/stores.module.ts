import { Module } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { DashboardAccessModule } from '../dashboard-access/dashboard-access.module';

@Module({
  imports: [DashboardAccessModule],
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}
