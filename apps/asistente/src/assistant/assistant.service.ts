import { Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { InvoiceFileService } from '../invoices/invoice-file.service';
import { InvoicesService } from '../invoices/invoices.service';
import { LedgerService } from '../ledger/ledger.service';
import { QueriesService } from '../queries/queries.service';
import { ConversationService } from './conversation.service';
import {
  applyAnswers,
  formatInvoiceNumber,
  invoiceTotal,
  mergeDraft,
  missingFields,
  questionFor,
} from './pending-fields';
import type { AssistantReply, Extraction } from './types';

export interface IncomingMessage {
  threadId: string;
  text: string | null;
  imageBase64: string | null;
  imageMediaType: string | null;
}

// Orquestador del pipeline del PRD §8: clasifica la intención con Claude y
// ejecuta la rama correspondiente. Toda rama termina con una respuesta clara
// y accionable por WhatsApp — nunca un "listo" sin contexto (PRD §8.7).
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly agent: AgentService,
    private readonly conversation: ConversationService,
    private readonly invoices: InvoicesService,
    private readonly invoiceFile: InvoiceFileService,
    private readonly ledger: LedgerService,
    private readonly queries: QueriesService,
  ) {}

  async handleMessage(message: IncomingMessage): Promise<AssistantReply> {
    const state = await this.conversation.get(message.threadId);
    const todayIso = new Date().toISOString().slice(0, 10);

    const extraction = await this.agent.extract({
      text: message.text,
      imageBase64: message.imageBase64,
      imageMediaType: message.imageMediaType,
      draft: state.draft,
      pendingFields: state.pendingFields,
      todayIso,
    });

    switch (extraction.intent) {
      case 'invoice':
      case 'answer':
        return this.handleInvoiceFlow(message.threadId, state.draft, extraction);
      case 'payment':
        return this.handlePayment(extraction);
      case 'query':
        return { reply: await this.queries.answer(extraction.query ?? { kind: 'other', month: null }, todayIso) };
      case 'schedule':
        return {
          reply:
            'La agenda todavía no está activa (llega en la siguiente fase). Por ahora te ayudo con invoices, pagos a subcontratistas y consultas.',
        };
      default:
        return {
          reply:
            'No entendí bien. Puedes mandarme la foto de la libreta para hacer un invoice, decirme un pago ("le pagué 300 a Juan") o preguntarme cuánto llevas facturado.',
        };
    }
  }

  // Rama Invoice (PRD §8.3): extraer → comparar campos obligatorios →
  // preguntar lo que falta (una pregunta a la vez) → generar y responder con el PDF.
  private async handleInvoiceFlow(
    threadId: string,
    savedDraft: Extraction['invoice'],
    extraction: Extraction,
  ): Promise<AssistantReply> {
    let draft = mergeDraft(savedDraft, extraction.invoice);
    draft = applyAnswers(draft, extraction.answers);

    const missing = missingFields(draft);
    if (missing.length > 0) {
      const nextField = missing[0];
      if (nextField === undefined) throw new Error('unreachable');
      await this.conversation.save(threadId, draft, missing);
      return { reply: questionFor(nextField) };
    }

    const job = await this.invoices.createFromDraft(draft);
    const file = await this.invoiceFile.generate(job);
    await this.conversation.clear(threadId);

    const total = invoiceTotal(draft);
    const subs =
      draft.subcontractors.length > 0
        ? `\nSubcontratistas registrados: ${draft.subcontractors
            .map((s) => `${s.name}${s.amount !== null ? ` ($${s.amount.toFixed(2)})` : ''}`)
            .join(', ')}.`
        : '';

    return {
      reply:
        `Invoice #${formatInvoiceNumber(job.invoiceNumber)} por $${total.toFixed(2)} para ${job.client.name}, ` +
        `jobsite ${job.jobsiteAddress}. Listo para enviar.${subs}`,
      attachment: {
        filename: file.filename,
        mimeType: file.mimeType,
        base64: file.buffer.toString('base64'),
      },
    };
  }

  private async handlePayment(extraction: Extraction): Promise<AssistantReply> {
    const result = await this.ledger.recordPayment(
      extraction.payment ?? { subcontractorName: null, amount: null, jobsiteHint: null },
    );
    switch (result.status) {
      case 'recorded':
        return {
          reply: `Anotado: $${result.amount.toFixed(2)} pagados a ${result.subcontractorName} (${result.jobsite}).`,
        };
      case 'needs_amount':
        return { reply: '¿Cuánto le pagaste?' };
      case 'needs_subcontractor':
        return { reply: '¿A quién le pagaste?' };
      case 'no_job':
        return {
          reply:
            'No encontré un trabajo al cual asociar ese pago. Primero registra el invoice del trabajo y luego me dices el pago.',
        };
    }
  }
}
