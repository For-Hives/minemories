import { type RefObject, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18n'
import {
	actionFor,
	type Bindings,
	type ControlPreset,
	type ControlSettings,
	defaultControls,
	type FlightAction,
	flightActions,
	type KeyboardLayout,
	keyLabel,
	loadControls,
	presetBindings,
	type ResolvedLayout,
	rebind,
	reservedKey,
	resolveLayout,
	riskyKey,
	saveControls,
} from '../lib/flight-controls'
import { browserStorage } from '../lib/viewer-lighting'
import type { FlightTouch, ViewerNavigation } from '../viewer-navigation'
import type { ViewerScene } from '../viewer-scene'
import { SiteSelect } from './SiteSelect'
import { ViewerIcon } from './ViewerIcons'

/** The visitor's controls, remembered in this browser. */
export function useControls(): [ControlSettings, (next: ControlSettings) => void] {
	const [controls, setControls] = useState(() => loadControls(browserStorage()))
	return [
		controls,
		next => {
			setControls(next)
			saveControls(browserStorage(), next)
		},
	]
}

/**
 * Whether touch controls show: a coarse pointer to start with, then whatever the visitor last used (a finger
 * shows them, a mouse hides them), so a laptop with a touch screen gets the right one.
 */
export function useTouchMode(): boolean {
	const [touch, setTouch] = useState(() => Boolean(window.matchMedia?.('(pointer: coarse)').matches))
	useEffect(() => {
		const seen = (event: PointerEvent) => setTouch(event.pointerType === 'touch' || event.pointerType === 'pen')
		window.addEventListener('pointerdown', seen, { capture: true, passive: true })
		return () => window.removeEventListener('pointerdown', seen, { capture: true })
	}, [])
	return touch
}

type KeyboardWithLayout = { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> }

/** The keyboard's real characters where the browser tells them (Chromium), for labels. */
function useKeyLabels(layout: KeyboardLayout): (code: string | null) => string | null {
	const [map, setMap] = useState<ReadonlyMap<string, string>>()
	useEffect(() => {
		let live = true
		const keyboard = (navigator as Navigator & { keyboard?: KeyboardWithLayout }).keyboard
		keyboard
			?.getLayoutMap?.()
			.then(found => {
				if (live) setMap(found)
			})
			.catch(() => undefined)
		return () => {
			live = false
		}
	}, [])
	const resolved = resolveLayout(layout, navigator.languages ?? [navigator.language])
	// A chosen layout overrides the browser's map; "auto" trusts the map first.
	const source = layout === 'auto' ? map : undefined
	return code => (code === null ? null : keyLabel(code, resolved, source))
}

function firstKey(bindings: Bindings, action: FlightAction, label: (code: string | null) => string | null): string {
	const [first, second] = bindings[action]
	return label(first) ?? label(second) ?? '—'
}

/** What each key does, with the visitor's bindings and keyboard labels. */
function KeyboardHelp({ controls }: { controls: ControlSettings }) {
	const { t } = useI18n()
	const label = useKeyLabels(controls.layout)
	const key = (action: FlightAction) => firstKey(controls.bindings, action, label)
	return (
		<>
			<p>{t('Click to look · Esc to stop')}</p>
			<p>
				{t('{forward} {left} {back} {right} fly · {up} up · {down} down · {sprint} sprint · Wheel: speed', {
					forward: key('forward'),
					left: key('left'),
					back: key('back'),
					right: key('right'),
					up: key('up'),
					down: key('down'),
					sprint: key('sprint'),
				})}
			</p>
		</>
	)
}

/** On touch the card folds at the first gesture elsewhere, so the view gets the screen back. */
function useFoldOnTouch(touch: boolean, card: RefObject<HTMLElement | null>): [boolean, (folded: boolean) => void] {
	const [folded, setFolded] = useState(false)
	useEffect(() => {
		if (!touch || folded) return
		const fold = (event: PointerEvent) => {
			if (event.pointerType === 'touch' && !card.current?.contains(event.target as Node)) setFolded(true)
		}
		window.addEventListener('pointerdown', fold, { capture: true, passive: true })
		return () => window.removeEventListener('pointerdown', fold, { capture: true })
	}, [touch, folded, card])
	return [touch && folded, setFolded]
}

/** The card shown while flying: what each control does, the flying speed, and the controls settings. */
export function FlightPanel({
	controls,
	touch,
	speed,
	onSettings,
}: {
	controls: ControlSettings
	touch: boolean
	speed: number | null
	onSettings: () => void
}) {
	const { t } = useI18n()
	const card = useRef<HTMLElement>(null)
	const [folded, setFolded] = useFoldOnTouch(touch, card)
	return (
		<section ref={card} className={`cinema-navigation ${folded ? 'is-folded' : ''}`} aria-label={t('Explore')}>
			{!folded &&
				(touch ? (
					<p>{t('Left thumb flies, right thumb looks. Push to the edge to sprint.')}</p>
				) : (
					<KeyboardHelp controls={controls} />
				))}
			{speed !== null && (
				<p className="flight-speed" role="status">
					{t('Flying speed {percent}%', { percent: Math.round(speed * 100) })}
				</p>
			)}
			<div>
				<button type="button" onClick={onSettings}>
					{t('Controls')}
				</button>
				{touch && (
					<button type="button" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
						{folded ? t('Show help') : t('Hide help')}
					</button>
				)}
			</div>
		</section>
	)
}

const STICK_RADIUS = 48
/** The stick pushed this far forward sprints, as a long press on forward would. */
const SPRINT_PUSH = 0.92

/** A thumb stick and climb/descend buttons for phones and tablets. */
export function TouchFlightPad({ flight }: { flight: ViewerNavigation | undefined }) {
	const { t } = useI18n()
	const state = useRef<FlightTouch>({ forward: 0, strafe: 0, up: false, down: false, sprint: false })
	const stick = useRef<{ id: number; x: number; y: number } | null>(null)
	const [knob, setKnob] = useState({ x: 0, y: 0 })
	const send = (change: Partial<FlightTouch>) => {
		state.current = { ...state.current, ...change }
		flight?.setTouch(state.current)
	}
	// iOS Safari zooms on a double tap or pinch unless told not to, even with touch-action.
	useEffect(() => {
		const stop = (event: Event) => event.preventDefault()
		document.addEventListener('gesturestart', stop)
		return () => {
			document.removeEventListener('gesturestart', stop)
			flight?.setTouch({ forward: 0, strafe: 0, up: false, down: false, sprint: false })
		}
	}, [flight])
	const moveStick = (x: number, y: number) => {
		const origin = stick.current
		if (!origin) return
		let dx = (x - origin.x) / STICK_RADIUS
		let dy = (y - origin.y) / STICK_RADIUS
		const length = Math.hypot(dx, dy)
		if (length > 1) {
			dx /= length
			dy /= length
		}
		setKnob({ x: dx * STICK_RADIUS, y: dy * STICK_RADIUS })
		send({ forward: -dy, strafe: dx, sprint: -dy >= SPRINT_PUSH })
	}
	const release = () => {
		stick.current = null
		setKnob({ x: 0, y: 0 })
		send({ forward: 0, strafe: 0, sprint: false })
	}
	const hold = (action: 'up' | 'down') => ({
		onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
			event.currentTarget.setPointerCapture?.(event.pointerId)
			send({ [action]: true })
		},
		onPointerUp: () => send({ [action]: false }),
		onPointerCancel: () => send({ [action]: false }),
		onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
	})
	return (
		<div className="touch-flight">
			<div
				className="touch-stick"
				role="application"
				aria-label={t('Move')}
				onPointerDown={event => {
					if (stick.current) return
					const box = event.currentTarget.getBoundingClientRect()
					stick.current = { id: event.pointerId, x: box.left + box.width / 2, y: box.top + box.height / 2 }
					event.currentTarget.setPointerCapture?.(event.pointerId)
					moveStick(event.clientX, event.clientY)
				}}
				onPointerMove={event => {
					if (event.pointerId === stick.current?.id) moveStick(event.clientX, event.clientY)
				}}
				onPointerUp={event => {
					if (event.pointerId === stick.current?.id) release()
				}}
				onPointerCancel={release}
			>
				<span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
			</div>
			<div className="touch-climb">
				<button type="button" aria-label={t('Fly up')} {...hold('up')}>
					<ViewerIcon name="chevronUp" />
				</button>
				<button type="button" aria-label={t('Fly down')} {...hold('down')}>
					<ViewerIcon name="chevronDown" />
				</button>
			</div>
		</div>
	)
}

