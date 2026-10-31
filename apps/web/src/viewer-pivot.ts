import * as THREE from 'three'

const LINGER_SECONDS = 1.2
const FADE_PER_SECOND = 4
const RING_SEGMENTS = 48
const OPACITY = 0.55
const SHADOW_OPACITY = 0.9
const SIZE = 0.045

/** Soft round shadow: dark centre fading to nothing at the rim. */
function shadowTexture(): THREE.DataTexture {
	const size = 64,
		pixels = new Uint8Array(size * size * 4)
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
			// alphaMap reads the green channel.
			pixels.fill(Math.round(255 * Math.max(0, 1 - distance) ** 1.2), (y * size + x) * 4, (y * size + x) * 4 + 4)
		}
	const texture = new THREE.DataTexture(pixels, size, size)
	texture.needsUpdate = true
	return texture
}

/**
 * A faint gizmo marking the orbit/pan origin while the camera is being driven. A soft shadow on the ground below
 * it, joined by a thin stem, locates the pivot in depth.
 */
export class ViewerPivot {
	readonly object = new THREE.Group()
	private readonly ringGeometry = new THREE.BufferGeometry()
	private readonly ringMaterial = new THREE.LineBasicMaterial({
		color: 0xe6c68e,
		transparent: true,
		opacity: 0,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	})
	private readonly ring = new THREE.LineSegments(this.ringGeometry, this.ringMaterial)
	private readonly shadowGeometry = new THREE.CircleGeometry(1.8, 32).rotateX(-Math.PI / 2)
	private readonly shadowMap = shadowTexture()
	private readonly shadowMaterial = new THREE.MeshBasicMaterial({
		color: 0x000000,
		alphaMap: this.shadowMap,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		toneMapped: false,
	})
	private readonly shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial)
	private readonly stemGeometry = new THREE.BufferGeometry().setAttribute(
		'position',
		new THREE.Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3)
	)
	private readonly stemMaterial = new THREE.LineBasicMaterial({
		color: 0xe6c68e,
		transparent: true,
		opacity: 0,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	})
	private readonly stem = new THREE.Line(this.stemGeometry, this.stemMaterial)
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
		this.ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
		for (const part of [this.ring, this.stem]) part.renderOrder = 1000
		this.shadow.renderOrder = 999
		for (const part of [this.ring, this.shadow, this.stem]) {
			part.frustumCulled = false
			this.object.add(part)
		}
		this.object.visible = false
	}

	/** True while the gizmo is shown or fading: the scene only measures the ground for it then. */
	get wanted(): boolean {
		return this.holding || this.linger > 0 || this.opacity > 0
	}

	show(): void {
		this.holding = true
		this.linger = LINGER_SECONDS
	}

	release(): void {
		this.holding = false
	}

	/** `ground` is the height of the surface nearest the target vertically, or null when there is none. */
	update(delta: number, camera: THREE.Camera, target: THREE.Vector3, allowed: boolean, ground: number | null = null) {
		if (!this.holding) this.linger = Math.max(0, this.linger - delta)
		const visible = allowed && (this.holding || this.linger > 0)
		const step = FADE_PER_SECOND * delta
		this.opacity = visible ? Math.min(OPACITY, this.opacity + step) : Math.max(0, this.opacity - step)
		this.object.visible = this.opacity > 0
		if (!this.object.visible) return
		const scale = camera.position.distanceTo(target) * SIZE
		this.object.position.copy(target)
		this.ring.scale.setScalar(scale)
		this.ringMaterial.opacity = this.opacity
		const drop = ground === null ? 0 : target.y - ground
		this.shadow.visible = ground !== null
		this.stem.visible = ground !== null && Math.abs(drop) > scale * 0.7
		if (ground === null) return
		// Further from the surface (above it, or buried below it), the shadow spreads and fades like a real one.
		const spread = 1 + Math.min(Math.abs(drop) / Math.max(scale, 0.001), 12) * 0.05
		this.shadow.position.set(0, -drop + 0.02, 0)
		this.shadow.scale.setScalar(scale * spread)
		this.shadowMaterial.opacity = (this.opacity / OPACITY) * (SHADOW_OPACITY / spread)
		this.stem.scale.set(1, drop, 1)
		this.stemMaterial.opacity = this.opacity * 0.6
	}

	dispose(): void {
		for (const resource of [
			this.ringGeometry,
			this.ringMaterial,
			this.shadowGeometry,
			this.shadowMaterial,
			this.shadowMap,
			this.stemGeometry,
			this.stemMaterial,
		])
			resource.dispose()
	}
}
