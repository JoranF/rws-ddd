import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { beheerApi } from './api';
import { AlleenLezen, Kpi, KpiRij, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';

export function BeheerDashboard() {
  const navigate = useNavigate();
  const kunstwerken = useQuery({ queryKey: ['beheer', 'kunstwerken'], queryFn: beheerApi.kunstwerken });
  const beoordelingen = useQuery({ queryKey: ['beheer', 'beoordelingen'], queryFn: () => beheerApi.beoordelingen() });

  const kw = kunstwerken.data ?? [];
  const buitenGebruik = kw.filter(k => k.status === 'BuitenGebruik').length;
  const voldoetNiet = (beoordelingen.data ?? []).filter(b => b.resultaat === 'VoldoetNiet').length;

  return (
    <>
      <PageHeader context="beheer" titel="Beheer — kunstwerk-register" />
      <AlleenLezen context="beheer" />

      <KpiRij>
        <Kpi label="Kunstwerken in register" waarde={kunstwerken.data ? kw.length : '…'} />
        <Kpi label="Buiten gebruik" waarde={kunstwerken.data ? buitenGebruik : '…'} toon={buitenGebruik > 0 ? 'let-op' : undefined} />
        <Kpi label="Rapportage-beoordelingen" waarde={beoordelingen.data ? beoordelingen.data.length : '…'} />
        <Kpi label="Voldoet niet" waarde={beoordelingen.data ? voldoetNiet : '…'} toon={voldoetNiet > 0 ? 'fout' : 'ok'} />
      </KpiRij>

      <Sectie titel="Laatst gewijzigde kunstwerken">
        <Tabel
          rijen={[...kw].sort((a, b) => b.gewijzigdOp.localeCompare(a.gewijzigdOp)).slice(0, 5)}
          laden={kunstwerken.isLoading}
          fout={kunstwerken.error as Error | null}
          leeg="Nog geen kunstwerken in het register. Registreer het eerste kunstwerk via de pagina Kunstwerken."
          sleutel={k => k.kunstwerkId}
          onRij={k => navigate(`/beheer/kunstwerken/${k.kunstwerkId}`)}
          kolommen={[
            { kop: 'ID', cel: k => k.kunstwerkId, mono: true },
            { kop: 'Naam', cel: k => <strong>{k.naam}</strong> },
            { kop: 'Type', cel: k => k.type },
            { kop: 'Status', cel: k => <StatusPil waarde={k.status} /> },
            { kop: 'Gewijzigd', cel: k => fmt(k.gewijzigdOp), mono: true },
          ]}
        />
      </Sectie>

      <Sectie titel="Recente rapportage-beoordelingen">
        <Tabel
          rijen={[...(beoordelingen.data ?? [])].sort((a, b) => b.ontvangenOp.localeCompare(a.ontvangenOp)).slice(0, 5)}
          laden={beoordelingen.isLoading}
          fout={beoordelingen.error as Error | null}
          leeg="Nog geen beoordelingen ontvangen. Die ontstaan zodra Monitoring of Onderhoud rapporteert."
          sleutel={b => b.beoordelingId}
          kolommen={[
            { kop: 'Kunstwerk', cel: b => b.kunstwerkId, mono: true },
            { kop: 'Type rapportage', cel: b => b.rapportageType },
            { kop: 'Resultaat', cel: b => <StatusPil waarde={b.resultaat} /> },
            { kop: 'Ontvangen', cel: b => fmt(b.ontvangenOp), mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
