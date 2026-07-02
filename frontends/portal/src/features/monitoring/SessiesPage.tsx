import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringApi, type SessieDto } from './api';
import { ActieForm, ActieKnop, AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';
import { useToast } from '../../lib/toast';

// Statusvergelijking case-insensitief: de service kan 'Actief' of 'actief' teruggeven.
const status = (s: SessieDto) => s.status.toLowerCase();
const isBeeindigd = (s: SessieDto) =>
  s.beeindigdOp != null || ['afgerond', 'beeindigd', 'beëindigd'].includes(status(s));

export function SessiesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const sessies = useQuery({ queryKey: ['monitoring', 'sessies'], queryFn: monitoringApi.sessies });

  const klaar = () => qc.invalidateQueries({ queryKey: ['monitoring'] });

  const start = useMutation({
    mutationFn: monitoringApi.startSessie,
    onSuccess: r => { toast.push('success', `Sessie ${r.id} gestart`); klaar(); },
    onError: e => toast.push('error', 'Sessie starten mislukt', (e as Error).message),
  });

  const pauzeer = useMutation({
    mutationFn: monitoringApi.pauzeerSessie,
    onSuccess: (_d, id) => { toast.push('success', `Sessie ${id} gepauzeerd`); klaar(); },
    onError: e => toast.push('error', 'Pauzeren mislukt', (e as Error).message),
  });

  const hervat = useMutation({
    mutationFn: monitoringApi.hervatSessie,
    onSuccess: (_d, id) => { toast.push('success', `Sessie ${id} hervat`); klaar(); },
    onError: e => toast.push('error', 'Hervatten mislukt', (e as Error).message),
  });

  const rondAf = useMutation({
    mutationFn: monitoringApi.rondSessieAf,
    onSuccess: (_d, id) => { toast.push('success', `Sessie ${id} afgerond`); klaar(); },
    onError: e => toast.push('error', 'Afronden mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="monitoring" titel="Sessies" />
      <AlleenLezen context="monitoring" />

      <ActieForm
        context="monitoring"
        titel="Sessie starten"
        knop="Start sessie"
        bezig={start.isPending}
        velden={[{ naam: 'kunstwerkId', label: 'Kunstwerk-ID', hint: 'bv. KW-001' }]}
        onSubmit={v => start.mutate({ kunstwerkId: v.kunstwerkId })}
      />

      <Sectie titel={`Sessies (${sessies.data?.length ?? '…'})`}>
        <Tabel
          rijen={sessies.data}
          laden={sessies.isLoading}
          fout={sessies.error as Error | null}
          leeg="Nog geen sessies. Start de eerste sessie hierboven."
          sleutel={s => s.id}
          kolommen={[
            { kop: 'Kunstwerk', cel: s => s.kunstwerkId, mono: true },
            { kop: 'Status', cel: s => <StatusPil waarde={s.status} /> },
            { kop: 'Gestart', cel: s => fmt(s.gestartOp), mono: true },
            { kop: 'Beëindigd', cel: s => fmt(s.beeindigdOp), mono: true },
            { kop: 'Aantal metingen', cel: s => s.aantalMetingen, uitlijnen: 'rechts', mono: true },
            {
              kop: 'Acties',
              cel: s => (
                <>
                  {status(s) === 'actief' && (
                    <ActieKnop
                      context="monitoring"
                      bezig={pauzeer.isPending && pauzeer.variables === s.id}
                      onClick={() => pauzeer.mutate(s.id)}
                    >
                      Pauzeren
                    </ActieKnop>
                  )}{' '}
                  {status(s) === 'gepauzeerd' && (
                    <ActieKnop
                      context="monitoring"
                      bezig={hervat.isPending && hervat.variables === s.id}
                      onClick={() => hervat.mutate(s.id)}
                    >
                      Hervatten
                    </ActieKnop>
                  )}{' '}
                  {!isBeeindigd(s) && (
                    <ActieKnop
                      context="monitoring"
                      bezig={rondAf.isPending && rondAf.variables === s.id}
                      onClick={() => rondAf.mutate(s.id)}
                    >
                      Afronden
                    </ActieKnop>
                  )}
                </>
              ),
            },
          ]}
        />
      </Sectie>
    </>
  );
}
