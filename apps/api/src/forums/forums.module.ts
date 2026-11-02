import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BoardModule } from '../board/board.module';
import { ForumsService } from './forums.service';
import { ForumsController } from './forums.controller';

@Module({
  imports: [AuditModule, BoardModule],
  controllers: [ForumsController],
  providers: [ForumsService],
  exports: [ForumsService],
})
export class ForumsModule {}
