import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { contractApi } from './api';
import { AlleenLezen, Kpi, KpiRij, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmtEuro } from '../../lib/dates';

// Soepel vergelijken: statussen kunnen per service-implementatie in casing verschillen.
const laag = (s: string) => s.toLowerCase();

export function ContractDashboard() {
  const navigate = useNavigate();
  const aanbestedingen = useQuery({ queryKey: ['contract', 'aanbestedingen'], queryFn: contractApi.aanbestedingen });
  const contracten = useQuery({ queryKey: ['contract', 'contracten'], queryFn: () => contractApi.contracten() });

  const ab = aanbestedingen.data ?? [];
  const cn = contracten.data ?? [];
  const lopend = ab.filter(a => laag(a.status) !== 'gegund' && laag(a.status) !== 'gesloten').length;
  const actief = cn.filter(c => laag(c.status) === 'actief').length;
  const totaleWaarde = cn.reduce((som, c) => som + c.waarde, 0);

  return (
    <>
      <PageHeader context="contract" titel="Contract — aanbestedingen en contracten" />
      <AlleenLezen context="contract" />

      <KpiRij>
        <Kpi label="Lopende aanbestedingen" waarde={aanbestedingen.data ? lopend : '…'} toon={lopend > 0 ? 'let-op' : undefined} />
        <Kpi label="Aanbestedingen totaal" waarde={aanbestedingen.data ? ab.length : '…'} />
        <Kpi label="Actieve contracten" waarde={contracten.data ? actief : '…'} toon={actief > 0 ? 'ok' : undefined} />
        <Kpi label="Totale contractwaarde" waarde={contracten.data ? fmtEuro(totaleWaarde) : '…'} />
      </KpiRij>

      <Sectie titel="Aanbestedingen">
        <Tabel
          rijen={ab.slice(0, 5)}
          laden={aanbestedingen.isLoading}
          fout={aanbestedingen.error as Error | null}
          leeg="Nog geen aanbestedingen. Start de eerste via de pagina Aanbestedingen."
          sleutel={a => a.aanbestedingId}
          onRij={a => navigate(`/contract/aanbestedingen/${a.aanbestedingId}`)}
          kolommen={[
            { kop: 'ID', cel: a => a.aanbestedingId, mono: true },
            { kop: 'Kunstwerk', cel: a => a.kunstwerkId, mono: true },
            { kop: 'Status', cel: a => <StatusPil waarde={a.status} /> },
            { kop: 'Inschrijvingen', cel: a => a.aantalInschrijvingen, uitlijnen: 'rechts', mono: true },
          ]}
        />
      </Sectie>

      <Sectie titel="Contracten">
        <Tabel
          rijen={cn.slice(0, 5)}
          laden={contracten.isLoading}
          fout={contracten.error as Error | null}
          leeg="Nog geen onderhoudscontracten. Die ontstaan na gunning van een aanbesteding."
          sleutel={c => c.contractId}
          onRij={c => navigate(`/contract/contracten/${c.contractId}`)}
          kolommen={[
            { kop: 'ID', cel: c => c.contractId, mono: true },
            { kop: 'Kunstwerk', cel: c => c.kunstwerkId, mono: true },
            { kop: 'Opdrachtnemer', cel: c => <strong>{c.opdrachtnemer}</strong> },
            { kop: 'Status', cel: c => <StatusPil waarde={c.status} /> },
            { kop: 'Waarde', cel: c => fmtEuro(c.waarde), uitlijnen: 'rechts', mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
