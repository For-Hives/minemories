import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { buttonDark, buttonOutline, Eyebrow, fileInputHidden, useAppContext } from '../App'
import { apiBase, apiClient } from '../api-client'
import { formatFileSize } from '../lib/glb'
import { formatClock, ViewerScene } from '../viewer-scene'

export function ViewerPage() {
	const { viewerFile, setViewerFile } = useAppContext()
	const [search] = useSearchParams()
	const navigate = useNavigate()
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [fileInfo, setFileInfo] = useState('')
	const [empty, setEmpty] = useState(true)
	const [loading, setLoading] = useState<string | null>(null)
	const [loadError, setLoadError] = useState('')
	const [dragOver, setDragOver] = useState(false)
	const memoryId = search.get('memory')

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const scene = new ViewerScene(canvas, {
			onCycle: cycle => {
				setMinutes(cycle.minutes)
			},
			onFileInfo: (name, size) => setFileInfo(`${name} · ${formatFileSize(size)}`),
			onEmptyChange: setEmpty,
			onLoading: setLoading,
		})
		sceneRef.current = scene
		return () => {
			scene.dispose()
			sceneRef.current = null
		}
	}, [])

	const openFile = useCallback(async (file: File) => {
		const scene = sceneRef.current
		if (!scene) return false
		setLoadError('')
		try {
			await scene.loadFile(file)
			return true
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Could not read this GLB')
			return false
		}
	}, [])

	useEffect(() => {
		if (viewerFile && !memoryId) {
			sceneRef.current?.setCaptureContext({
				x: null,
				y: null,
				z: null,
				dayTime: null,
				dimension: null,
				seed: null,
				biome: null,
			})
			void openFile(viewerFile)
		}
	}, [viewerFile, memoryId, openFile])

	useEffect(() => {
		if (!memoryId) return
		let cancelled = false
		const controller = new AbortController()
		setLoadError('')
		setLoading('Téléchargement du souvenir…')
		async function loadMemory(id: string) {
			try {
				const capture = await fetchCapture(id, controller.signal)
				if (cancelled) return
				applyCaptureMetadata(capture.metadata)
				const ready = await openFile(capture.file)
				if (!cancelled) afterMemoryOpened(id, capture.metadata.thumbnail, capture.metadata.icon, ready)
			} catch (error) {
				if (!cancelled) {
					setLoading(null)
					setLoadError(loadErrorMessage(error))
				}
			}
		}
		void loadMemory(memoryId)
		return () => {
			cancelled = true
			controller.abort()
		}
	}, [memoryId, openFile])

	function applyCaptureMetadata(metadata: Awaited<ReturnType<typeof fetchCapture>>['metadata']) {
		const scene = sceneRef.current
		if (!scene) return
		scene.setCaptureContext({
			x: metadata.x,
			y: metadata.y,
			z: metadata.z,
			dayTime: metadata.dayTime,
			dimension: metadata.dimension,
			seed: metadata.seed,
			biome: metadata.biome,
		})
		if (metadata.dayTime !== null) scene.setMinutes(ticksToMinutes(metadata.dayTime))
	}

	function afterMemoryOpened(id: string, thumbnail: string | null, icon: string | null, ready: boolean) {
		const scene = sceneRef.current
		if (!(ready && scene) || (thumbnail !== null && icon !== null)) return
		const snapshot = scene.snapshot()
		if (!snapshot || snapshot.length > 96_000) return
		if (icon === null && thumbnail !== null) {
			void apiClient.memories.setThumbnail({ id, thumbnail: snapshot, icon: thumbnail }).catch(() => undefined)
		} else {
			void apiClient.memories.setThumbnail({ id, thumbnail: snapshot }).catch(() => undefined)
		}
	}

	function chooseLocalFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0]
		if (file) {
			setViewerFile(file)
			navigate('/viewer', { replace: true })
		}
		event.currentTarget.value = ''
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault()
		setDragOver(false)
		const file = event.dataTransfer.files?.[0]
		if (file) void openFile(file)
	}

	return (
		<section className="mx-auto w-[min(100%-88px,1360px)] px-0 py-[37px] pb-[27px] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)] max-phone:py-[25px] max-phone:pb-[19px]">
			<div className="flex items-center justify-between gap-5 pb-[19px] max-phone:flex-col max-phone:items-start max-phone:gap-[13px]">
				<div>
					<Eyebrow>3D EXPLORATION</Eyebrow>
					<h1 className="mb-0 mt-[6px] max-w-[640px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[21px] font-bold tracking-[-0.8px] max-phone:max-w-[calc(100vw-40px)] max-phone:text-lg">
						{memoryId ? 'A world to find again.' : (viewerFile?.name ?? 'A world to revisit.')}
					</h1>
				</div>
				<div className="flex gap-[9px]">
					<label
						className={`${buttonOutline} relative min-h-[40px] text-[10px] focus-within:outline-2 focus-within:outline-[#607a4a] focus-within:outline-offset-[3px]`}
					>
						Choose a GLB
						<input
							id="local-file-input"
							type="file"
							accept=".glb,model/gltf-binary"
							className={fileInputHidden}
							onChange={chooseLocalFile}
						/>
					</label>
					<Link className={`${buttonDark} min-h-[40px] text-[10px]`} to="/gallery">
						My gallery <span>↗</span>
					</Link>
				</div>
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dropping files is a bonus; the Choose button stays keyboard accessible. */}
			<div
				className="relative h-[min(68vw,690px)] min-h-[420px] overflow-hidden rounded-lg border border-[#354238] bg-night shadow-[0_16px_45px_#26312316] max-phone:h-[68vh] max-phone:min-h-[370px]"
				onDragEnter={event => {
					event.preventDefault()
					setDragOver(true)
				}}
				onDragOver={event => event.preventDefault()}
				onDragLeave={event => {
					event.preventDefault()
					setDragOver(false)
				}}
				onDrop={handleDrop}
			>
				<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(#283024_1px,transparent_1px),linear-gradient(90deg,#283024_1px,transparent_1px)] bg-[length:42px_42px] opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,#000_0%,transparent_73%)]" />
				<canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Interactive 3D scene" />
				{empty && !loading && <EmptyState />}
				<div
					className={`drop-overlay absolute inset-[12px] z-[3] hidden place-items-center rounded-lg border border-dashed border-lime-deep bg-[#13180ee8] font-mono text-sm text-lime-deep ${dragOver ? 'visible' : ''}`}
				>
					Drop your world here
				</div>
				{(loading ?? loadError) && (
					<div
						role="status"
						aria-live="polite"
						className="absolute top-1/2 left-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-lg border border-[#3b4334] bg-night-soft px-[18px] py-[14px] font-mono text-xs text-[#e6eadc]"
					>
						{loading && (
							<span className="h-[15px] w-[15px] animate-viewer-spin rounded-full border-2 border-[#4a553c] border-t-lime-deep" />
						)}
						<span>{loading ?? loadError}</span>
					</div>
				)}
				{fileInfo && (
					<div className="absolute top-[18px] left-[18px] z-[1] flex max-w-[min(60%,420px)] items-center gap-[9px] overflow-hidden rounded-md border border-[#33392e] bg-[#141811d9] px-[11px] py-[9px] font-mono text-[10px] text-[#e1e5d8]">
						<span className="inline-block h-[7px] w-[7px] flex-none rounded-full bg-lime-deep shadow-[0_0_12px_#c9f36a66]" />
						<span className="overflow-hidden text-ellipsis whitespace-nowrap">{fileInfo}</span>
					</div>
				)}
				{!empty && (
					<div className="absolute bottom-[17px] left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap rounded-md border border-[#33392e] bg-[#141811d9] px-3 py-2 font-mono text-[9px] text-[#b4c1ad] max-phone:hidden">
						<span className="text-[#e0e5d7]">Drag</span> to orbit{' '}
						<i className="px-2 text-[#b4c1ad] not-italic max-phone:px-[3px]">·</i>{' '}
						<span className="text-[#e0e5d7]">Scroll</span> to zoom{' '}
						<i className="px-2 text-[#b4c1ad] not-italic max-phone:px-[3px]">·</i>{' '}
						<span className="text-[#e0e5d7]">Right-click</span> to pan
					</div>
				)}
				{!empty && (
					<div className="absolute bottom-[17px] right-[17px]">
						<button
							className="h-[34px] w-[34px] cursor-pointer rounded-md border border-[#3b4334] bg-[#171b14d9] font-sans text-xl text-lime-deep"
							type="button"
							title="Recenter the camera"
							onClick={() => sceneRef.current?.resetView()}
						>
							◎
						</button>
					</div>
				)}
				<TimePresets minutes={minutes} onSelect={value => sceneRef.current?.setMinutes(value)} />
			</div>
			<p className="mb-0 mt-[14px] flex items-center justify-center gap-[10px] text-[10px] text-[#b4c1ad] max-phone:flex-wrap max-phone:gap-[7px] max-phone:text-[8px]">
				<span className="text-[15px] text-[#b4c1ad]">⌖</span> Drag to orbit{' '}
				<i className="h-[3px] w-[3px] rounded-full bg-[#3a4a3e] not-italic" /> Scroll to zoom{' '}
				<i className="h-[3px] w-[3px] rounded-full bg-[#3a4a3e] not-italic" /> Right-click to pan
			</p>
		</section>
	)
}

