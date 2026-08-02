import { describe, expect, it } from 'vitest';
import { jobsiteProfit, outstandingBalance } from './profit';

describe('jobsiteProfit', () => {
  it('aplica la fórmula del PRD: facturado − pagos a subs − gastos', () => {
    expect(
      jobsiteProfit({ invoiced: 3200, paidToSubcontractors: 900, expenses: 350 }),
    ).toBe(1950);
  });

  it('puede ser negativa (trabajo con pérdida)', () => {
    expect(jobsiteProfit({ invoiced: 500, paidToSubcontractors: 600, expenses: 0 })).toBe(-100);
  });

  it('redondea a centavos', () => {
    expect(jobsiteProfit({ invoiced: 100.105, paidToSubcontractors: 0.001, expenses: 0 })).toBe(
      100.1,
    );
  });
});

describe('outstandingBalance', () => {
  it('calcula lo que se le debe al subcontratista', () => {
    expect(outstandingBalance(500, 300)).toBe(200);
  });

  it('nunca es negativo aunque se haya pagado de más', () => {
    expect(outstandingBalance(300, 500)).toBe(0);
  });
});
