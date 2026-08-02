import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryInfo } from '../assistant/types';
import { outstandingBalance } from '../ledger/profit';

// Rama Consulta del pipeline (PRD §8.6): las respuestas se construyen SOLO
// con datos reales de Postgres — nunca se estiman ni inventan cifras (PRD §9).
@Injectable()
export class QueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async answer(query: QueryInfo, todayIso: string): Promise<string> {
    switch (query.kind) {
      case 'monthly_invoiced':
        return this.monthlyInvoiced(query.month ?? todayIso.slice(0, 7));
      case 'pending_payments':
        return this.pendingPayments();
      default:
        return 'Puedo decirte cuánto llevas facturado en el mes o qué pagos tienes pendientes con tus subcontratistas. ¿Cuál de las dos te interesa?';
    }
  }

  private async monthlyInvoiced(month: string): Promise<string> {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const jobs = await this.prisma.job.findMany({
      where: {
        status: { in: ['invoiced', 'paid'] },
        workDate: { gte: start, lt: end },
      },
      include: { lineItems: true, client: true },
      orderBy: { invoiceNumber: 'asc' },
    });

    if (jobs.length === 0) {
      return `No tienes invoices registrados en ${month}.`;
    }

    let total = 0;
    const lines = jobs.map((job) => {
      const jobTotal = job.lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
      total += jobTotal;
      return `• #${job.invoiceNumber.toString().padStart(4, '0')} ${job.client.name} — $${jobTotal.toFixed(2)}`;
    });

    return [
      `En ${month} llevas ${jobs.length.toString()} invoice(s) por un total de $${total.toFixed(2)}:`,
      ...lines,
    ].join('\n');
  }

  private async pendingPayments(): Promise<string> {
    const pending = await this.prisma.jobSubcontractorPayment.findMany({
      where: { status: 'pending' },
      include: { subcontractor: true, job: true },
    });

    const bySub = new Map<string, number>();
    for (const p of pending) {
      const balance = outstandingBalance(Number(p.amountOwed), Number(p.amountPaid));
      if (balance > 0) {
        bySub.set(p.subcontractor.name, (bySub.get(p.subcontractor.name) ?? 0) + balance);
      }
    }

    if (bySub.size === 0) {
      return 'No tienes pagos pendientes con subcontratistas. Todo al día. ✅';
    }

    const lines = [...bySub.entries()].map(([name, amount]) => `• ${name}: $${amount.toFixed(2)}`);
    const total = [...bySub.values()].reduce((a, b) => a + b, 0);
    return [`Debes $${total.toFixed(2)} a subcontratistas:`, ...lines].join('\n');
  }
}
