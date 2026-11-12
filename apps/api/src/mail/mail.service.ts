import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAIL_PROVIDER,
  MailMessage,
  MailOutcome,
  type MailProvider,
} from './mail.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');

  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Envoie un e-mail et écrit TOUJOURS une ligne email_outbox (SENT / FAILED). Ne lève pas. */
  async send(message: MailMessage): Promise<MailOutcome> {
    const from = {
      name: this.config.env.EMAIL_FROM_NAME,
      email: this.config.env.EMAIL_FROM_ADDRESS,
    };
    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const res = await this.provider.send(message, from);
      messageId = res.messageId;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Échec d'envoi [${message.category}] via ${this.provider.name} : ${error}`,
      );
    }
    const status = error ? 'FAILED' : 'SENT';
    const row = await this.prisma.emailOutbox.create({
      data: {
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        category: message.category,
        provider: this.provider.name,
        providerMessageId: messageId,
        status,
        error,
      },
    });
    return {
      outboxId: row.id,
      status,
      provider: this.provider.name,
      messageId,
      error,
    };
  }
}
