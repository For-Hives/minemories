import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './theme.css'
import './pages/installation.css'
import './album.css'
import './pages/auth.css'
// La charte de la landing, sur toutes les pages : jetons, puis le kit du jeu (polices, couleurs, boutons, panneaux), puis l'habillage des pages de l'app.
import './hero/tokens.css'
import './hero/kit.css'
import './charter-app.css'

const container = document.getElementById('app')
if (!container) throw new Error('Application root not found.')

const initialPath = window.location.pathname.replace(/\/$/, '') || '/'
if (container.dataset.prerendered === 'true' && container.dataset.route === initialPath) hydrateRoot(container, <App />)
else createRoot(container).render(<App />)
