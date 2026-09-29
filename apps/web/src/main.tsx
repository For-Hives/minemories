import { createRoot } from 'react-dom/client'
import { App } from './App'
import './theme.css'

const container = document.getElementById('app')
if (!container) throw new Error('Application root not found.')

createRoot(container).render(<App />)
