import { Module } from '@nestjs/common';
import { SortitionService } from './sortition.service';
import { SortitionController } from './sortition.controller';
import { AuditModule } from '../audit/audit.module';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  imports: [AuditModule],
  controllers: [SortitionController],
  providers: [SortitionService],
  exports: [SortitionService],
})
export class SortitionModule {}
