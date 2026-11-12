import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { MailService } from './mail.service';
import { MAIL_PROVIDER, MailProvider } from './mail.types';
import { BrevoMailProvider } from './providers/brevo.provider';
import { LogMailProvider } from './providers/log.provider';
import { SmtpMailProvider } from './providers/smtp.provider';
import { MailTemplates } from './templates';

export function createMailProvider(config: AppConfig): MailProvider {
  const env = config.env;
  switch (env.EMAIL_PROVIDER) {
    case 'brevo':
      if (!env.EMAIL_API_KEY) {
        throw new Error('EMAIL_API_KEY est requis avec EMAIL_PROVIDER=brevo');
      }
      return new BrevoMailProvider(env.EMAIL_API_KEY);
    case 'smtp':
      if (!env.SMTP_HOST) {
        throw new Error('SMTP_HOST est requis avec EMAIL_PROVIDER=smtp');
      }
      return new SmtpMailProvider({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      });
    case 'log':
      return new LogMailProvider();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [AppConfig],
      useFactory: createMailProvider,
    },
    MailService,
    MailTemplates,
  ],
  exports: [MailService, MailTemplates],
})
export class MailModule {}
