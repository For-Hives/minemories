import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAppContext } from '../App';

export function ViewerPage() {
  const { viewerFile, setViewerFile } = useAppContext();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const latestFile = useRef(viewerFile);
  const lastSentFile = useRef<File | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const memoryId = search.get('memory');
  latestFile.current = viewerFile;

  const sendFileToViewer = useCallback(() => {
    if (!latestFile.current || latestFile.current === lastSentFile.current) return;
    frame.current?.contentWindow?.postMessage(
      { type: 'load-glb', file: latestFile.current },
      window.location.origin,
    );
    lastSentFile.current = latestFile.current;
  }, []);

  useEffect(() => {
    if (frameReady && viewerFile) sendFileToViewer();
  }, [frameReady, sendFileToViewer, viewerFile]);

  return (
    <section className="viewer-page">
      <div className="viewer-heading">
        <div>
          <span className="eyebrow-label">EXPLORATION 3D</span>
          <h1>
            {viewerFile?.name ?? (memoryId ? 'Un monde à retrouver.' : 'Un monde à revisiter.')}
          </h1>
        </div>
        <div className="viewer-actions">
          <label className="button button-outline viewer-file-button">
            Choisir un GLB
            <input
              id="local-file-input"
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  setViewerFile(file);
                  navigate('/viewer', { replace: true });
                }
                event.currentTarget.value = '';
              }}
            />
          </label>
          <Link className="button button-dark" to="/gallery">
            Ma galerie <span>↗</span>
          </Link>
        </div>
      </div>
      <div className="viewer-frame-wrap">
        <iframe
          key={memoryId ?? 'local'}
          ref={frame}
          title="Exploration du monde en trois dimensions"
          src={`/viewer.html?embed=1${memoryId ? `&memory=${encodeURIComponent(memoryId)}` : ''}`}
          onLoad={() => {
            lastSentFile.current = null;
            setFrameReady(true);
            sendFileToViewer();
          }}
        />
      </div>
      <p className="viewer-tip">
        <span>⌖</span> Glisser pour orbiter <i /> Molette pour zoomer <i /> Clic droit pour déplacer
      </p>
    </section>
  );
}
