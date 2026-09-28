import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAppContext } from '../App';
import { apiClient } from '../api-client';
import { formatFileSize } from '../lib/glb';

type Memories = Awaited<ReturnType<typeof apiClient.memories.list>>;
type PairingStatus = 'idle' | 'pending' | 'paired' | 'expired' | 'error';

export function GalleryPage() {
  const { session, notify, setViewerFile } = useAppContext();
  const navigate = useNavigate();
  const [memories, setMemories] = useState<Memories>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [pairStatus, setPairStatus] = useState<PairingStatus>('idle');
  const [pairExpires, setPairExpires] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [openingId, setOpeningId] = useState('');

  const refreshMemories = useCallback(async () => {
    setLoadError('');
    try {
      setMemories(await apiClient.memories.list());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'La galerie est indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMemories();
    const refreshTimer = window.setInterval(() => void refreshMemories(), 12_000);
    return () => window.clearInterval(refreshTimer);
  }, [refreshMemories]);

  useEffect(() => {
    if (!pairCode || pairStatus !== 'pending') return;
    let timer = 0;
    let stopped = false;
    const poll = async () => {
      try {
        const result = await apiClient.pairing.check({ code: pairCode });
        if (stopped) return;
        if (result.status === 'paired') {
          setPairStatus('paired');
          notify('Le mod est lié à ton compte. Tu peux envoyer une capture depuis Minecraft.');
          return;
        }
        if (result.status === 'expired') {
          setPairStatus('expired');
          return;
        }
      } catch {
        if (!stopped) setPairStatus('error');
        return;
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), 1600);
    };
    timer = window.setTimeout(() => void poll(), 1100);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [pairCode, pairStatus, notify]);

  async function createPairing() {
    setPairBusy(true);
    setPairStatus('idle');
    setPairCode('');
    try {
      const pairing = await apiClient.pairing.create();
      setPairCode(pairing.code);
      setPairExpires(
        new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
      setPairStatus('pending');
    } catch (error) {
      setPairStatus('error');
      setLoadError(error instanceof Error ? error.message : 'Impossible de créer le code.');
    } finally {
      setPairBusy(false);
    }
  }

  function openMemory(id: string) {
    setOpeningId(id);
    setLoadError('');
    setViewerFile(null);
    navigate(`/viewer?memory=${encodeURIComponent(id)}`);
    setOpeningId('');
  }

  async function copyCode() {
    await navigator.clipboard.writeText(pairCode);
    notify('Code copié dans le presse-papiers.');
  }

  return (
    <div className="gallery-page">
      <div className="gallery-heading">
        <div>
          <span className="eyebrow-label">L’ALBUM DU SERVEUR</span>
          <h1>
            La galerie de <em>{session?.user.name.split(' ')[0] ?? 'tes mondes'}.</em>
          </h1>
          <p>Chaque capture garde une place ici, prête à être revisitée.</p>
        </div>
        <Link className="button button-dark" to="/viewer">
          Ouvrir un GLB local <span>↗</span>
        </Link>
      </div>

      <section
        className={`pairing-card ${pairStatus === 'paired' ? 'is-paired' : ''}`}
        aria-live="polite"
      >
        <div className="pairing-card-icon">{pairStatus === 'paired' ? '✓' : '⌘'}</div>
        <div className="pairing-card-copy">
          <span className="eyebrow-label">
            {pairStatus === 'paired' ? 'C’EST LIÉ' : 'CAPTURE DEPUIS LE SERVEUR'}
          </span>
          <h2>
            {pairStatus === 'paired' ? 'Ton mod est appairé.' : 'Relie Minecraft à ta galerie.'}
          </h2>
          <p>
            {pairStatus === 'paired'
              ? 'Lance /memorypoc upload après une capture. La galerie se met à jour automatiquement.'
              : 'Un code temporaire relie ton profil au client de jeu. Une seule fois, et c’est prêt.'}
          </p>
          {pairStatus === 'pending' && (
            <div className="pairing-live">
              <span className="pulse-dot" /> En attente de Minecraft…
            </div>
          )}
          {pairStatus === 'expired' && (
            <div className="pairing-live pairing-warning">
              Ce code a expiré. Génère-en un nouveau.
            </div>
          )}
          {pairStatus === 'error' && (
            <div className="pairing-live pairing-warning">
              La vérification a échoué. Vérifie que l’API tourne.
            </div>
          )}
        </div>
        {pairStatus === 'pending' ? (
          <div className="pair-code-block">
            <span>CODE À SAISIR DANS LE JEU</span>
            <button type="button" onClick={copyCode} aria-label="Copier le code d’appairage">
              {pairCode.slice(0, 3)} {pairCode.slice(3)}
            </button>
            <small>Expire à {pairExpires}</small>
          </div>
        ) : pairStatus === 'paired' ? (
          <span className="paired-badge">
            <i /> Client lié
          </span>
        ) : (
          <button
            className="button button-lime pairing-action"
            type="button"
            onClick={() => void createPairing()}
            disabled={pairBusy}
          >
            {pairBusy ? 'Création…' : 'Lier mon serveur'} <span>↗</span>
          </button>
        )}
      </section>

      <section className="memories-section">
        <div className="memories-title">
          <div>
            <span className="eyebrow-label">VOS CAPTURES</span>
            <h2>À revisiter</h2>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={() => void refreshMemories()}
            title="Actualiser la galerie"
          >
            ↻ Actualiser
          </button>
        </div>
        {loadError && (
          <div className="gallery-error" role="alert">
            {loadError}
          </div>
        )}
        {loading ? (
          <div className="gallery-empty">
            <span className="loading-orbit" />
            <p>On rassemble tes souvenirs…</p>
          </div>
        ) : memories.length ? (
          <div className="memory-grid">
            {memories.map((memory, index) => (
              <article className="memory-card" key={memory.id}>
                <div className={`memory-card-art art-tone-${index % 4}`}>
                  <MemoryTile variant={index % 4} />
                  <span className="memory-kind">CAPTURE 3D</span>
                  <span className="memory-order">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="memory-card-info">
                  <div>
                    <h3>{memory.name}</h3>
                    <p>
                      {new Date(memory.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}{' '}
                      <i /> {formatFileSize(memory.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openMemory(memory.id)}
                    disabled={openingId === memory.id}
                    aria-label={`Revisiter ${memory.name}`}
                  >
                    {openingId === memory.id ? '…' : '↗'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="gallery-empty empty-library">
            <span className="empty-icon">▧</span>
            <h3>Le premier souvenir attend son heure.</h3>
            <p>
              Relie ton mod pour envoyer une capture, ou ouvre un fichier GLB depuis ton appareil.
            </p>
            <div>
              <button
                className="button button-outline"
                type="button"
                onClick={() => document.getElementById('global-file-input')?.click()}
              >
                Choisir un fichier local
              </button>
              <button
                className="button button-dark"
                type="button"
                onClick={() => void createPairing()}
              >
                Lier mon serveur
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MemoryTile({ variant }: { variant: number }) {
  return (
    <div className={`memory-tile tile-${variant}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <b />
    </div>
  );
}
