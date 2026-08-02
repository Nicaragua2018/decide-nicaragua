import { describe, expect, it } from 'vitest';
import {
  applyAnswers,
  completeLineItems,
  emptyDraft,
  formatInvoiceNumber,
  invoiceTotal,
  mergeDraft,
  missingFields,
  questionFor,
} from './pending-fields';
import type { InvoiceDraft } from './types';

function fullDraft(): InvoiceDraft {
  return {
    clientName: 'Admer Const Group',
    jobsiteAddress: '1450 NW 7th Ave',
    workDate: '2026-08-05',
    invoiceNumber: null,
    pmEmail: null,
    lineItems: [{ description: 'Block 8x8x16', quantity: 450, unitPrice: 3.5, amount: null }],
    subcontractors: [{ name: 'Juan', amount: 300 }],
  };
}

describe('missingFields', () => {
  it('no reporta faltantes con un borrador completo', () => {
    expect(missingFields(fullDraft())).toEqual([]);
  });

  it('reporta todos los obligatorios con un borrador vacío', () => {
    expect(missingFields(emptyDraft())).toEqual([
      'clientName',
      'jobsiteAddress',
      'workDate',
      'lineItems',
    ]);
  });

  it('rechaza fechas que no son YYYY-MM-DD', () => {
    const draft = { ...fullDraft(), workDate: '05/08/2026' };
    expect(missingFields(draft)).toEqual(['workDate']);
  });

  it('exige líneas con monto calculable', () => {
    const draft = {
      ...fullDraft(),
      lineItems: [{ description: 'Block', quantity: null, unitPrice: null, amount: null }],
    };
    expect(missingFields(draft)).toEqual(['lineItems']);
  });
});

describe('completeLineItems / invoiceTotal', () => {
  it('calcula amount = quantity × unitPrice cuando falta', () => {
    const [item] = completeLineItems([
      { description: 'Block', quantity: 450, unitPrice: 3.5, amount: null },
    ]);
    expect(item?.amount).toBe(1575);
  });

  it('no toca montos ya presentes', () => {
    const [item] = completeLineItems([
      { description: 'Labor', quantity: null, unitPrice: null, amount: 1200 },
    ]);
    expect(item?.amount).toBe(1200);
  });

  it('suma el total con redondeo a centavos', () => {
    const draft = {
      ...fullDraft(),
      lineItems: [
        { description: 'a', quantity: 3, unitPrice: 0.1, amount: null },
        { description: 'b', quantity: null, unitPrice: null, amount: 100.005 },
      ],
    };
    expect(invoiceTotal(draft)).toBe(100.31);
  });
});

describe('mergeDraft', () => {
  it('la información nueva no borra lo ya confirmado', () => {
    const base = fullDraft();
    const update = { ...emptyDraft(), workDate: '2026-08-06' };
    const merged = mergeDraft(base, update);
    expect(merged.clientName).toBe('Admer Const Group');
    expect(merged.workDate).toBe('2026-08-06');
    expect(merged.lineItems).toHaveLength(1);
  });

  it('parte de un borrador vacío cuando no hay base', () => {
    const merged = mergeDraft(null, null);
    expect(merged).toEqual(emptyDraft());
  });
});

describe('applyAnswers', () => {
  it('aplica respuestas a campos conocidos', () => {
    const draft = applyAnswers(emptyDraft(), [
      { field: 'clientName', value: 'Bed Rock Construction' },
      { field: 'workDate', value: '2026-08-05' },
      { field: 'invoiceNumber', value: '13' },
    ]);
    expect(draft.clientName).toBe('Bed Rock Construction');
    expect(draft.workDate).toBe('2026-08-05');
    expect(draft.invoiceNumber).toBe(13);
  });

  it('ignora campos desconocidos y valores vacíos sin fallar', () => {
    const draft = applyAnswers(emptyDraft(), [
      { field: 'algoRaro', value: 'x' },
      { field: 'clientName', value: '  ' },
      { field: 'invoiceNumber', value: 'no-es-numero' },
    ]);
    expect(draft).toEqual(emptyDraft());
  });
});

describe('formatInvoiceNumber', () => {
  it('rellena con ceros a 4 dígitos', () => {
    expect(formatInvoiceNumber(13)).toBe('0013');
    expect(formatInvoiceNumber(12345)).toBe('12345');
  });
});

describe('questionFor', () => {
  it('tiene una pregunta en español para cada campo obligatorio', () => {
    for (const field of ['clientName', 'jobsiteAddress', 'workDate', 'lineItems']) {
      expect(questionFor(field)).toMatch(/[¿?]/);
    }
  });
});
