import { Module } from '@nestjs/common';
import { ServiceTypeConfigController } from './service-type.controller';
import { ServiceTypeConfigService } from './service-type.service';

@Module({
  controllers: [ServiceTypeConfigController],
  providers: [ServiceTypeConfigService],
  exports: [ServiceTypeConfigService],
})
export class ServiceTypeConfigModule {}
