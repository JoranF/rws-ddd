// Gedeelde bouwstenen voor alle werkschermen. Houd feature-pagina's dun:
// data ophalen met TanStack Query, renderen met deze componenten.
import { useState, type FormEvent, type ReactNode } from 'react';
import { CONTEXTS, type ContextKey } from '../lib/contexts';
import { useAuth, useKanBewerken } from '../auth/auth';

// ---------------------------------------------------------------- paginakop
export function PageHeader({ context, titel, children }: {
  context: ContextKey; titel: string; children?: ReactNode;
}) {
  const ctx = CONTEXTS[context];
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow" style={{ color: ctx.kleur }}>Bounded context — {ctx.label}</span>
        <h1>{titel}</h1>
      </div>
      {children && <div className="page-header__acties">{children}</div>}
    </header>
  );
}

// Banner op pagina's van een andere context dan die van de ingelogde gebruiker.
export function AlleenLezen({ context }: { context: ContextKey }) {
  const kan = useKanBewerken(context);
  const { gebruiker } = useAuth();
  if (kan || !gebruiker) return null;
  const ctx = CONTEXTS[context];
  return (
    <div className="alleen-lezen">
      <span className="alleen-lezen__oog" aria-hidden>◎</span>
      Alleen lezen — {ctx.label.toLowerCase()} is de context van de {ctx.rol.toLowerCase()}.
      Jij bent ingelogd als {gebruiker.rol.toLowerCase()}.
    </div>
  );
}

// ---------------------------------------------------------------- KPI-tegels
export function KpiRij({ children }: { children: ReactNode }) {
  return <div className="kpi-rij">{children}</div>;
}

