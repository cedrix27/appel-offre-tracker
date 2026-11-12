import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { button, escapeHtml, layout, paragraph } from './layout';
import { MailMessage } from './mail.types';

@Injectable()
export class MailTemplates {
  constructor(private readonly config: AppConfig) {}

  link(path: string, token: string): string {
    const url = new URL(path, this.config.env.WEB_APP_URL);
    url.searchParams.set('token', token);
    return url.toString();
  }

  verifyEmail(to: string, fullName: string, token: string): MailMessage {
    const href = this.link('/verifier-email', token);
    const title = 'Confirmez votre adresse e-mail';
    return {
      to: [to],
      category: 'VERIFY_EMAIL',
      subject: 'SRC Digital — confirmez votre adresse e-mail',
      html: layout({
        preheader: 'Activez votre compte SRC Digital.',
        title,
        body:
          paragraph(`Bonjour ${escapeHtml(fullName)},`) +
          paragraph(
            'Merci pour votre inscription à SRC Digital. Pour activer votre compte, confirmez votre adresse e-mail :',
          ) +
          button('Confirmer mon adresse', href, '#d4232b') +
          paragraph(
            'Ce lien est valable 48 heures et ne peut être utilisé qu’une fois.',
          ) +
          paragraph(
            `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${escapeHtml(href)}" style="color:#d4232b;word-break:break-all">${escapeHtml(href)}</a>`,
          ),
      }),
      text: `Bonjour ${fullName},\n\nConfirmez votre adresse e-mail (lien valable 48 heures) :\n${href}\n\nSRC Digital`,
    };
  }

  passwordReset(to: string, fullName: string, token: string): MailMessage {
    const href = this.link('/reinitialiser-mot-de-passe', token);
    return {
      to: [to],
      category: 'PASSWORD_RESET',
      subject: 'SRC Digital — réinitialisation de votre mot de passe',
      html: layout({
        preheader: 'Choisissez un nouveau mot de passe.',
        title: 'Réinitialiser votre mot de passe',
        body:
          paragraph(`Bonjour ${escapeHtml(fullName)},`) +
          paragraph(
            'Une demande de réinitialisation du mot de passe a été faite pour votre compte.',
          ) +
          button('Choisir un nouveau mot de passe', href) +
          paragraph(
            'Ce lien est valable 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
          ) +
          paragraph(
            `Lien : <a href="${escapeHtml(href)}" style="color:#d4232b;word-break:break-all">${escapeHtml(href)}</a>`,
          ),
      }),
      text: `Bonjour ${fullName},\n\nRéinitialisez votre mot de passe (lien valable 1 heure) :\n${href}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\nSRC Digital`,
    };
  }

  invite(
    to: string,
    fullName: string,
    companyName: string,
    inviterName: string,
    token: string,
  ): MailMessage {
    const href = this.link('/invitation', token);
    return {
      to: [to],
      category: 'INVITE',
      subject: `SRC Digital — invitation à rejoindre ${companyName}`,
      html: layout({
        preheader: `${inviterName} vous invite sur SRC Digital.`,
        title: `Rejoignez ${companyName} sur SRC Digital`,
        body:
          paragraph(`Bonjour ${escapeHtml(fullName)},`) +
          paragraph(
            `${escapeHtml(inviterName)} vous invite à rejoindre l’espace <strong>${escapeHtml(companyName)}</strong> sur SRC Digital, le service de veille des appels d’offres publics du Burkina Faso.`,
          ) +
          button('Accepter l’invitation', href, '#d4232b') +
          paragraph(
            'Vous choisirez votre mot de passe à l’étape suivante. Ce lien est valable 7 jours.',
          ) +
          paragraph(
            `Lien : <a href="${escapeHtml(href)}" style="color:#d4232b;word-break:break-all">${escapeHtml(href)}</a>`,
          ),
      }),
      text: `Bonjour ${fullName},\n\n${inviterName} vous invite à rejoindre ${companyName} sur SRC Digital.\nAcceptez l'invitation (lien valable 7 jours) :\n${href}\n\nSRC Digital`,
    };
  }
}
