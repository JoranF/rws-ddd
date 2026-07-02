import { useCallback } from 'react';
import { api } from '../lib/api';
import { dateOnly, fmt, isoOffsetDays } from '../lib/dates';
import { usePolling, useNewRows } from '../hooks/usePolling';
import { useToast } from '../lib/toast';
import { KUNSTWERK_ID } from '../demo/script';
import { ActionForm, ErnstBadge, LiveList, Panel, StatusBadge } from './ui';

type Row = Record<string, unknown>;
const POLL = 2000;

const str = (o: Row, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (v != null && typeof v !== 'object') return String(v);
  }
  return undefined;
};
const rowKey = (o: Row, ...keys: string[]): string =>
  str(o, ...keys, 'id') ?? JSON.stringify(o);

function Chips({ pairs }: { pairs: Array<[string, string | undefined]> }) {
  return (
    <span className="chips">
      {pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
        <span key={k} className="chip"><em>{k}</em> {v}</span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- BEHEER
export function BeheerPanel() {
  const toast = useToast();
  const kunstwerken = usePolling(() => api.get<Row[]>('/beheer/api/kunstwerken'), POLL);
  const beoordelingen = usePolling(
    () => api.get<Row[]>(`/beheer/api/rapportage-beoordelingen?kunstwerkId=${KUNSTWERK_ID}`), POLL);
  const freshKw = useNewRows(kunstwerken.data, r => rowKey(r, 'kunstwerkId'));
  const freshBo = useNewRows(beoordelingen.data, r => rowKey(r, 'beoordelingId'));

  const wrap = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.push('success', ok); }
    catch (e) { toast.push('error', 'Beheer', (e as Error).message); }
  }, [toast]);

  return (
    <Panel title="Beheer · 8004" accent="#4fa3ff">
      <h3>Kunstwerken</h3>
      <LiveList rows={kunstwerken.data} loading={kunstwerken.loading} error={kunstwerken.error}
        fresh={freshKw} keyOf={r => rowKey(r, 'kunstwerkId')} empty="nog geen kunstwerken"
        render={r => (
          <div className="row">
            <strong>{str(r, 'naam') ?? str(r, 'kunstwerkId')}</strong>
            <StatusBadge value={str(r, 'status', 'toestand')} />
            <Chips pairs={[['id', str(r, 'kunstwerkId')], ['type', str(r, 'type')], ['loc', str(r, 'locatie')]]} />
          </div>
        )} />

      <h3>Rapportage-beoordelingen ({KUNSTWERK_ID})</h3>
      <LiveList rows={beoordelingen.data} loading={beoordelingen.loading} error={beoordelingen.error}
        fresh={freshBo} keyOf={r => rowKey(r, 'beoordelingId')} empty="nog geen beoordelingen"
        render={r => (
          <div className="row">
            <StatusBadge value={str(r, 'rapportageType', 'type')} />
            <StatusBadge value={str(r, 'oordeel', 'status')} />
            <Chips pairs={[['ontvangen', fmt(str(r, 'ontvangenOp', 'aangemaaktOp'))]]} />
          </div>
        )} />

      <h3>Vrij spelen</h3>
      <ActionForm label="Registreer kunstwerk"
        fields={[
          { name: 'kunstwerkId', label: 'ID', value: 'KW-VRIJ-1' },
          { name: 'naam', label: 'Naam', value: 'Sluis B' },
          { name: 'type', label: 'Type', value: 'Sluis' },
          { name: 'locatie', label: 'Locatie', value: 'A2 km 10' },
        ]}
        onSubmit={v => wrap(() => api.post('/beheer/api/kunstwerken', v), 'Kunstwerk geregistreerd')} />
      <ActionForm label="Buiten gebruik stellen"
        fields={[{ name: 'kunstwerkId', label: 'kunstwerkId', value: KUNSTWERK_ID }]}
        onSubmit={v => wrap(() => api.post(`/beheer/api/kunstwerken/${v.kunstwerkId}/buitengebruikstelling`), 'Buiten gebruik gesteld')} />
    </Panel>
  );
}

