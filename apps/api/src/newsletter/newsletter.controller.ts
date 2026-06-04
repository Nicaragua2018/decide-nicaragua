import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /**
   * POST /api/newsletter/subscribe
   * Endpoint público — no requiere autenticación.
   * Rate limit: 5 requests por IP por hora (sobreescribe el global).
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletter.subscribe(dto);
  }
}
