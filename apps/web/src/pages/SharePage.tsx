import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { apiBase, apiClient } from '../api-client'
import { CaptureRestorationPanel, useCaptureRestoration } from '../components/CaptureRestoration'
import { useScenePageReady } from '../components/PageFrame'
import { ViewerHeader, ViewerLoadState } from '../components/ViewerChrome'
import { ViewerStudio } from '../components/ViewerStudio'
import { type FilmActions, useWorldEvolution, type WorldSource, WorldStage } from '../components/WorldViewer'
import { errorMessageKey } from '../i18n/error-messages'
import { translate, useI18n } from '../i18n/I18n'
import { type Locale, localeTag } from '../i18n/locales'
import { CaptureRestorationRequired, downloadCapture, SCENE_UNREACHABLE } from '../lib/capture-file'
import { formatFileSize } from '../lib/glb'
import { readViewLink, type ViewLink } from '../lib/view-link'
import { RestorationNeeded } from '../lib/world-load'
import { track } from '../observability/insight'
import { ViewerScene } from '../viewer-scene'
import { ticksToMinutes } from './ViewerPage'
import './share-page.css'

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

interface SharedCapture {
	name: string
	/** The name the owner gave this server or world in their gallery; absent from public pages and older APIs. */
	place?: string | null
	size: number
	id?: string
	/** Present on a world link: every snapshot of the world, oldest first. Such a link opens the composed world. */
	snapshots?: { id: string; at: string }[]
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

function sharedBase(token: string): string {
	return `${apiBase}/api/shared/${encodeURIComponent(token)}`
}

/** What a share link points at. Its first request is the one that counts the opening. */
async function fetchSharedInfo(token: string, signal: AbortSignal): Promise<SharedCapture> {
	const response = await fetch(sharedBase(token), { signal })
	if (response.status === 404) throw new Error(LINK_STOPPED)
	if (!response.ok) throw new Error(SCENE_UNREACHABLE)
	return (await response.json()) as SharedCapture
}

/** The answer of a link's first request: what it is, or why it failed. */
interface FirstAnswer {
	capture: SharedCapture | null
	failure?: unknown
}

async function fetchSharedCapture(
	token: string,
	signal: AbortSignal,
	first: FirstAnswer | undefined
): Promise<{ capture: SharedCapture; file: File }> {
	if (first && first.failure !== undefined) throw first.failure
	const capture = first?.capture ?? (await fetchSharedInfo(token, signal))
	const file = await downloadCapture(`${sharedBase(token)}/file`, 'shared.glb', signal)
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

/** Hidden before the first load, so the capture never flashes in with them. */
function hideLinkLayers(scene: ViewerScene, view: ViewLink): void {
	for (const category of view.hidden ?? []) scene.setCategoryVisible(category, false)
}

/** The link's hour and camera, over the capture's own hour and the default framing. */
function applyLinkView(scene: ViewerScene, view: ViewLink | null): void {
	if (view?.minutes !== undefined) scene.setMinutes(view.minutes)
	if (view?.camera && view.target) scene.applyView(view.camera, view.target)
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
	onTitle(capture.place || capture.name)
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
					{worldCount(locale, moments)} {t('Press Play to watch it change.')}
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

/** The top of the stage once the scene is on screen: the visitor's welcome, then the invitation. */
function ShareTop({
	invite,
	isPublic,
	engaged,
	moments,
}: {
	invite: boolean
	isPublic: boolean
	engaged: boolean
	moments: number
}): ReactNode {
	let line: ReactNode = null
	if (invite)
		line = engaged ? <ShareCall isPublic={isPublic} /> : <ShareWelcome isPublic={isPublic} moments={moments} />
	return <div className="share-top">{line}</div>
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

/** Counted once per link opened: the share funnel's "they saw it" step. */
function useOpenedOnce(onScreen: boolean, reference: string | undefined, isPublic: boolean): void {
	const counted = useRef<string | undefined>(undefined)
	useEffect(() => {
		if (!onScreen || counted.current === reference) return
		counted.current = reference
		track('viewer-open', { source: isPublic ? 'public' : 'share' })
	}, [onScreen, reference, isPublic])
}

/** A share link: a world link opens the composed world, any other link (or a failed first request) one capture. */
export function SharePage({ isPublic = false }: { isPublic?: boolean }) {
	const { token } = useParams()
	const [info, setInfo] = useState<(FirstAnswer & { token: string }) | null>(null)
	useEffect(() => {
		if (isPublic || !token) return
		const controller = new AbortController()
		fetchSharedInfo(token, controller.signal).then(
			capture => setInfo({ token, capture }),
			failure => {
				// The capture page shows the failure, with its Retry when it can pass.
				if (!controller.signal.aborted) setInfo({ token, capture: null, failure })
			}
		)
		return () => controller.abort()
	}, [isPublic, token])
	if (isPublic || !token) return <SharedCapturePage isPublic={isPublic} />
	if (info?.token !== token) return <section className="viewer-page cinema-page" aria-busy="true" />
	if (info.capture?.snapshots) return <SharedWorldPage token={token} capture={info.capture} />
	return <SharedCapturePage key={token} first={info} />
}

/** One capture: a snapshot link, or a public page. */
function SharedCapturePage({ isPublic = false, first }: { isPublic?: boolean; first?: FirstAnswer }) {
	const { t, locale } = useI18n()

	const { token, id } = useParams()
	const [params] = useSearchParams()
	const review = isPublic && params.get('review') === '1'
	// A view carried by the link (camera, hour, weather, layers), applied once, on the first load.
	const [linkView] = useState(() => readViewLink(params))
	const pendingView = useRef<ViewLink | null>(linkView)
	// The answer of the link's first request, used once: asking again would count a second opening.
	const firstAnswer = useRef(first)
	const reference = isPublic ? id : token
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<ViewerScene | null>(null)
	const [minutes, setMinutes] = useState(570)
	const [title, setTitle] = useState<string | null>(null)
	const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null)
	const [empty, setEmpty] = useState(true)
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

		hideLinkLayers(scene, linkView)
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
			setStatus('Loading the shared world…')
			const first = firstAnswer.current
			firstAnswer.current = undefined
			try {
				const { capture, file } = await restoreLoad(
					() =>
						isPublic
							? fetchPublicCapture(reference, review, controller.signal)
							: fetchSharedCapture(reference, controller.signal, first),
					isPublic ? { kind: 'public', id: reference } : { kind: 'shared', token: reference },
					controller.signal
				)
				if (cancelled) return
				applySharedCapture(scene, capture, setTitle)
				await scene.loadFile(file)
				applyLinkView(scene, pendingView.current)
				pendingView.current = null
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
	}, [reference, isPublic, review, restoreLoad, attempt])

	// A moderator reviewing a candidate gets neither the welcome (it is not reviewed yet) nor the invitation.
	const invite = !review
	const onScreen = invite && sceneOnScreen({ empty, status, error, restoring: restoration.view !== null })
	const [engaged, engage] = useEngagement(onScreen)
	useOpenedOnce(onScreen, reference, isPublic)
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
				below={<ShareTop invite={onScreen} isPublic={isPublic} engaged={engaged} moments={0} />}
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
					initialView={linkView}
					viewLink
				/>
			)}
		</section>
	)
}