export function Kpi({ label, waarde, toon }: { label: string; waarde: ReactNode; toon?: 'ok' | 'let-op' | 'fout' }) {
  return (
    <div className={`kpi${toon ? ` kpi--${toon}` : ''}`}>
      <span className="kpi__waarde">{waarde}</span>
      <span className="kpi__label">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- tabellen
export interface Kolom<T> {
  kop: string;
  cel: (rij: T) => ReactNode;
  mono?: boolean;   // ID's, meetwaarden, timestamps → IBM Plex Mono
  uitlijnen?: 'rechts';
}

export function Tabel<T>({ rijen, kolommen, sleutel, laden, fout, leeg, onRij }: {
  rijen: T[] | undefined;
  kolommen: Kolom<T>[];
  sleutel: (rij: T) => string;
  laden?: boolean;
  fout?: Error | null;
  leeg: string;
  onRij?: (rij: T) => void;
}) {
  if (fout) return <FoutBlok fout={fout} />;
  if (laden && !rijen) return <p className="stil">Laden…</p>;
  if (!rijen || rijen.length === 0) return <p className="stil">{leeg}</p>;
  return (
    <div className="tabel-wrap">
      <table className="tabel">
        <thead>
          <tr>{kolommen.map(k => <th key={k.kop} className={k.uitlijnen === 'rechts' ? 'rechts' : undefined}>{k.kop}</th>)}</tr>
        </thead>
        <tbody>
          {rijen.map(r => (
            <tr key={sleutel(r)} className={onRij ? 'klikbaar' : undefined}
                onClick={onRij ? () => onRij(r) : undefined}
                tabIndex={onRij ? 0 : undefined}
                onKeyDown={onRij ? e => { if (e.key === 'Enter') onRij(r); } : undefined}>
              {kolommen.map(k => (
                <td key={k.kop} className={[k.mono ? 'mono' : '', k.uitlijnen === 'rechts' ? 'rechts' : ''].join(' ').trim() || undefined}>
                  {k.cel(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- statuspillen
const STATUS_TOON: Record<string, 'ok' | 'let-op' | 'fout' | 'neutraal'> = {
  // gedeeld
  Open: 'let-op', Gestart: 'let-op', Actief: 'ok', Afgerond: 'ok', Opgelost: 'ok',
  // beheer
  Geregistreerd: 'neutraal', InGebruik: 'ok', BuitenGebruik: 'fout', Afgekeurd: 'fout',
  Voldoet: 'ok', VoldoetNiet: 'fout', NietTeBeoordelen: 'let-op',
  // onderhoud
  Gemeld: 'let-op', Gepland: 'neutraal', Goedgekeurd: 'ok',
  // monitoring / contract
  InBehandeling: 'let-op', Gepubliceerd: 'neutraal', Gegund: 'ok', Gesloten: 'neutraal',
};

export function StatusPil({ waarde }: { waarde: string | null | undefined }) {
  if (!waarde) return <span className="stil">—</span>;
  const toon = STATUS_TOON[waarde] ?? 'neutraal';
  return <span className={`pil pil--${toon}`}>{waarde}</span>;
}

const ERNST_TOON: Record<string, string> = { Laag: 'neutraal', Middel: 'let-op', Hoog: 'fout', Kritiek: 'fout' };

export function ErnstPil({ waarde }: { waarde: string | null | undefined }) {
  if (!waarde) return <span className="stil">—</span>;
  return <span className={`pil pil--${ERNST_TOON[waarde] ?? 'neutraal'}`}>{waarde}</span>;
}

// ---------------------------------------------------------------- fouten & leegte
export function FoutBlok({ fout }: { fout: Error }) {
  return (
    <div className="fout-blok" role="alert">
      <strong>De service gaf een fout terug.</strong>
      <pre>{fout.message}</pre>
    </div>
  );
}

// ---------------------------------------------------------------- formulieren
// Eenvoudig declaratief formulier: velden → waarden als strings, submit-callback
// doet de mutatie. Alleen zichtbaar als de gebruiker in deze context mag schrijven.
export interface VeldDef {
  naam: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'datetime-local';
  standaard?: string;
  opties?: string[];      // → select
  verplicht?: boolean;
  hint?: string;
}

export function ActieForm({ context, titel, velden, knop, onSubmit, bezig }: {
  context: ContextKey;
  titel: string;
  velden: VeldDef[];
  knop: string;
  onSubmit: (waarden: Record<string, string>) => void;
  bezig?: boolean;
}) {
  const kan = useKanBewerken(context);
  const [waarden, setWaarden] = useState<Record<string, string>>(
    () => Object.fromEntries(velden.map(v => [v.naam, v.standaard ?? ''])),
  );
  if (!kan) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(waarden);
  };

  return (
    <form className="actie-form" onSubmit={submit}>
      <h3>{titel}</h3>
      <div className="actie-form__velden">
        {velden.map(v => (
          <label key={v.naam} className="veld">
            <span>{v.label}{v.verplicht !== false && <em aria-hidden> *</em>}</span>
            {v.opties ? (
              <select value={waarden[v.naam]} required={v.verplicht !== false}
                      onChange={e => setWaarden(w => ({ ...w, [v.naam]: e.target.value }))}>
                {!v.standaard && <option value="">— kies —</option>}
                {v.opties.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={v.type ?? 'text'} value={waarden[v.naam]} required={v.verplicht !== false}
                     step={v.type === 'number' ? 'any' : undefined}
                     onChange={e => setWaarden(w => ({ ...w, [v.naam]: e.target.value }))} />
            )}
            {v.hint && <small>{v.hint}</small>}
          </label>
        ))}
      </div>
      <button className="knop" type="submit" disabled={bezig}>{bezig ? 'Bezig…' : knop}</button>
    </form>
  );
}

// Losse actieknop (zonder velden), alleen zichtbaar met schrijfrechten.
export function ActieKnop({ context, children, onClick, bezig, variant }: {
  context: ContextKey; children: ReactNode; onClick: () => void; bezig?: boolean; variant?: 'gevaar';
}) {
  const kan = useKanBewerken(context);
  if (!kan) return null;
  return (
    <button className={`knop${variant ? ` knop--${variant}` : ''}`} type="button" onClick={onClick} disabled={bezig}>
      {bezig ? 'Bezig…' : children}
    </button>
  );
}

// ---------------------------------------------------------------- detailweergave
export function DefLijst({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="def-lijst">
      {items.map(([k, v]) => (
        <div key={k} className="def-lijst__rij">
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Sectie({ titel, children, acties }: { titel: string; children: ReactNode; acties?: ReactNode }) {
  return (
    <section className="sectie">
      <div className="sectie__kop">
        <h2>{titel}</h2>
        {acties}
      </div>
      {children}
    </section>
  );
}
