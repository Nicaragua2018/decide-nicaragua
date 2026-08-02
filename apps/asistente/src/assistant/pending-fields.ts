// Lógica pura del flujo de preguntas de aclaración (PRD §8.3.b-c).
// Determinista y sin dependencias: los campos obligatorios los decide el
// servicio, no el modelo — Claude solo extrae y responde preguntas.

import type { ExtractedLineItem, FieldAnswer, InvoiceDraft } from './types';

// Campos obligatorios para generar un invoice formal, en orden de pregunta.
// El número de invoice NO está aquí: lo asigna el sistema (consecutivo).
export const REQUIRED_FIELDS = ['clientName', 'jobsiteAddress', 'workDate', 'lineItems'] as const;

export function emptyDraft(): InvoiceDraft {
  return {
    clientName: null,
    jobsiteAddress: null,
    workDate: null,
    invoiceNumber: null,
    pmEmail: null,
    lineItems: [],
    subcontractors: [],
  };
}

// Combina el borrador guardado con una nueva extracción.
// La información nueva solo sobreescribe cuando trae valor (no borra lo ya confirmado).
export function mergeDraft(base: InvoiceDraft | null, update: InvoiceDraft | null): InvoiceDraft {
  const a = base ?? emptyDraft();
  if (!update) return a;
  return {
    clientName: update.clientName ?? a.clientName,
    jobsiteAddress: update.jobsiteAddress ?? a.jobsiteAddress,
    workDate: update.workDate ?? a.workDate,
    invoiceNumber: update.invoiceNumber ?? a.invoiceNumber,
    pmEmail: update.pmEmail ?? a.pmEmail,
    lineItems: update.lineItems.length > 0 ? update.lineItems : a.lineItems,
    subcontractors: update.subcontractors.length > 0 ? update.subcontractors : a.subcontractors,
  };
}

// Aplica respuestas a preguntas pendientes ("¿la fecha es X o Y?" → "la de la libreta")
export function applyAnswers(draft: InvoiceDraft, answers: FieldAnswer[]): InvoiceDraft {
  const result = { ...draft };
  for (const answer of answers) {
    const value = answer.value.trim();
    if (value === '') continue;
    switch (answer.field) {
      case 'clientName':
        result.clientName = value;
        break;
      case 'jobsiteAddress':
        result.jobsiteAddress = value;
        break;
      case 'workDate':
        result.workDate = value;
        break;
      case 'invoiceNumber': {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n)) result.invoiceNumber = n;
        break;
      }
      case 'pmEmail':
        result.pmEmail = value;
        break;
      default:
        // Campo desconocido: se ignora en vez de fallar (el modelo puede equivocarse)
        break;
    }
  }
  return result;
}

// Completa montos calculables: amount = quantity × unitPrice cuando falta.
export function completeLineItems(items: ExtractedLineItem[]): ExtractedLineItem[] {
  return items.map((item) => {
    if (item.amount === null && item.quantity !== null && item.unitPrice !== null) {
      return { ...item, amount: Math.round(item.quantity * item.unitPrice * 100) / 100 };
    }
    return item;
  });
}

// Campos obligatorios que aún faltan, en orden de pregunta.
export function missingFields(draft: InvoiceDraft): string[] {
  const missing: string[] = [];
  if (!draft.clientName) missing.push('clientName');
  if (!draft.jobsiteAddress) missing.push('jobsiteAddress');
  if (!draft.workDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.workDate)) missing.push('workDate');
  const items = completeLineItems(draft.lineItems);
  const hasValidItems = items.length > 0 && items.every((i) => i.amount !== null);
  if (!hasValidItems) missing.push('lineItems');
  return missing;
}

// Total del invoice (suma de montos de líneas ya completas)
export function invoiceTotal(draft: InvoiceDraft): number {
  const items = completeLineItems(draft.lineItems);
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// Una sola pregunta a la vez, en español, tono directo y cordial (PRD §9).
export function questionFor(field: string): string {
  switch (field) {
    case 'clientName':
      return '¿Para qué cliente (general contractor) es este invoice?';
    case 'jobsiteAddress':
      return '¿Cuál es la dirección del jobsite?';
    case 'workDate':
      return '¿Cuál es la fecha del trabajo? (por ejemplo: 05/08/2026)';
    case 'lineItems':
      return 'No pude leer bien los conceptos y montos. ¿Me los mandas? (por ejemplo: "block 8x8x16, 450 unidades a $3.50")';
    default:
      return '¿Me confirmas ese dato, por favor?';
  }
}

// Formato del número de invoice con ceros a la izquierda: 13 → "0013"
export function formatInvoiceNumber(n: number): string {
  return n.toString().padStart(4, '0');
}
