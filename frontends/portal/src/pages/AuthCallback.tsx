// Vangt de redirect van Keycloak op (?code=...&state=...), wisselt de code in voor
// tokens en navigeert daarna terug naar de pagina waar de gebruiker vandaan kwam.
// Deze route is publiek (staat buiten RequireAuth) — anders zou RequireAuth de
// callback naar /login sturen voordat de code verwerkt is.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { oidc } from '../auth/oidc';

export function AuthCallback() {
  const navigate = useNavigate();
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let levend = true;
    oidc.signinRedirectCallback()
      .then(user => {
        if (!levend) return;
        // We bewaarden de oorspronkelijke pagina in state.van; val terug op de start.
        const van = (user.state as { van?: string } | undefined)?.van;
        navigate(van && van !== '/login' && van !== '/auth/callback' ? van : '/', { replace: true });
      })
      .catch(e => {
        if (levend) setFout((e as Error).message || 'Inloggen mislukt.');
      });
    return () => { levend = false; };
  }, [navigate]);

  if (fout) {
    return (
      <div className="laden">
        <p role="alert">Inloggen mislukt: {fout}</p>
        <button className="knop" type="button" onClick={() => navigate('/login', { replace: true })}>
          Terug naar inloggen
        </button>
      </div>
    );
  }
  return <div className="laden">Bezig met inloggen…</div>;
}
