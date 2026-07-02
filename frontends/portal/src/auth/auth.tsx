// Echte authenticatie via Keycloak (OIDC Authorization Code + PKCE).
// De demo-login (vaste gebruikers + wachtwoord) is vervallen; wie mag schrijven
// volgt nu uit de realm-rollen in het token: realm_access.roles bevat één van
// beheer/monitoring/onderhoud/contract. Dat spiegelt de portalregel
// "eigen context = schrijven, rest read-only".
//
// De publieke API (Gebruiker, useAuth, useKanBewerken, AuthProvider, RequireAuth)
// is bewust gelijk gehouden aan de oude demo-provider, zodat de rest van de app
// (AppLayout, dashboards, LoginPage) ongewijzigd blijft werken.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User } from 'oidc-client-ts';
import { CONTEXTS, CONTEXT_VOLGORDE, type ContextKey } from '../lib/contexts';
import { oidc } from './oidc';

export interface Gebruiker {
  email: string;
  naam: string;
  rol: string;
  organisatie: string;
  context: ContextKey;
  rollen: ContextKey[]; // alle context-rollen uit het token (voor schrijfrechten)
}

// Vorm van de claims die we uit het access-/id-token lezen. Alleen wat we nodig hebben.
interface Claims {
  email?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
}

// Welke van de realm-rollen zijn context-rollen? (andere Keycloak-rollen negeren we)
function contextRollen(roles: string[] | undefined): ContextKey[] {
  const geldig = new Set<string>(CONTEXT_VOLGORDE);
  return (roles ?? []).filter((r): r is ContextKey => geldig.has(r));
}

// Bouw een Gebruiker uit een OIDC-User. De "context" is de eerste context-rol in
// vaste volgorde; bestaat die niet, dan heeft de gebruiker geen eigen context
// (alles read-only). De rol-label komt uit de service-taal (CONTEXTS[...].rol).
function uitToken(user: User): Gebruiker | null {
  const id = (user.profile ?? {}) as Claims;
  // Rollen staan in het access-token (realm_access), niet altijd in het id-token.
  const rollen = contextRollen(leesRealmRoles(user));
  const context = CONTEXT_VOLGORDE.find(k => rollen.includes(k)) ?? null;

  const volledigeNaam = [id.given_name, id.family_name].filter(Boolean).join(' ').trim();
  const naam = id.name || volledigeNaam || id.preferred_username || id.email || 'Gebruiker';
  const email = id.email ?? id.preferred_username ?? '';

  if (!context) {
    // Geldig ingelogd maar zonder context-rol: mag overal lezen, nergens schrijven.
    return { email, naam, rol: 'Gebruiker', organisatie: 'Rijkswaterstaat', context: CONTEXT_VOLGORDE[0], rollen };
  }
  return {
    email,
    naam,
    rol: CONTEXTS[context].rol,
    organisatie: 'Rijkswaterstaat',
    context,
    rollen,
  };
}

// Decodeer het JWT-payload om realm_access.roles te lezen. De rollen zitten in het
// access-token (Keycloak zet realm_access daar), niet in user.profile (id-token).
function leesRealmRoles(user: User): string[] | undefined {
  try {
    const payload = user.access_token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return (json as Claims).realm_access?.roles;
  } catch {
    return undefined;
  }
}

interface AuthApi {
  gebruiker: Gebruiker | null;
  bezig: boolean;                 // true zolang de sessie nog geladen wordt
  login: () => Promise<void>;     // start de redirect naar Keycloak
  logout: () => Promise<void>;    // logt uit bij Keycloak
}

const Ctx = createContext<AuthApi>({
  gebruiker: null,
  bezig: true,
  login: async () => {},
  logout: async () => {},
});
export const useAuth = () => useContext(Ctx);

// Mag de ingelogde gebruiker in deze context schrijven? true als de context-rol
// in realm_access.roles zit. (eigen context = schrijven, rest read-only)
export function useKanBewerken(context: ContextKey): boolean {
  const { gebruiker } = useAuth();
  return gebruiker?.rollen.includes(context) ?? false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(null);
  const [bezig, setBezig] = useState(true);

  useEffect(() => {
    let levend = true;
    const toepassen = (user: User | null) => {
      if (!levend) return;
      setGebruiker(user && !user.expired ? uitToken(user) : null);
    };

    // Bestaande sessie oppikken bij het laden (o.a. na een harde refresh).
    oidc.getUser()
      .then(toepassen)
      .catch(() => toepassen(null))
      .finally(() => { if (levend) setBezig(false); });

    // Blijf synchroon met token-vernieuwing en uitloggen in andere tabs.
    const onLoaded = (user: User) => toepassen(user);
    const onUnloaded = () => toepassen(null);
    oidc.events.addUserLoaded(onLoaded);
    oidc.events.addUserUnloaded(onUnloaded);
    oidc.events.addAccessTokenExpired(onUnloaded);

    return () => {
      levend = false;
      oidc.events.removeUserLoaded(onLoaded);
      oidc.events.removeUserUnloaded(onUnloaded);
      oidc.events.removeAccessTokenExpired(onUnloaded);
    };
  }, []);

  const login = useCallback(async () => {
    // Onthoud waar de gebruiker heen wilde; de callback navigeert daar terug.
    await oidc.signinRedirect({ state: { van: window.location.pathname + window.location.search } });
  }, []);

  const logout = useCallback(async () => {
    await oidc.signoutRedirect();
  }, []);

  return <Ctx.Provider value={{ gebruiker, bezig, login, logout }}>{children}</Ctx.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { gebruiker, bezig } = useAuth();
  const location = useLocation();
  // Wacht tot de sessie geladen is, anders flitst /login even bij een refresh.
  if (bezig) return <div className="laden">Sessie laden…</div>;
  if (!gebruiker) return <Navigate to="/login" replace state={{ van: location.pathname }} />;
  return <>{children}</>;
}
