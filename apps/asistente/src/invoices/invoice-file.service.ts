import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import { formatInvoiceNumber } from '../assistant/pending-fields';
import type { JobWithDetails } from './invoices.service';

const execFileAsync = promisify(execFile);

export interface InvoiceFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

// Genera el invoice formal reutilizando la estructura de plantilla ya validada:
// encabezado, BILL TO / FOR, tabla de conceptos, TOTAL / PAY THIS AMOUNT (PRD §10).
// Exporta a PDF con LibreOffice headless; si no está disponible, entrega el .xlsx.
@Injectable()
export class InvoiceFileService {
  private readonly logger = new Logger(InvoiceFileService.name);

  async generate(job: JobWithDetails): Promise<InvoiceFile> {
    const xlsxBuffer = await this.buildWorkbook(job);
    const baseName = `invoice-${formatInvoiceNumber(job.invoiceNumber)}`;

    try {
      const pdfBuffer = await this.convertToPdf(xlsxBuffer, baseName);
      return { filename: `${baseName}.pdf`, mimeType: 'application/pdf', buffer: pdfBuffer };
    } catch (err) {
      this.logger.warn(
        `PDF conversion failed, falling back to xlsx: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return {
        filename: `${baseName}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsxBuffer,
      };
    }
  }

  private async buildWorkbook(job: JobWithDetails): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoice');
    sheet.columns = [
      { width: 45 }, // DESCRIPTION
      { width: 10 }, // QTY
      { width: 14 }, // UNIT PRICE
      { width: 14 }, // AMOUNT
    ];

    const businessName = process.env['BUSINESS_NAME'] ?? 'H&N Corintian Construction';
    const businessAddress = process.env['BUSINESS_ADDRESS'] ?? '';
    const businessPhone = process.env['BUSINESS_PHONE'] ?? '';
    const businessEmail = process.env['BUSINESS_EMAIL'] ?? '';

    // Encabezado del negocio
    sheet.mergeCells('A1:D1');
    const title = sheet.getCell('A1');
    title.value = businessName;
    title.font = { bold: true, size: 16 };
    let row = 2;
    for (const line of [businessAddress, businessPhone, businessEmail]) {
      if (line !== '') {
        sheet.mergeCells(`A${row.toString()}:D${row.toString()}`);
        sheet.getCell(`A${row.toString()}`).value = line;
        row++;
      }
    }
    row++;

    // INVOICE + número + fecha
    sheet.mergeCells(`A${row.toString()}:B${row.toString()}`);
    const invoiceCell = sheet.getCell(`A${row.toString()}`);
    invoiceCell.value = 'INVOICE';
    invoiceCell.font = { bold: true, size: 14 };
    sheet.getCell(`C${row.toString()}`).value = 'No.';
    sheet.getCell(`D${row.toString()}`).value = formatInvoiceNumber(job.invoiceNumber);
    sheet.getCell(`D${row.toString()}`).font = { bold: true };
    row++;
    sheet.getCell(`C${row.toString()}`).value = 'DATE';
    sheet.getCell(`D${row.toString()}`).value = job.workDate.toISOString().slice(0, 10);
    row += 2;

    // BILL TO / FOR
    sheet.getCell(`A${row.toString()}`).value = 'BILL TO:';
    sheet.getCell(`A${row.toString()}`).font = { bold: true };
    sheet.getCell(`B${row.toString()}`).value = job.client.name;
    row++;
    if (job.client.address) {
      sheet.getCell(`B${row.toString()}`).value = job.client.address;
      row++;
    }
    sheet.getCell(`A${row.toString()}`).value = 'FOR:';
    sheet.getCell(`A${row.toString()}`).font = { bold: true };
    sheet.getCell(`B${row.toString()}`).value = `Jobsite: ${job.jobsiteAddress}`;
    row += 2;

    // Tabla de conceptos
    const headerRow = sheet.getRow(row);
    headerRow.values = ['DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT'];
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } };
    });
    row++;

    let total = 0;
    for (const item of job.lineItems) {
      const amount = Number(item.amount);
      total += amount;
      const r = sheet.getRow(row);
      r.values = [item.description, Number(item.quantity), Number(item.unitPrice), amount];
      r.getCell(3).numFmt = '"$"#,##0.00';
      r.getCell(4).numFmt = '"$"#,##0.00';
      row++;
    }
    row++;

    // TOTAL / PAY THIS AMOUNT
    const totalRow = sheet.getRow(row);
    totalRow.getCell(3).value = 'TOTAL';
    totalRow.getCell(3).font = { bold: true };
    totalRow.getCell(4).value = Math.round(total * 100) / 100;
    totalRow.getCell(4).numFmt = '"$"#,##0.00';
    totalRow.getCell(4).font = { bold: true };
    row++;
    const payRow = sheet.getRow(row);
    payRow.getCell(3).value = 'PAY THIS AMOUNT';
    payRow.getCell(3).font = { bold: true };
    payRow.getCell(4).value = Math.round(total * 100) / 100;
    payRow.getCell(4).numFmt = '"$"#,##0.00';
    payRow.getCell(4).font = { bold: true };

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  private async convertToPdf(xlsxBuffer: Buffer, baseName: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'invoice-'));
    try {
      const xlsxPath = join(dir, `${baseName}.xlsx`);
      await writeFile(xlsxPath, xlsxBuffer);
      await execFileAsync(
        process.env['SOFFICE_BIN'] ?? 'soffice',
        ['--headless', '--convert-to', 'pdf', '--outdir', dir, xlsxPath],
        { timeout: 60_000 },
      );
      return await readFile(join(dir, `${baseName}.pdf`));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
