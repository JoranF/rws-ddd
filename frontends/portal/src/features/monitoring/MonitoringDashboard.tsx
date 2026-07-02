import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from './api';
import { AlleenLezen, ErnstPil, Kpi, KpiRij, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt, statusIs } from '../../lib/dates';

export function MonitoringDashboard() {
  const incidenten = useQuery({ queryKey: ['monitoring', 'incidenten'], queryFn: () => monitoringApi.incidenten() });
  const sessies = useQuery({ queryKey: ['monitoring', 'sessies'], queryFn: monitoringApi.sessies });
  const rapporten = useQuery({ queryKey: ['monitoring', 'rapporten'], queryFn: () => monitoringApi.rapporten() });

  const inc = incidenten.data ?? [];
  const openIncidenten = inc.filter(i => !statusIs(i.status, 'Opgelost')).length;

  const ss = sessies.data ?? [];
  const actieveSessies = ss.filter(s => statusIs(s.status, 'Actief')).length;

  return (
    <>
      <PageHeader context="monitoring" titel="Monitoring — sensordata en incidenten" />
      <AlleenLezen context="monitoring" />

      <KpiRij>
        <Kpi label="Open incidenten" waarde={incidenten.data ? openIncidenten : '…'} toon={openIncidenten > 0 ? 'let-op' : 'ok'} />
        <Kpi label="Totaal incidenten" waarde={incidenten.data ? inc.length : '…'} />
        <Kpi label="Actieve sessies" waarde={sessies.data ? actieveSessies : '…'} />
        <Kpi label="Rapporten opgesteld" waarde={rapporten.data ? rapporten.data.length : '…'} />
      </KpiRij>

      <Sectie titel="Recente incidenten">
        <Tabel
          rijen={[...inc].sort((a, b) => b.aangemaaktOp.localeCompare(a.aangemaaktOp)).slice(0, 5)}
          laden={incidenten.isLoading}
          fout={incidenten.error as Error | null}
          leeg="Nog geen incidenten. Die ontstaan zodra een meting een drempelwaarde overschrijdt."
          sleutel={i => i.id}
          kolommen={[
            { kop: 'Kunstwerk', cel: i => i.kunstwerkId, mono: true },
            { kop: 'Sensor', cel: i => i.sensorType },
            { kop: 'Gemeten / drempel', cel: i => `${i.gemetenWaarde} / ${i.drempelwaarde}`, mono: true },
            { kop: 'Ernst', cel: i => <ErnstPil waarde={i.ernst} /> },
            { kop: 'Status', cel: i => <StatusPil waarde={i.status} /> },
            { kop: 'Aangemaakt', cel: i => fmt(i.aangemaaktOp), mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
