import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from './normalize';

describe('normalizeExtraction', () => {
  it('normaliza una extracción de invoice válida', () => {
    const result = normalizeExtraction({
      intent: 'invoice',
      invoice: {
        clientName: '  Admer Const Group ',
        jobsiteAddress: '1450 NW 7th Ave',
        workDate: '2026-08-05',
        invoiceNumber: 13,
        pmEmail: null,
        lineItems: [{ description: 'Block 8x8x16', quantity: 450, unitPrice: 3.5, amount: null }],
        subcontractors: [{ name: 'Juan', amount: 300 }],
      },
      payment: null,
      query: null,
      answers: [],
      uncertainFields: ['workDate'],
    });

    expect(result.intent).toBe('invoice');
    expect(result.invoice?.clientName).toBe('Admer Const Group');
    expect(result.invoice?.lineItems).toHaveLength(1);
    expect(result.invoice?.subcontractors).toEqual([{ name: 'Juan', amount: 300 }]);
    expect(result.uncertainFields).toEqual(['workDate']);
  });

  it('descarta líneas sin monto ni forma de calcularlo', () => {
    const result = normalizeExtraction({
      intent: 'invoice',
      invoice: {
        clientName: null,
        jobsiteAddress: null,
        workDate: null,
        invoiceNumber: null,
        pmEmail: null,
        lineItems: [
          { description: 'ilegible', quantity: null, unitPrice: null, amount: null },
          { description: 'labor', quantity: null, unitPrice: null, amount: 500 },
        ],
        subcontractors: [],
      },
      payment: null,
      query: null,
      answers: [],
      uncertainFields: [],
    });
    expect(result.invoice?.lineItems).toHaveLength(1);
    expect(result.invoice?.lineItems[0]?.amount).toBe(500);
  });

  it('rechaza montos negativos y números de invoice inválidos', () => {
    const result = normalizeExtraction({
      intent: 'payment',
      invoice: {
        clientName: null,
        jobsiteAddress: null,
        workDate: null,
        invoiceNumber: -5,
        pmEmail: null,
        lineItems: [],
        subcontractors: [],
      },
      payment: { subcontractorName: 'Juan', amount: -300, jobsiteHint: null },
      query: null,
      answers: [],
      uncertainFields: [],
    });
    expect(result.invoice?.invoiceNumber).toBeNull();
    expect(result.payment?.amount).toBeNull();
  });

  it('cae a intent "other" y estructuras vacías con entrada corrupta', () => {
    const result = normalizeExtraction({ intent: 'hackear', answers: 'no-array' });
    expect(result.intent).toBe('other');
    expect(result.invoice).toBeNull();
    expect(result.answers).toEqual([]);
  });

  it('valida el formato de mes en las consultas', () => {
    const ok = normalizeExtraction({
      intent: 'query',
      query: { kind: 'monthly_invoiced', month: '2026-08' },
    });
    const bad = normalizeExtraction({
      intent: 'query',
      query: { kind: 'monthly_invoiced', month: 'agosto' },
    });
    expect(ok.query?.month).toBe('2026-08');
    expect(bad.query?.month).toBeNull();
  });

  it('filtra respuestas vacías', () => {
    const result = normalizeExtraction({
      intent: 'answer',
      answers: [
        { field: 'workDate', value: '2026-08-05' },
        { field: '', value: 'x' },
        { field: 'clientName', value: '' },
      ],
    });
    expect(result.answers).toEqual([{ field: 'workDate', value: '2026-08-05' }]);
  });
});
