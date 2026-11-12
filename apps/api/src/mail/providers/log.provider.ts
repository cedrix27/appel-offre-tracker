import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MailMessage, MailProvider, MailSendResult } from '../mail.types';

/** Aucun envoi réel : l'e-mail est seulement journalisé (et écrit dans email_outbox). */
export class LogMailProvider implements MailProvider {
  readonly name = 'log';
  private readonly logger = new Logger('LogMailProvider');

  send(message: MailMessage): Promise<MailSendResult> {
    this.logger.log(
      `[${message.category}] à ${message.to.length} destinataire(s) — « ${message.subject} »`,
    );
    return Promise.resolve({ messageId: `log-${randomUUID()}` });
  }
}
