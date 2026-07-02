import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contractApi } from './api';
import { ActieForm, ActieKnop, AlleenLezen, DefLijst, FoutBlok, PageHeader, Sectie, StatusPil } from '../../components/ui';
import { dateOnly, fmtEuro, nowIso } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const contract = useQuery({ queryKey: ['contract', 'contract', id], queryFn: () => contractApi.contract(id) });

  const klaar = () => qc.invalidateQueries({ queryKey: ['contract'] });

  const dienVerklaringIn = useMutation({
    mutationFn: (v: Record<string, string>) => contractApi.dienPrestatieverklaringIn(id, {
      periodeStart: v.periodeStart,
      periodeEind: v.periodeEind,
      bedrag: Number(v.bedrag),
    }),
    onSuccess: () => { toast.push('success', 'Prestatieverklaring opgesteld'); klaar(); },
    onError: e => toast.push('error', 'Prestatieverklaring indienen mislukt', (e as Error).message),
  });

  const rondAf = useMutation({
    mutationFn: () => contractApi.rondAf(id, { datum: nowIso() }),
    onSuccess: () => { toast.push('success', `Contract ${id} afgerond`); klaar(); },
    onError: e => toast.push('error', 'Contract afronden mislukt', (e as Error).message),
  });

  if (contract.error) {
    return (
      <>
        <PageHeader context="contract" titel={`Contract ${id}`} />
        <FoutBlok fout={contract.error as Error} />
      </>
    );
  }

  const c = contract.data;

  return (
    <>
      <Link className="terug" to="/contract/contracten">← Alle contracten</Link>
      <PageHeader context="contract" titel={`Contract ${id}`} />
      <AlleenLezen context="contract" />

      <DefLijst items={[
        ['Contract-ID', c ? <span className="mono">{c.contractId}</span> : null],
        ['Kunstwerk', c?.kunstwerkId],
        ['Opdrachtnemer', c?.opdrachtnemer],
        ['Status', <StatusPil waarde={c?.status} />],
        ['Waarde', c ? fmtEuro(c.waarde) : null],
      ]} />

      <ActieForm
        context="contract"
        titel="Prestatieverklaring indienen"
        knop="Dien prestatieverklaring in"
        bezig={dienVerklaringIn.isPending}
        velden={[
          // De periode moet binnen de contractlooptijd vallen; die begint op de gunningsdag.
          { naam: 'periodeStart', label: 'Periode start', type: 'date', standaard: dateOnly(0) },
          { naam: 'periodeEind', label: 'Periode eind', type: 'date', standaard: dateOnly(30) },
          { naam: 'bedrag', label: 'Bedrag', type: 'number', hint: 'De prestatiescore volgt automatisch uit de monitoring-KPI’s' },
        ]}
        onSubmit={v => dienVerklaringIn.mutate(v)}
      />

      {c?.status.toLowerCase() !== 'afgerond' && (
        <Sectie titel="Afronding">
          <ActieKnop context="contract" variant="gevaar" bezig={rondAf.isPending} onClick={() => rondAf.mutate()}>
            Contract afronden
          </ActieKnop>
        </Sectie>
      )}
    </>
  );
}
