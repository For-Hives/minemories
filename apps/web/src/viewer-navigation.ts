import * as THREE from 'three'

/** Free flight: no collision mesh or per-frame ray casts, including inside buildings. */
export class ViewerNavigation {
	active = false
	private readonly keys = new Set<string>()
	private dragging = false
	private pointerX = 0
	private pointerY = 0
	private readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ')
	private readonly direction = new THREE.Vector3()
	private readonly abort = new AbortController()

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly canvas: HTMLCanvasElement
	) {
		canvas.tabIndex = 0
		const options = { signal: this.abort.signal }
		canvas.addEventListener('keydown', this.keyDown, options)
		window.addEventListener('keyup', this.keyUp, options)
		canvas.addEventListener('blur', this.clear, options)
		window.addEventListener('blur', this.clear, options)
		document.addEventListener('visibilitychange', this.clear, options)
		canvas.addEventListener('pointerdown', this.pointerDown, options)
		canvas.addEventListener('pointermove', this.pointerMove, options)
		canvas.addEventListener('pointerup', this.pointerUp, options)
		canvas.addEventListener('pointercancel', this.pointerUp, options)
		canvas.addEventListener('lostpointercapture', this.pointerUp, options)
	}

	setActive(active: boolean) {
		this.active = active
		this.clear()
		if (active) this.canvas.focus({ preventScroll: true })
	}

	private clear = () => {
		this.keys.clear()
		this.dragging = false
	}

	private keyDown = (event: KeyboardEvent) => {
		if (event.code === 'Escape') this.clear()
		if (!this.active || event.ctrlKey || event.metaKey) return
		if (
			![
				'KeyW',
				'KeyA',
				'KeyS',
				'KeyD',
				'ArrowUp',
				'ArrowDown',
				'ArrowLeft',
				'ArrowRight',
				'Space',
				'KeyE',
				'KeyQ',
				'ShiftLeft',
				'ShiftRight',
				'AltLeft',
				'AltRight',
			].includes(event.code)
		)
			return
		event.preventDefault()
		this.keys.add(event.code)
	}

	private keyUp = (event: KeyboardEvent) => {
		this.keys.delete(event.code)
	}
	private pointerDown = (event: PointerEvent) => {
		if (!this.active || event.button !== 0) return
		this.canvas.focus({ preventScroll: true })
		this.dragging = true
		this.pointerX = event.clientX
		this.pointerY = event.clientY
		this.canvas.setPointerCapture(event.pointerId)
	}
	private pointerUp = () => {
		this.dragging = false
	}
	private pointerMove = (event: PointerEvent) => {
		if (!(this.active && this.dragging)) return
		this.rotation.setFromQuaternion(this.camera.quaternion)
		this.rotation.y -= (event.clientX - this.pointerX) * 0.003
		this.rotation.x = THREE.MathUtils.clamp(this.rotation.x - (event.clientY - this.pointerY) * 0.003, -1.55, 1.55)
		this.pointerX = event.clientX
		this.pointerY = event.clientY
		this.camera.quaternion.setFromEuler(this.rotation)
	}

	move(direction: 'forward' | 'back' | 'up' | 'down', pressed: boolean) {
		const code = { forward: 'KeyW', back: 'KeyS', up: 'KeyE', down: 'KeyQ' }[direction]
		if (pressed) this.keys.add(code)
		else this.keys.delete(code)
	}

	update(delta: number) {
		if (!this.active) return
		const held = (...codes: string[]) => Number(codes.some(code => this.keys.has(code)))
		this.direction.set(
			held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
			0,
			held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp')
		)
		this.direction.applyQuaternion(this.camera.quaternion)
		this.direction.y += held('Space', 'KeyE') - held('KeyQ')
		let speed = 3
		if (held('ShiftLeft', 'ShiftRight')) speed = 12
		if (held('AltLeft', 'AltRight')) speed = 0.7
		this.camera.position.addScaledVector(this.direction.normalize(), Math.min(delta, 0.05) * speed)
	}

	dispose() {
		this.clear()
		this.abort.abort()
	}
}
