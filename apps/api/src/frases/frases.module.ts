import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RulesModule } from '../rules/rules.module';
import { FrasesService } from './frases.service';
import { FrasesController } from './frases.controller';

@Module({
  imports: [RulesModule, AuditModule],
  controllers: [FrasesController],
  providers: [FrasesService],
  exports: [FrasesService],
})
export class FrasesModule {}
