import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentInfo } from '../assistant/types';
import { outstandingBalance } from './profit';

export type PaymentResult =
  | { status: 'recorded'; subcontractorName: string; amount: number; jobsite: string }
  | { status: 'needs_amount' }
  | { status: 'needs_subcontractor' }
  | { status: 'no_job' };

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // Rama Subcontratista del pipeline (PRD §8.4):
  // "le pagué 300 a Juan por lo de ayer" → identificar subcontratista + monto
  // + trabajo relacionado (por jobsite reciente) → actualizar pagos.
  async recordPayment(payment: PaymentInfo): Promise<PaymentResult> {
    if (!payment.subcontractorName) return { status: 'needs_subcontractor' };
    if (payment.amount === null) return { status: 'needs_amount' };

    const subcontractor = await this.prisma.subcontractor.upsert({
      where: { name: payment.subcontractorName },
      update: {},
      create: { name: payment.subcontractorName },
    });

    // Preferir una deuda pendiente existente de ese subcontratista;
    // si trae pista de jobsite, filtrar por ella.
    const pending = await this.prisma.jobSubcontractorPayment.findFirst({
      where: {
        subcontractorId: subcontractor.id,
        status: 'pending',
        ...(payment.jobsiteHint
          ? { job: { jobsiteAddress: { contains: payment.jobsiteHint, mode: 'insensitive' } } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { job: true },
    });

    if (pending) {
      const newPaid = Number(pending.amountPaid) + payment.amount;
      const owed = Number(pending.amountOwed);
      await this.prisma.jobSubcontractorPayment.update({
        where: { id: pending.id },
        data: {
          amountPaid: new Prisma.Decimal(newPaid),
          paidAt: new Date(),
          status: outstandingBalance(owed, newPaid) === 0 ? 'paid' : 'pending',
        },
      });
      return {
        status: 'recorded',
        subcontractorName: subcontractor.name,
        amount: payment.amount,
        jobsite: pending.job.jobsiteAddress,
      };
    }

    // Sin deuda registrada: asociar el pago al trabajo más reciente
    const job = await this.prisma.job.findFirst({
      where: payment.jobsiteHint
        ? { jobsiteAddress: { contains: payment.jobsiteHint, mode: 'insensitive' } }
        : {},
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return { status: 'no_job' };

    await this.prisma.jobSubcontractorPayment.create({
      data: {
        jobId: job.id,
        subcontractorId: subcontractor.id,
        amountOwed: new Prisma.Decimal(payment.amount),
        amountPaid: new Prisma.Decimal(payment.amount),
        paidAt: new Date(),
        status: 'paid',
      },
    });
    return {
      status: 'recorded',
      subcontractorName: subcontractor.name,
      amount: payment.amount,
      jobsite: job.jobsiteAddress,
    };
  }
}
