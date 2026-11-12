import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { apiBase, apiClient } from '../api-client'
import { CaptureRestorationPanel, useCaptureRestoration } from '../components/CaptureRestoration'
import { GalleryIcon } from '../components/GalleryIcons'
import { useScenePageReady } from '../components/PageFrame'
import { ViewerHeader, ViewerLoadState } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import { errorMessageKey } from '../i18n/error-messages'
import { translate, useI18n } from '../i18n/I18n'
import { type Locale, localeTag } from '../i18n/locales'
import { downloadCapture, SCENE_UNREACHABLE } from '../lib/capture-file'
import { formatFileSize } from '../lib/glb'
import { ViewerScene } from '../viewer-scene'
import { ticksToMinutes } from './ViewerPage'
import './share-timeline.css'

/** The API answers 404 once the owner stops the link or removes the memory: share links have no expiry date. */
const LINK_STOPPED = 'This link was stopped by the person who shared it.'
/** Failures where the same request can work a moment later: the error offers Retry. */
const RETRYABLE = new Set([
	SCENE_UNREACHABLE,
	'The service is temporarily unavailable. Try again.',
	'Too many attempts. Wait a moment and try again.',
	'Restoration information could not be loaded. Try again.',
])
/** The invitation to install waits for the first gesture on the scene, or this long once it is on screen. */
export const INVITE_DELAY_MS = 10_000

interface SharedSnapshot {
	id: string
	at: string
}

