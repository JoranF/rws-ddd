import { useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Pollt een async fetcher op een interval. Geen mockdata: bij fout wordt error
// gezet en blijft de laatst bekende data staan (of null), nooit nepdata.
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetcherRef.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (e) {
        if (alive) setState(s => ({ data: s.data, error: (e as Error).message, loading: false }));
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}

// Onthoudt welke rij-id's nieuw zijn sinds vorige poll → voor flash-highlight.
export function useNewRows<T>(rows: T[] | null, keyOf: (row: T) => string): Set<string> {
  const seen = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!rows) return;
    const keys = rows.map(keyOf);
    if (firstRun.current) {
      firstRun.current = false;
      seen.current = new Set(keys);
      return;
    }
    const added = keys.filter(k => !seen.current.has(k));
    keys.forEach(k => seen.current.add(k));
    if (added.length) {
      setFresh(new Set(added));
      const id = setTimeout(() => setFresh(new Set()), 2500);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return fresh;
}
