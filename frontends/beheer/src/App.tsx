import type { FormEvent, MutableRefObject, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CircleDot,
  Clock3,
  ExternalLink,
  FileText,
  Gauge,
  Hammer,
  Loader2,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';

type ServiceKey = 'contract' | 'monitoring' | 'onderhoud' | 'beheer';
type HealthStatus = 'checking' | 'online' | 'offline';
type StepStatus = 'idle' | 'running' | 'done' | 'error';
type ToastType = 'ok' | 'error' | 'info' | 'warn';
type FlowKey =
  | 'beheer-broadcast'
  | 'monitoring-incident'
  | 'monitoring-report'
  | 'contract-gunning'
  | 'onderhoud-report';

type UnknownRecord = Record<string, unknown>;

interface HealthInfo {
  status: HealthStatus;
  detail: string;
  checkedAt?: string;
}

interface PollState {
  data: UnknownRecord[] | null;
  error: string | null;
  loading: boolean;
  lastUpdated: string | null;
  flashIds: Set<string>;
  refresh: () => Promise<void>;
}

interface Toast {
  id: number;
  title: string;
  detail?: string;
  type: ToastType;
}

interface DemoStep {
  number: number;
  service: string;
  title: string;
  actionLabel: string;
  flow?: FlowKey;
}

class ApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} voor ${path}`);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const DEMO_KUNSTWERK_ID = 'KW-DEMO-1';
const UNKNOWN_KUNSTWERK_ID = 'KW-BESTAAT-NIET';

const SERVICE_CONFIG: Record<
  ServiceKey,
  { label: string; healthPath: string; className: string }
> = {
  contract: { label: 'Contract', healthPath: '/contract/health', className: 'contract' },
  monitoring: { label: 'Monitoring', healthPath: '/monitoring/health', className: 'monitoring' },
  onderhoud: { label: 'Onderhoud', healthPath: '/onderhoud/health', className: 'onderhoud' },
  beheer: { label: 'Beheer', healthPath: '/beheer/health', className: 'beheer' },
};

const ENTITY_ID_KEYS = [
  'id',
  'kunstwerkId',
  'kunstwerk_id',
  'beoordelingId',
  'eisenpakketId',
  'sessieId',
  'metingId',
  'incidentId',
  'rapportId',
  'onderhoudId',
  'trajectId',
  'storingId',
  'diagnoseId',
  'aanbestedingId',
  'inschrijvingId',
  'contractId',
  'prestatieverklaringId',
];

const POLL_KEYS = {
  kunstwerken: ['kunstwerkId'],
  beoordelingen: ['beoordelingId', 'externRapportId'],
  sessies: ['sessieId', 'id'],
  metingen: ['metingId', 'id'],
  incidenten: ['incidentId', 'id'],
  rapporten: ['rapportId', 'id'],
  onderhoud: ['onderhoudId', 'trajectId', 'id'],
  storingen: ['storingId', 'id'],
  aanbestedingen: ['aanbestedingId', 'id'],
  contracten: ['contractId', 'id'],
};

const STEPS: DemoStep[] = [
  {
    number: 1,
    service: 'Beheer',
    title: 'Kunstwerk registreren',
    actionLabel: 'Registreer',
    flow: 'beheer-broadcast',
  },
  {
    number: 2,
    service: 'Beheer',
    title: 'Onderhouds- en ontwerpeisen vaststellen',
    actionLabel: 'Stel eisen vast',
    flow: 'beheer-broadcast',
  },
  {
    number: 3,
    service: 'Monitoring',
    title: 'Sessie starten na kunstwerk-event',
    actionLabel: 'Start sessie',
  },
  {
    number: 4,
    service: 'Monitoring',
    title: 'Normale en kritieke meting versturen',
    actionLabel: 'Verstuur metingen',
    flow: 'monitoring-incident',
  },
  {
    number: 5,
    service: 'Onderhoud',
    title: 'Automatisch gepland traject zichtbaar',
    actionLabel: 'Wacht op traject',
    flow: 'monitoring-incident',
  },
  {
    number: 6,
    service: 'Contract',
    title: 'Aanbesteden, inschrijven en gunnen',
    actionLabel: 'Gun contract',
    flow: 'contract-gunning',
  },
  {
    number: 7,
    service: 'Monitoring',
    title: 'Rapport maken en bij Beheer zien',
    actionLabel: 'Maak rapport',
    flow: 'monitoring-report',
  },
  {
    number: 8,
    service: 'Contract',
    title: 'Prestatieverklaring zonder score',
    actionLabel: 'Verklaar prestatie',
  },
  {
    number: 9,
    service: 'Onderhoud',
    title: 'Traject uitvoeren en afronden',
    actionLabel: 'Rond traject af',
    flow: 'onderhoud-report',
  },
  {
    number: 10,
    service: 'Monitoring',
    title: 'Incident oplossen',
    actionLabel: 'Los incident op',
  },
  {
    number: 11,
    service: 'Finale',
    title: 'Strenge validatie met onbekend kunstwerk',
    actionLabel: 'Toon domeinfout',
  },
];

const initialStepState = Object.fromEntries(
  STEPS.map((step) => [step.number, { status: 'idle' as StepStatus, message: '' }]),
) as Record<number, { status: StepStatus; message: string }>;

function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stepStates, setStepStates] = useState(initialStepState);
  const [activeFlow, setActiveFlow] = useState<FlowKey | null>(null);
  const toastId = useRef(0);
  const demoRefs = useRef<{
    aanbestedingId?: string;
    contractId?: string;
    incidentId?: string;
    onderhoudId?: string;
  }>({});

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = toastId.current + 1;
    toastId.current = id;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.type === 'error' ? 9000 : 6200);
  }, []);

  const health = useHealth();
  const kunstwerken = usePolling('/beheer/api/kunstwerken', POLL_KEYS.kunstwerken);
  const beoordelingen = usePolling(
    `/beheer/api/rapportage-beoordelingen?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
    POLL_KEYS.beoordelingen,
  );
  const sessies = usePolling('/monitoring/api/sessies', POLL_KEYS.sessies);
  const metingen = usePolling(
    `/monitoring/api/metingen?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
    POLL_KEYS.metingen,
  );
  const incidenten = usePolling(
    `/monitoring/api/incidenten?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
    POLL_KEYS.incidenten,
  );
  const rapporten = usePolling(
    `/monitoring/api/rapporten?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
    POLL_KEYS.rapporten,
  );
  const onderhoud = usePolling('/onderhoud/api/onderhoud', POLL_KEYS.onderhoud);
  const storingen = usePolling('/onderhoud/api/storingen', POLL_KEYS.storingen);
  const aanbestedingen = usePolling('/contract/api/aanbestedingen', POLL_KEYS.aanbestedingen);
  const contracten = usePolling(
    `/contract/api/contracten?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
    POLL_KEYS.contracten,
  );

  const allPolls = useMemo(
    () => [
      kunstwerken,
      beoordelingen,
      sessies,
      metingen,
      incidenten,
      rapporten,
      onderhoud,
      storingen,
      aanbestedingen,
      contracten,
    ],
    [
      kunstwerken,
      beoordelingen,
      sessies,
      metingen,
      incidenten,
      rapporten,
      onderhoud,
      storingen,
      aanbestedingen,
      contracten,
    ],
  );

  const refreshAll = useCallback(async () => {
    await Promise.allSettled(allPolls.map((poll) => poll.refresh()));
  }, [allPolls]);

  const runStep = useCallback(
    async (stepNumber: number) => {
      const step = STEPS.find((item) => item.number === stepNumber);
      if (!step) {
        return;
      }

      setStepStates((current) => ({
        ...current,
        [stepNumber]: { status: 'running', message: 'Bezig met echte API-calls...' },
      }));
      setActiveFlow(step.flow ?? null);

      try {
        const message = await executeDemoStep(stepNumber, demoRefs, addToast);
        await refreshAll();
        setStepStates((current) => ({
          ...current,
          [stepNumber]: { status: 'done', message },
        }));
        addToast({ type: 'ok', title: `Stap ${stepNumber} afgerond`, detail: message });
      } catch (error) {
        const detail = formatError(error);
        setStepStates((current) => ({
          ...current,
          [stepNumber]: { status: 'error', message: detail },
        }));
        addToast({ type: 'error', title: `Stap ${stepNumber} mislukt`, detail });
      } finally {
        setActiveFlow(null);
      }
    },
    [addToast, refreshAll],
  );

  const submitBeheerKunstwerk = useCallback(
    async (payload: UnknownRecord) => {
      await runApiAction(
        () => requestJson('/beheer/api/kunstwerken', { method: 'POST', body: payload }),
        'Kunstwerk geregistreerd',
        addToast,
        kunstwerken.refresh,
      );
    },
    [addToast, kunstwerken.refresh],
  );

  const submitMonitoringMeting = useCallback(
    async (payload: UnknownRecord) => {
      await runApiAction(
        () => requestJson('/monitoring/api/metingen', { method: 'POST', body: payload }),
        'Meting verstuurd',
        addToast,
        metingen.refresh,
      );
    },
    [addToast, metingen.refresh],
  );

  const submitMonitoringSessie = useCallback(
    async (payload: UnknownRecord) => {
      await runApiAction(
        () => requestJson('/monitoring/api/sessies', { method: 'POST', body: payload }),
        'Sessie gestart',
        addToast,
        sessies.refresh,
      );
    },
    [addToast, sessies.refresh],
  );

  const submitStoring = useCallback(
    async (payload: UnknownRecord) => {
      await runApiAction(
        () => requestJson('/onderhoud/api/storingen', { method: 'POST', body: payload }),
        'Storing gemeld',
        addToast,
        storingen.refresh,
      );
    },
    [addToast, storingen.refresh],
  );

  const submitAanbesteding = useCallback(
    async (payload: UnknownRecord) => {
      await runApiAction(
        () => requestJson('/contract/api/aanbestedingen', { method: 'POST', body: payload }),
        'Aanbesteding aangemaakt',
        addToast,
        aanbestedingen.refresh,
      );
    },
    [addToast, aanbestedingen.refresh],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="rws-mark">RWS</span>
          <div>
            <p className="eyebrow">DDD live demo</p>
            <h1>RWS-DDD Regiekamer</h1>
          </div>
        </div>

        <div className="health-strip" aria-label="Service health">
          {(Object.keys(SERVICE_CONFIG) as ServiceKey[]).map((service) => (
            <HealthBadge key={service} service={service} health={health[service]} />
          ))}
        </div>

        <a
          className="rabbit-link"
          href="http://localhost:15672"
          target="_blank"
          rel="noreferrer"
          title="RabbitMQ management UI"
        >
          <RadioTower size={17} />
          RabbitMQ
          <ExternalLink size={14} />
        </a>
      </header>

      <main className="dashboard-grid">
        <section className="script-panel" aria-labelledby="script-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Gouden route</p>
              <h2 id="script-title">Demo-script</h2>
            </div>
            <span className="demo-kunstwerk">{DEMO_KUNSTWERK_ID}</span>
          </div>
          <div className="step-list">
            {STEPS.map((step, index) => {
              const state = stepStates[step.number];
              const previousDone = index === 0 || stepStates[step.number - 1]?.status === 'done';
              const disabled = state.status === 'running' || !previousDone;
              return (
                <button
                  key={step.number}
                  className={`step-button ${state.status}`}
                  type="button"
                  onClick={() => void runStep(step.number)}
                  disabled={disabled}
                >
                  <span className="step-number">{step.number}</span>
                  <span className="step-copy">
                    <span className="step-service">{step.service}</span>
                    <strong>{step.title}</strong>
                    {state.message ? <small>{state.message}</small> : null}
                  </span>
                  <span className="step-action">
                    {state.status === 'running' ? (
                      <Loader2 className="spin" size={17} />
                    ) : state.status === 'done' ? (
                      <Check size={18} />
                    ) : state.status === 'error' ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                    <span>{state.status === 'idle' ? step.actionLabel : stateLabel(state.status)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="map-panel" aria-labelledby="map-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Published language</p>
              <h2 id="map-title">Context-map</h2>
            </div>
            <Activity size={22} />
          </div>
          <ContextMap activeFlow={activeFlow} />
        </section>

        <ContextPanel
          service="beheer"
          icon={<ShieldCheck size={20} />}
          title="Beheer"
          subtitle="Kunstwerken, eisen en rapportagebeoordelingen"
          actions={<BeheerActions onSubmit={submitBeheerKunstwerk} />}
        >
          <LiveList title="Kunstwerken" endpoint="/beheer/api/kunstwerken" state={kunstwerken} />
          <LiveList
            title="Rapportagebeoordelingen"
            endpoint="/beheer/api/rapportage-beoordelingen"
            state={beoordelingen}
          />
        </ContextPanel>

        <ContextPanel
          service="monitoring"
          icon={<Gauge size={20} />}
          title="Monitoring"
          subtitle="Sessies, metingen, incidenten en rapporten"
          actions={
            <MonitoringActions
              onMeting={submitMonitoringMeting}
              onSessie={submitMonitoringSessie}
            />
          }
        >
          <LiveList title="Sessies" endpoint="/monitoring/api/sessies" state={sessies} />
          <LiveList title="Incidenten" endpoint="/monitoring/api/incidenten" state={incidenten} />
          <LiveList title="Metingen" endpoint="/monitoring/api/metingen" state={metingen} />
          <LiveList title="Rapporten" endpoint="/monitoring/api/rapporten" state={rapporten} />
        </ContextPanel>

        <ContextPanel
          service="onderhoud"
          icon={<Hammer size={20} />}
          title="Onderhoud"
          subtitle="Storingen en onderhoudstrajecten"
          actions={<OnderhoudActions onSubmit={submitStoring} />}
        >
          <LiveList title="Onderhoudstrajecten" endpoint="/onderhoud/api/onderhoud" state={onderhoud} />
          <LiveList title="Storingen" endpoint="/onderhoud/api/storingen" state={storingen} />
        </ContextPanel>

        <ContextPanel
          service="contract"
          icon={<FileText size={20} />}
          title="Contract"
          subtitle="Aanbestedingen, contracten en prestatieverklaringen"
          actions={<ContractActions onSubmit={submitAanbesteding} />}
        >
          <LiveList
            title="Aanbestedingen"
            endpoint="/contract/api/aanbestedingen"
            state={aanbestedingen}
          />
          <LiveList title="Contracten" endpoint="/contract/api/contracten" state={contracten} />
        </ContextPanel>
      </main>

      <ToastStack toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    </div>
  );
}

function useHealth() {
  const [health, setHealth] = useState<Record<ServiceKey, HealthInfo>>(() => ({
    contract: { status: 'checking', detail: 'Nog niet gecontroleerd' },
    monitoring: { status: 'checking', detail: 'Nog niet gecontroleerd' },
    onderhoud: { status: 'checking', detail: 'Nog niet gecontroleerd' },
    beheer: { status: 'checking', detail: 'Nog niet gecontroleerd' },
  }));

  useEffect(() => {
    let alive = true;

    async function checkService(service: ServiceKey) {
      const config = SERVICE_CONFIG[service];
      try {
        const response = await fetch(config.healthPath, { cache: 'no-store' });
        const payload = await parseResponse(response);
        if (!alive) {
          return;
        }
        setHealth((current) => ({
          ...current,
          [service]: {
            status: response.ok ? 'online' : 'offline',
            detail: response.ok ? '200 OK' : `HTTP ${response.status}: ${formatValue(payload)}`,
            checkedAt: new Date().toISOString(),
          },
        }));
      } catch (error) {
        if (!alive) {
          return;
        }
        setHealth((current) => ({
          ...current,
          [service]: {
            status: 'offline',
            detail: error instanceof Error ? error.message : 'Niet bereikbaar',
            checkedAt: new Date().toISOString(),
          },
        }));
      }
    }

    function checkAll() {
      (Object.keys(SERVICE_CONFIG) as ServiceKey[]).forEach((service) => {
        void checkService(service);
      });
    }

    checkAll();
    const interval = window.setInterval(checkAll, 5000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  return health;
}

function usePolling(path: string, idKeys: string[], intervalMs = 2000): PollState {
  const [data, setData] = useState<UnknownRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const previousIds = useRef<Set<string> | null>(null);
  const idKeySignature = idKeys.join('|');

  const refresh = useCallback(async () => {
    try {
      const value = await requestJson(path);
      const rows = toRows(value);
      const currentIds = new Set(
        rows.map((row) => entityId(row, idKeys)).filter((id): id is string => Boolean(id)),
      );

      if (previousIds.current) {
        const newIds = [...currentIds].filter((id) => !previousIds.current?.has(id));
        if (newIds.length > 0) {
          setFlashIds((current) => new Set([...current, ...newIds]));
          window.setTimeout(() => {
            setFlashIds((current) => {
              const next = new Set(current);
              newIds.forEach((id) => next.delete(id));
              return next;
            });
          }, 1900);
        }
      }

      previousIds.current = currentIds;
      setData(rows);
      setError(null);
      setLastUpdated(new Date().toISOString());
    } catch (pollError) {
      setData(null);
      setError(formatError(pollError));
    } finally {
      setLoading(false);
    }
  }, [path, idKeySignature]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [refresh, intervalMs]);

  return { data, error, loading, lastUpdated, flashIds, refresh };
}

function HealthBadge({ service, health }: { service: ServiceKey; health: HealthInfo }) {
  const config = SERVICE_CONFIG[service];
  const Icon = health.status === 'online' ? Check : health.status === 'offline' ? AlertTriangle : Clock3;
  return (
    <span className={`health-badge ${config.className} ${health.status}`} title={health.detail}>
      <Icon size={16} />
      <span>{config.label}</span>
      <strong>{health.status === 'online' ? 'groen' : health.status === 'offline' ? 'rood' : 'check'}</strong>
    </span>
  );
}

function ContextPanel({
  service,
  icon,
  title,
  subtitle,
  actions,
  children,
}: {
  service: ServiceKey;
  icon: ReactNode;
  title: string;
  subtitle: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`context-panel ${SERVICE_CONFIG[service].className}`}>
      <div className="context-heading">
        <span className="context-icon">{icon}</span>
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="action-surface">{actions}</div>
      <div className="live-list-grid">{children}</div>
    </section>
  );
}

function LiveList({ title, endpoint, state }: { title: string; endpoint: string; state: PollState }) {
  const count = state.data?.length ?? 0;

  return (
    <section className={`live-list ${state.error ? 'has-error' : ''}`}>
      <div className="live-list-heading">
        <div>
          <h3>{title}</h3>
          <code>{endpoint}</code>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void state.refresh()}
          title="Ververs lijst"
        >
          {state.loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
        </button>
      </div>

      <div className="list-status">
        {state.error ? (
          <span className="status-pill error">
            <AlertTriangle size={14} />
            Fout
          </span>
        ) : (
          <span className="status-pill ok">
            <CircleDot size={13} />
            {count} item{count === 1 ? '' : 's'}
          </span>
        )}
        {state.lastUpdated ? <time>{formatTime(state.lastUpdated)}</time> : null}
      </div>

      {state.error ? (
        <pre className="error-box">{state.error}</pre>
      ) : (
        <div className="rows">
          {state.data?.length ? (
            state.data.map((row, index) => {
              const id = entityId(row) ?? `${title}-${index}`;
              return (
                <article
                  className={`data-row ${state.flashIds.has(id) ? 'flash' : ''}`}
                  key={`${id}-${index}`}
                >
                  <RowSummary row={row} />
                </article>
              );
            })
          ) : (
            <div className="empty-state">Geen records uit deze service.</div>
          )}
        </div>
      )}
    </section>
  );
}

function RowSummary({ row }: { row: UnknownRecord }) {
  const entries = Object.entries(row).filter(([, value]) => value !== null && value !== undefined);
  const primary = pickPrimary(row);
  const visibleEntries = entries.filter(([key]) => key !== primary?.[0]).slice(0, 8);

  return (
    <>
      {primary ? (
        <div className="row-primary">
          <span>{primary[0]}</span>
          <strong>{formatValue(primary[1])}</strong>
        </div>
      ) : null}
      <dl className="field-grid">
        {visibleEntries.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd className={severityClass(value)}>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function BeheerActions({ onSubmit }: { onSubmit: (payload: UnknownRecord) => Promise<void> }) {
  const [form, setForm] = useState({
    kunstwerkId: DEMO_KUNSTWERK_ID,
    naam: 'Brug A12',
    type: 'Brug',
    locatie: 'A12 km 4',
    beheerder: 'Rijkswaterstaat',
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(removeEmpty(form));
  }

  return (
    <form className="action-form" onSubmit={submit}>
      <TextInput label="KunstwerkId" value={form.kunstwerkId} onChange={(value) => setForm({ ...form, kunstwerkId: value })} />
      <TextInput label="Naam" value={form.naam} onChange={(value) => setForm({ ...form, naam: value })} />
      <label>
        <span>Type</span>
        <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
          <option>Brug</option>
          <option>Sluis</option>
          <option>Tunnel</option>
          <option>Snelweg</option>
          <option>Dijk</option>
          <option>Gemaal</option>
          <option>Stormvloedkering</option>
        </select>
      </label>
      <TextInput label="Locatie" value={form.locatie} onChange={(value) => setForm({ ...form, locatie: value })} />
      <TextInput label="Beheerder" value={form.beheerder} onChange={(value) => setForm({ ...form, beheerder: value })} />
      <button className="primary-action" type="submit">
        <Plus size={17} />
        Registreer
      </button>
    </form>
  );
}

function MonitoringActions({
  onMeting,
  onSessie,
}: {
  onMeting: (payload: UnknownRecord) => Promise<void>;
  onSessie: (payload: UnknownRecord) => Promise<void>;
}) {
  const [form, setForm] = useState({
    kunstwerkId: DEMO_KUNSTWERK_ID,
    sensorType: 'Trilling',
    waarde: '12',
  });

  function meting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onMeting({
      kunstwerkId: form.kunstwerkId,
      sensorType: form.sensorType,
      waarde: Number(form.waarde),
    });
  }

  return (
    <form className="action-form" onSubmit={meting}>
      <TextInput label="KunstwerkId" value={form.kunstwerkId} onChange={(value) => setForm({ ...form, kunstwerkId: value })} />
      <label>
        <span>Sensor</span>
        <select value={form.sensorType} onChange={(event) => setForm({ ...form, sensorType: event.target.value })}>
          <option>Trilling</option>
          <option>Belasting</option>
          <option>Temperatuur</option>
          <option>Slijtage</option>
        </select>
      </label>
      <TextInput label="Waarde" type="number" value={form.waarde} onChange={(value) => setForm({ ...form, waarde: value })} />
      <button className="primary-action" type="button" onClick={() => void onSessie({ kunstwerkId: form.kunstwerkId })}>
        <Play size={17} />
        Start sessie
      </button>
      <button className="secondary-action" type="submit">
        <Send size={17} />
        Verstuur meting
      </button>
    </form>
  );
}

function OnderhoudActions({ onSubmit }: { onSubmit: (payload: UnknownRecord) => Promise<void> }) {
  const [form, setForm] = useState({
    kunstwerkId: DEMO_KUNSTWERK_ID,
    omschrijving: 'Trilling boven norm',
    ernst: 'Hoog',
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(removeEmpty(form));
  }

  return (
    <form className="action-form" onSubmit={submit}>
      <TextInput label="KunstwerkId" value={form.kunstwerkId} onChange={(value) => setForm({ ...form, kunstwerkId: value })} />
      <TextInput label="Omschrijving" value={form.omschrijving} onChange={(value) => setForm({ ...form, omschrijving: value })} />
      <label>
        <span>Ernst</span>
        <select value={form.ernst} onChange={(event) => setForm({ ...form, ernst: event.target.value })}>
          <option>Laag</option>
          <option>Middel</option>
          <option>Hoog</option>
          <option>Kritiek</option>
        </select>
      </label>
      <button className="primary-action" type="submit">
        <Plus size={17} />
        Meld storing
      </button>
    </form>
  );
}

function ContractActions({ onSubmit }: { onSubmit: (payload: UnknownRecord) => Promise<void> }) {
  const [form, setForm] = useState({
    kunstwerkId: DEMO_KUNSTWERK_ID,
    sluitingsdatum: addDaysIso(7),
    prijsgewicht: '60',
    kwaliteitsgewicht: '40',
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit({
      kunstwerkId: form.kunstwerkId,
      sluitingsdatum: form.sluitingsdatum,
      prijsgewicht: Number(form.prijsgewicht),
      kwaliteitsgewicht: Number(form.kwaliteitsgewicht),
    });
  }

  return (
    <form className="action-form" onSubmit={submit}>
      <TextInput label="KunstwerkId" value={form.kunstwerkId} onChange={(value) => setForm({ ...form, kunstwerkId: value })} />
      <TextInput label="Sluiting ISO" value={form.sluitingsdatum} onChange={(value) => setForm({ ...form, sluitingsdatum: value })} />
      <TextInput label="Prijsgewicht" type="number" value={form.prijsgewicht} onChange={(value) => setForm({ ...form, prijsgewicht: value })} />
      <TextInput label="Kwaliteit" type="number" value={form.kwaliteitsgewicht} onChange={(value) => setForm({ ...form, kwaliteitsgewicht: value })} />
      <button className="primary-action" type="submit">
        <Plus size={17} />
        Maak aanbesteding
      </button>
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ContextMap({ activeFlow }: { activeFlow: FlowKey | null }) {
  const isActive = (flow: FlowKey) => (activeFlow === flow ? 'active' : '');

  return (
    <div className="context-map">
      <svg viewBox="0 0 620 360" role="img" aria-label="DDD context-map">
        <defs>
          <marker id="arrow" markerHeight="8" markerWidth="8" orient="auto" refX="8" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" />
          </marker>
        </defs>
        <line className={`flow-line ${isActive('beheer-broadcast')}`} x1="155" y1="95" x2="465" y2="95" />
        <line className={`flow-line ${isActive('beheer-broadcast')}`} x1="145" y1="125" x2="165" y2="250" />
        <line className={`flow-line ${isActive('beheer-broadcast')}`} x1="160" y1="125" x2="455" y2="248" />
        <line className={`flow-line ${isActive('monitoring-incident')}`} x1="175" y1="265" x2="455" y2="265" />
        <line className={`flow-line ${isActive('monitoring-report')}`} x1="155" y1="246" x2="140" y2="125" />
        <line className={`flow-line ${isActive('monitoring-report')}`} x1="170" y1="244" x2="460" y2="118" />
        <line className={`flow-line ${isActive('contract-gunning')}`} x1="490" y1="125" x2="490" y2="238" />
        <line className={`flow-line ${isActive('onderhoud-report')}`} x1="455" y1="250" x2="160" y2="126" />
      </svg>
      <MapNode className="beheer" title="Beheer" detail="kunstwerk / eisen" />
      <MapNode className="contract" title="Contract" detail="gegund" />
      <MapNode className="monitoring" title="Monitoring" detail="incident / rapport" />
      <MapNode className="onderhoud" title="Onderhoud" detail="onderhoudsrapport" />
    </div>
  );
}

function MapNode({ className, title, detail }: { className: string; title: string; detail: string }) {
  return (
    <div className={`map-node ${className}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article className={`toast ${toast.type}`} key={toast.id}>
          <div>
            <strong>{toast.title}</strong>
            {toast.detail ? <pre>{toast.detail}</pre> : null}
          </div>
          <button type="button" onClick={() => onClose(toast.id)} title="Sluit melding">
            <X size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

async function executeDemoStep(
  stepNumber: number,
  refs: MutableRefObject<{
    aanbestedingId?: string;
    contractId?: string;
    incidentId?: string;
    onderhoudId?: string;
  }>,
  addToast: (toast: Omit<Toast, 'id'>) => void,
) {
  switch (stepNumber) {
    case 1: {
      try {
        await requestJson('/beheer/api/kunstwerken', {
          method: 'POST',
          body: {
            kunstwerkId: DEMO_KUNSTWERK_ID,
            naam: 'Brug A12',
            type: 'Brug',
            locatie: 'A12 km 4',
          },
        });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) {
          throw error;
        }
      }
      await waitForRow('/beheer/api/kunstwerken', (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID));
      return 'Kunstwerk is zichtbaar in Beheer.';
    }

    case 2: {
      await requestJson(`/beheer/api/kunstwerken/${encodeURIComponent(DEMO_KUNSTWERK_ID)}/onderhoudseisen`, {
        method: 'POST',
        body: {
          eisen: [
            {
              code: 'SPOOR',
              omschrijving: 'Spoorvorming maximaal',
              meetwaarde: 'spoorvorming',
              operator: '<=',
              grenswaarde: 8,
              eenheid: 'mm',
            },
          ],
        },
      });
      await requestJson(`/beheer/api/kunstwerken/${encodeURIComponent(DEMO_KUNSTWERK_ID)}/ontwerpeisen`, {
        method: 'POST',
        body: {
          eisen: [
            {
              code: 'TRIL',
              omschrijving: 'Trillingsnorm',
              meetwaarde: 'trilling',
              operator: '<=',
              grenswaarde: 5,
              eenheid: 'mm/s',
            },
          ],
        },
      });
      await waitForRows(
        `/beheer/api/kunstwerken/${encodeURIComponent(DEMO_KUNSTWERK_ID)}/eisen`,
        (rows) => rows.length >= 2,
      );
      return 'Onderhoudseisen en ontwerpeisen zijn zichtbaar.';
    }

    case 3: {
      await retryJson('/monitoring/api/sessies', {
        method: 'POST',
        body: { kunstwerkId: DEMO_KUNSTWERK_ID },
      });
      await waitForRow('/monitoring/api/sessies', (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID));
      return 'Monitoring kent het kunstwerk en heeft een sessie gestart.';
    }

    case 4: {
      await requestJson('/monitoring/api/metingen', {
        method: 'POST',
        body: { kunstwerkId: DEMO_KUNSTWERK_ID, sensorType: 'Trilling', waarde: 3 },
      });
      await requestJson('/monitoring/api/metingen', {
        method: 'POST',
        body: { kunstwerkId: DEMO_KUNSTWERK_ID, sensorType: 'Trilling', waarde: 12 },
      });
      const incident = await waitForRow(
        `/monitoring/api/incidenten?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
        (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID),
      );
      refs.current.incidentId = entityId(incident, ['incidentId', 'id']) ?? refs.current.incidentId;
      return 'Kritieke meting heeft een incident opgeleverd.';
    }

    case 5: {
      const traject = await waitForRow('/onderhoud/api/onderhoud', (row) =>
        matchesKunstwerk(row, DEMO_KUNSTWERK_ID),
      );
      refs.current.onderhoudId = entityId(traject, ['onderhoudId', 'trajectId', 'id']) ?? refs.current.onderhoudId;
      return 'Onderhoudstraject verscheen via event.';
    }

    case 6: {
      const aanbesteding = await requestJson<UnknownRecord>('/contract/api/aanbestedingen', {
        method: 'POST',
        body: {
          kunstwerkId: DEMO_KUNSTWERK_ID,
          sluitingsdatum: addDaysIso(7),
          prijsgewicht: 60,
          kwaliteitsgewicht: 40,
        },
      });
      let aanbestedingId =
        entityId(aanbesteding, ['aanbestedingId', 'id']) ?? refs.current.aanbestedingId;

      if (!aanbestedingId) {
        const visible = await waitForRow('/contract/api/aanbestedingen', (row) =>
          matchesKunstwerk(row, DEMO_KUNSTWERK_ID),
        );
        aanbestedingId = entityId(visible, ['aanbestedingId', 'id']);
      }

      if (!aanbestedingId) {
        throw new Error('Aanbesteding is aangemaakt maar er kwam geen id terug.');
      }

      refs.current.aanbestedingId = aanbestedingId;
      await requestJson(`/contract/api/aanbestedingen/${encodeURIComponent(aanbestedingId)}/inschrijvingen`, {
        method: 'POST',
        body: { aannemer: 'BAM Infra', prijs: 120000, kwaliteitsscore: 8 },
      });
      await requestJson(`/contract/api/aanbestedingen/${encodeURIComponent(aanbestedingId)}/inschrijvingen`, {
        method: 'POST',
        body: { aannemer: 'Heijmans Infra', prijs: 132000, kwaliteitsscore: 9 },
      });
      const gunning = await requestJson<UnknownRecord>(
        `/contract/api/aanbestedingen/${encodeURIComponent(aanbestedingId)}/gunning`,
        {
          method: 'POST',
          body: {
            looptijdStart: dateOnly(0),
            looptijdEind: dateOnly(365),
          },
        },
      );

      refs.current.contractId =
        entityId(gunning, ['contractId', 'id']) ?? refs.current.contractId;

      if (!refs.current.contractId) {
        const contract = await waitForRow(
          `/contract/api/contracten?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
          (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID),
        );
        refs.current.contractId = entityId(contract, ['contractId', 'id']);
      }

      return 'Contract is gegund op basis van EMVI.';
    }

    case 7: {
      await requestJson('/monitoring/api/rapporten', {
        method: 'POST',
        body: {
          kunstwerkId: DEMO_KUNSTWERK_ID,
          periodeStart: addDaysIso(-7),
          periodeEind: new Date().toISOString(),
        },
      });
      await waitForRow(
        `/beheer/api/rapportage-beoordelingen?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
        (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID) && rowText(row).includes('Netwerkrapportage'),
      );
      return 'Monitoringrapport is bij Beheer beoordeeld.';
    }

    case 8: {
      const contractId = refs.current.contractId ?? (await findContractId(DEMO_KUNSTWERK_ID));
      if (!contractId) {
        throw new Error('Geen contractId beschikbaar voor de prestatieverklaring.');
      }
      refs.current.contractId = contractId;
      await requestJson(`/contract/api/contracten/${encodeURIComponent(contractId)}/prestatieverklaringen`, {
        method: 'POST',
        body: {
          periodeStart: dateOnly(0),
          periodeEind: dateOnly(30),
          bedrag: 25000,
        },
      });
      return 'Prestatieverklaring is zonder handmatige score verstuurd.';
    }

    case 9: {
      const onderhoudId = refs.current.onderhoudId ?? (await findOnderhoudId(DEMO_KUNSTWERK_ID));
      if (!onderhoudId) {
        throw new Error('Geen onderhoudstraject beschikbaar om uit te voeren.');
      }
      refs.current.onderhoudId = onderhoudId;
      await requestJson(`/onderhoud/api/onderhoud/${encodeURIComponent(onderhoudId)}/start`, {
        method: 'POST',
        body: { datum: new Date().toISOString() },
      });
      await requestJson(`/onderhoud/api/onderhoud/${encodeURIComponent(onderhoudId)}/inspecties`, {
        method: 'POST',
        body: { datum: new Date().toISOString(), oordeel: 'Goedgekeurd' },
      });
      await requestJson(`/onderhoud/api/onderhoud/${encodeURIComponent(onderhoudId)}/afronden`, {
        method: 'POST',
        body: {
          resultaat: 'Lagers vervangen, trillingsniveau genormaliseerd',
          datum: new Date().toISOString(),
        },
      });
      await waitForRow(
        `/beheer/api/rapportage-beoordelingen?kunstwerkId=${encodeURIComponent(DEMO_KUNSTWERK_ID)}`,
        (row) => matchesKunstwerk(row, DEMO_KUNSTWERK_ID) && rowText(row).includes('Onderhoudsrapport'),
      );
      return 'Onderhoudsrapport is terug bij Beheer.';
    }

    case 10: {
      const incidentId = refs.current.incidentId ?? (await findIncidentId(DEMO_KUNSTWERK_ID));
      if (!incidentId) {
        throw new Error('Geen incidentId beschikbaar om op te lossen.');
      }
      refs.current.incidentId = incidentId;
      await requestJson(`/monitoring/api/incidenten/${encodeURIComponent(incidentId)}/oplossing`, {
        method: 'POST',
      });
      return 'Incident is opgelost.';
    }

    case 11: {
      try {
        const aanbesteding = await requestJson<UnknownRecord>('/contract/api/aanbestedingen', {
          method: 'POST',
          body: {
            kunstwerkId: UNKNOWN_KUNSTWERK_ID,
            sluitingsdatum: addDaysIso(7),
            prijsgewicht: 60,
            kwaliteitsgewicht: 40,
          },
        });
        const aanbestedingId = entityId(aanbesteding, ['aanbestedingId', 'id']);
        if (!aanbestedingId) {
          throw new Error('Geen aanbestedingId ontvangen voor de validatie-finale.');
        }
        await requestJson(`/contract/api/aanbestedingen/${encodeURIComponent(aanbestedingId)}/inschrijvingen`, {
          method: 'POST',
          body: { aannemer: 'BAM Infra', prijs: 120000, kwaliteitsscore: 8 },
        });
        await requestJson(`/contract/api/aanbestedingen/${encodeURIComponent(aanbestedingId)}/gunning`, {
          method: 'POST',
          body: { looptijdStart: dateOnly(0), looptijdEind: dateOnly(365) },
        });
        throw new Error('De gunning voor een onbekend kunstwerk werd niet geweigerd.');
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          addToast({
            type: 'warn',
            title: 'Streng: alleen bekende kunstwerken',
            detail: formatError(error),
          });
          return 'Domeinfout zichtbaar: onbekend kunstwerk wordt geweigerd.';
        }
        throw error;
      }
    }

    default:
      throw new Error(`Onbekende demo-stap: ${stepNumber}`);
  }
}

async function runApiAction(
  action: () => Promise<unknown>,
  successTitle: string,
  addToast: (toast: Omit<Toast, 'id'>) => void,
  refresh: () => Promise<void>,
) {
  try {
    const response = await action();
    addToast({ type: 'ok', title: successTitle, detail: formatValue(response) });
  } catch (error) {
    addToast({ type: 'error', title: 'API-call mislukt', detail: formatError(error) });
  } finally {
    await refresh().catch(() => undefined);
  }
}

async function requestJson<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body: requestBody, headers: inputHeaders, ...fetchOptions } = options;
  const headers = new Headers(inputHeaders);
  headers.set('Accept', 'application/json');

  let body: BodyInit | undefined;
  if (requestBody !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(requestBody);
  }

  const response = await fetch(path, {
    ...fetchOptions,
    headers,
    body,
    cache: 'no-store',
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(path, response.status, payload);
  }

  return payload as T;
}

async function retryJson(path: string, options: RequestOptions, timeoutMs = 22000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestJson(path, options);
    } catch (error) {
      lastError = error;
      await sleep(1200);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry timeout zonder foutdetails.');
}

async function parseResponse(response: Response) {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function waitForRow(
  path: string,
  predicate: (row: UnknownRecord) => boolean,
  timeoutMs = 24000,
) {
  const rows = await waitForRows(path, (items) => items.some(predicate), timeoutMs);
  const row = rows.find(predicate);
  if (!row) {
    throw new Error(`Geen zichtbaar record gevonden via ${path}.`);
  }
  return row;
}

async function waitForRows(
  path: string,
  predicate: (rows: UnknownRecord[]) => boolean,
  timeoutMs = 24000,
) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await requestJson(path);
      const rows = toRows(value);
      if (predicate(rows)) {
        return rows;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }

  const suffix = lastError ? ` Laatste fout: ${formatError(lastError)}` : '';
  throw new Error(`Timeout bij wachten op zichtbaar resultaat via ${path}.${suffix}`);
}

async function findContractId(kunstwerkId: string) {
  const contract = await waitForRow(
    `/contract/api/contracten?kunstwerkId=${encodeURIComponent(kunstwerkId)}`,
    (row) => matchesKunstwerk(row, kunstwerkId),
  );
  return entityId(contract, ['contractId', 'id']);
}

async function findOnderhoudId(kunstwerkId: string) {
  const traject = await waitForRow('/onderhoud/api/onderhoud', (row) =>
    matchesKunstwerk(row, kunstwerkId),
  );
  return entityId(traject, ['onderhoudId', 'trajectId', 'id']);
}

async function findIncidentId(kunstwerkId: string) {
  const incident = await waitForRow(
    `/monitoring/api/incidenten?kunstwerkId=${encodeURIComponent(kunstwerkId)}`,
    (row) => matchesKunstwerk(row, kunstwerkId),
  );
  return entityId(incident, ['incidentId', 'id']);
}

function toRows(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items.filter(isRecord);
  }
  if (isRecord(value)) {
    return [value];
  }
  return [];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entityId(row: UnknownRecord, preferredKeys: string[] = []) {
  for (const key of [...preferredKeys, ...ENTITY_ID_KEYS]) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return undefined;
}

function matchesKunstwerk(row: UnknownRecord, kunstwerkId: string) {
  for (const key of ['kunstwerkId', 'kunstwerk_id', 'objectId', 'object_id']) {
    const value = row[key];
    if (value === kunstwerkId) {
      return true;
    }
  }
  return JSON.stringify(row).includes(kunstwerkId);
}

function rowText(row: UnknownRecord) {
  return JSON.stringify(row);
}

function pickPrimary(row: UnknownRecord): [string, unknown] | null {
  for (const key of ENTITY_ID_KEYS) {
    if (row[key] !== undefined && row[key] !== null) {
      return [key, row[key]];
    }
  }
  const first = Object.entries(row)[0];
  return first ?? null;
}

function formatError(error: unknown) {
  if (error instanceof ApiError) {
    return JSON.stringify(
      {
        path: error.path,
        status: error.status,
        body: error.body,
      },
      null,
      2,
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return formatValue(error);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function severityClass(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('kritiek') || normalized.includes('rood')) {
    return 'severity critical';
  }
  if (normalized.includes('hoog')) {
    return 'severity high';
  }
  if (normalized.includes('middel') || normalized.includes('geel')) {
    return 'severity medium';
  }
  if (normalized.includes('laag')) {
    return 'severity low';
  }
  return '';
}

function stateLabel(status: StepStatus) {
  if (status === 'running') {
    return 'Loopt';
  }
  if (status === 'done') {
    return 'Zichtbaar';
  }
  if (status === 'error') {
    return 'Fout';
  }
  return 'Start';
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function dateOnly(daysFromToday: number) {
  return addDaysIso(daysFromToday).slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function removeEmpty(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''));
}

export default App;
