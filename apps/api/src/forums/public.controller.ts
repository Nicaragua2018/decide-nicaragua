import { Controller, Get } from '@nestjs/common';
import type { PublicConsensus, RuleView } from '@decide/shared';
import { RulesService } from '../rules/rules.service';
import { ForumsService } from './forums.service';

/** Lo que cualquier visitante puede ver, sin cuenta (spec §3). */
@Controller('public')
export class PublicController {
  constructor(
    private readonly forums: ForumsService,
    private readonly rules: RulesService,
  ) {}

  @Get('consensos')
  async consensos(): Promise<PublicConsensus[]> {
    return this.forums.publicConsensus();
  }

  /** Las reglas de colmena, visibles sin cuenta. */
  @Get('reglas')
  async reglas(): Promise<RuleView[]> {
    return this.rules.list(null);
  }
}
