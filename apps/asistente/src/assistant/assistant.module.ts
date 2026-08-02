import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LedgerModule } from '../ledger/ledger.module';
import { QueriesModule } from '../queries/queries.module';
import { AssistantService } from './assistant.service';
import { ConversationService } from './conversation.service';

@Module({
  imports: [AgentModule, InvoicesModule, LedgerModule, QueriesModule],
  providers: [AssistantService, ConversationService],
  exports: [AssistantService],
})
export class AssistantModule {}
