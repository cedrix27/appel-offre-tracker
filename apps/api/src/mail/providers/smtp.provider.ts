import { createTransport, Transporter } from 'nodemailer';
import { MailMessage, MailProvider, MailSendResult } from '../mail.types';

export interface SmtpOptions {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(opts: SmtpOptions) {
    this.transporter = createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth:
        opts.user && opts.password
          ? { user: opts.user, pass: opts.password }
          : undefined,
    });
  }

  async send(
    message: MailMessage,
    from: { name: string; email: string },
  ): Promise<MailSendResult> {
    const info = (await this.transporter.sendMail({
      from: { name: from.name, address: from.email },
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })) as { messageId?: string };
    return { messageId: info.messageId ?? null };
  }
}
