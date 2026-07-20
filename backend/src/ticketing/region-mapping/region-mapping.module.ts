import { Module } from '@nestjs/common';
import { RegionMappingController } from './region-mapping.controller';
import { RegionMappingService } from './region-mapping.service';

@Module({
  controllers: [RegionMappingController],
  providers: [RegionMappingService],
  exports: [RegionMappingService],
})
export class RegionMappingModule {}
