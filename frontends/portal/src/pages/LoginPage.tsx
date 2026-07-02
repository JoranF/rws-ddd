import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { DEMO_WACHTWOORD, GEBRUIKERS, useAuth } from '../auth/auth';
import { CONTEXTS } from '../lib/contexts';

export function LoginPage() {
  const { login, gebruiker } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [fout, setFout] = useState<string | null>(null);

  if (gebruiker) return <Navigate to={`/${gebruiker.context}`} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const resultaat = login(email, wachtwoord);
    if (resultaat) { setFout(resultaat); return; }
    const ingelogd = GEBRUIKERS.find(g => g.email === email.trim().toLowerCase());
    navigate(`/${ingelogd?.context ?? 'beheer'}`, { replace: true });
  };

  const vulIn = (mail: string) => {
    setEmail(mail);
    setWachtwoord(DEMO_WACHTWOORD);
    setFout(null);
  };

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
            {GEBRUIKERS.map(g => (
              <li key={g.email}>
                <span className="login__blok" style={{ background: CONTEXTS[g.context].kleur }} aria-hidden />
                <strong>{CONTEXTS[g.context].label}</strong> — {g.rol.toLowerCase()} · {CONTEXTS[g.context].taak.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="login__formulier">
        <form onSubmit={submit}>
          <h2>Inloggen</h2>
          <label className="veld">
            <span>E-mailadres</span>
            <input type="email" autoComplete="username" value={email}
                   onChange={e => { setEmail(e.target.value); setFout(null); }} required />
          </label>
          <label className="veld">
            <span>Wachtwoord</span>
            <input type="password" autoComplete="current-password" value={wachtwoord}
                   onChange={e => { setWachtwoord(e.target.value); setFout(null); }} required />
          </label>
          {fout && <p className="login__fout" role="alert">{fout}</p>}
          <button className="knop knop--breed" type="submit">Inloggen</button>

          <div className="login__demo">
            <span>Demo-gebruikers (klik om in te vullen, wachtwoord: <code>{DEMO_WACHTWOORD}</code>)</span>
            <div className="login__chips">
              {GEBRUIKERS.map(g => (
                <button key={g.email} type="button" className="chip" onClick={() => vulIn(g.email)}>
                  {g.email}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
