import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from './api';
import { ActieForm, AlleenLezen, PageHeader, Sectie, Tabel } from '../../components/ui';
import { dateOnly, fmt, fmtDatum } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function RapportenPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const rapporten = useQuery({ queryKey: ['monitoring', 'rapporten'], queryFn: () => monitoringApi.rapporten() });

  const klaar = () => qc.invalidateQueries({ queryKey: ['monitoring'] });

  const stelOp = useMutation({
    mutationFn: monitoringApi.stelRapportOp,
    onSuccess: r => { toast.push('success', `Rapport ${r.id} opgesteld`); klaar(); },
    onError: e => toast.push('error', 'Rapport opstellen mislukt', (e as Error).message),
  });

  const netwerk = useMutation({
    mutationFn: monitoringApi.stelNetwerkrapportageOp,
    onSuccess: r => { toast.push('success', `Netwerkrapportage ${r.id} opgesteld en verstuurd naar Beheer`); klaar(); },
    onError: e => toast.push('error', 'Netwerkrapportage opstellen mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="monitoring" titel="Rapporten" />
      <AlleenLezen context="monitoring" />

      <Sectie titel={`Rapporten (${rapporten.data?.length ?? '…'})`}>
        <Tabel
          rijen={rapporten.data}
          laden={rapporten.isLoading}
          fout={rapporten.error as Error | null}
          leeg="Nog geen rapporten opgesteld."
          sleutel={r => r.id}
          kolommen={[
            { kop: 'Kunstwerk', cel: r => r.kunstwerkId, mono: true },
            { kop: 'Periode', cel: r => `${fmtDatum(r.periodeStart)} – ${fmtDatum(r.periodeEind)}` },
            { kop: 'Zwaarste open incident', cel: r => r.zwaarsteOpenIncidentId ?? '—', mono: true },
            { kop: 'Opgesteld', cel: r => fmt(r.opgesteldOp), mono: true },
          ]}
        />
      </Sectie>

      <ActieForm
        context="monitoring"
        titel="Rapport opstellen"
        knop="Stel rapport op"
        bezig={stelOp.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID', hint: 'bv. KW-001' },
          { naam: 'periodeStart', label: 'Periode start', type: 'date', standaard: dateOnly(-7) },
          { naam: 'periodeEind', label: 'Periode eind', type: 'date', standaard: dateOnly(0) },
        ]}
        onSubmit={v => stelOp.mutate({
          kunstwerkId: v.kunstwerkId,
          periodeStart: new Date(v.periodeStart).toISOString(),
          periodeEind: new Date(v.periodeEind).toISOString(),
        })}
      />

      <ActieForm
        context="monitoring"
        titel="Netwerkrapportage opstellen"
        knop="Stel netwerkrapportage op"
        bezig={netwerk.isPending}
        velden={[
          { naam: 'periodeStart', label: 'Periode start', type: 'date', standaard: dateOnly(-7) },
          { naam: 'periodeEind', label: 'Periode eind', type: 'date', standaard: dateOnly(0),
            hint: 'De netwerkrapportage over alle kunstwerken wordt naar Beheer gestuurd.' },
        ]}
        onSubmit={v => netwerk.mutate({
          periodeStart: new Date(v.periodeStart).toISOString(),
          periodeEind: new Date(v.periodeEind).toISOString(),
        })}
      />
    </>
  );
}