async function fetchCapture(id: string, signal: AbortSignal) {
	const [file, captures] = await Promise.all([fetchMemoryFile(id, signal), apiClient.memories.list()])
	const capture = captures.find(item => item.id === id)
	return {
		file,
		metadata: capture?.metadata ?? {
			x: null,
			y: null,
			z: null,
			dayTime: null,
			dimension: null,
			seed: null,
			biome: null,
			thumbnail: null,
			icon: null,
		},
	}
}

export function ticksToMinutes(ticks: number): number {
	const timeOfDay = ((ticks % 24_000) + 24_000) % 24_000
	return Math.round((((timeOfDay + 6_000) % 24_000) / 24_000) * 1_440) % 1_440
}

function loadErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Could not load this memory.'
}

async function fetchMemoryFile(memoryId: string, signal: AbortSignal): Promise<File> {
	const response = await fetch(`${apiBase}/api/memories/${encodeURIComponent(memoryId)}/file`, {
		credentials: 'include',
		signal,
	})
	if (!response.ok) throw new Error('Could not load this memory.')
	return new File([await response.blob()], 'memory.glb', { type: 'model/gltf-binary' })
}

function EmptyState() {
	return (
		<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
			<div className="mb-[29px] grid h-12 w-12 place-items-center rounded-[14px] border border-[#454d3d] bg-[#171c13] text-2xl text-lime-deep shadow-[0_0_42px_#c9f36a0b]">
				<span>◈</span>
			</div>
			<p className="m-0 mb-[13px] font-mono text-[10px] tracking-[1.8px] text-lime-deep">YOUR MEMORY, IN 3D</p>
			<p className="mx-0 my-5 mb-[18px] max-w-[300px] text-[13px] leading-[1.6] text-[#b4c1ad]">
				Drag a <b className="rounded-[3px] bg-[#262a22] px-[5px] py-[3px] font-mono text-[11px] text-[#e9ebdf]">.glb</b>{' '}
				file here, or open one from your computer.
			</p>
		</div>
	)
}

