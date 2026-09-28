import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { buttonDark, Eyebrow, useAppContext } from '../App';
import { authClient } from '../auth-client';

const inputField =
  'h-[45px] w-full rounded-[5px] border border-[#d6d8cd] bg-[#fbfaf6] px-[13px] text-xs font-normal text-ink outline-0 placeholder:text-[#a5a89d] focus:border-[#82956b] focus:shadow-[0_0_0_3px_#8b9e6320]';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { session, isPending, refreshSession } = useAppContext();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const creating = mode === 'register';
  const from = (location.state as { from?: string } | null)?.from ?? '/gallery';

  if (isPending)
    return (
      <div className="grid min-h-[55vh] place-items-center text-sm text-muted-ink">Un instant…</div>
    );
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
    <section className="mx-auto my-[46px] mb-[58px] grid min-h-[660px] w-[min(100%-88px,1120px)] grid-cols-[0.92fr_1fr] overflow-hidden rounded-[9px] border border-[#deded4] bg-paper-light shadow-[0_16px_45px_#373c2810] max-tablet:w-[min(100%-48px,760px)] max-phone:mx-auto max-phone:mb-7 max-phone:mt-[13px] max-phone:min-h-0 max-phone:w-[calc(100%-24px)] max-phone:grid-cols-1">
      <div className="relative flex flex-col overflow-hidden bg-[#293d2f] px-[39px] py-9 text-[#f2f2e7] max-phone:min-h-[205px] max-phone:p-[22px]">
        <Link
          className="inline-flex items-center gap-[11px] font-sans text-[19px] font-extrabold tracking-[-1.1px] text-[#f2f2e7] no-underline max-phone:gap-2 max-phone:text-[15px]"
          to="/"
        >
          <span className="grid h-[31px] w-[31px] -rotate-5 place-items-center rounded-[10px_10px_10px_4px] bg-lime font-sans text-[20px] font-extrabold text-forest-dark">
            m
          </span>{' '}
          minemories
        </Link>
        <div className="relative z-[1] my-auto pb-[70px] max-phone:m-[27px_0_0] max-phone:p-0 max-phone:pb-[2px]">
          <Eyebrow tone="text-[#d4e4a1]">UN ENDROIT POUR REVENIR</Eyebrow>
          <blockquote className="mb-[14px] mt-[21px] max-w-[385px] font-sans text-[36px] font-semibold leading-[1.2] tracking-[-1.8px] max-phone:mb-1 max-phone:mt-[10px] max-phone:max-w-[260px] max-phone:text-[23px]">
            « Tu te rappelles la cabane au-dessus du ravin ? »
          </blockquote>
          <span className="text-xs text-[#b5c0b0] max-phone:text-[10px]">
            C’est souvent comme ça que ça commence.
          </span>
        </div>
        <div
          aria-hidden="true"
          className="absolute bottom-[-62px] right-[34px] h-[211px] w-[244px] rotate-[-28deg] opacity-[0.54] max-phone:bottom-[-94px] max-phone:right-[3px] max-phone:origin-bottom-right max-phone:scale-[0.72]"
        >
          <span className="absolute top-0 left-[64px] grid h-[90px] w-[90px] place-items-center border border-[#d8e3bd] bg-[#405944] text-[36px] text-lime shadow-[20px_20px_0_#1c302588]">
            ▧
          </span>
          <i className="absolute bottom-5 left-[7px] h-[74px] w-[37px] border border-[#aab995] bg-[#80926d] not-italic" />
          <i className="absolute bottom-5 left-[54px] h-[106px] w-[37px] border border-[#aab995] bg-[#80926d] not-italic" />
          <i className="absolute bottom-5 left-[102px] h-[60px] w-[37px] border border-[#aab995] bg-[#80926d] not-italic" />
          <b className="absolute bottom-[33px] right-[10px] font-mono text-[9px] font-normal text-[#d9e6ca]">
            SAISON 04
          </b>
        </div>
        <span className="relative z-[1] text-[11px] text-[#bdc5b7] max-phone:hidden">
          Une petite archive des grandes aventures.
        </span>
      </div>
      <div className="grid place-items-center px-[42px] py-[50px] max-phone:px-[21px] max-phone:py-9 max-phone:pb-[33px]">
        <div className="w-[min(100%,380px)]">
          <Eyebrow>{creating ? 'VOTRE HISTOIRE CONTINUE' : 'HEUREUX DE VOUS REVOIR'}</Eyebrow>
          <h1 className="mb-2 mt-[13px] font-sans text-[34px] font-semibold tracking-[-1.6px] max-phone:text-[28px]">
            {creating ? 'Créer un espace' : 'Bienvenue à nouveau.'}
          </h1>
          <p className="m-0 text-[13px] text-[#7d8175]">
            {creating
              ? 'Rassemble tes mondes dans une seule galerie.'
              : 'Retrouve la galerie de vos mondes.'}
          </p>
          <form className="mt-[31px] grid gap-[18px]" onSubmit={submit}>
            {creating && (
              <label className="grid gap-2 text-[11px] font-bold text-[#53584c]">
                Nom affiché
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="Comment tes amis t’appellent ?"
                  className={inputField}
                />
              </label>
            )}
            <label className="grid gap-2 text-[11px] font-bold text-[#53584c]">
              Adresse e-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="toi@exemple.fr"
                className={inputField}
              />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[#53584c]">
              Mot de passe
              <input
                name="password"
                type="password"
                autoComplete={creating ? 'new-password' : 'current-password'}
                minLength={creating ? 12 : undefined}
                required
                placeholder={creating ? '12 caractères minimum' : 'Ton mot de passe'}
                className={inputField}
              />
            </label>
            {error && (
              <p className="m-0 -mt-1 text-xs text-[#a23c30]" role="alert">
                {error}
              </p>
            )}
            <button className={`${buttonDark} mt-[2px] w-full`} type="submit" disabled={busy}>
              {busy ? 'Un instant…' : creating ? 'Créer mon espace' : 'Se connecter'} <span>↗</span>
            </button>
          </form>
          <p className="mb-0 mt-[22px] text-center text-[11px] text-[#777c70]">
            {creating ? 'Tu as déjà un compte ?' : 'Pas encore de compte ?'}{' '}
            <Link
              className="font-bold text-[#557043] underline underline-offset-[3px]"
              to={creating ? '/login' : '/register'}
            >
              {creating ? 'Se connecter' : 'Créer un espace'}
            </Link>
          </p>
          <p className="mb-0 mt-8 text-center text-[11px] text-[#777c70]">
            Tu veux seulement ouvrir un fichier ?{' '}
            <Link
              className="font-bold text-[#557043] underline underline-offset-[3px]"
              to="/viewer"
            >
              Essayer sans compte
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
