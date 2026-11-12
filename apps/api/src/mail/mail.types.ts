export type MailCategory =
  'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'INVITE' | 'DAILY_DIGEST';

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  category: MailCategory;
}

export interface MailSendResult {
  messageId: string | null;
}

/** Fournisseur d'envoi (log | smtp | brevo). Lève une erreur en cas d'échec. */
export interface MailProvider {
  readonly name: string;
  send(
    message: MailMessage,
    from: { name: string; email: string },
  ): Promise<MailSendResult>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailOutcome {
  outboxId: string;
  status: 'SENT' | 'FAILED';
  provider: string;
  messageId: string | null;
  error: string | null;
}
