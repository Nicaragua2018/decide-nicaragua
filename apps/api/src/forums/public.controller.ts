import { Controller, Get } from '@nestjs/common';
import type { PublicConsensus } from '@decide/shared';
import { ForumsService } from './forums.service';

/** Lo que cualquier visitante puede ver, sin cuenta (spec §3). */
@Controller('public')
export class PublicController {
  constructor(private readonly forums: ForumsService) {}

  @Get('consensos')
  async consensos(): Promise<PublicConsensus[]> {
    return this.forums.publicConsensus();
  }
}
