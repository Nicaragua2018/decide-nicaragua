// JSON Schema para la salida estructurada de Claude (output_config.format).
// Reglas de structured outputs: additionalProperties:false en todos los objetos,
// todos los campos en required, sin restricciones numéricas/minLength.

const lineItem = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'quantity', 'unitPrice', 'amount'],
  properties: {
    description: { type: 'string' },
    quantity: { type: ['number', 'null'] },
    unitPrice: { type: ['number', 'null'] },
    amount: { type: ['number', 'null'] },
  },
} as const;

const subcontractor = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'amount'],
  properties: {
    name: { type: 'string' },
    amount: { type: ['number', 'null'] },
  },
} as const;

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'invoice', 'payment', 'query', 'answers', 'uncertainFields'],
  properties: {
    intent: {
      type: 'string',
      enum: ['invoice', 'payment', 'schedule', 'query', 'answer', 'other'],
    },
    invoice: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'clientName',
            'jobsiteAddress',
            'workDate',
            'invoiceNumber',
            'pmEmail',
            'lineItems',
            'subcontractors',
          ],
          properties: {
            clientName: { type: ['string', 'null'] },
            jobsiteAddress: { type: ['string', 'null'] },
            workDate: { type: ['string', 'null'] },
            invoiceNumber: { type: ['integer', 'null'] },
            pmEmail: { type: ['string', 'null'] },
            lineItems: { type: 'array', items: lineItem },
            subcontractors: { type: 'array', items: subcontractor },
          },
        },
      ],
    },
    payment: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['subcontractorName', 'amount', 'jobsiteHint'],
          properties: {
            subcontractorName: { type: ['string', 'null'] },
            amount: { type: ['number', 'null'] },
            jobsiteHint: { type: ['string', 'null'] },
          },
        },
      ],
    },
    query: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'month'],
          properties: {
            kind: { type: 'string', enum: ['monthly_invoiced', 'pending_payments', 'other'] },
            month: { type: ['string', 'null'] },
          },
        },
      ],
    },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value'],
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    uncertainFields: { type: 'array', items: { type: 'string' } },
  },
} as const;
