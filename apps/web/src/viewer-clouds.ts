import * as THREE from 'three'

export interface CloudContext {
	x: number | null
	y: number | null
	z: number | null
	dayTime: number | null
	dimension: string | null
}

const CELLS = 80
const CELL_SIZE = 12

export class MinecraftClouds extends THREE.Group {
	readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
	private readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material)
	private pixels: Uint8ClampedArray | null = null
	private context: CloudContext = { x: 0, y: 64, z: 0, dayTime: 0, dimension: null }
	private elapsed = 0
	private cellKey = ''
	private disposed = false

	constructor() {
		super()
		this.mesh.frustumCulled = false
		this.add(this.mesh)
		const image = new Image()
		image.onload = () => {
			if (this.disposed) return
			const canvas = document.createElement('canvas')
			canvas.width = canvas.height = 256
			const context = canvas.getContext('2d')
			if (!context) return
			context.drawImage(image, 0, 0)
			this.pixels = context.getImageData(0, 0, 256, 256).data
		}
		image.src = '/textures/minecraft-clouds.png'
	}

	setContext(context: CloudContext): void {
		this.context = context
		this.elapsed = 0
		this.cellKey = ''
		this.visible = !context.dimension || context.dimension === 'minecraft:overworld'
	}

	update(camera: THREE.Vector3, deltaSeconds: number): void {
		this.elapsed += deltaSeconds
		if (!(this.pixels && this.visible)) return
		const drift = (this.context.dayTime ?? 0) * 0.03 + this.elapsed * 0.6
		const x = (this.context.x ?? 0) + camera.x + drift
		const z = (this.context.z ?? 0) + camera.z
		const cellX = Math.floor(x / CELL_SIZE)
		const cellZ = Math.floor(z / CELL_SIZE)
		const key = `${cellX}:${cellZ}`
		if (key !== this.cellKey) {
			this.rebuild(cellX, cellZ)
			this.cellKey = key
		}
		this.position.set(
			camera.x - (x - cellX * CELL_SIZE),
			194 - (this.context.y ?? 64),
			camera.z - (z - cellZ * CELL_SIZE)
		)
	}

	dispose(): void {
		this.disposed = true
		this.mesh.geometry.dispose()
		this.material.dispose()
	}

	private occupied(x: number, z: number): boolean {
		const pixelX = ((x % 256) + 256) % 256
		const pixelZ = ((z % 256) + 256) % 256
		return (this.pixels?.[(pixelZ * 256 + pixelX) * 4 + 3] ?? 0) >= 128
	}

	private rebuild(cellX: number, cellZ: number): void {
		const positions: number[] = []
		const colors: number[] = []
		const face = (vertices: number[], shade: number) => {
			for (const index of [0, 1, 2, 0, 2, 3]) {
				positions.push(vertices[index * 3] ?? 0, vertices[index * 3 + 1] ?? 0, vertices[index * 3 + 2] ?? 0)
				colors.push(shade, shade, shade)
			}
		}
		for (let x = -CELLS / 2; x < CELLS / 2; x += 1) {
			for (let z = -CELLS / 2; z < CELLS / 2; z += 1) {
				if (!this.occupied(cellX + x, cellZ + z)) continue
				this.addCell(x, z, cellX, cellZ, face)
			}
		}
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
		this.mesh.geometry.dispose()
		this.mesh.geometry = geometry
	}
	private addCell(
		x: number,
		z: number,
		cellX: number,
		cellZ: number,
		face: (vertices: number[], shade: number) => void
	): void {
		const left = x * CELL_SIZE,
			right = left + CELL_SIZE,
			back = z * CELL_SIZE,
			front = back + CELL_SIZE
		face([left, 2, back, right, 2, back, right, 2, front, left, 2, front], 1)
		face([left, -2, back, right, -2, back, right, -2, front, left, -2, front], 0.7)
		if (!this.occupied(cellX + x - 1, cellZ + z))
			face([left, -2, back, left, 2, back, left, 2, front, left, -2, front], 0.9)
		if (!this.occupied(cellX + x + 1, cellZ + z))
			face([right, -2, back, right, 2, back, right, 2, front, right, -2, front], 0.9)
		if (!this.occupied(cellX + x, cellZ + z - 1))
			face([left, -2, back, left, 2, back, right, 2, back, right, -2, back], 0.8)
		if (!this.occupied(cellX + x, cellZ + z + 1))
			face([left, -2, front, left, 2, front, right, 2, front, right, -2, front], 0.8)
	}
}
