import { Module } from '@nestjs/common';
import { DeliberationService } from './deliberation.service';
import { DeliberationController } from './deliberation.controller';
import { AuditModule } from '../audit/audit.module';
import { AsistenteModule } from '../asistente/asistente.module';
import { ForumsModule } from '../forums/forums.module';
import { GroupsModule } from '../groups/groups.module';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  imports: [AuditModule, ForumsModule, GroupsModule, AsistenteModule],
  controllers: [DeliberationController],
  providers: [DeliberationService],
  exports: [DeliberationService],
})
export class DeliberationModule {}