// ---------------------------------------------------------------- MONITORING
export function MonitoringPanel() {
  const toast = useToast();
  const sessies = usePolling(() => api.get<Row[]>('/monitoring/api/sessies'), POLL);
  const metingen = usePolling(() => api.get<Row[]>(`/monitoring/api/metingen?kunstwerkId=${KUNSTWERK_ID}`), POLL);
  const incidenten = usePolling(() => api.get<Row[]>(`/monitoring/api/incidenten?kunstwerkId=${KUNSTWERK_ID}`), POLL);
  const freshM = useNewRows(metingen.data, r => rowKey(r, 'metingId'));
  const freshI = useNewRows(incidenten.data, r => rowKey(r, 'incidentId'));

  const wrap = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.push('success', ok); }
    catch (e) { toast.push('error', 'Monitoring', (e as Error).message); }
  }, [toast]);

  return (
    <Panel title="Monitoring · 8002" accent="#43d9a3">
      <h3>Sessies</h3>
      <LiveList rows={sessies.data} loading={sessies.loading} error={sessies.error}
        fresh={new Set()} keyOf={r => rowKey(r, 'sessieId')} empty="geen sessies"
        render={r => (
          <div className="row">
            <StatusBadge value={str(r, 'status', 'toestand')} />
            <Chips pairs={[['kw', str(r, 'kunstwerkId')]]} />
          </div>
        )} />

      <h3>Metingen ({KUNSTWERK_ID})</h3>
      <LiveList rows={metingen.data} loading={metingen.loading} error={metingen.error}
        fresh={freshM} keyOf={r => rowKey(r, 'metingId')} empty="geen metingen"
        render={r => (
          <div className="row">
            <strong>{str(r, 'sensorType')}</strong>
            <span className="value">{str(r, 'waarde')}</span>
            <Chips pairs={[['tijd', fmt(str(r, 'tijdstip', 'gemetenOp', 'aangemaaktOp'))]]} />
          </div>
        )} />

      <h3>Incidenten ({KUNSTWERK_ID})</h3>
      <LiveList rows={incidenten.data} loading={incidenten.loading} error={incidenten.error}
        fresh={freshI} keyOf={r => rowKey(r, 'incidentId')} empty="geen incidenten"
        render={r => (
          <div className="row">
            <ErnstBadge value={str(r, 'ernst')} />
            <StatusBadge value={str(r, 'status')} />
            <Chips pairs={[['id', str(r, 'incidentId')], ['sensor', str(r, 'sensorType')]]} />
          </div>
        )} />

      <h3>Vrij spelen</h3>
      <ActionForm label="Meting insturen"
        fields={[
          { name: 'kunstwerkId', label: 'kunstwerkId', value: KUNSTWERK_ID },
          { name: 'sensorType', label: 'Sensor', value: 'Trilling' },
          { name: 'waarde', label: 'Waarde', type: 'number', value: '12' },
        ]}
        onSubmit={v => wrap(() => api.post('/monitoring/api/metingen', {
          kunstwerkId: v.kunstwerkId, sensorType: v.sensorType, waarde: Number(v.waarde),
        }), 'Meting verstuurd')} />
      <ActionForm label="Sessie starten"
        fields={[{ name: 'kunstwerkId', label: 'kunstwerkId', value: KUNSTWERK_ID }]}
        onSubmit={v => wrap(() => api.post('/monitoring/api/sessies', { kunstwerkId: v.kunstwerkId }), 'Sessie gestart')} />
    </Panel>
  );
}

