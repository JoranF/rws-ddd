// Demo-login, alleen frontend. Vier vaste gebruikers — één per bounded context.
// Bewust GEEN beveiliging op service-niveau: dit is een rollenmodel voor het
// DDD-verhaal (wie mag waar schrijven), geen security-feature.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ContextKey } from '../lib/contexts';

export interface Gebruiker {
  email: string;
  naam: string;
  rol: string;
  organisatie: string;
  context: ContextKey;
}

export const DEMO_WACHTWOORD = 'rws-demo';

export const GEBRUIKERS: Gebruiker[] = [
  { email: 'anna@rws.nl', naam: 'Anna van Dijk',  rol: 'Beheerder',         organisatie: 'Rijkswaterstaat', context: 'beheer' },
  { email: 'mark@rws.nl', naam: 'Mark Jansen',    rol: 'Monitoringanalist', organisatie: 'Rijkswaterstaat', context: 'monitoring' },
  { email: 'kees@bam.nl', naam: 'Kees Bakker',    rol: 'Aannemer',          organisatie: 'BAM Infra',       context: 'onderhoud' },
  { email: 'lisa@rws.nl', naam: 'Lisa de Vries',  rol: 'Contractmanager',   organisatie: 'Rijkswaterstaat', context: 'contract' },
];

const OPSLAG_SLEUTEL = 'portal.gebruiker';

function bewaard(): Gebruiker | null {
  try {
    const raw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string };
    return GEBRUIKERS.find(g => g.email === parsed.email) ?? null;
  } catch {
    return null;
  }
}

interface AuthApi {
  gebruiker: Gebruiker | null;
  login: (email: string, wachtwoord: string) => string | null; // null = ok, anders foutmelding
  logout: () => void;
}

const Ctx = createContext<AuthApi>({ gebruiker: null, login: () => 'niet geladen', logout: () => {} });
export const useAuth = () => useContext(Ctx);

// Mag de ingelogde gebruiker in deze context schrijven? (eigen context = ja, rest read-only)
export function useKanBewerken(context: ContextKey): boolean {
  const { gebruiker } = useAuth();
  return gebruiker?.context === context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(bewaard);

  const login = useCallback((email: string, wachtwoord: string): string | null => {
    const kandidaat = GEBRUIKERS.find(g => g.email === email.trim().toLowerCase());
    if (!kandidaat) return 'Onbekend e-mailadres. Kies een van de demo-gebruikers.';
    if (wachtwoord !== DEMO_WACHTWOORD) return `Onjuist wachtwoord. Het demo-wachtwoord is "${DEMO_WACHTWOORD}".`;
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify({ email: kandidaat.email }));
    setGebruiker(kandidaat);
    return null;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(OPSLAG_SLEUTEL);
    setGebruiker(null);
  }, []);

  return <Ctx.Provider value={{ gebruiker, login, logout }}>{children}</Ctx.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { gebruiker } = useAuth();
  const location = useLocation();
  if (!gebruiker) return <Navigate to="/login" replace state={{ van: location.pathname }} />;
  return <>{children}</>;
}
