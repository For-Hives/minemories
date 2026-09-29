import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { buttonDark, buttonLime, buttonOutline, Eyebrow, useAppContext } from '../App'
import { apiClient } from '../api-client'
import { formatRelativeDate } from '../lib/dates'
import { formatFileSize } from '../lib/glb'

type Memories = Awaited<ReturnType<typeof apiClient.memories.list>>
type PairingStatus = 'idle' | 'pending' | 'paired' | 'expired' | 'error'

const artTones = ['bg-[#e2e6d7]', 'bg-[#dfe4de]', 'bg-[#e9e1d3]', 'bg-[#d9e1e2]']

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

	useEffect(() => {
		void refreshMemories()
		apiClient.pairing
			.status()
			.then(result => {
				if (result.paired) setPairStatus('paired')
			})
			.catch(() => {
				// Stay on the manual pairing card when the status check fails.
			})
		const refreshTimer = window.setInterval(() => void refreshMemories(), 12_000)
		return () => window.clearInterval(refreshTimer)
	}, [refreshMemories])

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
					<p className="m-0 text-[13px] text-[#777c71]">Every capture keeps a place here, ready to revisit.</p>
				</div>
				<Link className={buttonDark} to="/viewer">
					Open a local GLB <span>↗</span>
				</Link>
			</div>

			<section
				className={`my-[31px] mb-12 flex items-center gap-[18px] rounded-lg border bg-[#e8ecdf] px-[23px] py-[22px] max-phone:m-[24px_0_35px] max-phone:grid max-phone:grid-cols-[42px_1fr] max-phone:gap-[10px_12px] max-phone:p-[15px] ${
					pairStatus === 'paired' ? 'border-[#b3c89e] bg-[#e5eddf]' : 'border-[#d2d9c7]'
				}`}
				aria-live="polite"
			>
				<div className="grid h-[47px] w-[47px] flex-none place-items-center rounded-xl bg-[#d7e1c8] text-[22px] text-[#4f6c40] max-phone:h-10 max-phone:w-10 max-phone:rounded-[10px] max-phone:text-lg">
					{pairStatus === 'paired' ? '✓' : '⌘'}
				</div>
				<div className="flex-1">
					<Eyebrow>{pairStatus === 'paired' ? 'LINKED' : 'CAPTURE FROM THE SERVER'}</Eyebrow>
					<h2 className="mb-1 mt-[5px] font-sans text-base font-bold tracking-[-0.35px] max-phone:text-sm">
						{pairStatus === 'paired' ? 'Your mod is paired.' : 'Link Minecraft to your gallery.'}
					</h2>
					<p className="m-0 text-[11px] leading-[1.55] text-[#72786d] max-phone:text-[10px]">
						{pairStatus === 'paired'
							? 'Run /minemories upload after a capture. The gallery updates itself.'
							: 'A temporary code links your profile to the game client. Once, and you are set.'}
					</p>
					{pairStatus === 'pending' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#62774d]">
							<span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[#85a555] shadow-[0_0_0_0_#85a55599]" />{' '}
							Waiting for Minecraft…
						</div>
					)}
					{pairStatus === 'expired' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#986641]">
							This code expired. Generate a new one.
						</div>
					)}
					{pairStatus === 'error' && (
						<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#986641]">
							Verification failed. Check that the API is running.
						</div>
					)}
				</div>
				{pairStatus === 'pending' && (
					<div className="flex min-w-[181px] flex-col items-center border-l border-[#cdd5c1] px-[11px] py-[3px] max-phone:col-2 max-phone:mt-[5px] max-phone:items-start max-phone:justify-self-start max-phone:border-0 max-phone:p-[3px_0]">
						<span className="font-mono text-[8px] tracking-[0.4px] text-[#75806d]">CODE FOR THE GAME</span>
						<button
							type="button"
							onClick={copyCode}
							aria-label="Copy the pairing code"
							className="cursor-pointer border-0 bg-transparent px-0 py-[4px] pb-[2px] font-mono text-[28px] font-bold tracking-[2px] text-[#2b402d] max-phone:text-[26px]"
						>
							{pairCode.slice(0, 3)} {pairCode.slice(3)}
						</button>
						<small className="text-[9px] text-[#858a7d]">Expires at {pairExpires}</small>
					</div>
				)}
				{pairStatus === 'paired' && (
					<span className="flex items-center gap-[7px] rounded-[20px] border border-[#b7c7a8] px-[11px] py-2 text-[10px] font-bold text-[#4c6942] max-phone:col-2 max-phone:justify-self-start">
						<i className="h-[7px] w-[7px] rounded-full bg-[#78a355] not-italic" /> Linked client
					</span>
				)}
				{pairStatus !== 'pending' && pairStatus !== 'paired' && (
					<button
						className={`${buttonLime} min-w-[156px] max-phone:col-2 max-phone:min-h-[38px] max-phone:justify-self-start`}
						type="button"
						onClick={() => void createPairing()}
						disabled={pairBusy}
					>
						{pairBusy ? 'Creating…' : 'Link my server'} <span>↗</span>
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
						className="cursor-pointer border-0 bg-transparent px-[9px] py-[7px] text-[11px] text-[#6b7362] hover:text-[#2f492f]"
						type="button"
						onClick={() => void refreshMemories()}
						title="Refresh the gallery"
					>
						↻ Refresh
					</button>
				</div>
				{loadError && (
					<div
						className="mb-[15px] rounded-[5px] border border-[#e8c6b8] bg-[#f6e7df] px-[14px] py-[11px] text-xs text-[#914c3b]"
						role="alert"
					>
						{loadError}
					</div>
				)}
				{loading && (
					<div className="flex min-h-[270px] flex-col items-center justify-center rounded-[7px] border border-dashed border-[#cbcec2] bg-[#f5f4ee] p-[25px] text-center text-[#818579]">
						<span className="h-[21px] w-[21px] animate-loading-orbit rounded-full border-2 border-[#d8dccd] border-t-[#75885e]" />
						<p className="mb-0 mt-[6px] text-xs">Gathering your memories…</p>
					</div>
				)}
				{!loading && memories.length > 0 && (
					<div className="grid grid-cols-3 gap-[17px] max-phone:grid-cols-1 max-phone:gap-3">
						{memories.map((memory, index) => (
							<article
								className="overflow-hidden rounded-[7px] border border-[#dcded4] bg-[#f9f8f2] transition hover:-translate-y-[3px] hover:shadow-[0_13px_30px_#333d2514]"
								key={memory.id}
							>
								<div
									className={`relative grid h-[190px] place-items-center overflow-hidden max-tablet:h-40 max-phone:h-[190px] ${artTones[index % 4]}`}
								>
									<MemoryTile variant={index % 4} />
									<span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_68%,#18251c35)]" />
									<span className="absolute top-3 left-[13px] z-[2] font-mono text-[8px] tracking-[0.5px] text-[#65705e]">
										3D CAPTURE
									</span>
									<span className="absolute top-3 right-[13px] z-[2] font-mono text-[8px] tracking-[0.5px] text-[#65705e]">
										{String(index + 1).padStart(2, '0')}
									</span>
								</div>
								<div className="flex min-h-[74px] items-center justify-between gap-[10px] px-[14px] py-3">
									<div>
										<h3 className="m-0 max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-bold">
											{memory.name}
										</h3>
										<p className="mb-0 mt-[6px] flex items-center gap-[7px] text-[9px] text-[#85897d]">
											{formatRelativeDate(memory.createdAt)}{' '}
											<i className="h-[3px] w-[3px] rounded-full bg-[#a5aa9b] not-italic" />{' '}
											{formatFileSize(memory.size)}
										</p>
									</div>
									<button
										type="button"
										onClick={() => openMemory(memory.id)}
										disabled={openingId === memory.id}
										aria-label={`Revisit ${memory.name}`}
										className="h-[30px] w-[30px] flex-none cursor-pointer rounded-full border border-[#d6d9cd] bg-transparent text-[#506744] hover:border-[#96a87f] hover:bg-[#edf1e6]"
									>
										{openingId === memory.id ? '…' : '↗'}
									</button>
								</div>
							</article>
						))}
					</div>
				)}
				{!loading && memories.length === 0 && (
					<div className="flex min-h-[270px] flex-col items-center justify-center rounded-[7px] border border-dashed border-[#cbcec2] bg-[#f5f4ee] p-[25px] text-center text-[#818579]">
						<span className="grid h-[45px] w-[45px] place-items-center rounded-[13px] bg-[#e9ecdf] text-[22px] text-[#72845b]">
							▧
						</span>
						<h3 className="mb-0 mt-[14px] font-sans text-[17px] font-bold text-[#42483d]">
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
								Link my server
							</button>
						</div>
					</div>
				)}
			</section>
		</div>
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
