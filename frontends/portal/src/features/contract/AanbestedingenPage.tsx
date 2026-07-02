import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { contractApi } from './api';
import { ActieForm, AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { dateOnly } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function AanbestedingenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const aanbestedingen = useQuery({ queryKey: ['contract', 'aanbestedingen'], queryFn: contractApi.aanbestedingen });

  const start = useMutation({
    mutationFn: contractApi.startAanbesteding,
    onSuccess: a => {
      toast.push('success', `Aanbesteding ${a.aanbestedingId} gestart`);
      qc.invalidateQueries({ queryKey: ['contract'] });
    },
    onError: e => toast.push('error', 'Aanbesteding starten mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="contract" titel="Aanbestedingen" />
      <AlleenLezen context="contract" />

      <ActieForm
        context="contract"
        titel="Aanbesteding starten"
        knop="Start aanbesteding"
        bezig={start.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID', hint: 'ID van het object uit het beheer-register' },
          { naam: 'sluitingsdatum', label: 'Sluitingsdatum', type: 'date', standaard: dateOnly(7) },
          { naam: 'prijsgewicht', label: 'Prijsgewicht', type: 'number', standaard: '60' },
          { naam: 'kwaliteitsgewicht', label: 'Kwaliteitsgewicht', type: 'number', standaard: '40', hint: 'Gewichten samen 100 — EMVI' },
        ]}
        onSubmit={v => start.mutate({
          kunstwerkId: v.kunstwerkId,
          sluitingsdatum: new Date(v.sluitingsdatum).toISOString(),
          prijsgewicht: Number(v.prijsgewicht),
          kwaliteitsgewicht: Number(v.kwaliteitsgewicht),
        })}
      />

      <Sectie titel={`Aanbestedingen (${aanbestedingen.data?.length ?? '…'})`}>
        <Tabel
          rijen={aanbestedingen.data}
          laden={aanbestedingen.isLoading}
          fout={aanbestedingen.error as Error | null}
          leeg="Nog geen aanbestedingen. Start de eerste met het formulier hierboven."
          sleutel={a => a.aanbestedingId}
          onRij={a => navigate(`/contract/aanbestedingen/${a.aanbestedingId}`)}
          kolommen={[
            { kop: 'ID', cel: a => a.aanbestedingId, mono: true },
            { kop: 'Kunstwerk', cel: a => a.kunstwerkId, mono: true },
            { kop: 'Status', cel: a => <StatusPil waarde={a.status} /> },
            { kop: 'Inschrijvingen', cel: a => a.aantalInschrijvingen, uitlijnen: 'rechts', mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
