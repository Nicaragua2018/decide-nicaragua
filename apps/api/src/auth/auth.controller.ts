import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { extractIp } from '../common/utils/ip.util';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { VerifiedCitizenGuard } from './guards/verified-citizen.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AccountStatus, type JwtPayload, type AuthResponse } from '@decide/shared';

/** Duración del access token en ms (15 min) */
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

/** Duración del refresh token en ms (30 días) */
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/auth/me
   * Devuelve los datos actuales del usuario autenticado.
   * Consulta la DB para garantizar que el status sea fresco (no del token).
   *
   * Nota de seguridad: si el status del usuario cambia (ej: suspensión),
   * este endpoint lo reflejará de inmediato aunque el access_token aún sea válido.
   * El token expirado en 15 min también terminará la sesión.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() actor: JwtPayload): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailWithProfile(actor.email);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status as unknown as AccountStatus,
        displayName: user.profile?.displayName ?? null,
        birthDepartment: user.profile?.birthDepartment ?? null,
        currentCountry: user.profile?.currentCountry ?? null,
      },
    };
  }

  /**
   * PATCH /api/auth/profile
   * Edición del perfil propio. Accesible a cualquier usuario autenticado activo.
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const user = await this.authService.updateProfile(actor.sub, dto, extractIp(req));
    return { user };
  }

  /**
   * POST /api/auth/invite
   * Solo ciudadanos verificados pueden invitar nuevos usuarios.
   * Rate limit: 10 invitaciones / 60s (más permisivo que login).
   */
  @Post('invite')
  @UseGuards(JwtAuthGuard, VerifiedCitizenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async invite(
    @Body() dto: InviteUserDto,
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
  ): Promise<{ message: string; devInviteUrl?: string }> {
    const { inviteUrl } = await this.authService.inviteUser(dto, actor.sub, extractIp(req));
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    return {
      message: 'Invitation sent successfully',
      // Solo exponer la URL fuera de producción (para demos y desarrollo)
      ...(!isProduction && { devInviteUrl: inviteUrl }),
    };
  }

  /**
   * POST /api/auth/accept-invite
   * El usuario acepta la invitación y completa su perfil.
   * Rate limit: 5 intentos / 60s.
   */
  @Post('accept-invite')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.authService.acceptInvite(dto, extractIp(req));
    return {
      message:
        'Registration complete. Your account is pending verification and will be reviewed shortly.',
    };
  }

  /**
   * POST /api/auth/login
   * Rate limit estricto: 5 intentos / 15 min para mitigar brute force.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto, extractIp(req));
    this.setAuthCookies(res, result.accessToken, result.refreshTokenId);
    return { user: result.user };
  }

  /**
   * POST /api/auth/refresh
   * Rota access y refresh tokens usando el refresh_token cookie.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const refreshTokenId = cookies?.['refresh_token'];

    if (!refreshTokenId) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const result = await this.authService.refreshTokens(
      refreshTokenId,
      extractIp(req),
    );

    this.setAuthCookies(res, result.accessToken, result.refreshTokenId);
    return { message: 'Tokens refreshed' };
  }

  /**
   * POST /api/auth/logout
   * Invalida la sesión en Redis y limpia las cookies.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const refreshTokenId = cookies?.['refresh_token'];

    await this.authService.logout(user.sub, refreshTokenId, extractIp(req));
    this.clearAuthCookies(res);

    return { message: 'Logged out successfully' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildCookieBase(): CookieOptions {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN');

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      // Solo configurar domain si está definido (en localhost no se necesita)
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshTokenId: string,
  ): void {
    const base = this.buildCookieBase();

    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });

    res.cookie('refresh_token', refreshTokenId, {
      ...base,
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      // Restricción de path: el refresh token solo se envía a los endpoints de auth
      path: '/api/auth',
    });
  }

  private clearAuthCookies(res: Response): void {
    const base = this.buildCookieBase();
    res.clearCookie('access_token', base);
    res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
  }
}
