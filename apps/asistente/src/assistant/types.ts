// Tipos compartidos del flujo del asistente.
// La extracción viene de Claude (visión + texto) como JSON estructurado;
// los campos que el modelo no pudo determinar con confianza llegan en null
// y listados en `uncertainFields` (nunca inventados — lineamiento del PRD §9).

export type Intent = 'invoice' | 'payment' | 'schedule' | 'query' | 'answer' | 'other';

export interface ExtractedLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface ExtractedSubcontractor {
  name: string;
  amount: number | null;
}

export interface InvoiceDraft {
  clientName: string | null;
  jobsiteAddress: string | null;
  // Fecha del trabajo en formato YYYY-MM-DD
  workDate: string | null;
  // null = usar el consecutivo automático (el sistema asigna MAX+1)
  invoiceNumber: number | null;
  pmEmail: string | null;
  lineItems: ExtractedLineItem[];
  subcontractors: ExtractedSubcontractor[];
}

export interface PaymentInfo {
  subcontractorName: string | null;
  amount: number | null;
  // Pista para asociar el pago a un trabajo ("lo de ayer", una dirección…)
  jobsiteHint: string | null;
}

export type QueryKind = 'monthly_invoiced' | 'pending_payments' | 'other';

export interface QueryInfo {
  kind: QueryKind;
  // Mes consultado en formato YYYY-MM; null = mes actual
  month: string | null;
}

// Respuesta a una pregunta de aclaración pendiente
export interface FieldAnswer {
  field: string;
  value: string;
}

export interface Extraction {
  intent: Intent;
  invoice: InvoiceDraft | null;
  payment: PaymentInfo | null;
  query: QueryInfo | null;
  answers: FieldAnswer[];
  uncertainFields: string[];
}

// Respuesta que el webhook devuelve a n8n para reenviar por WhatsApp
export interface AssistantReply {
  reply: string;
  attachment?: {
    filename: string;
    mimeType: string;
    base64: string;
  };
}
