import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BoardModule } from '../board/board.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [BoardModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
