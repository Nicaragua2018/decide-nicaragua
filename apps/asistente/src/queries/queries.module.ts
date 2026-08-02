import { Module } from '@nestjs/common';
import { QueriesService } from './queries.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [QueriesService],
  exports: [QueriesService],
})
export class QueriesModule {}
