import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAppContext } from '../App';
import { authClient } from '../auth-client';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { session, isPending, refreshSession } = useAppContext();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const creating = mode === 'register';
  const from = (location.state as { from?: string } | null)?.from ?? '/gallery';

  if (isPending) return <div className="route-loading">Un instant…</div>;
  if (session) return <Navigate to="/gallery" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    try {
      const result = creating
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get('name') ?? '').trim(),
          })
        : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      await refreshSession();
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-aside">
        <Link className="wordmark auth-wordmark" to="/">
          <span className="wordmark-icon">m</span> minemories
        </Link>
        <div className="auth-quote">
          <span className="eyebrow-label">UN ENDROIT POUR REVENIR</span>
          <blockquote>« Tu te rappelles la cabane au-dessus du ravin ? »</blockquote>
          <span className="quote-caption">C’est souvent comme ça que ça commence.</span>
        </div>
        <div className="auth-aside-art">
          <span>▧</span>
          <i />
          <i />
          <i />
          <b>SAISON 04</b>
        </div>
        <span className="aside-note">Une petite archive des grandes aventures.</span>
      </div>
      <div className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow-label">
            {creating ? 'VOTRE HISTOIRE CONTINUE' : 'HEUREUX DE VOUS REVOIR'}
          </span>
          <h1>{creating ? 'Créer un espace' : 'Bienvenue à nouveau.'}</h1>
          <p>
            {creating
              ? 'Rassemble tes mondes dans une seule galerie.'
              : 'Retrouve la galerie de vos mondes.'}
          </p>
          <form className="auth-form" onSubmit={submit}>
            {creating && (
              <label>
                Nom affiché
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="Comment tes amis t’appellent ?"
                />
              </label>
            )}
            <label>
              Adresse e-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="toi@exemple.fr"
              />
            </label>
            <label>
              Mot de passe
              <input
                name="password"
                type="password"
                autoComplete={creating ? 'new-password' : 'current-password'}
                minLength={creating ? 12 : undefined}
                required
                placeholder={creating ? '12 caractères minimum' : 'Ton mot de passe'}
              />
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button-dark auth-submit" type="submit" disabled={busy}>
              {busy ? 'Un instant…' : creating ? 'Créer mon espace' : 'Se connecter'} <span>↗</span>
            </button>
          </form>
          <p className="auth-switch">
            {creating ? 'Tu as déjà un compte ?' : 'Pas encore de compte ?'}{' '}
            <Link to={creating ? '/login' : '/register'}>
              {creating ? 'Se connecter' : 'Créer un espace'}
            </Link>
          </p>
          <p className="auth-local">
            Tu veux seulement ouvrir un fichier ? <Link to="/viewer">Essayer sans compte</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
