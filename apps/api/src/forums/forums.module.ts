import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BoardModule } from '../board/board.module';
import { RulesModule } from '../rules/rules.module';
import { GroupsModule } from '../groups/groups.module';
import { ForumsService } from './forums.service';
import { ForumsController } from './forums.controller';
import { PublicController } from './public.controller';
import { ModeracionScheduler } from './moderacion.scheduler';

@Module({
  imports: [AuditModule, BoardModule, RulesModule, GroupsModule],
  controllers: [ForumsController, PublicController],
  providers: [ForumsService, ModeracionScheduler],
  exports: [ForumsService],
})
export class ForumsModule {}
