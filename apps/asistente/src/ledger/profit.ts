// Fórmula de contabilidad básica del PRD §7:
// Ganancia por jobsite = SUM(line_items.amount)
//                      − SUM(subcontractor_payments.amount_paid)
//                      − SUM(expenses.amount)

export interface JobsiteTotals {
  invoiced: number;
  paidToSubcontractors: number;
  expenses: number;
}

export function jobsiteProfit(totals: JobsiteTotals): number {
  const profit = totals.invoiced - totals.paidToSubcontractors - totals.expenses;
  return Math.round(profit * 100) / 100;
}

// Saldo pendiente de un pago a subcontratista
export function outstandingBalance(amountOwed: number, amountPaid: number): number {
  return Math.max(0, Math.round((amountOwed - amountPaid) * 100) / 100);
}
