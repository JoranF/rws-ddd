import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ERNST_OPTIES, onderhoudApi } from './api';
import { ActieForm, AlleenLezen, ErnstPil, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { useToast } from '../../lib/toast';

export function StoringenPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const storingen = useQuery({ queryKey: ['onderhoud', 'storingen'], queryFn: onderhoudApi.storingen });

  const meld = useMutation({
    mutationFn: onderhoudApi.meldStoring,
    onSuccess: () => {
      toast.push('success', 'Storing gemeld');
      qc.invalidateQueries({ queryKey: ['onderhoud'] });
    },
    onError: e => toast.push('error', 'Storing melden mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="onderhoud" titel="Storingen" />
      <AlleenLezen context="onderhoud" />

      <ActieForm
        context="onderhoud"
        titel="Storing melden"
        knop="Meld storing"
        bezig={meld.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID' },
          { naam: 'omschrijving', label: 'Omschrijving' },
          { naam: 'ernst', label: 'Ernst', opties: ERNST_OPTIES, standaard: 'Hoog',
            hint: 'Bij Hoog of Kritiek wordt automatisch een onderhoudstraject gepland' },
        ]}
        onSubmit={v => meld.mutate({ kunstwerkId: v.kunstwerkId, omschrijving: v.omschrijving, ernst: v.ernst })}
      />

      <Sectie titel={`Storingen (${storingen.data?.length ?? '…'})`}>
        <Tabel
          rijen={storingen.data}
          laden={storingen.isLoading}
          fout={storingen.error as Error | null}
          leeg="Nog geen storingen gemeld."
          sleutel={s => s.storingId}
          kolommen={[
            { kop: 'Kunstwerk', cel: s => s.kunstwerkId, mono: true },
            { kop: 'Omschrijving', cel: s => s.omschrijving },
            { kop: 'Ernst', cel: s => <ErnstPil waarde={s.ernst} /> },
            { kop: 'Status', cel: s => <StatusPil waarde={s.status} /> },
            { kop: 'Gekoppeld traject', cel: s => s.onderhoudId ?? '—', mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
