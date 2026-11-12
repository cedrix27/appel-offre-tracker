/** Date du jour (YYYY-MM-DD) dans le fuseau donné. */
export function dateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Convertit 'YYYY-MM-DD' en Date UTC minuit (colonnes @db.Date). */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Date @db.Date → 'YYYY-MM-DD'. */
export function toYmd(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function formatDateFr(
  date: Date,
  timeZone: string,
  withTime: boolean,
): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('fr-FR', opts).format(date);
}
