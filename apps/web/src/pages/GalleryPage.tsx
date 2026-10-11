import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { buttonDark, buttonLime, buttonOutline, Eyebrow, useAppContext } from '../App'
import { apiClient } from '../api-client'
import { formatRelativeDate } from '../lib/dates'
import { type CaptureStack, groupCaptures, stackCaptures } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { shouldShowPaired } from '../lib/pairing'
import { getStackName, setStackName } from '../lib/stack-names'
import { daysUntilPurge } from '../lib/trash'

type Memories = Awaited<ReturnType<typeof apiClient.memories.list>>
type TrashMemories = Awaited<ReturnType<typeof apiClient.memories.listTrash>>
type Storage = Awaited<ReturnType<typeof apiClient.account.storage>>
type MemoryMetadata = Memories[number]['metadata']
type PairingStatus = 'idle' | 'pending' | 'paired' | 'expired' | 'error'

function StorageSummary({ storage, failed }: { storage: Storage | null; failed: boolean }) {
	if (!storage) {
		return (
			<p aria-live="polite">
				{failed
					? 'Storage information is unavailable. Your captures remain accessible.'
					: 'Checking available storage…'}
			</p>
		)
	}
	return (
		<section aria-label="Gallery storage" aria-live="polite" className="my-4 text-xs">
			<p>
				{formatFileSize(storage.availableBytes)} available of {formatFileSize(storage.limitBytes)} ·{' '}
				{formatFileSize(storage.usedBytes)} used or reserved.
			</p>
			{storage.availableBytes === 0 && (
				<p>Your gallery has no space available. Refused uploads keep their local GLB file on your computer.</p>
			)}
			<p>To free space, use Delete forever in Trash. Moving a capture to Trash keeps its space used.</p>
			{storage.pendingDeletionBytes > 0 && (
				<p>
					Deletion is still in progress for {formatFileSize(storage.pendingDeletionBytes)}. That space becomes available
					when deletion finishes.
				</p>
			)}
			{storage.reservedBytes > 0 && (
				<p>
					Uploads are reserving {formatFileSize(storage.reservedBytes)} until they finish or their cleanup completes.
				</p>
			)}
		</section>
	)
}

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

function CaptureMetadata({ metadata }: { metadata: MemoryMetadata }) {
	return (
		<>
			{metadata.biome && <p className="mb-0 mt-1 text-[9px] text-[#b4c1ad]">{metadata.biome.replaceAll('_', ' ')}</p>}
			{metadata.dimension && (
				<p className="mb-0 mt-1 max-w-[230px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[#b4c1ad]">
					{metadata.dimension}
				</p>
			)}
			{metadata.seed && <p className="mb-0 mt-1 break-all text-[9px] text-[#b4c1ad]">Seed {metadata.seed}</p>}
			{metadata.dayTime !== null || metadata.raining || metadata.thundering ? (
				<p className="mb-0 mt-1 text-[9px] text-[#b4c1ad]">
					{metadata.dayTime !== null && `World time ${metadata.dayTime}`}
					{metadata.raining && ' · Rain'}
					{metadata.thundering && ' · Thunder'}
				</p>
			) : null}
		</>
	)
}

const artTones = ['bg-[#1c2720]', 'bg-[#202b23]', 'bg-[#1a231f]', 'bg-[#232d26]']

interface TilePalette {
	top: string
	side: string
	blocks: [string, string, string, string]
	trunk: string
}

