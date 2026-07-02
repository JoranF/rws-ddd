import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { onderhoudApi } from './api';
import { ActieForm, AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function TrajectenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const trajecten = useQuery({ queryKey: ['onderhoud', 'trajecten'], queryFn: onderhoudApi.trajecten });

  const aanvraag = useMutation({
    mutationFn: onderhoudApi.dienContractaanvraagIn,
    onSuccess: () => {
      toast.push('success', 'Contractaanvraag ingediend');
      qc.invalidateQueries({ queryKey: ['onderhoud'] });
    },
    onError: e => toast.push('error', 'Contractaanvraag indienen mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="onderhoud" titel="Onderhoudstrajecten" />
      <AlleenLezen context="onderhoud" />

      <Sectie titel={`Trajecten (${trajecten.data?.length ?? '…'})`}>
        <Tabel
          rijen={trajecten.data}
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
            { kop: 'Inspecties', cel: t => t.inspecties.length, uitlijnen: 'rechts', mono: true },
            { kop: 'Gestart', cel: t => fmt(t.gestartOp), mono: true },
          ]}
        />
      </Sectie>

      <ActieForm
        context="onderhoud"
        titel="Contractaanvraag indienen"
        knop="Dien aanvraag in"
        bezig={aanvraag.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID' },
          { naam: 'aanleiding', label: 'Aanleiding',
            hint: 'De aanvraag gaat via een event naar de Contract-context' },
        ]}
        onSubmit={v => aanvraag.mutate({ kunstwerkId: v.kunstwerkId, aanleiding: v.aanleiding })}
      />
    </>
  );
}
