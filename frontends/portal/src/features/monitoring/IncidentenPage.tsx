import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from './api';
import { ActieKnop, AlleenLezen, ErnstPil, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function IncidentenPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kunstwerkId, setKunstwerkId] = useState('');

  const incidenten = useQuery({
    queryKey: ['monitoring', 'incidenten', kunstwerkId],
    queryFn: () => monitoringApi.incidenten(kunstwerkId ? { kunstwerkId } : undefined),
  });

  const klaar = () => qc.invalidateQueries({ queryKey: ['monitoring'] });

  const inBehandeling = useMutation({
    mutationFn: monitoringApi.neemInBehandeling,
    onSuccess: (_d, id) => { toast.push('success', `Incident ${id} in behandeling genomen`); klaar(); },
    onError: e => toast.push('error', 'In behandeling nemen mislukt', (e as Error).message),
  });

  const losOp = useMutation({
    mutationFn: monitoringApi.losOp,
    onSuccess: (_d, id) => { toast.push('success', `Incident ${id} opgelost`); klaar(); },
    onError: e => toast.push('error', 'Oplossen mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="monitoring" titel="Incidenten" />
      <AlleenLezen context="monitoring" />

      <label className="veld" style={{ maxWidth: 280 }}>
        <span>Filter op kunstwerk-ID</span>
        <input value={kunstwerkId} onChange={e => setKunstwerkId(e.target.value)} placeholder="bv. KW-001" />
        <small>Leeg laten voor alle incidenten.</small>
      </label>

      <Sectie titel={`Incidenten (${incidenten.data?.length ?? '…'})`}>
        <Tabel
          rijen={incidenten.data}
          laden={incidenten.isLoading}
          fout={incidenten.error as Error | null}
          leeg="Geen incidenten gevonden."
          sleutel={i => i.id}
          kolommen={[
            { kop: 'Kunstwerk', cel: i => i.kunstwerkId, mono: true },
            { kop: 'Sensor', cel: i => i.sensorType },
            { kop: 'Gemeten / drempel', cel: i => `${i.gemetenWaarde} / ${i.drempelwaarde}`, mono: true },
            { kop: 'Ernst', cel: i => <ErnstPil waarde={i.ernst} /> },
            { kop: 'Omschrijving', cel: i => i.omschrijving },
            { kop: 'Vervolgactie', cel: i => i.vervolgactie },
            { kop: 'Status', cel: i => <StatusPil waarde={i.status} /> },
            { kop: 'Aangemaakt', cel: i => fmt(i.aangemaaktOp), mono: true },
            {
              kop: 'Acties',
              cel: i => (
                <>
                  {i.status !== 'InBehandeling' && i.status !== 'Opgelost' && (
                    <ActieKnop
                      context="monitoring"
                      bezig={inBehandeling.isPending && inBehandeling.variables === i.id}
                      onClick={() => inBehandeling.mutate(i.id)}
                    >
                      In behandeling
                    </ActieKnop>
                  )}{' '}
                  {i.status !== 'Opgelost' && (
                    <ActieKnop
                      context="monitoring"
                      bezig={losOp.isPending && losOp.variables === i.id}
                      onClick={() => losOp.mutate(i.id)}
                    >
                      Oplossen
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
