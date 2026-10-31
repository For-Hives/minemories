import * as THREE from 'three'

const LINGER_SECONDS = 1.2
const FADE_PER_SECOND = 4
const RING_SEGMENTS = 48
const OPACITY = 0.55

/** A faint gizmo marking the orbit/pan origin while the camera is being driven. */
export class ViewerPivot {
	readonly object: THREE.LineSegments
	private readonly geometry = new THREE.BufferGeometry()
	private readonly material = new THREE.LineBasicMaterial({
		color: 0xe6c68e,
		transparent: true,
		opacity: 0,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	})
	private holding = false
	private linger = 0
	private opacity = 0

	constructor() {
		const points: number[] = []
		for (let i = 0; i < RING_SEGMENTS; i++) {
			const a = (i / RING_SEGMENTS) * Math.PI * 2
			const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2
			points.push(Math.cos(a), 0, Math.sin(a), Math.cos(b), 0, Math.sin(b))
		}
		points.push(-0.35, 0, 0, 0.35, 0, 0, 0, 0, -0.35, 0, 0, 0.35, 0, -0.6, 0, 0, 0.6, 0)
		this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
		this.object = new THREE.LineSegments(this.geometry, this.material)
		this.object.renderOrder = 1000
		this.object.frustumCulled = false
		this.object.visible = false
	}

	show(): void {
		this.holding = true
		this.linger = LINGER_SECONDS
	}

	release(): void {
		this.holding = false
	}

	update(delta: number, camera: THREE.Camera, target: THREE.Vector3, allowed: boolean): void {
		if (!this.holding) this.linger = Math.max(0, this.linger - delta)
		const visible = allowed && (this.holding || this.linger > 0)
		const step = FADE_PER_SECOND * delta
		this.opacity = visible ? Math.min(OPACITY, this.opacity + step) : Math.max(0, this.opacity - step)
		this.material.opacity = this.opacity
		this.object.visible = this.opacity > 0
		if (!this.object.visible) return
		this.object.position.copy(target)
		this.object.scale.setScalar(camera.position.distanceTo(target) * 0.045)
	}

	dispose(): void {
		this.geometry.dispose()
		this.material.dispose()
	}
}
