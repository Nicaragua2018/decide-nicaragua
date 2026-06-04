import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    try {
      await this.prisma.newsletterSubscription.create({
        data: {
          email:   dto.email,
          name:    dto.name    ?? null,
          country: dto.country ?? null,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este correo ya está suscrito al boletín.');
      }
      throw error;
    }

    return { message: 'Suscripción registrada correctamente.' };
  }
}
