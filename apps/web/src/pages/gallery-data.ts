import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { errorMessageKey } from '../i18n/error-messages'
export type Memories = Awaited<ReturnType<typeof apiClient.memories.list>>
export type TrashMemories = Awaited<ReturnType<typeof apiClient.memories.listTrash>>
export type Storage = Awaited<ReturnType<typeof apiClient.account.storage>>
function useStorageStatus() {
	const [storage, setStorage] = useState<Storage | null>(null)
	const [storageError, setStorageError] = useState(false)
	const requestVersion = useRef(0)
	useEffect(
		() => () => {
			requestVersion.current += 1
		},
		[]
	)
	const refreshStorage = useCallback(async () => {
		const version = ++requestVersion.current
		try {
			const result = await apiClient.account.storage()
			if (version !== requestVersion.current) return
			setStorage(result)
			setStorageError(false)
		} catch {
			if (version !== requestVersion.current) return
			setStorage(null)
			setStorageError(true)
		}
	}, [])
	return { storage, storageError, refreshStorage }
}

function useGalleryLists() {
	const [memories, setMemories] = useState<Memories>([])
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [trash, setTrash] = useState<TrashMemories>([])
	const memoriesVersion = useRef(0),
		trashVersion = useRef(0)
	useEffect(
		() => () => {
			memoriesVersion.current += 1
			trashVersion.current += 1
		},
		[]
	)
	const refreshMemories = useCallback(async () => {
		const version = ++memoriesVersion.current
		setLoadError('')
		try {
			const result = await apiClient.memories.list()
			if (version === memoriesVersion.current) setMemories(result)
		} catch (error) {
			if (version === memoriesVersion.current) setLoadError(errorMessageKey(error, 'The gallery is unavailable.'))
		} finally {
			if (version === memoriesVersion.current) setLoading(false)
		}
	}, [])

	const refreshTrash = useCallback(async () => {
		const version = ++trashVersion.current
		try {
			const result = await apiClient.memories.listTrash()
			if (version === trashVersion.current) setTrash(result)
		} catch {
			// The trash section stays empty when its refresh fails; captures remain visible.
		}
	}, [])

	/**
	 * Takes a snapshot deleted for good out of the trash at once. The reload that follows starts a newer trash request, so
	 * an older one answering late cannot bring it back.
	 */
	const dropFromTrash = useCallback((id: string) => {
		setTrash(items => items.filter(item => item.id !== id))
	}, [])

	return { memories, trash, loading, loadError, setLoadError, refreshMemories, refreshTrash, dropFromTrash }
}

export function useLivePage() {
	const active = useRef(true)
	useEffect(() => {
		active.current = true
		return () => {
			active.current = false
		}
	}, [])
	return active
}

function useTrashActions(
	notify: (message: string) => void,
	setLoadError: (message: string) => void,
	refreshAll: () => Promise<void>,
	dropFromTrash: (id: string) => void
) {
	const active = useLivePage()
	// Snapshots being deleted for good: their card shows it at once and its buttons wait while the server erases the
	// file, which can take a few seconds for a large capture.
	const [deleting, setDeleting] = useState<ReadonlySet<string>>(() => new Set())
	function markDeleting(id: string, busy: boolean) {
		setDeleting(current => {
			const next = new Set(current)
			if (busy) next.add(id)
			else next.delete(id)
			return next
		})
	}
	async function trashSnapshot(id: string) {
		try {
			await apiClient.memories.trash({ id })
			if (!active.current) return
			notify('Snapshot moved to trash. It disappears forever after 30 days.')
			await refreshAll()
		} catch (error) {
			if (active.current) setLoadError(errorMessageKey(error, 'Could not trash this snapshot.'))
		}
	}

	async function restoreSnapshot(id: string) {
		try {
			await apiClient.memories.restore({ id })
			if (!active.current) return
			await refreshAll()
		} catch (error) {
			if (active.current) setLoadError(errorMessageKey(error, 'Could not restore this snapshot.'))
		}
	}

	/** Deletes a trashed snapshot for good. The caller has already asked the player (`ConfirmDelete`). */
	async function deleteSnapshot(id: string) {
		markDeleting(id, true)
		try {
			await apiClient.memories.delete({ id })
			if (!active.current) return
			dropFromTrash(id)
			notify('Snapshot deleted forever.')
			// The card is already gone: the lists and the storage figure catch up without holding anything back.
			void refreshAll()
		} catch (error) {
			if (active.current) setLoadError(errorMessageKey(error, 'Could not delete this snapshot.'))
		} finally {
			if (active.current) markDeleting(id, false)
		}
	}

	return { trashSnapshot, restoreSnapshot, deleteSnapshot, deleting }
}

export function useGalleryData(notify: (message: string) => void) {
	const lists = useGalleryLists(),
		storage = useStorageStatus()
	const { refreshMemories, refreshTrash } = lists,
		{ refreshStorage } = storage
	const refreshAll = useCallback(async () => {
		await Promise.all([refreshMemories(), refreshTrash(), refreshStorage()])
	}, [refreshMemories, refreshTrash, refreshStorage])
	useEffect(() => {
		let stopped = false,
			timer = 0
		async function refresh() {
			await refreshAll()
			if (!stopped) timer = window.setTimeout(() => void refresh(), 12000)
		}
		void refresh()
		return () => {
			stopped = true
			window.clearTimeout(timer)
		}
	}, [refreshAll])
	const actions = useTrashActions(notify, lists.setLoadError, refreshAll, lists.dropFromTrash)
	return { ...lists, ...storage, ...actions, refreshAll }
}
