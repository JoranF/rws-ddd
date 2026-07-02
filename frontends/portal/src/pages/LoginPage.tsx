import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/auth';
import { CONTEXTS, CONTEXT_VOLGORDE } from '../lib/contexts';

export function LoginPage() {
  const { login, gebruiker, bezig } = useAuth();

  // Al ingelogd? Direct door naar het dashboard van de eigen context.
  if (gebruiker) return <Navigate to={`/${gebruiker.context}`} replace />;

  return (
    <div className="login">
      <section className="login__paneel">
        <span className="login__baan" aria-hidden />
        <div className="login__paneel-inhoud">
          <h1>RWS Infraportaal</h1>
          <p>
            Eén portaal, vier bounded contexts. Elke rol werkt in zijn eigen context;
            de andere contexts zijn zichtbaar maar alleen-lezen.
          </p>
          <ul className="login__contexts">
            {CONTEXT_VOLGORDE.map(key => {
              const ctx = CONTEXTS[key];
              return (
                <li key={key}>
                  <span className="login__blok" style={{ background: ctx.kleur }} aria-hidden />
                  <strong>{ctx.label}</strong> — {ctx.rol.toLowerCase()} · {ctx.taak.toLowerCase()}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="login__formulier">
        <div className="login__aanmelden">
          <h2>Inloggen</h2>
          <p>
            Aanmelden gaat via de RWS-identiteitsprovider (Keycloak). Je context en
            schrijfrechten volgen automatisch uit je toegewezen rol.
          </p>
          <button
            className="knop knop--breed"
            type="button"
            disabled={bezig}
            onClick={() => { void login(); }}
          >
            {bezig ? 'Even geduld…' : 'Inloggen met Keycloak'}
          </button>
        </div>
      </section>
    </div>
  );
}
