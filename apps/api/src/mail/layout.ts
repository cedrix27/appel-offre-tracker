/** Gabarit HTML responsive commun (tables + styles en ligne, compatibles clients mail). */
export const COLORS = {
  ink: '#171716',
  ink2: '#55554f',
  brand: '#d4232b',
  paper: '#fafaf8',
  card: '#ffffff',
  line: '#e6e4de',
  warnBg: '#fdecec',
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function button(
  label: string,
  href: string,
  color: string = COLORS.ink,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td style="border-radius:8px;background:${color}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a></td></tr></table>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${COLORS.ink}">${html}</p>`;
}

export function layout(opts: {
  preheader: string;
  title: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 16px !important; padding-right: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.paper}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.paper}">
<tr><td align="center" style="padding:24px 8px">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
    <tr><td class="px" style="padding:8px 24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${COLORS.ink}">
      <span style="color:${COLORS.brand}">■</span> SRC Digital
    </td></tr>
    <tr><td class="px" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:12px;padding:32px 24px">
      <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${COLORS.ink}">${escapeHtml(opts.title)}</h1>
      ${opts.body}
    </td></tr>
    <tr><td class="px" style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.ink2}">
      SRC Digital — veille des appels d'offres publics du Burkina Faso.<br>
      Cet e-mail vous est envoyé automatiquement, merci de ne pas y répondre.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
