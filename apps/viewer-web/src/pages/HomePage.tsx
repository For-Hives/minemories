import { Link } from 'react-router';
import { useAppContext } from '../App';

export function HomePage() {
  const { session } = useAppContext();

  return (
    <div className="landing-page">
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow-label">
            <span /> LE TEMPS PASSE. VOS MONDES RESTENT.
          </span>
          <h1>
            Les mondes
            <br />
            qu’on a <em>faits ensemble.</em>
          </h1>
          <p className="hero-description">
            Gardez une trace des lieux, des constructions et des aventures partagées. Revisitez-les
            en 3D, sans relancer le serveur ni retrouver le bon modpack.
          </p>
          <div className="hero-actions">
            <Link className="button button-lime" to={session ? '/gallery' : '/register'}>
              {session ? 'Retrouver mes mondes' : 'Créer mon espace'}{' '}
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button button-outline" to="/viewer">
              Explorer un fichier local
            </Link>
          </div>
          <div className="hero-proof">
            <span className="avatar-stack">
              <i>J</i>
              <i>M</i>
              <i>A</i>
            </span>
            <span>Un lien à partager. Un monde à retrouver.</span>
          </div>
        </div>
        <MemoryArtwork />
        <span className="hero-index">01 — UNE PLACE POUR VOS MONDES</span>
      </section>

      <section className="story-section">
        <div className="section-heading">
          <span className="eyebrow-label">APRÈS LA DERNIÈRE CONNEXION</span>
          <h2>
            La sauvegarde existe.
            <br />
            <em>Le souvenir aussi.</em>
          </h2>
        </div>
        <div className="story-copy">
          <p>
            Un serveur ferme, les versions changent, et le dossier du monde finit oublié quelque
            part.
          </p>
          <p>
            Minemories en garde une version légère et explorable. Le fichier original reste sur ton
            ordinateur; tes captures peuvent aussi être retrouvées dans ta galerie privée.
          </p>
        </div>
      </section>

      <section className="steps-section" aria-label="Comment ça marche">
        <div className="step-card">
          <span className="step-number">01</span>
          <span className="step-icon">⌂</span>
          <h3>Capture ton coin</h3>
          <p>Choisis une zone depuis Minecraft ou ouvre un fichier GLB de ton ordinateur.</p>
        </div>
        <div className="step-card">
          <span className="step-number">02</span>
          <span className="step-icon">◌</span>
          <h3>Revisite-le</h3>
          <p>Fais le tour de la construction dans le navigateur, comme si tu y retournais.</p>
        </div>
        <div className="step-card">
          <span className="step-number">03</span>
          <span className="step-icon">↗</span>
          <h3>Montre-le aux autres</h3>
          <p>Retrouve tes captures dans un espace personnel et partage-les avec tes amis.</p>
        </div>
      </section>

      <section className="closing-banner">
        <div>
          <span className="eyebrow-label">LE PROCHAIN MONDE PEUT RESTER</span>
          <h2>
            À la prochaine
            <br />
            saison.
          </h2>
        </div>
        <Link className="button button-lime" to={session ? '/gallery' : '/register'}>
          Garder mon premier souvenir <span>↗</span>
        </Link>
        <span className="banner-spark">✳</span>
      </section>
    </div>
  );
}

function MemoryArtwork() {
  return (
    <div
      className="memory-artwork"
      role="img"
      aria-label="Illustration isométrique d’un monde en blocs"
    >
      <div className="art-topline">
        <span>ARCHIVE N° 008</span>
        <span>SAISON D’ÉTÉ · 2024</span>
      </div>
      <div className="art-sun" />
      <div className="pixel-scene">
        <svg
          viewBox="0 0 560 430"
          role="img"
          aria-label="Maison au bord d’une rivière, entourée d’arbres"
        >
          <defs>
            <linearGradient id="artSky" x2="0" y2="1">
              <stop stopColor="#9bc9bf" />
              <stop offset="1" stopColor="#d7dbb8" />
            </linearGradient>
            <linearGradient id="artWater" x2="0" y2="1">
              <stop stopColor="#65aeb1" />
              <stop offset="1" stopColor="#397b80" />
            </linearGradient>
          </defs>
          <path fill="url(#artSky)" d="M25 42h510v288H25z" />
          <path fill="#6f9677" d="M25 258h510v72H25z" />
          <path fill="#7fac80" d="m25 248 72-37 78 28 78-62 62 26 70-51 75 26 75-43v139H25z" />
          <path fill="url(#artWater)" d="m25 285 124-20 88 26 82-13 88 28 128-18v62H25z" />
          <path
            fill="#dfd2a8"
            d="m66 302 65-7 43 20-68 9zM260 308l48-5 43 13-52 8zM438 293l47-7 34 8-47 9z"
          />
          <path fill="#644e3d" d="M187 182h145v109H187z" />
          <path fill="#b18c5c" d="m170 183 88-63 92 63-18 18-74-51-71 50z" />
          <path fill="#6d3d36" d="m250 129 9-9 91 63-17 16z" />
          <path fill="#d2b77e" d="M204 197h50v94h-50z" />
          <path fill="#a36f4c" d="M268 197h49v94h-49z" />
          <path fill="#a6d0c1" d="M214 207h28v26h-28zM277 207h27v26h-27z" />
          <path fill="#39473a" d="M263 244h20v47h-20z" />
          <path fill="#705843" d="M99 193h12v74H99zM384 168h13v89h-13zM448 208h12v64h-12z" />
          <path
            fill="#527957"
            d="m65 197 39-73 42 73-16 7 21 31H53l24-31zM353 171l38-76 44 76-17 8 24 37h-99l23-37zM420 211l34-59 39 59-12 7 18 29h-88l20-29z"
          />
          <path fill="#78976a" d="m84 194 20-40 23 40zM372 168l19-43 24 43zM438 209l16-31 20 31z" />
          <path fill="#b5aa79" d="M326 278h41v12h-41zM343 263h39v13h-39zM358 247h38v13h-38z" />
          <path
            fill="#e2d5a7"
            d="M47 266h13v13H47zM149 245h12v12h-12zM403 260h12v12h-12zM476 239h12v12h-12z"
          />
        </svg>
      </div>
      <div className="art-caption">
        <span className="art-cube">▧</span>
        <span>
          <b>Notre première base</b>
          <small>Par Léo, Sarah et 4 autres</small>
        </span>
        <span className="art-play">▶</span>
      </div>
      <div className="art-stamp">
        FAIT ENSEMBLE
        <br />
        <b>GARDÉ POUR TOUJOURS</b>
      </div>
    </div>
  );
}
