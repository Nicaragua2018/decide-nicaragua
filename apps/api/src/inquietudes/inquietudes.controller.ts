import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { InquietudDetail, InquietudSummary, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { InquietudesService } from './inquietudes.service';
import { CreateInquietudDto } from './dto/create-inquietud.dto';

@Controller('inquietudes')
@UseGuards(JwtAuthGuard)
export class InquietudesController {
  constructor(private readonly inquietudes: InquietudesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Post()
  async create(@Body() dto: CreateInquietudDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ id: string }> {
    return this.inquietudes.create(this.perfil(user), dto, extractIp(req));
  }

  @Get()
  async list(@Query('groupId', ParseUUIDPipe) groupId: string, @CurrentUser() user: JwtPayload): Promise<InquietudSummary[]> {
    return this.inquietudes.list(this.perfil(user), groupId);
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<InquietudDetail> {
    return this.inquietudes.get(this.perfil(user), id);
  }

  @Post(':id/apoyo')
  @HttpCode(HttpStatus.OK)
  async support(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.inquietudes.support(this.perfil(user), id, extractIp(req));
    return { ok: true };
  }

  @Delete(':id/apoyo')
  @HttpCode(HttpStatus.OK)
  async unsupport(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.inquietudes.unsupport(this.perfil(user), id, extractIp(req));
    return { ok: true };
  }
}
