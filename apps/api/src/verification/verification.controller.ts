import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload, PendingVerification, VerificationStatus } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { VerificationService } from './verification.service';

@Controller('verifications')
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('me')
  async me(@CurrentUser() user: JwtPayload): Promise<VerificationStatus> {
    return this.verification.statusFor(user.sub);
  }

  @Get('pending')
  async pending(@CurrentUser() user: JwtPayload): Promise<PendingVerification[]> {
    return this.verification.pendingFor(user);
  }

  @Post(':userId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.verification.confirm(user, userId, extractIp(req));
    return { ok: true };
  }
}
