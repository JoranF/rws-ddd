import { useEffect, useState } from 'react';
import { checkHealth, SERVICES, type Service } from '../lib/api';

const ORDER: Service[] = ['beheer', 'monitoring', 'onderhoud', 'contract'];

export function HealthBar() {
  const [health, setHealth] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const entries = await Promise.all(
        ORDER.map(async s => [s, await checkHealth(s)] as const),
      );
      if (alive) setHealth(Object.fromEntries(entries));
    };
    tick();
    const id = setInterval(tick, 5000); // elke 5 s
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="health-bar">
      {ORDER.map(s => {
        const ok = health[s];
        const cls = ok == null ? 'health--unknown' : ok ? 'health--up' : 'health--down';
        return (
          <div key={s} className={`health ${cls}`}>
            <span className="health__dot" />
            <span className="health__name">{SERVICES[s].label}</span>
            <span className="health__port">:{SERVICES[s].port}</span>
            <span className="health__state">{ok == null ? '…' : ok ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        );
      })}
    </div>
  );
}
