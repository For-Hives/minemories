import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { buttonLime, Eyebrow } from '../App'
import { apiBase } from '../api-client'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { TimePresets, ticksToMinutes } from './ViewerPage'

interface SharedCapture {
	name: string
	size: number
	metadata: {
		x: number | null
		y: number | null
		z: number | null
		dayTime: number | null
		dimension: string | null
		seed: string | null
		biome: string | null
	}
}

async function fetchSharedCapture(token: string): Promise<{ capture: SharedCapture; file: File }> {
	const metaResponse = await fetch(`${apiBase}/api/shared/${encodeURIComponent(token)}`)
	if (!metaResponse.ok) throw new Error('This link is invalid or was revoked.')
	const capture = (await metaResponse.json()) as SharedCapture
	const fileResponse = await fetch(`${apiBase}/api/shared/${encodeURIComponent(token)}/file`)
	if (!fileResponse.ok) throw new Error('Could not download this world.')
	return { capture, file: new File([await fileResponse.blob()], 'shared.glb', { type: 'model/gltf-binary' }) }
}

function applySharedCapture(scene: ViewerScene, capture: SharedCapture, onTitle: (name: string) => void): void {
	scene.setCaptureContext({
		x: capture.metadata.x,
		y: capture.metadata.y,
		z: capture.metadata.z,
		dayTime: capture.metadata.dayTime,
		dimension: capture.metadata.dimension,
		seed: capture.metadata.seed,
		biome: capture.metadata.biome,
	})
	if (capture.metadata.dayTime !== null) scene.setMinutes(ticksToMinutes(capture.metadata.dayTime))
	onTitle(capture.name)
}

export function SharePage() {
	const { token } = useParams()
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [title, setTitle] = useState('A shared world.')
	const [fileInfo, setFileInfo] = useState('')
	const [empty, setEmpty] = useState(true)
	const [status, setStatus] = useState<string | null>('Loading the shared world…')
	const [error, setError] = useState('')

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const scene = new ViewerScene(canvas, {
			onCycle: cycle => {
				setMinutes(cycle.minutes)
			},
			onFileInfo: (name, size) => setFileInfo(`${name} · ${formatFileSize(size)}`),
			onEmptyChange: setEmpty,
			onLoading: setStatus,
		})
		sceneRef.current = scene
		return () => {
			scene.dispose()
			sceneRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!token) {
			setError('This link is incomplete.')
			setStatus(null)
			return
		}
		let cancelled = false
		function reportError(cause: unknown) {
			if (cancelled) return
			setError(cause instanceof Error ? cause.message : 'Could not load this world.')
			setStatus(null)
		}
		async function loadShared() {
			const scene = sceneRef.current
			if (!(scene && token)) return
			try {
				const { capture, file } = await fetchSharedCapture(token)
				if (cancelled) return
				applySharedCapture(scene, capture, setTitle)
				await scene.loadFile(file)
			} catch (cause) {
				reportError(cause)
			}
		}
		void loadShared()
		return () => {
			cancelled = true
		}
	}, [token])

	return (
		<section className="mx-auto w-[min(100%-88px,1360px)] px-0 py-[37px] pb-[27px] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)] max-phone:py-[25px] max-phone:pb-[19px]">
			<div className="flex items-center justify-between gap-5 pb-[19px] max-phone:flex-col max-phone:items-start max-phone:gap-[13px]">
				<div>
					<Eyebrow>SHARED MEMORY</Eyebrow>
					<h1 className="mb-0 mt-[6px] max-w-[640px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[21px] font-bold tracking-[-0.8px] max-phone:max-w-[calc(100vw-40px)] max-phone:text-lg">
						{title}
					</h1>
				</div>
				<Link className={`${buttonLime} min-h-[40px] text-[10px]`} to="/">
					Keep my own worlds <span>↗</span>
				</Link>
			</div>
			<div className="relative h-[min(68vw,690px)] min-h-[420px] overflow-hidden rounded-lg border border-[#354238] bg-night shadow-[0_16px_45px_#26312316] max-phone:h-[68vh] max-phone:min-h-[370px]">
				<canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Shared 3D scene" />
				{(status ?? error) && (
					<div className="absolute top-1/2 left-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-lg border border-[#3b4334] bg-night-soft px-[18px] py-[14px] font-mono text-xs text-[#e6eadc]">
						{status && (
							<span className="h-[15px] w-[15px] animate-viewer-spin rounded-full border-2 border-[#4a553c] border-t-lime-deep" />
						)}
						<span>{status ?? error}</span>
					</div>
				)}
				{fileInfo && (
					<div className="absolute top-[18px] left-[18px] z-[1] flex max-w-[min(60%,420px)] items-center gap-[9px] overflow-hidden rounded-md border border-[#33392e] bg-[#141811d9] px-[11px] py-[9px] font-mono text-[10px] text-[#e1e5d8]">
						<span className="inline-block h-[7px] w-[7px] flex-none rounded-full bg-lime-deep shadow-[0_0_12px_#c9f36a66]" />
						<span className="overflow-hidden text-ellipsis whitespace-nowrap">{fileInfo}</span>
					</div>
				)}
				{!empty && <TimePresets minutes={minutes} onSelect={value => sceneRef.current?.setMinutes(value)} />}
			</div>
			<p className="mb-0 mt-[14px] flex items-center justify-center gap-[10px] text-[10px] text-[#b4c1ad]">
				Shared link · no account needed to revisit this world.
			</p>
		</section>
	)
}
