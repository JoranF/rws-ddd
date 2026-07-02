// OIDC-client (Keycloak). Dit is de infrastructuur-laag van de authenticatie:
// hier leeft de UserManager en de token-toegang. Bedrijfsregels (welke context,
// wie mag schrijven) staan NIET hier maar worden in auth.tsx uit het token afgeleid.
//
// Flow: Authorization Code + PKCE (PKCE is default in oidc-client-ts v3).
// Tokens staan in localStorage zodat een harde refresh de sessie behoudt; silent
// renew houdt het access-token vers via een verborgen iframe.

import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

// Eén realm, één client. Redirect-URI's zijn afgeleid van de origin zodat dezelfde
// build lokaal (Vite) en in productie (nginx) werkt zonder herconfiguratie.
export const oidc = new UserManager({
  authority: 'https://keycloak.joranit.com/realms/rws',
  client_id: 'rws-portal',
  redirect_uri: window.location.origin + '/auth/callback',
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  // Sessie in localStorage: overleeft een harde refresh (sessionStorage niet).
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});

// Het huidige access-token, of null als er geen (geldige) sessie is. De api-client
// gebruikt dit om de Authorization-header te zetten.
let huidigToken: string | null = null;

export function accessToken(): string | null {
  return huidigToken;
}

// Houd het cache-token in sync met de UserManager-events, zodat de api-client
// altijd het meest verse token pakt zonder async-lookup per request.
function onthoudToken(user: User | null) {
  huidigToken = user && !user.expired ? user.access_token : null;
}

oidc.events.addUserLoaded(onthoudToken);
oidc.events.addUserUnloaded(() => { huidigToken = null; });
oidc.events.addSilentRenewError(() => { huidigToken = null; });
oidc.events.addAccessTokenExpired(() => { huidigToken = null; });

// Bij het laden van de app het reeds bewaarde token oppikken (harde refresh).
oidc.getUser().then(onthoudToken).catch(() => { huidigToken = null; });
