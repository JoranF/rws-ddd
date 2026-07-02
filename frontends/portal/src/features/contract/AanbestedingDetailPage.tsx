import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contractApi } from './api';
import { ActieForm, AlleenLezen, DefLijst, FoutBlok, PageHeader, StatusPil } from '../../components/ui';
import { dateOnly } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function AanbestedingDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const aanbesteding = useQuery({ queryKey: ['contract', 'aanbesteding', id], queryFn: () => contractApi.aanbesteding(id) });

  const klaar = () => qc.invalidateQueries({ queryKey: ['contract'] });

  const dienIn = useMutation({
    mutationFn: (v: Record<string, string>) => contractApi.dienInschrijvingIn(id, {
      aannemer: v.aannemer,
      prijs: Number(v.prijs),
      kwaliteitsscore: Number(v.kwaliteitsscore),
    }),
    onSuccess: (_r, v) => { toast.push('success', `Inschrijving van ${v.aannemer} ontvangen`); klaar(); },
    onError: e => toast.push('error', 'Inschrijving indienen mislukt', (e as Error).message),
  });

  const gun = useMutation({
    mutationFn: (v: Record<string, string>) => contractApi.gun(id, {
      looptijdStart: v.looptijdStart,
      looptijdEind: v.looptijdEind,
    }),
    onSuccess: r => { toast.push('success', `Gegund volgens EMVI — contract ${r.contractId} aangemaakt`); klaar(); },
    onError: e => toast.push('error', 'Gunnen mislukt', (e as Error).message),
  });

  if (aanbesteding.error) {
    return (
      <>
        <PageHeader context="contract" titel={`Aanbesteding ${id}`} />
        <FoutBlok fout={aanbesteding.error as Error} />
      </>
    );
  }

  const a = aanbesteding.data;
  // Na gunning (of sluiting) zijn inschrijven en gunnen niet meer aan de orde.
  const loopt = !!a && !['gegund', 'gesloten'].includes(a.status.toLowerCase());

  return (
    <>
      <Link className="terug" to="/contract/aanbestedingen">← Alle aanbestedingen</Link>
      <PageHeader context="contract" titel={`Aanbesteding ${id}`} />
      <AlleenLezen context="contract" />

      <DefLijst items={[
        ['Aanbesteding-ID', a ? <span className="mono">{a.aanbestedingId}</span> : null],
        ['Kunstwerk', a?.kunstwerkId],
        ['Status', <StatusPil waarde={a?.status} />],
        ['Aantal inschrijvingen', a?.aantalInschrijvingen],
      ]} />

      {loopt && <ActieForm
        context="contract"
        titel="Inschrijving indienen"
        knop="Dien inschrijving in"
        bezig={dienIn.isPending}
        velden={[
          { naam: 'aannemer', label: 'Aannemer' },
          { naam: 'prijs', label: 'Prijs', type: 'number' },
          { naam: 'kwaliteitsscore', label: 'Kwaliteitsscore', type: 'number', hint: 'Score van 1 t/m 10' },
        ]}
        onSubmit={v => dienIn.mutate(v)}
      />}

      {loopt && <ActieForm
        context="contract"
        titel="Gunnen (EMVI)"
        knop="Gun aanbesteding"
        bezig={gun.isPending}
        velden={[
          { naam: 'looptijdStart', label: 'Looptijd start', type: 'date', standaard: dateOnly(0) },
          { naam: 'looptijdEind', label: 'Looptijd eind', type: 'date', standaard: dateOnly(365), hint: 'Beste prijs/kwaliteit-verhouding wint' },
        ]}
        onSubmit={v => gun.mutate(v)}
      />}
    </>
  );
}
