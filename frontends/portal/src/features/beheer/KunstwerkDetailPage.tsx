import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { beheerApi, EIS_OPERATORS } from './api';
import { ActieForm, AlleenLezen, DefLijst, FoutBlok, PageHeader, Sectie, StatusPil, Tabel } from '../../components/ui';
import { dateOnly, fmt, fmtDatum } from '../../lib/dates';
import { useToast } from '../../lib/toast';

export function KunstwerkDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const kunstwerk = useQuery({ queryKey: ['beheer', 'kunstwerk', id], queryFn: () => beheerApi.kunstwerk(id) });
  const eisen = useQuery({ queryKey: ['beheer', 'eisen', id], queryFn: () => beheerApi.eisen(id) });
  const beoordelingen = useQuery({ queryKey: ['beheer', 'beoordelingen', id], queryFn: () => beheerApi.beoordelingen(id) });

  const klaar = () => qc.invalidateQueries({ queryKey: ['beheer'] });

  const stelEisVast = useMutation({
    mutationFn: (v: Record<string, string>) => beheerApi.stelEisenVast(
      id,
      v.soort === 'Ontwerpeisen' ? 'ontwerpeisen' : 'onderhoudseisen',
      [{ code: v.code, omschrijving: v.omschrijving, meetwaarde: v.meetwaarde, operator: v.operator, grenswaarde: Number(v.grenswaarde), eenheid: v.eenheid }],
    ),
    onSuccess: p => { toast.push('success', `${p.soort} vastgesteld (versie ${p.versie})`); klaar(); },
    onError: e => toast.push('error', 'Eis vaststellen mislukt', (e as Error).message),
  });

  const buitenGebruik = useMutation({
    mutationFn: (v: Record<string, string>) => beheerApi.buitenGebruik(id, { reden: v.reden, datum: v.datum }),
    onSuccess: () => { toast.push('success', `Kunstwerk ${id} buiten gebruik gesteld`); klaar(); },
    onError: e => toast.push('error', 'Buitengebruikstelling mislukt', (e as Error).message),
  });

  if (kunstwerk.error) {
    return (
      <>
        <PageHeader context="beheer" titel={`Kunstwerk ${id}`} />
        <FoutBlok fout={kunstwerk.error as Error} />
      </>
    );
  }

  const k = kunstwerk.data;

  return (
    <>
      <Link className="terug" to="/beheer/kunstwerken">← Alle kunstwerken</Link>
      <PageHeader context="beheer" titel={k ? `${k.naam} (${k.kunstwerkId})` : `Kunstwerk ${id}`} />
      <AlleenLezen context="beheer" />

      <DefLijst items={[
        ['Status', <StatusPil waarde={k?.status} />],
        ['Type', k?.type],
        ['Locatie', k?.locatie],
        ['Beheerder', k?.beheerder],
        ['Jaar renovatie', k?.jaarRenovatie],
        ['Laatste inspectie', k?.laatsteInspectiedatum ? fmtDatum(k.laatsteInspectiedatum) : null],
        ['Buiten gebruik', k?.buitengebruikDatum ? `${fmtDatum(k.buitengebruikDatum)} — ${k.buitengebruikReden ?? ''}` : null],
        ['Geregistreerd', k ? fmt(k.aangemaaktOp) : null],
      ]} />

      <Sectie titel="Eisenpakketten">
        <Tabel
          rijen={(eisen.data ?? []).flatMap(p => p.eisen.map(e => ({ pakket: p, eis: e })))}
          laden={eisen.isLoading}
          fout={eisen.error as Error | null}
          leeg="Nog geen eisen vastgesteld voor dit kunstwerk."
          sleutel={r => `${r.pakket.eisenpakketId}-${r.eis.code}`}
          kolommen={[
            { kop: 'Soort', cel: r => r.pakket.soort },
            { kop: 'Versie', cel: r => `v${r.pakket.versie}`, mono: true },
            // Elke nieuwe vaststelling vervangt het hele pakket van die soort;
            // zonder statuskolom lijken vervangen eisen nog te gelden.
            { kop: 'Status', cel: r => <StatusPil waarde={r.pakket.status} /> },
            { kop: 'Code', cel: r => r.eis.code, mono: true },
            { kop: 'Omschrijving', cel: r => r.eis.omschrijving },
            { kop: 'Norm', cel: r => `${r.eis.meetwaarde} ${r.eis.operator} ${r.eis.grenswaarde} ${r.eis.eenheid}`, mono: true },
            { kop: 'Vastgesteld', cel: r => fmt(r.pakket.vastgesteldOp), mono: true },
          ]}
        />
      </Sectie>

      <ActieForm
        key={`eis-${id}`}
        context="beheer"
        titel="Eis vaststellen"
        knop="Stel eis vast"
        bezig={stelEisVast.isPending}
        velden={[
          { naam: 'soort', label: 'Soort pakket', opties: ['Onderhoudseisen', 'Ontwerpeisen'], standaard: 'Onderhoudseisen', hint: 'Vervangt het huidige pakket van deze soort (nieuwe versie)' },
          { naam: 'code', label: 'Code', standaard: '', hint: 'bv. TRIL of SPOOR' },
          { naam: 'omschrijving', label: 'Omschrijving' },
          { naam: 'meetwaarde', label: 'Meetwaarde', hint: 'bv. trilling' },
          { naam: 'operator', label: 'Operator', opties: EIS_OPERATORS, standaard: '<=' },
          { naam: 'grenswaarde', label: 'Grenswaarde', type: 'number' },
          { naam: 'eenheid', label: 'Eenheid', hint: 'bv. mm/s' },
        ]}
        onSubmit={v => stelEisVast.mutate(v)}
      />

      <Sectie titel="Rapportage-beoordelingen">
        <Tabel
          rijen={beoordelingen.data}
          laden={beoordelingen.isLoading}
          fout={beoordelingen.error as Error | null}
          leeg="Nog geen beoordelingen voor dit kunstwerk."
          sleutel={b => b.beoordelingId}
          kolommen={[
            { kop: 'Type rapportage', cel: b => b.rapportageType },
            { kop: 'Resultaat', cel: b => <StatusPil waarde={b.resultaat} /> },
            { kop: 'Bevindingen', cel: b => b.bevindingen.length, uitlijnen: 'rechts', mono: true },
            { kop: 'Ontvangen', cel: b => fmt(b.ontvangenOp), mono: true },
          ]}
        />
      </Sectie>

      {k?.status !== 'BuitenGebruik' && (
        <ActieForm
          key={`buitengebruik-${id}`}
          context="beheer"
          titel="Buiten gebruik stellen"
          knop="Stel buiten gebruik"
          bezig={buitenGebruik.isPending}
          velden={[
            { naam: 'reden', label: 'Reden' },
            { naam: 'datum', label: 'Datum', type: 'date', standaard: dateOnly(0) },
          ]}
          onSubmit={v => buitenGebruik.mutate(v)}
        />
      )}
    </>
  );
}
