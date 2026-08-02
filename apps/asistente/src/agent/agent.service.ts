import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Extraction, InvoiceDraft } from '../assistant/types';
import { EXTRACTION_SCHEMA } from './extraction-schema';
import { normalizeExtraction } from './normalize';

export interface AgentInput {
  text: string | null;
  imageBase64: string | null;
  imageMediaType: string | null;
  // Contexto de conversación: borrador en curso y campos pendientes de pregunta
  draft: InvoiceDraft | null;
  pendingFields: string[];
  todayIso: string;
}

// Prompt de extracción según lineamientos del PRD §9:
// JSON estructurado, marcar campos inciertos, nunca inventar datos.
const SYSTEM_PROMPT = `Eres el motor de extracción de un asistente por WhatsApp para Héctor Mejía,
contratista de bloqueo (block installer) en Florida. Héctor manda fotos de su libreta
manuscrita y mensajes cortos en español (a veces con términos en inglés: invoice, jobsite, block).

Tu única tarea es devolver JSON estructurado clasificando la intención del mensaje y
extrayendo datos. Reglas estrictas:
- NUNCA inventes datos. Si un campo no se puede leer o determinar con confianza,
  déjalo en null y agrégalo a uncertainFields.
- Fechas siempre en formato YYYY-MM-DD. Si la libreta dice "05/08/26" interpreta MM/DD/YY
  (formato de EE.UU.). Si el mensaje dice "hoy" o "ayer", calcula desde la fecha actual.
- Montos en dólares como números (sin símbolo $).
- Intenciones:
  - "invoice": foto de libreta o mensaje describiendo un trabajo a facturar.
  - "payment": registro de pago a un subcontratista ("le pagué 300 a Juan").
  - "schedule": agendar un trabajo ("el lunes tengo trabajo en X").
  - "query": consulta de estado ("¿cuánto llevo facturado este mes?" → kind monthly_invoiced;
    "¿qué le debo a la gente?" → kind pending_payments).
  - "answer": el mensaje responde una pregunta pendiente del asistente (usa el contexto).
  - "other": nada de lo anterior.
- Si hay campos pendientes en el contexto y el mensaje los responde, usa intent "answer"
  y llena answers con el campo y el valor interpretado (fechas ya en YYYY-MM-DD).
- Si la respuesta es "sigue el consecutivo" sobre el número de invoice, NO agregues answer
  para invoiceNumber (el sistema lo asigna solo).
- Extrae subcontratistas mencionados en la libreta o el mensaje con su monto si aparece.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly client = new Anthropic();

  async extract(input: AgentInput): Promise<Extraction> {
    const contextLines: string[] = [`Fecha actual: ${input.todayIso}`];
    if (input.pendingFields.length > 0) {
      contextLines.push(
        `Campos pendientes de pregunta al usuario: ${input.pendingFields.join(', ')}`,
      );
    }
    if (input.draft) {
      contextLines.push(`Borrador de invoice en curso: ${JSON.stringify(input.draft)}`);
    }
    contextLines.push(`Mensaje de Héctor: ${input.text ?? '(solo foto, sin texto)'}`);

    const content: Anthropic.Messages.ContentBlockParam[] = [];
    if (input.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (input.imageMediaType ?? 'image/jpeg') as 'image/jpeg',
          data: input.imageBase64,
        },
      });
    }
    content.push({ type: 'text', text: contextLines.join('\n') });

    // Fallback server-side: si los clasificadores de seguridad declinan la
    // request, la API la re-ejecuta en el modelo de respaldo recomendado
    // en la misma llamada (beta server-side-fallback).
    const response = await this.client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      // @ts-expect-error — el tipado del SDK aún no incluye la forma escalar "default"
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      // Toda la cadena (modelo + fallback) declinó — se degrada a "no entendido"
      this.logger.warn('Model refused the request (stop_reason=refusal)');
      return normalizeExtraction({ intent: 'other' });
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    );
    if (!textBlock) {
      this.logger.warn('Model returned no text block');
      return normalizeExtraction({ intent: 'other' });
    }

    try {
      return normalizeExtraction(JSON.parse(textBlock.text));
    } catch {
      this.logger.warn('Model returned unparseable JSON');
      return normalizeExtraction({ intent: 'other' });
    }
  }
}
