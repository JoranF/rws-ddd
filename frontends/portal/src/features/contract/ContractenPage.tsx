import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { contractApi } from './api';
import { AlleenLezen, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { fmtEuro } from '../../lib/dates';

export function ContractenPage() {
  const navigate = useNavigate();
  const [kunstwerkId, setKunstwerkId] = useState('');
  const filter = kunstwerkId.trim();

  const contracten = useQuery({
    queryKey: ['contract', 'contracten', filter],
    queryFn: () => contractApi.contracten(filter || undefined),
  });

  return (
    <>
      <PageHeader context="contract" titel="Onderhoudscontracten" />
      <AlleenLezen context="contract" />

      <Sectie
        titel={`Contracten (${contracten.data?.length ?? '…'})`}
        acties={
          <label className="veld">
            <span>Filter op kunstwerk-ID</span>
            <input value={kunstwerkId} onChange={e => setKunstwerkId(e.target.value)} placeholder="Alle objecten" />
          </label>
        }
      >
        <Tabel
          rijen={contracten.data}
          laden={contracten.isLoading}
          fout={contracten.error as Error | null}
          leeg={filter
            ? `Geen contracten voor object ${filter}.`
            : 'Nog geen onderhoudscontracten. Die ontstaan na gunning van een aanbesteding.'}
          sleutel={c => c.contractId}
          onRij={c => navigate(`/contract/contracten/${c.contractId}`)}
          kolommen={[
            { kop: 'ID', cel: c => c.contractId, mono: true },
            { kop: 'Kunstwerk', cel: c => c.kunstwerkId, mono: true },
            { kop: 'Opdrachtnemer', cel: c => <strong>{c.opdrachtnemer}</strong> },
            { kop: 'Status', cel: c => <StatusPil waarde={c.status} /> },
            { kop: 'Waarde', cel: c => fmtEuro(c.waarde), uitlijnen: 'rechts', mono: true },
          ]}
        />
      </Sectie>
    </>
  );
}