const actionLabels: Record<FlightAction, string> = {
	forward: 'Forward',
	back: 'Back',
	left: 'Left',
	right: 'Right',
	up: 'Up',
	down: 'Down',
	sprint: 'Sprint',
}

type Listening = { action: FlightAction; slot: 0 | 1 } | null

/** Waits for the next key and binds it; Escape cancels, Backspace or Delete empties the slot. */
function useKeyCapture(listening: Listening, done: (code: string | null | undefined) => void) {
	useEffect(() => {
		if (!listening) return
		function onKey(event: KeyboardEvent) {
			event.preventDefault()
			event.stopImmediatePropagation()
			if (event.code === 'Escape') done(undefined)
			else if (event.code === 'Backspace' || event.code === 'Delete') done(null)
			else if (!reservedKey(event.code)) done(event.code)
		}
		window.addEventListener('keydown', onKey, { capture: true })
		return () => window.removeEventListener('keydown', onKey, { capture: true })
	})
}

function percent(value: number) {
	return Math.round(value * 100)
}

/** Flight settings: key layout and bindings, look sensitivity, inverted look, field of view effects. */
export function ControlsPanel({
	controls,
	onChange,
	onClose,
}: {
	controls: ControlSettings
	onChange: (next: ControlSettings) => void
	onClose: () => void
}) {
	const { t } = useI18n()
	const label = useKeyLabels(controls.layout)
	const [listening, setListening] = useState<Listening>(null)
	useKeyCapture(listening, code => {
		if (listening && code !== undefined)
			onChange({ ...controls, bindings: rebind(controls.bindings, listening.action, listening.slot, code) })
		setListening(null)
	})
	const auto: ResolvedLayout = resolveLayout('auto', navigator.languages ?? [navigator.language])
	const preset = (name: ControlPreset) => onChange({ ...controls, bindings: presetBindings[name] })
	const matches = (name: ControlPreset) => JSON.stringify(controls.bindings) === JSON.stringify(presetBindings[name])
	const risky = flightActions.some(action => controls.bindings[action].some(code => code !== null && riskyKey(code)))
	return (
		<section id="flight-controls" className="cinema-settings flight-controls" aria-label={t('Controls')}>
			<div className="cinema-panel-heading">
				<h2 className="cinema-panel-title">{t('Controls')}</h2>
				<button type="button" aria-label={t('Close controls')} onClick={onClose}>
					×
				</button>
			</div>
			<fieldset className="viewer-weather">
				<legend>{t('Key set')}</legend>
				<button type="button" aria-pressed={matches('viewer')} onClick={() => preset('viewer')}>
					{t('Default')}
				</button>
				<button type="button" aria-pressed={matches('minecraft')} onClick={() => preset('minecraft')}>
					Minecraft Java
				</button>
			</fieldset>
			<SiteSelect
				className="viewer-quality"
				label={t('Keyboard layout')}
				value={controls.layout}
				options={[
					{ value: 'auto' as const, label: t('Automatic · {layout}', { layout: auto.toUpperCase() }) },
					{ value: 'qwerty' as const, label: 'QWERTY' },
					{ value: 'azerty' as const, label: 'AZERTY' },
					{ value: 'qwertz' as const, label: 'QWERTZ' },
				]}
				onChange={layout => onChange({ ...controls, layout })}
			/>
			<table className="flight-keys">
				<tbody>
					{flightActions.map(action => (
						<tr key={action}>
							<th scope="row">{t(actionLabels[action])}</th>
							{([0, 1] as const).map(slot => {
								const waiting = listening?.action === action && listening.slot === slot
								return (
									<td key={slot}>
										<button
											type="button"
											aria-pressed={waiting}
											aria-label={t('{action}, key {slot}', { action: t(actionLabels[action]), slot: slot + 1 })}
											onClick={() => setListening(waiting ? null : { action, slot })}
										>
											{waiting ? t('Press a key…') : (label(controls.bindings[action][slot]) ?? t('Not set'))}
										</button>
									</td>
								)
							})}
						</tr>
					))}
				</tbody>
			</table>
			<small>{t('Esc cancels. Backspace clears the key. Double-tap forward to sprint.')}</small>
			{risky && (
				<p className="flight-warning" role="alert">
					{t('Ctrl, Alt and Cmd can trigger browser shortcuts: Ctrl+W closes the tab.')}
				</p>
			)}
			<label className="flight-slider">
				{t('Mouse sensitivity {percent}%', { percent: percent(controls.sensitivity) })}
				<input
					type="range"
					min={0}
					max={100}
					value={percent(controls.sensitivity)}
					onChange={event => onChange({ ...controls, sensitivity: Number(event.target.value) / 100 })}
				/>
			</label>
			<label className="flight-slider">
				{t('Touch sensitivity {percent}%', { percent: percent(controls.touchSensitivity) })}
				<input
					type="range"
					min={0}
					max={100}
					value={percent(controls.touchSensitivity)}
					onChange={event => onChange({ ...controls, touchSensitivity: Number(event.target.value) / 100 })}
				/>
			</label>
			<label className="flight-check">
				<input
					type="checkbox"
					checked={controls.invertY}
					onChange={event => onChange({ ...controls, invertY: event.target.checked })}
				/>
				{t('Invert vertical look')}
			</label>
			<label className="flight-check">
				<input
					type="checkbox"
					checked={controls.fovEffects}
					onChange={event => onChange({ ...controls, fovEffects: event.target.checked })}
				/>
				{t('Wider view when flying fast')}
			</label>
			<div className="flight-reset">
				<button type="button" onClick={() => onChange(defaultControls)}>
					{t('Reset controls')}
				</button>
			</div>
		</section>
	)
}

