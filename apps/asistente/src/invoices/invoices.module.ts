import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceFileService } from './invoice-file.service';

@Module({
  providers: [InvoicesService, InvoiceFileService],
  exports: [InvoicesService, InvoiceFileService],
})
export class InvoicesModule {}
