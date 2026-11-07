import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { inviteEmailHtml, inviteEmailText } from './templates/invite.template';
import { avisoTopeAsistenteHtml, avisoTopeAsistenteText } from './templates/aviso-tope-asistente.template';
import { INVITE_TOKEN_TTL_HOURS } from '@decide/shared';

export interface SendInviteOptions {
  to: string;
  inviteUrl: string;
}

/**
 * EmailService — abstracción sobre el proveedor de email transaccional.
 *
 * Proveedor actual: Resend.
 * Para cambiar de proveedor: implementar los métodos usando la nueva
 * librería y actualizar este servicio. La interfaz pública no cambia.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('EMAIL_FROM');
    this.fromName = this.config.get<string>('EMAIL_FROM_NAME') ?? 'Decide Nicaragua';
  }

  async sendInvite(options: SendInviteOptions): Promise<void> {
    const { to, inviteUrl } = options;

    const { error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.from}>`,
      to,
      subject: 'Invitación a Decide Nicaragua',
      html: inviteEmailHtml({ inviteUrl, expiresInHours: INVITE_TOKEN_TTL_HOURS }),
      text: inviteEmailText({ inviteUrl, expiresInHours: INVITE_TOKEN_TTL_HOURS }),
    });

    if (error) {
      this.logger.error(`Failed to send invite email to ${to}`, error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }

    this.logger.log(`Invite email sent to ${to}`);
  }

  /** Avisa al administrador que el asistente alcanzó el tope de gasto del mes. Sin contenido de miembros. */
  async sendAvisoTopeAsistente(to: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.from}>`,
      to,
      subject: 'El asistente alcanzó el tope de gasto del mes',
      html: avisoTopeAsistenteHtml(),
      text: avisoTopeAsistenteText(),
    });

    if (error) {
      this.logger.error(`Failed to send assistant budget email to ${to}`, error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }

    this.logger.log(`Assistant budget email sent to ${to}`);
  }
}
