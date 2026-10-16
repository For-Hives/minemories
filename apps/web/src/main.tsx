import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './theme.css'
import './pages/installation.css'
import './album.css'
import './pages/auth.css'

const container = document.getElementById('app')
if (!container) throw new Error('Application root not found.')

const initialPath = window.location.pathname.replace(/\/$/, '') || '/'
if (container.dataset.prerendered === 'true' && container.dataset.route === initialPath) hydrateRoot(container, <App />)
else createRoot(container).render(<App />)