/** How long the flying speed stays on screen after the wheel changes it. */
const SPEED_NOTICE_MS = 1500

export type FlightUi = {
	controls: ControlSettings
	setControls: (next: ControlSettings) => void
	open: boolean
	setOpen: (open: boolean) => void
	speed: number | null
	touch: boolean
	/** Whether a key flies, so the viewer's own shortcuts leave it alone while flying. */
	flies: (code: string) => boolean
}

/** Flight state for the viewer: the visitor's controls (sent to the scene), the panel, the wheel's speed notice. */
export function useFlight(sceneRef: RefObject<ViewerScene | null>, ready: boolean): FlightUi {
	const [controls, setControls] = useControls()
	const [open, setOpen] = useState(false)
	const [speed, setSpeed] = useState<number | null>(null)
	const touch = useTouchMode()
	useEffect(() => {
		if (ready) sceneRef.current?.flight.setControls(controls)
	}, [ready, controls, sceneRef])
	useEffect(() => {
		const flight = ready ? sceneRef.current?.flight : undefined
		if (!flight) return
		let timer = 0
		flight.onSpeedChange = value => {
			setSpeed(value)
			window.clearTimeout(timer)
			timer = window.setTimeout(() => setSpeed(null), SPEED_NOTICE_MS)
		}
		return () => {
			flight.onSpeedChange = null
			window.clearTimeout(timer)
		}
	}, [ready, sceneRef])
	return {
		controls,
		setControls,
		open,
		setOpen,
		speed,
		touch,
		flies: code => actionFor(controls.bindings, code) !== undefined,
	}
}

/** What the viewer shows for flight: the card while flying, the thumb controls on touch, and the controls panel. */
export function FlightLayer({
	flight,
	flying,
	sceneRef,
	onOpen,
}: {
	flight: FlightUi
	flying: boolean
	sceneRef: RefObject<ViewerScene | null>
	/** Closes the viewer's other panels when this one opens. */
	onOpen: () => void
}) {
	return (
		<>
			{flying && (
				<FlightPanel
					controls={flight.controls}
					touch={flight.touch}
					speed={flight.speed}
					onSettings={() => {
						onOpen()
						flight.setOpen(!flight.open)
					}}
				/>
			)}
			{flying && flight.touch && <TouchFlightPad flight={sceneRef.current?.flight} />}
			{flight.open && (
				<ControlsPanel controls={flight.controls} onChange={flight.setControls} onClose={() => flight.setOpen(false)} />
			)}
		</>
	)
}
