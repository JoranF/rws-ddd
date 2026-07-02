import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { onderhoudApi } from './api';
import { AlleenLezen, Kpi, KpiRij, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';

export function OnderhoudDashboard() {
  const navigate = useNavigate();
  const storingen = useQuery({ queryKey: ['onderhoud', 'storingen'], queryFn: onderhoudApi.storingen });
  const trajecten = useQuery({ queryKey: ['onderhoud', 'trajecten'], queryFn: onderhoudApi.trajecten });

  const tr = trajecten.data ?? [];
  const openstaand = (storingen.data ?? []).filter(s => s.status === 'Gemeld').length;
  const lopend = tr.filter(t => t.status === 'Gestart').length;
  const afgerond = tr.filter(t => t.status === 'Afgerond').length;

  return (
    <>
      <PageHeader context="onderhoud" titel="Onderhoud — storingen en trajecten" />
      <AlleenLezen context="onderhoud" />

      <KpiRij>
        <Kpi label="Openstaande storingen" waarde={storingen.data ? openstaand : '…'} toon={openstaand > 0 ? 'let-op' : 'ok'} />
        <Kpi label="Onderhoudstrajecten" waarde={trajecten.data ? tr.length : '…'} />
        <Kpi label="Lopend" waarde={trajecten.data ? lopend : '…'} toon={lopend > 0 ? 'let-op' : undefined} />
        <Kpi label="Afgerond" waarde={trajecten.data ? afgerond : '…'} toon={afgerond > 0 ? 'ok' : undefined} />
      </KpiRij>

      <Sectie titel="Recente trajecten">
        <Tabel
          rijen={[...tr].sort((a, b) => (b.gestartOp ?? '').localeCompare(a.gestartOp ?? '')).slice(0, 5)}
          laden={trajecten.isLoading}
          fout={trajecten.error as Error | null}
          leeg="Nog geen onderhoudstrajecten. Die ontstaan bij een storing met ernst Hoog of Kritiek."
          sleutel={t => t.onderhoudId}
          onRij={t => navigate(`/onderhoud/trajecten/${t.onderhoudId}`)}
          kolommen={[
            { kop: 'ID', cel: t => t.onderhoudId, mono: true },
            { kop: 'Kunstwerk', cel: t => t.kunstwerkId, mono: true },
            { kop: 'Status', cel: t => <StatusPil waarde={t.status} /> },
            { kop: 'Aanleiding', cel: t => t.aanleiding },
            { kop: 'Contract', cel: t => t.contractId ?? '—', mono: true },
            { kop: 'Gestart', cel: t => fmt(t.gestartOp), mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
