import { Module } from '@nestjs/common';
import { AsistenteModule } from '../asistente/asistente.module';
import { AuditModule } from '../audit/audit.module';
import { ForumsModule } from '../forums/forums.module';
import { GroupsModule } from '../groups/groups.module';
import { RulesModule } from '../rules/rules.module';
import { ChatController } from './chat.controller';
import { ChatGuardianService } from './chat-guardian.service';
import { ChatScheduler } from './chat.scheduler';
import { ChatService } from './chat.service';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  imports: [AuditModule, ForumsModule, GroupsModule, RulesModule, AsistenteModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGuardianService, ChatScheduler],
})
export class ChatModule {}
