// Normalización defensiva de la respuesta del modelo.
// Aunque structured outputs garantiza el schema, esta capa protege el resto
// del sistema ante valores raros (números negativos, strings vacíos, etc.)
// y da un punto único testeable sin llamar a la API.

import type { Extraction, InvoiceDraft } from '../assistant/types';
import { emptyDraft } from '../assistant/pending-fields';

const INTENTS = new Set(['invoice', 'payment', 'schedule', 'query', 'answer', 'other']);
const QUERY_KINDS = new Set(['monthly_invoiced', 'pending_payments', 'other']);

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function cleanAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function cleanInvoice(raw: unknown): InvoiceDraft | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const draft = emptyDraft();
  draft.clientName = cleanString(r['clientName']);
  draft.jobsiteAddress = cleanString(r['jobsiteAddress']);
  draft.workDate = cleanString(r['workDate']);
  const invoiceNumber = r['invoiceNumber'];
  draft.invoiceNumber =
    typeof invoiceNumber === 'number' && Number.isInteger(invoiceNumber) && invoiceNumber > 0
      ? invoiceNumber
      : null;
  draft.pmEmail = cleanString(r['pmEmail']);

  const lineItems = Array.isArray(r['lineItems']) ? r['lineItems'] : [];
  draft.lineItems = lineItems
    .map((item: unknown) => {
      const i = (item ?? {}) as Record<string, unknown>;
      return {
        description: cleanString(i['description']) ?? 'Trabajo realizado',
        quantity: cleanAmount(i['quantity']),
        unitPrice: cleanAmount(i['unitPrice']),
        amount: cleanAmount(i['amount']),
      };
    })
    .filter((i) => i.amount !== null || (i.quantity !== null && i.unitPrice !== null));

  const subs = Array.isArray(r['subcontractors']) ? r['subcontractors'] : [];
  draft.subcontractors = subs
    .map((sub: unknown) => {
      const s = (sub ?? {}) as Record<string, unknown>;
      return { name: cleanString(s['name']) ?? '', amount: cleanAmount(s['amount']) };
    })
    .filter((s) => s.name !== '');

  return draft;
}

export function normalizeExtraction(raw: unknown): Extraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  const intent = typeof r['intent'] === 'string' && INTENTS.has(r['intent']) ? r['intent'] : 'other';

  const paymentRaw = r['payment'];
  let payment: Extraction['payment'] = null;
  if (paymentRaw !== null && typeof paymentRaw === 'object') {
    const p = paymentRaw as Record<string, unknown>;
    payment = {
      subcontractorName: cleanString(p['subcontractorName']),
      amount: cleanAmount(p['amount']),
      jobsiteHint: cleanString(p['jobsiteHint']),
    };
  }

  const queryRaw = r['query'];
  let query: Extraction['query'] = null;
  if (queryRaw !== null && typeof queryRaw === 'object') {
    const q = queryRaw as Record<string, unknown>;
    const kind = typeof q['kind'] === 'string' && QUERY_KINDS.has(q['kind']) ? q['kind'] : 'other';
    const month = cleanString(q['month']);
    query = {
      kind: kind as NonNullable<Extraction['query']>['kind'],
      month: month !== null && /^\d{4}-\d{2}$/.test(month) ? month : null,
    };
  }

  const answersRaw = Array.isArray(r['answers']) ? r['answers'] : [];
  const answers = answersRaw
    .map((a: unknown) => {
      const item = (a ?? {}) as Record<string, unknown>;
      return {
        field: cleanString(item['field']) ?? '',
        value: cleanString(item['value']) ?? '',
      };
    })
    .filter((a) => a.field !== '' && a.value !== '');

  const uncertainRaw = Array.isArray(r['uncertainFields']) ? r['uncertainFields'] : [];
  const uncertainFields = uncertainRaw.filter((f: unknown): f is string => typeof f === 'string');

  return {
    intent: intent as Extraction['intent'],
    invoice: cleanInvoice(r['invoice']),
    payment,
    query,
    answers,
    uncertainFields,
  };
}
