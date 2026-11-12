import { MailMessage, MailProvider, MailSendResult } from '../mail.types';

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

type FetchFn = typeof fetch;

/** API transactionnelle Brevo (https://developers.brevo.com/reference/sendtransacemail). */
export class BrevoMailProvider implements MailProvider {
  readonly name = 'brevo';

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async send(
    message: MailMessage,
    from: { name: string; email: string },
  ): Promise<MailSendResult> {
    const res = await this.fetchFn(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: message.to.map((email) => ({ email })),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: [message.category],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Brevo a répondu ${res.status} : ${detail}`);
    }
    const body = (await res.json()) as { messageId?: string };
    return { messageId: body.messageId ?? null };
  }
}
