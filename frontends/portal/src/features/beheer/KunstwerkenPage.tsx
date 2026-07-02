import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { beheerApi, KUNSTWERK_TYPES } from './api';
import { ActieForm, AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { useToast } from '../../lib/toast';

export function KunstwerkenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const kunstwerken = useQuery({ queryKey: ['beheer', 'kunstwerken'], queryFn: beheerApi.kunstwerken });

  const registreer = useMutation({
    mutationFn: beheerApi.registreer,
    onSuccess: k => {
      toast.push('success', `Kunstwerk ${k.kunstwerkId} geregistreerd`);
      qc.invalidateQueries({ queryKey: ['beheer'] });
    },
    onError: e => toast.push('error', 'Registreren mislukt', (e as Error).message),
  });

  return (
    <>
      <PageHeader context="beheer" titel="Kunstwerken" />
      <AlleenLezen context="beheer" />

      <ActieForm
        context="beheer"
        titel="Kunstwerk registreren"
        knop="Registreer kunstwerk"
        bezig={registreer.isPending}
        velden={[
          { naam: 'kunstwerkId', label: 'Kunstwerk-ID', verplicht: false, hint: 'Leeg laten voor automatische uitgifte' },
          { naam: 'naam', label: 'Naam', standaard: '' },
          { naam: 'type', label: 'Type', opties: KUNSTWERK_TYPES, standaard: 'Brug' },
          { naam: 'locatie', label: 'Locatie' },
          { naam: 'beheerder', label: 'Beheerder', verplicht: false },
        ]}
        onSubmit={v => registreer.mutate({
          ...(v.kunstwerkId ? { kunstwerkId: v.kunstwerkId } : {}),
          naam: v.naam,
          type: v.type,
          locatie: v.locatie,
          ...(v.beheerder ? { beheerder: v.beheerder } : {}),
        })}
      />

      <Sectie titel={`Register (${kunstwerken.data?.length ?? '…'})`}>
        <Tabel
          rijen={kunstwerken.data}
          laden={kunstwerken.isLoading}
          fout={kunstwerken.error as Error | null}
          leeg="Nog geen kunstwerken in het register."
          sleutel={k => k.kunstwerkId}
          onRij={k => navigate(`/beheer/kunstwerken/${encodeURIComponent(k.kunstwerkId)}`)}
          kolommen={[
            { kop: 'ID', cel: k => k.kunstwerkId, mono: true },
            { kop: 'Naam', cel: k => <strong>{k.naam}</strong> },
            { kop: 'Type', cel: k => k.type },
            { kop: 'Locatie', cel: k => k.locatie },
            { kop: 'Status', cel: k => <StatusPil waarde={k.status} /> },
            { kop: 'Beheerder', cel: k => k.beheerder ?? '—' },
          ]}
        />
      </Sectie>
    </>
  );
}
