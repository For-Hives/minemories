import { createContext, useContext } from 'react'
import type { AuthSession } from './auth-client'

export interface AppContextValue {
	session: AuthSession | null
	isPending: boolean
	refreshSession: () => Promise<void>
	viewerFile: File | null
	setViewerFile: (file: File | null) => void
	notify: (message: string) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext() {
	const context = useContext(AppContext)
	if (!context) throw new Error('App context is unavailable.')
	return context
}
