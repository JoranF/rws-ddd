import { useState, type ReactNode } from 'react';

export function Panel({ title, accent, children }: { title: string; accent?: string; children: ReactNode }) {
  return (
    <section className="panel" style={accent ? { borderTopColor: accent } : undefined}>
      <h2 className="panel__title">{title}</h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}

const ERNST_CLASS: Record<string, string> = {
  laag: 'ernst--laag',
  middel: 'ernst--middel',
  hoog: 'ernst--hoog',
  kritiek: 'ernst--kritiek',
};

export function ErnstBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const cls = ERNST_CLASS[String(value).toLowerCase()] ?? 'ernst--laag';
  return <span className={`badge ${cls}`}>{value}</span>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  if (value == null) return <span className="badge badge--muted">—</span>;
  return <span className="badge badge--status">{String(value)}</span>;
}

// Live-lijst met flash-highlight voor nieuwe rijen. Toont fout (rode badge) i.p.v.
// nepdata als de service faalt.
export function LiveList<T>({
  loading, error, rows, keyOf, fresh, render, empty,
}: {
  loading: boolean;
  error: string | null;
  rows: T[] | null;
  keyOf: (row: T) => string;
  fresh: Set<string>;
  render: (row: T) => ReactNode;
  empty?: string;
}) {
  if (error && !rows) return <div className="list-error">⚠ {error}</div>;
  if (loading && !rows) return <div className="list-muted">laden…</div>;
  if (!rows || rows.length === 0) return <div className="list-muted">{empty ?? 'geen items'}</div>;
  return (
    <ul className="live-list">
      {error && <li className="list-error">⚠ {error} (laatst bekende data getoond)</li>}
      {rows.map(row => {
        const k = keyOf(row);
        return (
          <li key={k} className={fresh.has(k) ? 'live-list__row live-list__row--fresh' : 'live-list__row'}>
            {render(row)}
          </li>
        );
      })}
    </ul>
  );
}

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
  value?: string;
}

// Klein actie-formulier voor de "vrij spelen"-panelen. Doet een echte call.
export function ActionForm({
  label, fields, onSubmit,
}: {
  label: string;
  fields: FieldSpec[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const init: Record<string, string> = {};
  fields.forEach(f => (init[f.name] = f.value ?? ''));
  const [values, setValues] = useState(init);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="action-form"
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(values);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map(f => (
        <input
          key={f.name}
          className="action-form__input"
          type={f.type ?? 'text'}
          placeholder={f.placeholder ?? f.label}
          value={values[f.name]}
          onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
        />
      ))}
      <button className="btn btn--small" disabled={busy} type="submit">
        {busy ? '…' : label}
      </button>
    </form>
  );
}
