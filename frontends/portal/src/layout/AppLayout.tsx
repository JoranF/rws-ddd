import { NavLink, Outlet } from 'react-router-dom';
import { CONTEXTS, CONTEXT_VOLGORDE, type ContextKey } from '../lib/contexts';
import { useAuth } from '../auth/auth';
import { Matrixbord } from './Matrixbord';

// Navigatie per context. De eigen context van de gebruiker staat bovenaan en is
// bewerkbaar; de andere drie zijn zichtbaar maar alleen-lezen.
const NAV: Record<ContextKey, Array<{ naar: string; label: string; einde?: boolean }>> = {
  beheer: [
    { naar: '/beheer', label: 'Dashboard', einde: true },
    { naar: '/beheer/kunstwerken', label: 'Kunstwerken' },
    { naar: '/beheer/beoordelingen', label: 'Rapportage-beoordelingen' },
  ],
  monitoring: [
    { naar: '/monitoring', label: 'Dashboard', einde: true },
    { naar: '/monitoring/incidenten', label: 'Incidenten' },
    { naar: '/monitoring/metingen', label: 'Metingen' },
    { naar: '/monitoring/sessies', label: 'Sessies' },
    { naar: '/monitoring/rapporten', label: 'Rapporten' },
  ],
  onderhoud: [
    { naar: '/onderhoud', label: 'Dashboard', einde: true },
    { naar: '/onderhoud/storingen', label: 'Storingen' },
    { naar: '/onderhoud/trajecten', label: 'Onderhoudstrajecten' },
  ],
  contract: [
    { naar: '/contract', label: 'Dashboard', einde: true },
    { naar: '/contract/aanbestedingen', label: 'Aanbestedingen' },
    { naar: '/contract/contracten', label: 'Contracten' },
  ],
};

export function AppLayout() {
  const { gebruiker, logout } = useAuth();
  if (!gebruiker) return null; // RequireAuth vangt dit al af

  // Eigen context eerst, daarna de rest in vaste volgorde.
  const volgorde = [gebruiker.context, ...CONTEXT_VOLGORDE.filter(k => k !== gebruiker.context)];

  return (
    <div className="app">
      <aside className="zijbalk">
        <div className="zijbalk__merk">
          <span className="merk__vlak" aria-hidden />
          <div>
            <strong>RWS Infraportaal</strong>
            <small>Rijkswaterstaat — infrastructuurbeheer</small>
          </div>
        </div>

        <nav className="zijbalk__nav" aria-label="Bounded contexts">
          {volgorde.map(key => {
            const ctx = CONTEXTS[key];
            const eigen = key === gebruiker.context;
            return (
              <div key={key} className={`navgroep${eigen ? ' navgroep--eigen' : ''}`}
                   style={{ ['--ctx' as string]: ctx.kleur }}>
                <div className="navgroep__kop">
                  <span className="navgroep__blok" aria-hidden />
                  <span className="navgroep__naam">{ctx.label}</span>
                  <span className="navgroep__tag">{eigen ? 'jouw context' : 'lezen'}</span>
                </div>
                {NAV[key].map(item => (
                  <NavLink key={item.naar} to={item.naar} end={item.einde}
                           className={({ isActive }) => `navlink${isActive ? ' navlink--actief' : ''}`}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <Matrixbord />

        <div className="zijbalk__gebruiker">
          <div className="gebruiker__info">
            <strong>{gebruiker.naam}</strong>
            <small>{gebruiker.rol} · {gebruiker.organisatie}</small>
          </div>
          {/* RequireAuth rendert zelf de redirect naar /login zodra de gebruiker weg is. */}
          <button className="knop knop--stil" type="button" onClick={logout}>
            Uitloggen
          </button>
        </div>
      </aside>

      <main className="inhoud">
        <Outlet />
      </main>
    </div>
  );
}
