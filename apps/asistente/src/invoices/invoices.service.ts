import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { InvoiceDraft } from '../assistant/types';
import { completeLineItems } from '../assistant/pending-fields';

// Job con todas las relaciones que necesita la generación del archivo
export type JobWithDetails = Prisma.JobGetPayload<{
  include: { client: true; lineItems: true; payments: { include: { subcontractor: true } } };
}>;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Crea el job + líneas + deudas a subcontratistas a partir de un borrador completo.
  // La numeración consecutiva la controla la tabla (MAX+1 con unique constraint);
  // ante una colisión por concurrencia se reintenta con el siguiente número.
  async createFromDraft(draft: InvoiceDraft): Promise<JobWithDetails> {
    const items = completeLineItems(draft.lineItems);
    const clientName = draft.clientName;
    const jobsiteAddress = draft.jobsiteAddress;
    const workDate = draft.workDate;
    if (!clientName || !jobsiteAddress || !workDate) {
      throw new Error('Draft incompleto: faltan campos obligatorios');
    }

    const client = await this.prisma.client.upsert({
      where: { name: clientName },
      update: {},
      create: { name: clientName, pmEmail: draft.pmEmail },
    });

    const maxRetries = 3;
    for (let attempt = 0; ; attempt++) {
      const invoiceNumber = draft.invoiceNumber ?? (await this.nextInvoiceNumber());
      try {
        return await this.prisma.$transaction(async (tx) => {
          const job = await tx.job.create({
            data: {
              clientId: client.id,
              invoiceNumber,
              jobsiteAddress,
              workDate: new Date(`${workDate}T00:00:00Z`),
              status: 'invoiced',
              lineItems: {
                create: items.map((item) => ({
                  description: item.description,
                  quantity: new Prisma.Decimal(item.quantity ?? 1),
                  unitPrice: new Prisma.Decimal(item.unitPrice ?? item.amount ?? 0),
                  amount: new Prisma.Decimal(item.amount ?? 0),
                })),
              },
            },
          });

          // Registrar lo que se le debe a cada subcontratista mencionado (F6)
          for (const sub of draft.subcontractors) {
            const subcontractor = await tx.subcontractor.upsert({
              where: { name: sub.name },
              update: {},
              create: { name: sub.name },
            });
            await tx.jobSubcontractorPayment.create({
              data: {
                jobId: job.id,
                subcontractorId: subcontractor.id,
                amountOwed: new Prisma.Decimal(sub.amount ?? 0),
              },
            });
          }

          return tx.job.findUniqueOrThrow({
            where: { id: job.id },
            include: {
              client: true,
              lineItems: true,
              payments: { include: { subcontractor: true } },
            },
          });
        });
      } catch (err) {
        // P2002 = violación de unique en invoice_number (otro proceso tomó el número)
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isUniqueViolation && draft.invoiceNumber === null && attempt < maxRetries) {
          this.logger.warn(`Invoice number ${invoiceNumber.toString()} taken, retrying`);
          continue;
        }
        throw err;
      }
    }
  }

  async nextInvoiceNumber(): Promise<number> {
    const result = await this.prisma.job.aggregate({ _max: { invoiceNumber: true } });
    return (result._max.invoiceNumber ?? 0) + 1;
  }
}