export function TimePresets({ minutes, onSelect }: { minutes: number; onSelect: (value: number) => void }) {
	const presets = [
		{ label: 'Morning', minutes: 570, icon: '☀' },
		{ label: 'Noon', minutes: 720, icon: '☼' },
		{ label: 'Sunset', minutes: 1080, icon: '◒' },
		{ label: 'Night', minutes: 0, icon: '☾' },
	]
	let active = presets[0]
	let best = Number.POSITIVE_INFINITY
	for (const preset of presets) {
		const distance = Math.min(Math.abs(minutes - preset.minutes), 1_440 - Math.abs(minutes - preset.minutes))
		if (distance < best) {
			best = distance
			active = preset
		}
	}
	return (
		<fieldset
			className="absolute top-4 right-4 z-[2] flex gap-1 rounded-lg border border-[#44513d] bg-[#101714ed] p-1 max-phone:top-14"
			aria-label="Time of day"
		>
			{presets.map(preset => (
				<button
					type="button"
					key={preset.label}
					title={`${preset.label} · ${formatClock(preset.minutes)}`}
					aria-pressed={active?.label === preset.label}
					aria-label={`${preset.label} (${formatClock(preset.minutes)})`}
					onClick={() => onSelect(preset.minutes)}
					className={`cursor-pointer rounded-md px-3 py-2 text-xs transition-colors ${active?.label === preset.label ? 'bg-lime text-[#253121]' : 'text-[#d3dfce] hover:bg-[#2b392e]'}`}
				>
					<span aria-hidden="true">{preset.icon}</span> <span className="max-phone:sr-only">{preset.label}</span>
				</button>
			))}
		</fieldset>
	)
}
