import { Global, Module } from '@nestjs/common';
import { ErpDbService } from './erp-db.service';
import { FrappeRpcService } from './frappe-rpc.service';
import { ErpCacheService } from './erp-cache.service';

@Global()
@Module({
  providers: [ErpDbService, FrappeRpcService, ErpCacheService],
  exports: [ErpDbService, FrappeRpcService, ErpCacheService],
})
export class ErpModule {}
