import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from './api';
import { ActieForm, AlleenLezen, PageHeader, Sectie, Tabel } from '../../components/ui';
import { fmt } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function MetingenPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kunstwerkId, setKunstwerkId] = useState('');

  // De GET vereist een kunstwerkId; sessies leveren bekende ID's voor de datalist.
  const sessies = useQuery({ queryKey: ['monitoring', 'sessies'], queryFn: monitoringApi.sessies });
  const bekendeIds = [...new Set((sessies.data ?? []).map(s => s.kunstwerkId))];

  const metingen = useQuery({
    queryKey: ['monitoring', 'metingen', kunstwerkId],
    queryFn: () => monitoringApi.metingen(kunstwerkId),
    enabled: !!kunstwerkId,
  });

  const registreer = useMutation({
    mutationFn: monitoringApi.registreerMeting,
    onSuccess: m => {
      toast.push('success', `Meting geregistreerd voor ${m.kunstwerkId}: ${m.waarde} ${m.eenheid}`);
      qc.invalidateQueries({ queryKey: ['monitoring'] });
    },
    onError: e => toast.push('error', 'Meting registreren mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="monitoring" titel="Metingen" />
      <AlleenLezen context="monitoring" />

      <label className="veld" style={{ maxWidth: 280 }}>
        <span>Kunstwerk-ID</span>
        <input list="monitoring-kunstwerken" value={kunstwerkId}
               onChange={e => setKunstwerkId(e.target.value)} placeholder="bv. KW-001" />
        <small>Verplicht: metingen worden per kunstwerk opgevraagd.</small>
      </label>
      <datalist id="monitoring-kunstwerken">
        {bekendeIds.map(id => <option key={id} value={id} />)}
      </datalist>

      <Sectie titel={kunstwerkId ? `Metingen voor ${kunstwerkId}` : 'Metingen'}>
        {kunstwerkId ? (
          <Tabel
            rijen={metingen.data}
            laden={metingen.isLoading}
            fout={metingen.error as Error | null}
            leeg="Nog geen metingen voor dit kunstwerk."
            sleutel={m => m.id}
            kolommen={[
              { kop: 'Sensor', cel: m => m.sensorType },
              { kop: 'Waarde', cel: m => `${m.waarde} ${m.eenheid}`, mono: true },
              { kop: 'Tijdstip', cel: m => fmt(m.tijdstip), mono: true },
            ]}
          />
        ) : (
          <p className="stil">Vul eerst een kunstwerk-ID in om metingen te bekijken.</p>
        )}
      </Sectie>

      <ActieForm
        context="monitoring"
        titel="Meting registreren"
        knop="Registreer meting"
        bezig={registreer.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID' },
          { naam: 'sensorType', label: 'Sensortype', standaard: 'Trilling' },
          { naam: 'waarde', label: 'Waarde', type: 'number' },
        ]}
        onSubmit={v => registreer.mutate({ kunstwerkId: v.kunstwerkId, sensorType: v.sensorType, waarde: Number(v.waarde) })}
      />
    </>
  );
}