const sharedFilm: FilmActions = { restorable: true }

/** A world link: the owner's evolving world, composed in one scene, with the visitor's welcome and invitation. */
function SharedWorldPage({ token, capture }: { token: string; capture: SharedCapture }) {
	const { t } = useI18n()
	const [params] = useSearchParams()
	// A view carried by the link (capture, camera, hour, weather, layers), applied once the linked capture is drawn.
	const [linkView] = useState(() => readViewLink(params))
	const restoration = useCaptureRestoration()
	const restoreLoad = restoration.load
	const source = useMemo<WorldSource>(() => {
		const file = (id: string, signal: AbortSignal) =>
			downloadCapture(`${sharedBase(token)}/file?snapshot=${encodeURIComponent(id)}`, 'shared.glb', signal)
		return {
			key: token,
			load: signal => apiClient.timelapse.shared({ token }, { signal }),
			download: async (frame, signal) => {
				try {
					return await file(frame.id, signal)
				} catch (error) {
					if (error instanceof CaptureRestorationRequired) throw new RestorationNeeded()
					throw error
				}
			},
			restore: (frame, signal) =>
				restoreLoad(() => file(frame.id, signal), { kind: 'shared', token, snapshot: frame.id }, signal),
			unavailable: 'This shared world could not be loaded. Try again.',
		}
	}, [token, restoreLoad])
	const state = useWorldEvolution(source, {
		snapshot: linkView.snapshot,
		onShown: scene => {
			hideLinkLayers(scene, linkView)
			applyLinkView(scene, linkView)
		},
	})
	const { world, statuses, error } = state
	const onScreen = statuses.includes('ready') && !error && restoration.view === null
	const [engaged, engage] = useEngagement(onScreen)
	useOpenedOnce(onScreen, token, false)
	return (
		<section className="viewer-page cinema-page timelapse-page">
			<ViewerHeader
				title={capture.place || world?.name || t('A shared world.')}
				subtitle={t('SHARED WORLD')}
				back="/"
				backLabel="Minemories"
				below={
					<ShareTop
						invite={onScreen}
						isPublic={false}
						engaged={engaged}
						moments={world?.totalFrames ?? capture.snapshots?.length ?? 0}
					/>
				}
			/>
			<WorldStage
				state={state}
				actions={sharedFilm}
				ariaLabel={t('Shared 3D scene')}
				initialView={linkView}
				viewLink
				onEngage={engage}
				overlay={<CaptureRestorationPanel view={restoration.view} onRestore={restoration.resume} />}
			/>
		</section>
	)
}
