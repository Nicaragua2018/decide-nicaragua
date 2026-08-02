import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [AssistantModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
