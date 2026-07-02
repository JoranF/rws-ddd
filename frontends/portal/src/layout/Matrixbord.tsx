// Het "matrixbord": per service een rijstrooksignaal, zoals boven de snelweg.
// ● groen = dienst open (health 200), ✕ rood = dienst dicht. Ververst elke 10 s.
import { useQuery } from '@tanstack/react-query';
import { checkHealth } from '../lib/api';
import { CONTEXTS, CONTEXT_VOLGORDE } from '../lib/contexts';

export function Matrixbord() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const entries = await Promise.all(
        CONTEXT_VOLGORDE.map(async key => [key, await checkHealth(key)] as const),
      );
      return Object.fromEntries(entries) as Record<string, boolean>;
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="matrixbord" title="Servicestatus — zoals een matrixbord boven de rijstrook">
      <span className="matrixbord__kop">Diensten</span>
      {CONTEXT_VOLGORDE.map(key => {
        const status = data?.[key];
        const klasse = status === undefined ? 'onbekend' : status ? 'open' : 'dicht';
        return (
          <span key={key} className={`matrixbord__baan matrixbord__baan--${klasse}`}>
            <span className="matrixbord__signaal" aria-hidden>{status === false ? '✕' : '●'}</span>
            <span className="matrixbord__naam">{CONTEXTS[key].label}</span>
            <span className="matrixbord__poort">:{CONTEXTS[key].poort}</span>
          </span>
        );
      })}
    </div>
  );
}
