import { createContext, useContext, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { type AuthSession, authClient } from './auth-client';
import { AuthPage } from './pages/AuthPage';
import { GalleryPage } from './pages/GalleryPage';
import { HomePage } from './pages/HomePage';
import { ViewerPage } from './pages/ViewerPage';

interface AppContextValue {
  session: AuthSession | null;
  isPending: boolean;
  refreshSession: () => Promise<void>;
  viewerFile: File | null;
  setViewerFile: (file: File | null) => void;
  notify: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('App context is unavailable.');
  return context;
}

export function App() {
  const { data, isPending, refetch } = authClient.useSession();
  const [viewerFile, setViewerFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const context: AppContextValue = {
    session: data,
    isPending,
    refreshSession: async () => {
      await refetch();
    },
    viewerFile,
    setViewerFile,
    notify: setNotice,
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <AppContext.Provider value={context}>
      <BrowserRouter>
        <Routes>
          <Route element={<SiteLayout notice={notice} />}>
            <Route index element={<HomePage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route element={<RequireSession />}>
              <Route path="/gallery" element={<GalleryPage />} />
            </Route>
            <Route path="/viewer" element={<ViewerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}

function SiteLayout({ notice }: { notice: string }) {
  const { session, isPending, refreshSession, setViewerFile } = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="site-frame">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Minemories, accueil">
          <span className="wordmark-icon">m</span>
          <span>minemories</span>
        </Link>
        <nav className="main-nav" aria-label="Navigation principale">
          <Link to="/">Accueil</Link>
          {session && <Link to="/gallery">Ma galerie</Link>}
        </nav>
        <div className="header-actions">
          <label className="button button-quiet file-picker-button">
            Ouvrir un GLB local <span aria-hidden="true">↗</span>
            <input
              type="file"
              id="global-file-input"
              accept=".glb,model/gltf-binary"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  setViewerFile(file);
                  navigate('/viewer');
                }
                event.currentTarget.value = '';
              }}
            />
          </label>
          {isPending ? (
            <span className="avatar-skeleton" />
          ) : session ? (
            <div className="signed-in-actions">
              <Link className="profile-pill" to="/gallery" title={session.user.email}>
                <span className="profile-avatar">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{session.user.name}</span>
              </Link>
              <button
                className="sign-out-button"
                type="button"
                onClick={async () => {
                  await authClient.signOut();
                  await refreshSession();
                  navigate('/');
                }}
              >
                Quitter
              </button>
            </div>
          ) : (
            <Link className="button button-dark header-login" to="/login">
              Se connecter
            </Link>
          )}
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <Link className="wordmark footer-wordmark" to="/">
          <span className="wordmark-icon">m</span> minemories
        </Link>
        <span>Vos mondes restent les vôtres.</span>
        <span className="footer-local">Non affilié à Mojang ou Microsoft · Ouverture locale</span>
      </footer>
      {notice && (
        <div className="toast-message" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}

function RequireSession() {
  const { session, isPending } = useAppContext();
  const location = useLocation();
  if (isPending) return <div className="route-loading">Chargement de votre espace…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