const tilePalettes: TilePalette[] = [
	{
		top: 'bg-[#81936d]',
		side: 'bg-[#596f55]',
		blocks: ['bg-[#77926e]', 'bg-[#8e9c6a]', 'bg-[#667f5f]', 'bg-[#a18c62]'],
		trunk: 'bg-[#463f31]',
	},
	{
		top: 'bg-[#a29a76]',
		side: 'bg-[#647a83]',
		blocks: ['bg-[#778a7f]', 'bg-[#778a7f]', 'bg-[#778a7f]', 'bg-[#778a7f]'],
		trunk: 'bg-[#505747]',
	},
	{
		top: 'bg-[#987a5c]',
		side: 'bg-[#755444]',
		blocks: ['bg-[#a9926f]', 'bg-[#a9926f]', 'bg-[#a9926f]', 'bg-[#a9926f]'],
		trunk: 'bg-[#474035]',
	},
	{
		top: 'bg-[#657f87]',
		side: 'bg-[#46646d]',
		blocks: ['bg-[#7b9b9e]', 'bg-[#7b9b9e]', 'bg-[#7b9b9e]', 'bg-[#7b9b9e]'],
		trunk: 'bg-[#394b4e]',
	},
]

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: existing gallery coordinates polling, navigation and two UI states; separate component extraction needs interaction coverage.
export function GalleryPage() {
	const { session, notify, setViewerFile } = useAppContext()
	const navigate = useNavigate()
	const [memories, setMemories] = useState<Memories>([])
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [pairCode, setPairCode] = useState('')
	const [pairStatus, setPairStatus] = useState<PairingStatus>('idle')
	const [pairExpires, setPairExpires] = useState('')
	const [pairBusy, setPairBusy] = useState(false)
	const [openingId, setOpeningId] = useState('')
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [trash, setTrash] = useState<TrashMemories>([])
	const { storage, storageError, refreshStorage } = useStorageStatus()
	const pairedFresh = shouldShowPaired(pairStatus === 'paired', memories)

	const refreshMemories = useCallback(async () => {
		setLoadError('')
		try {
			setMemories(await apiClient.memories.list())
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'The gallery is unavailable.')
		} finally {
			setLoading(false)
		}
	}, [])

	const refreshTrash = useCallback(async () => {
		try {
			setTrash(await apiClient.memories.listTrash())
		} catch {
			// The trash section stays empty when its refresh fails; captures remain visible.
		}
	}, [])

	const refreshAll = useCallback(async () => {
		await Promise.all([refreshMemories(), refreshTrash(), refreshStorage()])
	}, [refreshMemories, refreshTrash, refreshStorage])
	const trashActions = useTrashActions(notify, setLoadError, refreshAll)

	useEffect(() => {
		void refreshAll()
		apiClient.pairing
			.status()
			.then(result => {
				if (result.paired) setPairStatus('paired')
			})
			.catch(() => {
				// Stay on the manual pairing card when the status check fails.
			})
		const refreshTimer = window.setInterval(() => void refreshAll(), 12_000)
		return () => window.clearInterval(refreshTimer)
	}, [refreshAll])

	useEffect(() => {
		if (!pairCode || pairStatus !== 'pending') return
		let timer = 0
		let stopped = false
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep async polling transitions together until a browser interaction test covers cancellation.
		const poll = async () => {
			try {
				const result = await apiClient.pairing.check({ code: pairCode })
				if (stopped) return
				if (result.status === 'paired') {
					setPairStatus('paired')
					notify('The mod is linked to your account. Send a capture from Minecraft.')
					return
				}
				if (result.status === 'expired') {
					setPairStatus('expired')
					return
				}
			} catch {
				if (!stopped) setPairStatus('error')
				return
			}
			if (!stopped) timer = window.setTimeout(() => void poll(), 1600)
		}
		timer = window.setTimeout(() => void poll(), 1100)
		return () => {
			stopped = true
			window.clearTimeout(timer)
		}
	}, [pairCode, pairStatus, notify])

	async function createPairing() {
		setPairBusy(true)
		setPairStatus('idle')
		setPairCode('')
		try {
			const pairing = await apiClient.pairing.create()
			setPairCode(pairing.code)
			setPairExpires(new Date(pairing.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
			setPairStatus('pending')
		} catch (error) {
			setPairStatus('error')
			setLoadError(error instanceof Error ? error.message : 'Could not create the code.')
		} finally {
			setPairBusy(false)
		}
	}

	function openMemory(id: string) {
		setOpeningId(id)
		setLoadError('')
		setViewerFile(null)
		navigate(`/viewer?memory=${encodeURIComponent(id)}`)
		setOpeningId('')
	}

	function toggleGroup(key: string) {
		setExpanded(previous => {
			const next = new Set(previous)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	async function trashSnapshot(id: string) {
		await trashActions.trashSnapshot(id)
	}

	async function restoreSnapshot(id: string) {
		await trashActions.restoreSnapshot(id)
	}

	async function deleteSnapshot(id: string) {
		await trashActions.deleteSnapshot(id)
	}

	async function copyCode() {
		await navigator.clipboard.writeText(pairCode)
		notify('Code copied to the clipboard.')
	}

	return (
		<div className="mx-auto min-h-[670px] w-[min(100%-88px,1180px)] px-0 py-[62px] pb-[79px] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)] max-phone:py-10 max-phone:pb-[53px]">
			<div className="flex items-end justify-between gap-5 max-phone:flex-col max-phone:items-start">
				<div>
					<Eyebrow>THE SERVER ALBUM</Eyebrow>
					<h1 className="mb-[9px] mt-[13px] font-sans text-[clamp(36px,4vw,53px)] font-semibold leading-[1.1] tracking-[-2.8px] max-phone:text-[36px] max-phone:tracking-[-2px]">
						{session?.user.name.split(' ')[0] ?? 'Your'} gallery.
					</h1>
					<p className="m-0 text-[13px] text-[#b4c1ad]">Every capture keeps a place here, ready to revisit.</p>
				</div>
				<Link className={buttonDark} to="/viewer">
					Open a local GLB <span>↗</span>
				</Link>
			</div>

			<StorageSummary storage={storage} failed={storageError} />
			<section
				className={`my-[31px] mb-12 flex items-center gap-[18px] rounded-lg border bg-[#1c2720] px-[23px] py-[22px] max-phone:m-[24px_0_35px] max-phone:grid max-phone:grid-cols-[42px_1fr] max-phone:gap-[10px_12px] max-phone:p-[15px] ${
					pairedFresh ? 'border-[#354238] bg-[#1c2720]' : 'border-[#354238]'
				}`}
				aria-live="polite"
			>
				<div className="grid h-[47px] w-[47px] flex-none place-items-center rounded-xl bg-[#1c2720] text-[22px] text-[#b4c1ad] max-phone:h-10 max-phone:w-10 max-phone:rounded-[10px] max-phone:text-lg">
					{pairedFresh ? '✓' : '⌘'}
				</div>
				<div className="flex-1">
					<Eyebrow>{pairedFresh ? 'LINKED' : 'CAPTURE FROM THE SERVER'}</Eyebrow>
					<h2 className="mb-1 mt-[5px] font-sans text-base font-bold tracking-[-0.35px] max-phone:text-sm">
						{pairedFresh ? 'Your mod is paired.' : 'Link Minecraft to your gallery.'}
					</h2>
					<p className="m-0 text-[11px] leading-[1.55] text-[#b4c1ad] max-phone:text-[10px]">
						{pairingMessage(pairedFresh, pairStatus)}
					</p>
					{pairStatus === 'pending' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
							<span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[#85a555] shadow-[0_0_0_0_#85a55599]" />{' '}
							Waiting for Minecraft…
						</div>
					)}
					{pairStatus === 'expired' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
							This code expired. Generate a new one.
						</div>
					)}
					{pairStatus === 'error' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
							Verification failed. Check that the API is running.
						</div>
					)}
					{pairStatus !== 'pending' && (
						<p className="mt-[10px] text-[10px] text-[#8e978a]">{pairingHint(pairedFresh)}</p>
					)}
				</div>
				{pairStatus === 'pending' && (
					<div className="flex min-w-[181px] flex-col items-center border-l border-[#354238] px-[11px] py-[3px] max-phone:col-2 max-phone:mt-[5px] max-phone:items-start max-phone:justify-self-start max-phone:border-0 max-phone:p-[3px_0]">
						<span className="font-mono text-[8px] tracking-[0.4px] text-[#b4c1ad]">CODE FOR THE GAME</span>
						<button
							type="button"
							onClick={copyCode}
							aria-label="Copy the pairing code"
							className="cursor-pointer border-0 bg-transparent px-0 py-[4px] pb-[2px] font-mono text-[28px] font-bold tracking-[2px] text-[#e6eee1] max-phone:text-[26px]"
						>
							{pairCode.slice(0, 3)} {pairCode.slice(3)}
						</button>
						<small className="text-[9px] text-[#b4c1ad]">Expires at {pairExpires}</small>
					</div>
				)}
				{pairedFresh && (
					<span className="flex items-center gap-[7px] rounded-[20px] border border-[#354238] px-[11px] py-2 text-[10px] font-bold text-[#b4c1ad] max-phone:col-2 max-phone:justify-self-start">
						<i className="h-[7px] w-[7px] rounded-full bg-[#78a355] not-italic" /> Linked client
					</span>
				)}
				{pairStatus !== 'pending' && (
					<button
						className={`${buttonLime} min-w-[156px] max-phone:col-2 max-phone:min-h-[38px] max-phone:justify-self-start`}
						type="button"
						onClick={() => void createPairing()}
						disabled={pairBusy}
					>
						{pairingButtonLabel(pairBusy, pairedFresh)} <span>↗</span>
					</button>
				)}
			</section>

			<section>
				<div className="mb-[17px] flex items-end justify-between">
					<div>
						<Eyebrow>YOUR CAPTURES</Eyebrow>
						<h2 className="mb-0 mt-[6px] font-sans text-2xl font-bold tracking-[-1px]">To revisit</h2>
					</div>
					<button
						className="cursor-pointer border-0 bg-transparent px-[9px] py-[7px] text-[11px] text-[#b4c1ad] hover:text-[#e6eee1]"
						type="button"
						onClick={() => void refreshAll()}
						title="Refresh the gallery"
					>
						↻ Refresh
					</button>
				</div>
				{loadError && (
					<div
						className="mb-[15px] rounded-[5px] border border-[#354238] bg-[#1c2720] px-[14px] py-[11px] text-xs text-[#b4c1ad]"
						role="alert"
					>
						{loadError}
					</div>
				)}
				{loading && (
					<div className="flex min-h-[270px] flex-col items-center justify-center rounded-[7px] border border-dashed border-[#354238] bg-[#1c2720] p-[25px] text-center text-[#b4c1ad]">
						<span className="h-[21px] w-[21px] animate-loading-orbit rounded-full border-2 border-[#354238] border-t-[#75885e]" />
						<p className="mb-0 mt-[6px] text-xs">Gathering your memories…</p>
					</div>
				)}
				{!loading && memories.length > 0 && (
					<div className="space-y-4">
						{groupCaptures(memories).map(group => {
							const open = expanded.has(group.key)
							const stacks = open ? stackCaptures(group.captures) : []
							return (
								<section
									key={group.key}
									aria-label={group.name}
									className="overflow-hidden rounded-[7px] border border-[#354238] bg-[#151c17]"
								>
									<button
										type="button"
										onClick={() => toggleGroup(group.key)}
										aria-expanded={open}
										className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent p-4 text-left hover:bg-[#1a231c]"
									>
										<FolderIcon
											thumbnail={group.captures[0]?.metadata.icon ?? group.captures[0]?.metadata.thumbnail ?? null}
										/>
										<span className="min-w-0 flex-1">
											<span className="block overflow-hidden text-ellipsis whitespace-nowrap font-sans text-sm font-bold text-[#eef3ea]">
												{group.name}
											</span>
											<span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#8e978a]">
												{folderMotd(group.captures)}
											</span>
										</span>
										<span className="flex flex-none items-center gap-3">
											<span className="rounded-full border border-[#354238] px-2 py-1 font-mono text-[10px] text-[#b4c1ad]">
												{group.captures.length}
											</span>
											<span aria-hidden="true" className="text-[#b4c1ad]">
												{open ? '▾' : '▸'}
											</span>
										</span>
									</button>
									{open && (
										<div className="space-y-6 border-t border-[#2a332d] p-4">
											{stacks.map(stack => (
												<StackBundle
													key={stack.key}
													groupKey={group.key}
													stack={stack}
													openingId={openingId}
													onOpenMemory={openMemory}
													onChanged={() => void refreshAll()}
													onTrashed={id => void trashSnapshot(id)}
												/>
											))}
										</div>
									)}
								</section>
							)
						})}
					</div>
				)}
				{!loading && memories.length === 0 && (
					<div className="flex min-h-[270px] flex-col items-center justify-center rounded-[7px] border border-dashed border-[#354238] bg-[#1c2720] p-[25px] text-center text-[#b4c1ad]">
						<span className="grid h-[45px] w-[45px] place-items-center rounded-[13px] bg-[#1c2720] text-[22px] text-[#b4c1ad]">
							▧
						</span>
						<h3 className="mb-0 mt-[14px] font-sans text-[17px] font-bold text-[#e6eee1]">
							The first memory is still to come.
						</h3>
						<p className="mb-0 mt-[6px] text-xs">
							Link your mod to send a capture, or open a GLB file from your device.
						</p>
						<div className="mt-[22px] flex flex-wrap gap-[10px]">
							<button
								className={`${buttonOutline} min-h-[40px] text-[10px]`}
								type="button"
								onClick={() => document.getElementById('global-file-input')?.click()}
							>
								Choose a local file
							</button>
							<button
								className={`${buttonDark} min-h-[40px] text-[10px]`}
								type="button"
								onClick={() => void createPairing()}
							>
								{pairedFresh ? 'New code' : 'Link my server'}
							</button>
						</div>
					</div>
				)}
				{!loading && trash.length > 0 && (
					<section className="mt-12" aria-label="Trash">
						<div className="mb-[17px]">
							<Eyebrow>RECYCLE BIN</Eyebrow>
							<h2 className="mb-0 mt-[6px] font-sans text-2xl font-bold tracking-[-1px]">Trash · {trash.length}</h2>
							<p className="mb-0 mt-[6px] text-[11px] text-[#8e978a]">
								Snapshots disappear forever 30 days after deletion.
							</p>
						</div>
						<div className="grid grid-cols-3 gap-[17px] max-tablet:grid-cols-2 max-phone:grid-cols-1 max-phone:gap-3">
							{trash.map(item => (
								<TrashCard
									key={item.id}
									item={item}
									onRestore={() => void restoreSnapshot(item.id)}
									onDelete={() => void deleteSnapshot(item.id)}
								/>
							))}
						</div>
					</section>
				)}
			</section>
		</div>
	)
}

function useTrashActions(
	notify: (message: string) => void,
	setLoadError: (message: string) => void,
	refreshAll: () => Promise<void>
) {
	async function trashSnapshot(id: string) {
		try {
			await apiClient.memories.trash({ id })
			notify('Snapshot moved to trash. It disappears forever after 30 days.')
			await refreshAll()
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Could not trash this snapshot.')
		}
	}

	async function restoreSnapshot(id: string) {
		try {
			await apiClient.memories.restore({ id })
			await refreshAll()
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Could not restore this snapshot.')
		}
	}

	async function deleteSnapshot(id: string) {
		if (!window.confirm('Delete this snapshot forever? This cannot be undone.')) return
		try {
			await apiClient.memories.delete({ id })
			notify('Snapshot deleted forever.')
			await refreshAll()
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Could not delete this snapshot.')
		}
	}

	return { trashSnapshot, restoreSnapshot, deleteSnapshot }
}

function pairingButtonLabel(busy: boolean, pairedFresh: boolean): string {
	if (busy) return 'Creating…'
	return pairedFresh ? 'New code' : 'Link my server'
}

function pairingMessage(pairedFresh: boolean, pairStatus: PairingStatus): string {
	if (pairedFresh) return 'Run /minemories upload after a capture. The gallery updates itself.'
	if (pairStatus === 'paired') return 'No snapshot for two months. Link the mod again to resume auto-upload.'
	return 'A temporary code links your profile to the game client. Once, and you are set.'
}

function pairingHint(pairedFresh: boolean): string {
	if (pairedFresh) return 'Already linked? Generate a fresh code for another device.'
	return 'A temporary code links your profile to the game client. Once, and you are set.'
}

function folderMotd(captures: Memories): string {
	const count = captures.length
	const newest = captures[0]
	const seed = captures.find(item => item.metadata.seed)?.metadata.seed
	const parts = [`${count} capture${count > 1 ? 's' : ''}`]
	if (seed) parts.push(`Seed ${seed}`)
	if (newest) parts.push(`last visit ${formatRelativeDate(newest.metadata.capturedAt ?? newest.createdAt)}`)
	return parts.join(' · ')
}

function FolderIcon({ thumbnail }: { thumbnail: string | null }) {
	return (
		<span className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-[4px] border border-[#354238] bg-[#10150f]">
			{thumbnail ? (
				<span
					aria-hidden="true"
					className="block h-full w-full bg-cover bg-center"
					style={{ backgroundImage: `url("${thumbnail}")` }}
				/>
			) : (
				<span aria-hidden="true" className="block scale-[0.45]">
					<MemoryTile variant={0} />
				</span>
			)}
		</span>
	)
}

function StackThumbs({ captures }: { captures: Array<{ id: string; thumbnail: string | null }> }) {
	return (
		<span aria-hidden="true" className="flex flex-none">
			{captures.map(capture => (
				<span
					key={capture.id}
					className="grid h-9 w-9 place-items-center overflow-hidden rounded-[4px] border border-[#354238] bg-[#1c2720] not-first:-ml-3"
				>
					{capture.thumbnail ? (
						<span
							className="block h-full w-full bg-cover bg-center"
							style={{ backgroundImage: `url("${capture.thumbnail}")` }}
						/>
					) : (
						<span className="text-sm text-[#b4c1ad]">▧</span>
					)}
				</span>
			))}
		</span>
	)
}

function StackBundle({
	groupKey,
	stack,
	openingId,
	onOpenMemory,
	onChanged,
	onTrashed,
}: {
	groupKey: string
	stack: CaptureStack<Memories[number]>
	openingId: string
	onOpenMemory: (id: string) => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const [custom, setCustom] = useState(() => getStackName(groupKey, stack.key))
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState('')

	function startEditing() {
		setDraft(custom ?? '')
		setEditing(true)
	}

	function saveStackName() {
		setStackName(groupKey, stack.key, draft)
		setCustom(getStackName(groupKey, stack.key))
		setEditing(false)
	}

	const cards = stack.captures.map((memory, index) => (
		<SnapshotCard
			key={memory.id}
			memory={memory}
			index={index}
			opening={openingId === memory.id}
			onOpen={() => onOpenMemory(memory.id)}
			onChanged={onChanged}
			onTrashed={onTrashed}
		/>
	))
	if (stack.captures.length <= 1) {
		return (
			<div className="grid grid-cols-3 gap-[17px] max-tablet:grid-cols-2 max-phone:grid-cols-1 max-phone:gap-3">
				{cards}
			</div>
		)
	}
	return (
		<div className="rounded-[6px] border border-[#2a332d] bg-[#10150f] p-3">
			<div className="mb-3 flex items-center gap-3">
				<StackThumbs
					captures={stack.captures.slice(0, 3).map(item => ({ id: item.id, thumbnail: item.metadata.thumbnail }))}
				/>
				<div className="min-w-0 flex-1">
					{editing ? (
						<span className="flex items-center gap-2">
							<input
								value={draft}
								maxLength={80}
								placeholder="Name this area…"
								aria-label="Stack name"
								onChange={event => setDraft(event.currentTarget.value)}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#1c2720] px-2 text-xs text-ink outline-0"
							/>
							<button
								type="button"
								onClick={saveStackName}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								Save
							</button>
							<button
								type="button"
								onClick={() => setEditing(false)}
								aria-label="Cancel"
								className="h-8 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								✕
							</button>
						</span>
					) : (
						<>
							<p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-[#dfe7da]">
								{custom ?? `Same area · ${stack.captures.length} captures`}
							</p>
							{stack.x !== null && stack.z !== null && (
								<p className="m-0 mt-[2px] font-mono text-[10px] text-[#8e978a]">
									Near {Math.floor(stack.x)}, {Math.floor(stack.y ?? 0)}, {Math.floor(stack.z)}
								</p>
							)}
						</>
					)}
				</div>
				{!editing && (
					<button
						type="button"
						onClick={startEditing}
						title="Rename this area"
						aria-label="Rename this area"
						className="h-8 w-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent text-xs text-[#b4c1ad]"
					>
						✎
					</button>
				)}
			</div>
			<div className="grid grid-cols-3 gap-[17px] max-tablet:grid-cols-2 max-phone:grid-cols-1 max-phone:gap-3">
				{cards}
			</div>
		</div>
	)
}

function SnapshotCard({
	memory,
	index,
	opening,
	onOpen,
	onChanged,
	onTrashed,
}: {
	memory: Memories[number]
	index: number
	opening: boolean
	onOpen: () => void
	onChanged: () => void
	onTrashed: (id: string) => void
}) {
	const { notify } = useAppContext()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(memory.name)
	const [saving, setSaving] = useState(false)
	const [shareOpen, setShareOpen] = useState(false)

	function startEditing() {
		setDraft(memory.name)
		setEditing(true)
	}

	async function saveName() {
		const name = draft.trim()
		if (!name || name === memory.name) {
			setEditing(false)
			setDraft(memory.name)
			return
		}
		setSaving(true)
		try {
			await apiClient.memories.rename({ id: memory.id, name: name.slice(0, 80) })
			setEditing(false)
			onChanged()
		} catch {
			notify('Could not save this name.')
		} finally {
			setSaving(false)
		}
	}

	return (
		<article className="overflow-hidden rounded-[7px] border border-[#354238] bg-[#1c2720] transition hover:-translate-y-[3px] hover:shadow-[0_13px_30px_#333d2514]">
			<div
				className={`relative grid h-[190px] place-items-center overflow-hidden max-tablet:h-40 max-phone:h-[190px] ${artTones[index % artTones.length]}`}
			>
				{memory.metadata.thumbnail ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-cover bg-center"
						style={{ backgroundImage: `url("${memory.metadata.thumbnail}")` }}
					/>
				) : (
					<MemoryTile variant={index % 4} />
				)}
				<span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_68%,#18251c35)]" />
			</div>
			<div className="px-[14px] py-3">
				<div className="flex items-center justify-between gap-2">
					{editing ? (
						<span className="flex min-w-0 flex-1 items-center gap-2">
							<input
								value={draft}
								maxLength={80}
								aria-label="Snapshot name"
								onChange={event => setDraft(event.currentTarget.value)}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#10150f] px-2 text-xs text-ink outline-0"
							/>
							<button
								type="button"
								onClick={() => void saveName()}
								disabled={saving}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] disabled:opacity-60"
							>
								{saving ? '…' : 'Save'}
							</button>
							<button
								type="button"
								onClick={() => {
									setEditing(false)
									setDraft(memory.name)
								}}
								aria-label="Cancel"
								className="h-8 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent px-1 text-[11px] text-[#b4c1ad]"
							>
								✕
							</button>
						</span>
					) : (
						<>
							<h3 className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-bold">
								{memory.name}
							</h3>
							<button
								type="button"
								onClick={startEditing}
								title="Rename this snapshot"
								aria-label={`Rename ${memory.name}`}
								className="h-7 w-7 flex-none cursor-pointer rounded-[4px] border border-transparent bg-transparent text-[11px] text-[#8e978a] hover:border-[#354238] hover:text-[#b4c1ad]"
							>
								✎
							</button>
						</>
					)}
				</div>
				<p className="mb-0 mt-[6px] flex items-center gap-[7px] text-[9px] text-[#b4c1ad]">
					{formatRelativeDate(memory.metadata.capturedAt ?? memory.createdAt)}{' '}
					<i className="h-[3px] w-[3px] rounded-full bg-[#a5aa9b] not-italic" />{' '}
					{memory.metadata.x !== null && memory.metadata.x !== undefined
						? `${Math.floor(memory.metadata.x)}, ${Math.floor(memory.metadata.y ?? 0)}, ${Math.floor(memory.metadata.z ?? 0)} · `
						: ''}
					{formatFileSize(memory.size)}
				</p>
				<CaptureMetadata metadata={memory.metadata} />
				<div className="mt-3 flex items-center gap-2">
					<button
						type="button"
						onClick={onOpen}
						disabled={opening}
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] hover:bg-[#242e26] disabled:opacity-60"
					>
						{opening ? '…' : '↗ Revisit'}
					</button>
					<button
						type="button"
						onClick={() => setShareOpen(open => !open)}
						aria-expanded={shareOpen}
						title="Share this snapshot"
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:border-[#354238] hover:text-[#b4c1ad]"
					>
						🔗 Share
					</button>
					<button
						type="button"
						onClick={() => onTrashed(memory.id)}
						title="Move to trash"
						aria-label={`Move ${memory.name} to trash`}
						className="inline-flex h-8 flex-none cursor-pointer items-center gap-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:border-[#5a3535] hover:text-[#e8a0a0]"
					>
						🗑
					</button>
				</div>
				{shareOpen && <SharePanel memoryId={memory.id} />}
			</div>
		</article>
	)
}

function SharePanel({ memoryId }: { memoryId: string }) {
	const { notify } = useAppContext()
	const [status, setStatus] = useState<'checking' | 'off' | 'on'>('checking')
	const [url, setUrl] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		let live = true
		apiClient.memories
			.shareStatus({ id: memoryId })
			.then(result => {
				if (live) setStatus(result.shared ? 'on' : 'off')
			})
			.catch(() => {
				if (live) setStatus('off')
			})
		return () => {
			live = false
		}
	}, [memoryId])

	async function create() {
		setBusy(true)
		try {
			const link = await apiClient.memories.createShare({ id: memoryId })
			setUrl(`${window.location.origin}${link.urlPath}`)
			setStatus('on')
		} catch {
			notify('Could not create this link.')
		} finally {
			setBusy(false)
		}
	}

	async function revoke() {
		setBusy(true)
		try {
			await apiClient.memories.revokeShare({ id: memoryId })
			setStatus('off')
			setUrl('')
		} catch {
			notify('Could not stop sharing.')
		} finally {
			setBusy(false)
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(url)
			notify('Link copied to the clipboard.')
		} catch {
			notify('Could not copy this link.')
		}
	}

	return (
		<div className="mt-3 rounded-[4px] border border-[#2a332d] bg-[#10150f] p-2" aria-live="polite">
			{status === 'checking' && <p className="m-0 text-[10px] text-[#8e978a]">Checking the link…</p>}
			{status === 'off' && (
				<>
					<p className="m-0 text-[10px] leading-[1.5] text-[#8e978a]">Friends open the world without an account.</p>
					<button
						type="button"
						onClick={() => void create()}
						disabled={busy}
						className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad] disabled:opacity-60"
					>
						{busy ? '…' : 'Create a link'}
					</button>
				</>
			)}
			{status === 'on' && (
				<>
					{url ? (
						<span className="flex items-center gap-2">
							<input
								value={url}
								readOnly
								aria-label="Share link"
								onFocus={event => event.currentTarget.select()}
								className="h-8 min-w-0 flex-1 rounded-[4px] border border-[#354238] bg-[#1c2720] px-2 font-mono text-[10px] text-ink outline-0"
							/>
							<button
								type="button"
								onClick={() => void copy()}
								className="h-8 flex-none cursor-pointer rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
							>
								Copy
							</button>
						</span>
					) : (
						<p className="m-0 text-[10px] leading-[1.5] text-[#8e978a]">A link is active for this snapshot.</p>
					)}
					<span className="mt-2 flex items-center gap-2">
						<button
							type="button"
							onClick={() => void create()}
							disabled={busy}
							title="Replace the active link with a new one"
							className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:text-[#b4c1ad] disabled:opacity-60"
						>
							New link
						</button>
						<button
							type="button"
							onClick={() => void revoke()}
							disabled={busy}
							className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e978a] hover:text-[#e8a0a0] disabled:opacity-60"
						>
							Stop sharing
						</button>
					</span>
				</>
			)}
		</div>
	)
}

function TrashCard({
	item,
	onRestore,
	onDelete,
}: {
	item: TrashMemories[number]
	onRestore: () => void
	onDelete: () => void
}) {
	const remaining = daysUntilPurge(item.deletedAt, item.purgeAt)
	return (
		<article className="overflow-hidden rounded-[7px] border border-[#3a2f2f] bg-[#1c1a1a]">
			<div className="relative grid h-[130px] place-items-center overflow-hidden bg-[#141214]">
				{(item.metadata.thumbnail ?? item.metadata.icon) ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-cover bg-center opacity-70"
						style={{ backgroundImage: `url("${item.metadata.thumbnail ?? item.metadata.icon}")` }}
					/>
				) : (
					<span aria-hidden="true" className="text-xl text-[#6e6a6a]">
						▧
					</span>
				)}
			</div>
			<div className="px-[14px] py-3">
				<h3 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-bold text-[#cfc8c8]">
					{item.name}
				</h3>
				<p className="mb-0 mt-[6px] text-[9px] text-[#8e8585]">
					Deleted {formatRelativeDate(item.deletedAt)}
					{remaining !== null ? ` · gone in ${remaining}d` : ''}
				</p>
				<div className="mt-3 flex items-center gap-2">
					<button
						type="button"
						onClick={onRestore}
						className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-[#354238] bg-transparent px-2 text-[11px] text-[#b4c1ad]"
					>
						↩ Restore
					</button>
					<button
						type="button"
						onClick={onDelete}
						className="inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-transparent bg-transparent px-2 text-[11px] text-[#8e8585] hover:text-[#e8a0a0]"
					>
						Delete forever
					</button>
				</div>
			</div>
		</article>
	)
}

function MemoryTile({ variant }: { variant: number }) {
	const palette = tilePalettes[variant % tilePalettes.length]
	if (!palette) return null
	return (
		<div
			aria-hidden="true"
			className="relative h-[82px] w-[111px] rotate-[-32deg] skew-[10deg] drop-shadow-[12px_16px_0_#374b3024]"
		>
			<div className={`absolute top-0 left-[28px] h-[55px] w-[55px] rotate-45 skew-[-12deg] ${palette.top}`} />
			<div className={`absolute right-0 bottom-1 h-[44px] w-[50px] ${palette.side}`} />
			<span className={`absolute top-[10px] left-[28px] h-[21px] w-6 ${palette.blocks[0]}`} />
			<span className={`absolute top-[2px] left-[55px] h-[21px] w-6 ${palette.blocks[1]}`} />
			<span className={`absolute top-[30px] left-[14px] h-[21px] w-6 ${palette.blocks[2]}`} />
			<span className={`absolute top-[31px] left-[43px] h-[21px] w-6 ${palette.blocks[3]}`} />
			<b className={`absolute top-[33px] left-[74px] h-[29px] w-[22px] ${palette.trunk}`} />
		</div>
	)
}