// ---------------------------------------------------------------- ONDERHOUD
export function OnderhoudPanel() {
  const toast = useToast();
  const trajecten = usePolling(() => api.get<Row[]>('/onderhoud/api/onderhoud'), POLL);
  const storingen = usePolling(() => api.get<Row[]>('/onderhoud/api/storingen'), POLL);
  const freshT = useNewRows(trajecten.data, r => rowKey(r, 'onderhoudId', 'trajectId'));
  const freshS = useNewRows(storingen.data, r => rowKey(r, 'storingId'));

  const wrap = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.push('success', ok); }
    catch (e) { toast.push('error', 'Onderhoud', (e as Error).message); }
  }, [toast]);

  return (
    <Panel title="Onderhoud · 8003" accent="#ff9f43">
      <h3>Onderhoudstrajecten <small>(verschijnen vanzelf via event)</small></h3>
      <LiveList rows={trajecten.data} loading={trajecten.loading} error={trajecten.error}
        fresh={freshT} keyOf={r => rowKey(r, 'onderhoudId', 'trajectId')} empty="nog geen trajecten"
        render={r => (
          <div className="row">
            <StatusBadge value={str(r, 'status', 'toestand', 'fase')} />
            <ErnstBadge value={str(r, 'ernst')} />
            <Chips pairs={[['id', str(r, 'onderhoudId', 'trajectId')], ['kw', str(r, 'kunstwerkId')]]} />
          </div>
        )} />

      <h3>Storingen</h3>
      <LiveList rows={storingen.data} loading={storingen.loading} error={storingen.error}
        fresh={freshS} keyOf={r => rowKey(r, 'storingId')} empty="geen storingen"
        render={r => (
          <div className="row">
            <ErnstBadge value={str(r, 'ernst')} />
            <span>{str(r, 'omschrijving')}</span>
            <Chips pairs={[['kw', str(r, 'kunstwerkId')]]} />
          </div>
        )} />

      <h3>Vrij spelen</h3>
      <ActionForm label="Storing melden"
        fields={[
          { name: 'kunstwerkId', label: 'kunstwerkId', value: KUNSTWERK_ID },
          { name: 'omschrijving', label: 'Omschrijving', value: 'Scheur in wegdek' },
          { name: 'ernst', label: 'Ernst', value: 'Hoog' },
        ]}
        onSubmit={v => wrap(() => api.post('/onderhoud/api/storingen', v), 'Storing gemeld')} />
    </Panel>
  );
}

// ---------------------------------------------------------------- CONTRACT
export function ContractPanel() {
  const toast = useToast();
  const aanbestedingen = usePolling(() => api.get<Row[]>('/contract/api/aanbestedingen'), POLL);
  const contracten = usePolling(() => api.get<Row[]>(`/contract/api/contracten?kunstwerkId=${KUNSTWERK_ID}`), POLL);
  const freshA = useNewRows(aanbestedingen.data, r => rowKey(r, 'aanbestedingId'));
  const freshC = useNewRows(contracten.data, r => rowKey(r, 'contractId'));

  const wrap = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.push('success', ok); }
    catch (e) { toast.push('error', 'Contract', (e as Error).message); }
  }, [toast]);

  return (
    <Panel title="Contract · 8001" accent="#c17fff">
      <h3>Aanbestedingen</h3>
      <LiveList rows={aanbestedingen.data} loading={aanbestedingen.loading} error={aanbestedingen.error}
        fresh={freshA} keyOf={r => rowKey(r, 'aanbestedingId')} empty="geen aanbestedingen"
        render={r => (
          <div className="row">
            <StatusBadge value={str(r, 'status')} />
            <Chips pairs={[['id', str(r, 'aanbestedingId')], ['kw', str(r, 'kunstwerkId')], ['sluit', fmt(str(r, 'sluitingsdatum'))]]} />
          </div>
        )} />

      <h3>Contracten ({KUNSTWERK_ID})</h3>
      <LiveList rows={contracten.data} loading={contracten.loading} error={contracten.error}
        fresh={freshC} keyOf={r => rowKey(r, 'contractId')} empty="geen contracten"
        render={r => (
          <div className="row">
            <StatusBadge value={str(r, 'status')} />
            <Chips pairs={[['id', str(r, 'contractId')], ['aannemer', str(r, 'aannemer')]]} />
          </div>
        )} />

      <h3>Vrij spelen</h3>
      <ActionForm label="Aanbesteding starten"
        fields={[
          { name: 'kunstwerkId', label: 'kunstwerkId', value: KUNSTWERK_ID },
          { name: 'prijsgewicht', label: 'Prijsgewicht', type: 'number', value: '60' },
          { name: 'kwaliteitsgewicht', label: 'Kwaliteitsgewicht', type: 'number', value: '40' },
        ]}
        onSubmit={v => wrap(() => api.post('/contract/api/aanbestedingen', {
          kunstwerkId: v.kunstwerkId,
          sluitingsdatum: isoOffsetDays(7),
          prijsgewicht: Number(v.prijsgewicht),
          kwaliteitsgewicht: Number(v.kwaliteitsgewicht),
        }), 'Aanbesteding gestart')} />
      <span className="hint">Gunnen: gebruik de gouden route (stap 6) — datum {dateOnly(0)}.</span>
    </Panel>
  );
}
