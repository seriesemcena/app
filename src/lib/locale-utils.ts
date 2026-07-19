/* ─── Country → locale mapping ───────────────────────────────────────────── */

export const COUNTRY_TO_LOCALE: Record<string, string> = {
  // Portuguese
  BR: 'pt-BR',
  PT: 'pt-PT', AO: 'pt-PT', MZ: 'pt-PT', CV: 'pt-PT',
  GW: 'pt-PT', ST: 'pt-PT', TL: 'pt-PT',
  // Spanish - Mexico / Central America
  MX: 'es-MX', GT: 'es-MX', HN: 'es-MX', SV: 'es-MX',
  NI: 'es-MX', CR: 'es-MX', PA: 'es-MX', DO: 'es-MX', PR: 'es-MX',
  // Spanish - Spain & South America
  ES: 'es-ES', AR: 'es-ES', CL: 'es-ES', CO: 'es-ES', PE: 'es-ES',
  VE: 'es-ES', EC: 'es-ES', BO: 'es-ES', PY: 'es-ES', UY: 'es-ES', CU: 'es-ES',
  // French
  FR: 'fr-FR', BE: 'fr-FR', LU: 'fr-FR', MC: 'fr-FR',
  // German
  DE: 'de-DE', AT: 'de-DE', LI: 'de-DE',
  // Italian
  IT: 'it-IT', SM: 'it-IT', VA: 'it-IT',
  // Japanese
  JP: 'ja-JP',
  // Korean
  KR: 'ko-KR',
  // English - British Isles, Oceania
  GB: 'en-GB', AU: 'en-GB', NZ: 'en-GB', IE: 'en-GB', ZA: 'en-GB',
  // English - American (default for remaining)
  US: 'en-US', CA: 'en-US', IN: 'en-US', SG: 'en-US',
  PH: 'en-US', NG: 'en-US', KE: 'en-US', GH: 'en-US',
};

export function getDefaultLocaleForCountry(countryCode: string): string {
  return COUNTRY_TO_LOCALE[countryCode?.toUpperCase()] ?? 'en-US';
}

/* ─── Intl formatters ────────────────────────────────────────────────────── */

export function formatDate(
  date: Date | string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try { return new Intl.DateTimeFormat(locale, options).format(d); } catch { return String(d); }
}

export function formatNumber(
  n: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  try { return new Intl.NumberFormat(locale, options).format(n); } catch { return String(n); }
}

export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch { return `${currency} ${amount}`; }
}

export function formatRelativeTime(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr  / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diffSec < 60)  return rtf.format(0, 'second');
    if (diffMin < 60)  return rtf.format(-diffMin, 'minute');
    if (diffHr  < 24)  return rtf.format(-diffHr,  'hour');
    if (diffDay < 30)  return rtf.format(-diffDay,  'day');
    if (diffDay < 365) return rtf.format(-Math.floor(diffDay / 7), 'week');
    return rtf.format(-Math.floor(diffDay / 365), 'year');
  } catch { return String(d); }
}