interface SharedCapture {
	name: string
	size: number
	/** Present on a world link: every snapshot of the world, oldest first. The served one is `id`. */
	id?: string
	snapshots?: SharedSnapshot[]
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

async function fetchSharedCapture(
	token: string,
	signal: AbortSignal,
	snapshot?: string | null
): Promise<{ capture: SharedCapture; file: File }> {
	const base = `${apiBase}/api/shared/${encodeURIComponent(token)}`
	const query = snapshot ? `?snapshot=${encodeURIComponent(snapshot)}` : ''
	const metaResponse = await fetch(`${base}${query}`, { signal })
	if (metaResponse.status === 404) throw new Error(LINK_STOPPED)
	if (!metaResponse.ok) throw new Error(SCENE_UNREACHABLE)
	const capture = (await metaResponse.json()) as SharedCapture
	const file = await downloadCapture(`${base}/file${query}`, 'shared.glb', signal)
	return { capture, file }
}

async function fetchPublicCapture(
	id: string,
	review: boolean,
	signal: AbortSignal
): Promise<{ capture: SharedCapture; file: File }> {
	const procedure = review ? apiClient.discovery.review : apiClient.discovery.get
	const entry = await procedure({ id }, { signal })
	const file = await downloadCapture(`${apiBase}/api/public/${encodeURIComponent(id)}/file`, 'public.glb', signal)
	return {
		file,
		capture: {
			name: entry.title,
			size: file.size,
			metadata: { x: null, y: null, z: null, dayTime: null, dimension: null, seed: null, biome: null },
		},
	}
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

/** A world link: a slider over the snapshots, oldest to newest, committed once the visitor stops moving. */
function SnapshotTimeline({
	snapshots,
	shown,
	onPick,
}: {
	snapshots: SharedSnapshot[]
	shown: string | null
	onPick(id: string): void
}) {
	const { t, locale } = useI18n()
	const current = Math.max(
		0,
		snapshots.findIndex(entry => entry.id === shown)
	)
	const [position, setPosition] = useState(current)
	useEffect(() => setPosition(current), [current])
	useEffect(() => {
		const picked = snapshots[position]
		if (!picked || picked.id === shown) return
		const timer = setTimeout(() => onPick(picked.id), 250)
		return () => clearTimeout(timer)
	}, [position, snapshots, shown, onPick])
	const stamp = new Date(snapshots[position]?.at ?? '')
	const label = Number.isNaN(stamp.getTime())
		? '-'
		: new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(stamp)
	return (
		<div className="share-timeline">
			<GalleryIcon name="layers" />
			<input
				type="range"
				min={0}
				max={snapshots.length - 1}
				step={1}
				value={position}
				aria-label={t('Snapshots')}
				aria-valuetext={label}
				onChange={event => setPosition(Number(event.currentTarget.value))}
			/>
			<time dateTime={snapshots[position]?.at}>{label}</time>
			<span>
				{position + 1}/{snapshots.length}
			</span>
		</div>
	)
}

function worldCount(locale: Locale, count: number): string {
	const category = new Intl.PluralRules(localeTag(locale)).select(count)
	return translate(locale, `share.world.count.${category}`, { count })
}

/** The first line a visitor reads: what this is and the one gesture it needs; a world link adds how many moments it holds. */
function ShareWelcome({ isPublic, moments }: { isPublic: boolean; moments: number }) {
	const { t, locale } = useI18n()
	return (
		<p className="share-note" data-share="welcome">
			{t('A Minecraft place in 3D, shared with you. Drag to turn around it.')}
			{isPublic && <> {t('Published by its author, reviewed before publication.')}</>}
			{moments > 1 && (
				<>
					{' '}
					{worldCount(locale, moments)}{' '}
					<span className="share-slider-hint">{t('Drag the slider to watch it change.')}</span>
				</>
			)}
		</p>
	)
}

function installPath(isPublic: boolean): string {
	return `/installation?src=${isPublic ? 'public' : 'share'}`
}

/** One line that stays once the visitor has looked around: the way to keep their own worlds. */
function ShareCall({ isPublic }: { isPublic: boolean }) {
	const { t } = useI18n()
	return (
		<p className="share-note share-call" data-share="call">
			<Link to={installPath(isPublic)}>{t('Want the same for your own base?')} →</Link>
			{isPublic && <Link to="/explore">{t('See other places')}</Link>}
		</p>
	)
}

/** The top of the stage: a world link's slider, then the visitor's line once the scene is on screen. */
function ShareTop({
	snapshots,
	shown,
	onPick,
	invite,
	isPublic,
	engaged,
}: {
	snapshots: SharedSnapshot[] | null
	shown: string | null
	onPick(id: string): void
	invite: boolean
	isPublic: boolean
	engaged: boolean
}): ReactNode {
	const moments = snapshots?.length ?? 0
	let line: ReactNode = null
	if (invite)
		line = engaged ? <ShareCall isPublic={isPublic} /> : <ShareWelcome isPublic={isPublic} moments={moments} />
	return (
		<div className="share-top">
			{snapshots && moments > 1 && <SnapshotTimeline snapshots={snapshots} shown={shown} onPick={onPick} />}
			{line}
		</div>
	)
}

/** Retry for a failure that can pass; for a link that is gone (no base on screen), the way to keep one's own base instead. */
function ShareErrorActions({
	error,
	invite,
	isPublic,
	onRetry,
}: {
	error: string
	invite: boolean
	isPublic: boolean
	onRetry(): void
}) {
	const { t } = useI18n()
	if (!error) return null
	if (RETRYABLE.has(error))
		return (
			<button type="button" onClick={onRetry}>
				{t('Retry')}
			</button>
		)
	return invite ? <Link to={installPath(isPublic)}>{t('Keep your own base in 3D too')} →</Link> : null
}

/** Nothing left to wait for: the world is drawn (no status left), or an error or a restoration card takes its place. */
function shareSettled(status: string | null, error: string, restoring: boolean): boolean {
	return status === null || Boolean(error) || restoring
}

/** The scene is in view: loaded, not empty, with no error or restoration card over it. */
function sceneOnScreen(state: { empty: boolean; status: string | null; error: string; restoring: boolean }): boolean {
	return !(state.empty || state.status || state.error || state.restoring)
}

/** True after the visitor's first gesture on the scene, or once it has been on screen for `INVITE_DELAY_MS`. */
function useEngagement(onScreen: boolean): [boolean, () => void] {
	const [engaged, setEngaged] = useState(false)
	useEffect(() => {
		if (!onScreen || engaged) return
		const timer = window.setTimeout(() => setEngaged(true), INVITE_DELAY_MS)
		return () => window.clearTimeout(timer)
	}, [onScreen, engaged])
	return [engaged, () => setEngaged(true)]
}

export function SharePage({ isPublic = false }: { isPublic?: boolean }) {
	const { t, locale } = useI18n()

	const { token, id } = useParams()
	const [params] = useSearchParams()
	const review = isPublic && params.get('review') === '1'
	const reference = isPublic ? id : token
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [title, setTitle] = useState<string | null>(null)
	const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null)
	const [empty, setEmpty] = useState(true)
	const [snapshots, setSnapshots] = useState<SharedSnapshot[] | null>(null)
	const [shown, setShown] = useState<string | null>(null)
	const [wanted, setWanted] = useState<string | null>(null)
	const [status, setStatus] = useState<string | null>('Loading the shared world…')
	const [error, setError] = useState('')
	const [attempt, setAttempt] = useState(0)
	const restoration = useCaptureRestoration()
	const restoreLoad = restoration.load
	// the loading screen of index.html stays until the shared world is drawn, or until there is nothing left to wait for
	useScenePageReady(shareSettled(status, error, restoration.view !== null))

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		let scene: ViewerScene
		try {
			scene = new ViewerScene(canvas, {
				onCycle: cycle => {
					setMinutes(cycle.minutes)
				},
				onFileInfo: (name, size) => setFileInfo({ name, size }),
				onEmptyChange: setEmpty,
				onLoading: setStatus,
			})
		} catch {
			setError('WebGL is unavailable. Try another browser or enable hardware acceleration.')
			setStatus(null)
			return
		}

		sceneRef.current = scene
		return () => {
			scene.dispose()
			sceneRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!reference) {
			setError('This link is incomplete.')
			setStatus(null)
			return
		}
		let cancelled = false
		const controller = new AbortController()
		function reportError(cause: unknown) {
			if (cancelled) return
			setError(errorMessageKey(cause, SCENE_UNREACHABLE))
			setStatus(null)
		}
		async function loadShared() {
			const scene = sceneRef.current
			if (!(scene && reference)) return
			// another snapshot of the link: the stage shows the loading screen from its request on
			setStatus('Loading the shared world…')
			try {
				const { capture, file } = await restoreLoad(
					() =>
						isPublic
							? fetchPublicCapture(reference, review, controller.signal)
							: fetchSharedCapture(reference, controller.signal, wanted),
					isPublic ? { kind: 'public', id: reference } : { kind: 'shared', token: reference },
					controller.signal
				)
				if (cancelled) return
				applySharedCapture(scene, capture, setTitle)
				setSnapshots(capture.snapshots ?? null)
				setShown(capture.id ?? null)
				await scene.loadFile(file)
			} catch (cause) {
				reportError(cause)
			}
		}
		void loadShared()
		return () => {
			cancelled = true
			controller.abort()
		}
		// `attempt` only changes on Retry: it runs the same load again.
	}, [reference, isPublic, review, restoreLoad, wanted, attempt])

	// A moderator reviewing a candidate gets neither the welcome (it is not reviewed yet) nor the invitation.
	const invite = !review
	const onScreen = invite && sceneOnScreen({ empty, status, error, restoring: restoration.view !== null })
	const [engaged, engage] = useEngagement(onScreen)
	function retry() {
		setError('')
		setStatus('Loading the shared world…')
		setAttempt(value => value + 1)
	}

	const publicBack = review ? '/admin/moderation' : '/explore'
	return (
		<section className="viewer-page cinema-page">
			<ViewerHeader
				title={title ?? t('A shared world.')}
				subtitle={isPublic ? t('PUBLIC MEMORY') : t('SHARED MEMORY')}
				back={isPublic ? publicBack : '/'}
				backLabel={isPublic ? t(review ? 'Back to moderation' : 'Back to public gallery') : 'Minemories'}
				below={
					<ShareTop
						snapshots={snapshots}
						shown={shown}
						onPick={setWanted}
						invite={onScreen}
						isPublic={isPublic}
						engaged={engaged}
					/>
				}
			/>
			<div className="viewer-stage">
				<canvas
					ref={canvasRef}
					className={empty ? 'cinema-canvas is-empty' : 'cinema-canvas'}
					aria-label={t('Shared 3D scene')}
					onPointerDown={engage}
					onWheel={engage}
				/>
				<CaptureRestorationPanel view={restoration.view} onRestore={restoration.resume} />
				{!restoration.view && (
					<ViewerLoadState loading={status} error={error} final={error === LINK_STOPPED}>
						<ShareErrorActions error={error} invite={invite} isPublic={isPublic} onRetry={retry} />
					</ViewerLoadState>
				)}
			</div>
			{!empty && (
				<ViewerStudio
					sceneRef={sceneRef}
					ready={!(status || restoration.view)}
					minutes={minutes}
					fileInfo={fileInfo ? `${fileInfo.name} · ${formatFileSize(fileInfo.size, locale)}` : ''}
				/>
			)}
		</section>
	)
}
