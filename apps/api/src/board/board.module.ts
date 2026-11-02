import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GroupsModule } from '../groups/groups.module';
import { BoardService } from './board.service';
import { BoardGuard } from './board.guard';
import { BoardController } from './board.controller';

@Module({
  imports: [AuditModule, GroupsModule],
  controllers: [BoardController],
  providers: [BoardService, BoardGuard],
  exports: [BoardService, BoardGuard],
})
export class BoardModule {}
