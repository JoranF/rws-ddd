import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { onderhoudApi, OORDEEL_OPTIES } from './api';
import { ActieForm, ActieKnop, AlleenLezen, DefLijst, FoutBlok, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { dateOnly, fmt, fmtEuro, nowIso } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function TrajectDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const traject = useQuery({ queryKey: ['onderhoud', 'traject', id], queryFn: () => onderhoudApi.traject(id) });

  const klaar = () => qc.invalidateQueries({ queryKey: ['onderhoud'] });

  const start = useMutation({
    mutationFn: () => onderhoudApi.start(id, { datum: nowIso() }),
    onSuccess: () => { toast.push('success', `Traject ${id} gestart`); klaar(); },
    onError: e => toast.push('error', 'Traject starten mislukt', (e as Error).message),
  });

  const inspectie = useMutation({
    mutationFn: (v: Record<string, string>) => onderhoudApi.registreerInspectie(id, {
      datum: new Date(v.datum).toISOString(),
      oordeel: v.oordeel,
      ...(v.opmerkingen ? { opmerkingen: v.opmerkingen } : {}),
    }),
    onSuccess: () => { toast.push('success', 'Inspectie geregistreerd'); klaar(); },
    onError: e => toast.push('error', 'Inspectie registreren mislukt', (e as Error).message),
  });

  const rondAf = useMutation({
    mutationFn: (v: Record<string, string>) => onderhoudApi.rondAf(id, {
      resultaat: v.resultaat,
      datum: new Date(v.datum).toISOString(),
    }),
    onSuccess: () => { toast.push('success', `Traject ${id} afgerond`); klaar(); },
    onError: e => toast.push('error', 'Traject afronden mislukt', (e as Error).message),
  });

  const factuur = useMutation({
    mutationFn: (v: Record<string, string>) => onderhoudApi.registreerFactuur(id, {
      bedragEuro: Number(v.bedragEuro),
      ontvangenOp: new Date(v.ontvangenOp).toISOString(),
    }),
    onSuccess: f => { toast.push('success', `Factuur ${f.factuurId} geregistreerd`); klaar(); },
    onError: e => toast.push('error', 'Factuur registreren mislukt', (e as Error).message),
  });

  const keurGoed = useMutation({
    mutationFn: (factuurId: string) => onderhoudApi.keurFactuurGoed(id, factuurId),
    onSuccess: () => { toast.push('success', 'Factuur goedgekeurd'); klaar(); },
    onError: e => toast.push('error', 'Factuur goedkeuren mislukt', (e as Error).message),
  });

  if (traject.error) {
    return (
      <>
        <Link className="terug" to="/onderhoud/trajecten">← Alle trajecten</Link>
        <PageHeader context="onderhoud" titel={`Traject ${id}`} />
        <FoutBlok fout={traject.error as Error} />
      </>
    );
  }

  const t = traject.data;

  return (
    <>
      <Link className="terug" to="/onderhoud/trajecten">← Alle trajecten</Link>
      <PageHeader context="onderhoud" titel={`Traject ${id}`} />
      <AlleenLezen context="onderhoud" />

      <DefLijst items={[
        ['Kunstwerk', t?.kunstwerkId],
        ['Status', <StatusPil waarde={t?.status} />],
        ['Aanleiding', t?.aanleiding],
        ['Contract', t?.contractId],
        ['Gestart', t?.gestartOp ? fmt(t.gestartOp) : null],
        ['Afgerond', t?.afgerondOp ? fmt(t.afgerondOp) : null],
        ['Resultaat', t?.resultaat],
      ]} />

      <Sectie titel="Inspecties">
        <Tabel
          rijen={t?.inspecties}
          laden={traject.isLoading}
          leeg="Nog geen inspecties geregistreerd voor dit traject."
          sleutel={i => i.inspectieId}
          kolommen={[
            { kop: 'Datum', cel: i => fmt(i.datum), mono: true },
            { kop: 'Oordeel', cel: i => <StatusPil waarde={i.oordeel} /> },
            { kop: 'Opmerkingen', cel: i => i.opmerkingen ?? '—' },
          ]}
        />
      </Sectie>

      <Sectie titel="Facturen">
        <Tabel
          rijen={t?.facturen}
          laden={traject.isLoading}
          leeg="Nog geen facturen geregistreerd voor dit traject."
          sleutel={f => f.factuurId}
          kolommen={[
            { kop: 'Factuur', cel: f => f.factuurId, mono: true },
            { kop: 'Bedrag', cel: f => fmtEuro(f.bedragEuro), uitlijnen: 'rechts' },
            { kop: 'Status', cel: f => <StatusPil waarde={f.status} /> },
            { kop: 'Ontvangen', cel: f => fmt(f.ontvangenOp), mono: true },
            { kop: 'Acties', cel: f => f.status !== 'Goedgekeurd'
                ? <ActieKnop context="onderhoud" bezig={keurGoed.isPending} onClick={() => keurGoed.mutate(f.factuurId)}>Goedkeuren</ActieKnop>
                : null },
          ]}
        />
      </Sectie>

      {t && !t.gestartOp && (
        <ActieKnop context="onderhoud" bezig={start.isPending} onClick={() => start.mutate()}>
          Traject starten
        </ActieKnop>
      )}

      {t && t.gestartOp && !t.afgerondOp && (
        <>
          <ActieForm
            context="onderhoud"
            titel="Inspectie registreren"
            knop="Registreer inspectie"
            bezig={inspectie.isPending}
            velden={[
              { naam: 'datum', label: 'Datum', type: 'date', standaard: dateOnly(0) },
              { naam: 'oordeel', label: 'Oordeel', opties: OORDEEL_OPTIES, standaard: 'Goedgekeurd' },
              { naam: 'opmerkingen', label: 'Opmerkingen', verplicht: false },
            ]}
            onSubmit={v => inspectie.mutate(v)}
          />
          <ActieForm
            context="onderhoud"
            titel="Traject afronden"
            knop="Rond traject af"
            bezig={rondAf.isPending}
            velden={[
              { naam: 'resultaat', label: 'Resultaat' },
              { naam: 'datum', label: 'Datum', type: 'date', standaard: dateOnly(0) },
            ]}
            onSubmit={v => rondAf.mutate(v)}
          />
        </>
      )}

      {t && (
        <ActieForm
          context="onderhoud"
          titel="Factuur registreren"
          knop="Registreer factuur"
          bezig={factuur.isPending}
          velden={[
            { naam: 'bedragEuro', label: 'Bedrag (EUR)', type: 'number' },
            { naam: 'ontvangenOp', label: 'Ontvangen op', type: 'date', standaard: dateOnly(0) },
          ]}
          onSubmit={v => factuur.mutate(v)}
        />
      )}
    </>
  );
}
