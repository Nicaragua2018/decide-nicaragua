import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { InvoiceDraft } from './types';

export interface ThreadState {
  draft: InvoiceDraft | null;
  pendingFields: string[];
}

// Persistencia del estado de conversación por hilo de WhatsApp (PRD §7).
// Permite que el flujo de preguntas sobreviva reinicios del servicio.
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(threadId: string): Promise<ThreadState> {
    const state = await this.prisma.conversationState.findUnique({
      where: { whatsappThreadId: threadId },
    });
    if (!state) return { draft: null, pendingFields: [] };
    return {
      draft: (state.draft as InvoiceDraft | null) ?? null,
      pendingFields: Array.isArray(state.pendingFields) ? (state.pendingFields as string[]) : [],
    };
  }

  async save(threadId: string, draft: InvoiceDraft, pendingFields: string[]): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { whatsappThreadId: threadId },
      update: {
        draft: draft as unknown as Prisma.InputJsonValue,
        pendingFields: pendingFields as unknown as Prisma.InputJsonValue,
      },
      create: {
        whatsappThreadId: threadId,
        draft: draft as unknown as Prisma.InputJsonValue,
        pendingFields: pendingFields as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async clear(threadId: string): Promise<void> {
    await this.prisma.conversationState.deleteMany({
      where: { whatsappThreadId: threadId },
    });
  }
}
