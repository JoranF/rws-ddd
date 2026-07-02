// Alle timestamps die we versturen: ISO-8601 in UTC (eindigend op "Z").
export const nowIso = (): string => new Date().toISOString();

export const isoOffsetDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

// Kale kalenderdatum (yyyy-MM-dd) voor endpoints die geen tijd willen.
export const dateOnly = (offsetDays = 0): string =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export const fmt = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
};

export const fmtDatum = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('nl-NL', { dateStyle: 'medium' });
};

export const fmtEuro = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
