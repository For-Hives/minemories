import type { ServerProfile } from '@minemories/api-contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { getStackName, setStackName } from '../lib/stack-names'

/** Where a server's name was kept in this browser before it lived on the account. */
export const SERVER_NAME = '#server'

/** Sends a name kept only in this browser to the account (unless the account already has one), then forgets it. */
async function migrateLocalName(key: string, byKey: Map<string, ServerProfile>): Promise<void> {
	const local = getStackName(key, SERVER_NAME)
	if (!local) return
	if (!byKey.get(key)?.name) {
		await apiClient.memories.renameServer({ key, name: local })
		byKey.set(key, { key, name: local, cover: byKey.get(key)?.cover ?? null })
	}
	setStackName(key, SERVER_NAME, '')
}

/**
 * The owner's server profiles (name, picture chosen in the viewer), read from the account. A name still kept only in
 * this browser is sent to the account once, then forgotten here, so it follows the owner to every device and shows
 * on their share links. `revision` re-reads the profiles (a gallery refresh, a picture saved elsewhere).
 */
export function useServerProfiles(keys: readonly string[], revision: unknown) {
	const [profiles, setProfiles] = useState<ReadonlyMap<string, ServerProfile>>(new Map())
	const [loaded, setLoaded] = useState(false)
	const keysRef = useRef(keys)
	keysRef.current = keys
	const profilesRef = useRef(profiles)
	profilesRef.current = profiles

	useEffect(() => {
		let active = true
		void revision
		// Started inside a promise: an older API without profiles fails here, not in the render.
		Promise.resolve()
			.then(() => apiClient.memories.serverProfiles())
			.then(async list => {
				const byKey = new Map(list.map(profile => [profile.key, profile]))
				await Promise.all(keysRef.current.map(key => migrateLocalName(key, byKey)))
				if (active) {
					setProfiles(byKey)
					setLoaded(true)
				}
			})
			.catch(() => {
				// Offline or signed out: the gallery keeps the game's names and the newest images.
				if (active) setLoaded(true)
			})
		return () => {
			active = false
		}
	}, [revision])

	/**
	 * Shows the name at once and saves it on the account; an empty one goes back to the game's. When the account
	 * refuses, the previous name comes back and the promise rejects.
	 */
	const rename = useCallback(async (key: string, name: string) => {
		const next = name.trim() || null
		const previous = profilesRef.current.get(key)?.name ?? null
		const put = (value: string | null) =>
			setProfiles(current => {
				const copy = new Map(current)
				copy.set(key, { key, name: value, cover: current.get(key)?.cover ?? null })
				return copy
			})
		put(next)
		try {
			await apiClient.memories.renameServer({ key, name: next })
		} catch (error) {
			put(previous)
			throw error
		}
	}, [])

	return { profiles, loaded, rename }
}
