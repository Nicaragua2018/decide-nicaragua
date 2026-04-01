import { Module } from '@nestjs/common';
import { DeliberationService } from './deliberation.service';
import { DeliberationController } from './deliberation.controller';
import { AuditModule } from '../audit/audit.module';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  imports: [AuditModule],
  controllers: [DeliberationController],
  providers: [DeliberationService],
  exports: [DeliberationService],
})
export class DeliberationModule {}
