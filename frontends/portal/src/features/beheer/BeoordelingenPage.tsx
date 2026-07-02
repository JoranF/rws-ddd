import { useQuery } from '@tanstack/react-query';
import { beheerApi } from './api';
import { AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';

// Beoordelingen ontstaan via events (monitoring.rapport.opgesteld en
// onderhoud.onderhoud.afgerond) — hier is dus niets te "doen", alleen te lezen.
export function BeoordelingenPage() {
  const beoordelingen = useQuery({ queryKey: ['beheer', 'beoordelingen'], queryFn: () => beheerApi.beoordelingen() });

  return (
    <>
      <PageHeader context="beheer" titel="Rapportage-beoordelingen" />
      <AlleenLezen context="beheer" />

      <Sectie titel={`Ontvangen rapportages (${beoordelingen.data?.length ?? '…'})`}>
        <Tabel
          rijen={[...(beoordelingen.data ?? [])].sort((a, b) => b.ontvangenOp.localeCompare(a.ontvangenOp))}
          laden={beoordelingen.isLoading}
          fout={beoordelingen.error as Error | null}
          leeg="Nog geen rapportages ontvangen. Die komen binnen via events van Monitoring en Onderhoud."
          sleutel={b => b.beoordelingId}
          kolommen={[
            { kop: 'Kunstwerk', cel: b => b.kunstwerkId, mono: true },
            { kop: 'Type rapportage', cel: b => b.rapportageType },
            { kop: 'Resultaat', cel: b => <StatusPil waarde={b.resultaat} /> },
            {
              kop: 'Bevindingen',
              cel: b => b.bevindingen.length === 0 ? '—' : (
                <details>
                  <summary>{b.bevindingen.length} bevinding{b.bevindingen.length === 1 ? '' : 'en'}</summary>
                  <ul className="stil" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {b.bevindingen.map((bev, i) => (
                      <li key={i}>
                        {bev.eisCode ? <code className="mono">{bev.eisCode}</code> : null} {bev.resultaat}
                        {bev.toelichting ? ` — ${bev.toelichting}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ),
            },
            { kop: 'Ontvangen', cel: b => fmt(b.ontvangenOp), mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
