import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { type Atmosphere, getAtmosphere } from './lib/atmosphere'
import { isGlbFileName, parseEmbeddedGlb, UnsupportedGlbError } from './lib/glb'
import { type CloudContext, MinecraftClouds } from './viewer-clouds'

export interface ViewerLoadOptions {
	signal?: AbortSignal
	originDelta?: { x: number; y: number; z: number }
	preserveView?: boolean
}

/** Imported assets belong to one capture; release shared resources exactly once. */
export function disposeImportedObject(root: THREE.Object3D): void {
	const geometries = new Set<THREE.BufferGeometry>()
	const materials = new Set<THREE.Material>()
	const textures = new Set<THREE.Texture>()
	const skeletons = new Set<THREE.Skeleton>()
	root.traverse(object => {
		if (!(object instanceof THREE.Mesh)) return
		geometries.add(object.geometry)
		const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
		for (const material of meshMaterials) materials.add(material)
		if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
	})
	for (const material of materials) {
		for (const value of Object.values(material)) {
			if (value instanceof THREE.Texture) textures.add(value)
		}
		material.dispose()
	}
	for (const skeleton of skeletons) {
		if (skeleton.boneTexture) textures.add(skeleton.boneTexture)
		// The texture is disposed below with all other shared textures.
		skeleton.boneTexture = null
		skeleton.dispose()
	}
	const images = new Set<ImageBitmap>()
	for (const texture of textures) {
		texture.dispose()
		// GLTFLoader uses ImageBitmap when available; GPU disposal does not release its CPU pixels.
		const image: unknown = texture.source.data
		if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image)
	}
	for (const image of images) image.close()
	for (const geometry of geometries) geometry.dispose()
}

export interface ViewerCycle {
	minutes: number
	glyph: string
	night: boolean
}

export interface ViewerSceneEvents {
	onCycle(cycle: ViewerCycle): void
	onFileInfo(name: string, size: number): void
	onEmptyChange(empty: boolean): void
	onLoading(message: string | null): void
}

interface ImportedLight {
	light: THREE.PointLight
	position: THREE.Vector3
	color: THREE.Color
	intensity: number
	distance: number
}

export class ViewerScene {
	private readonly canvas: HTMLCanvasElement
	private readonly events: ViewerSceneEvents
	private readonly renderer: THREE.WebGLRenderer
	private readonly scene = new THREE.Scene()
	private readonly camera: THREE.PerspectiveCamera
	private readonly controls: OrbitControls
	private readonly modelRoot = new THREE.Group()
	private readonly loader = new GLTFLoader()
	private readonly skyUniforms = {
		uDay: { value: 9.5 / 24 },
		uMoonPhase: { value: 0 },
		uDayZenith: { value: new THREE.Vector3(0.2, 0.53, 0.88) },
		uDayHorizon: { value: new THREE.Vector3(0.64, 0.8, 0.94) },
		uNightZenith: { value: new THREE.Vector3(0.018, 0.028, 0.075) },
		uNightHorizon: { value: new THREE.Vector3(0.1, 0.12, 0.2) },
		uStars: { value: 1 },
		uCelestial: { value: 1 },
		uFixed: { value: -1 },
	}
	private atmosphere: Atmosphere = getAtmosphere(null, null)
	private readonly sky: THREE.Mesh
	private readonly clouds = new MinecraftClouds()
	private readonly hemisphere = new THREE.HemisphereLight(0xe2efff, 0x36352e, 0.65)
	private readonly keyLight = new THREE.DirectionalLight(0xffedc2, 1.05)
	private readonly nightFill = new THREE.DirectionalLight(0x7799ff, 0.04)
	private readonly shadowCenter = new THREE.Vector3()
	private readonly lastShadowDirection = new THREE.Vector3()
	private readonly resizeObserver: ResizeObserver
	private readonly onWindowResize: () => void
	private dayTime = 9.5 / 24
	private lunarAge = 0
	private lastMinutes = -1
	private shadowExtent = 32
	private hasShadowDirection = false
	private previousFrame = 0
	private disposed = false
	private preparingWorld = false
	private loadingFile = false

	constructor(canvas: HTMLCanvasElement, events: ViewerSceneEvents) {
		this.canvas = canvas
		this.events = events
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.toneMapping = THREE.NeutralToneMapping
		this.renderer.toneMappingExposure = 1
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = THREE.PCFShadowMap
		this.renderer.shadowMap.autoUpdate = false
		this.renderer.setClearColor('#11140f')

		this.sky = new THREE.Mesh(
			new THREE.SphereGeometry(1, 32, 20),
			new THREE.ShaderMaterial({
				uniforms: this.skyUniforms,
				side: THREE.BackSide,
				depthWrite: false,
				vertexShader: `varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
				fragmentShader: `
      varying vec3 vDirection;
      uniform float uDay;
      uniform float uMoonPhase;
      uniform vec3 uDayZenith;
      uniform vec3 uDayHorizon;
      uniform vec3 uNightZenith;
      uniform vec3 uNightHorizon;
      uniform float uStars;
      uniform float uCelestial;
      uniform float uFixed;
      void main() {
        vec3 direction = normalize(vDirection);
        float angle = (uDay - 0.25) * 6.28318530718;
        float elevation = sin(angle);
        float rawLight = smoothstep(-0.12, 0.20, elevation);
        float daylight = uFixed >= 0.0 ? uFixed : rawLight;
        vec3 nightZenith = uNightZenith;
        vec3 nightHorizon = uNightHorizon;
        vec3 dayZenith = uDayZenith;
        vec3 dayHorizon = uDayHorizon;
        float horizon = smoothstep(-0.30, 0.85, direction.y);
        vec3 skyColor = mix(mix(nightHorizon, nightZenith, horizon), mix(dayHorizon, dayZenith, horizon), daylight);
        vec3 sunDirection = normalize(vec3(cos(angle), elevation, 0.30));
        float sunDot = dot(direction, sunDirection);
        vec3 sunRight = normalize(cross(sunDirection, vec3(0.0, 1.0, 0.0)));
        vec3 sunUp = normalize(cross(sunRight, sunDirection));
        float sunSquare = step(abs(dot(direction, sunRight)), 0.045) * step(abs(dot(direction, sunUp)), 0.045);
        float sunDisk = sunSquare * smoothstep(-0.12, 0.20, elevation) * uCelestial;
        float sunGlow = pow(max(sunDot, 0.0), 48.0) * daylight * uCelestial;
        vec3 sunColor = mix(vec3(1.0, 0.48, 0.20), vec3(1.0, 0.91, 0.68), smoothstep(0.0, 0.45, elevation));
        skyColor = mix(skyColor, sunColor, max(sunDisk * daylight, sunGlow * 0.38));
        vec3 moonDirection = -sunDirection;
        vec3 moonRight = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.0)));
        vec3 moonUp = normalize(cross(moonRight, moonDirection));
        float moonSquare = step(abs(dot(direction, moonRight)), 0.030) * step(abs(dot(direction, moonUp)), 0.030);
        float moonPhase = mod(floor(uMoonPhase), 8.0);
        float phaseEdge = cos(moonPhase * 0.78539816339);
        float moonX = dot(direction, moonRight) / 0.030;
        float moonLit = moonPhase < 4.0 ? step(-phaseEdge, moonX) : step(moonX, phaseEdge);
        float moonVisible = moonSquare * moonLit * (1.0 - daylight) * uCelestial;
        skyColor = mix(skyColor, vec3(0.78, 0.84, 0.94), moonVisible);
        float stars = step(0.9988, fract(sin(dot(floor(direction * 420.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
        skyColor += vec3(0.72, 0.82, 1.0) * stars * (1.0 - daylight) * smoothstep(0.0, 0.15, direction.y) * uStars;
        gl_FragColor = vec4(skyColor, 1.0);
      }`,
			})
		)
		this.sky.frustumCulled = false
		this.sky.renderOrder = -100
		this.scene.add(this.sky)

		this.scene.add(this.clouds)

		this.scene.add(this.hemisphere)
		this.keyLight.position.set(8, 14, 10)
		this.keyLight.castShadow = true
		this.keyLight.shadow.mapSize.set(4096, 4096)
		this.keyLight.shadow.bias = -0.00015
		this.keyLight.shadow.normalBias = 0.025
		this.keyLight.shadow.autoUpdate = false
		this.keyLight.shadow.camera.left = -32
		this.keyLight.shadow.camera.right = 32
		this.keyLight.shadow.camera.top = 32
		this.keyLight.shadow.camera.bottom = -32
		this.keyLight.shadow.camera.near = 0.1
		this.keyLight.shadow.camera.far = 128
		this.scene.add(this.keyLight.target)
		this.scene.add(this.keyLight)
		this.scene.add(this.nightFill)

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
		this.camera.position.set(8, 7, 8)
		this.controls = new OrbitControls(this.camera, this.canvas)
		this.controls.enableDamping = true
		this.controls.dampingFactor = 0.08
		this.scene.add(this.modelRoot)

		this.onWindowResize = () => this.resize()
		window.addEventListener('resize', this.onWindowResize)
		this.resizeObserver = new ResizeObserver(() => this.resize())
		if (this.canvas.parentElement) this.resizeObserver.observe(this.canvas.parentElement)
		this.renderer.setAnimationLoop(timestamp => this.frame(timestamp))
		this.resize()
		this.updateDayCycle()
	}

	setCaptureContext(context: CloudContext): void {
		this.clouds.setContext(context)
		this.atmosphere = getAtmosphere(context.dimension, context.biome)
		this.skyUniforms.uDayZenith.value.set(...this.atmosphere.dayZenith)
		this.skyUniforms.uDayHorizon.value.set(...this.atmosphere.dayHorizon)
		this.skyUniforms.uNightZenith.value.set(...this.atmosphere.nightZenith)
		this.skyUniforms.uNightHorizon.value.set(...this.atmosphere.nightHorizon)
		this.skyUniforms.uStars.value = this.atmosphere.starAlpha
		this.skyUniforms.uCelestial.value = this.atmosphere.celestial ? 1 : 0
		this.skyUniforms.uFixed.value = this.atmosphere.fixedDaylight ?? -1
		if (context.dimension === 'minecraft:the_nether') {
			this.hemisphere.color.set(0xff9a7a)
			this.hemisphere.groundColor.set(0x4a1a12)
		} else if (context.dimension === 'minecraft:the_end') {
			this.hemisphere.color.set(0xb8a8e8)
			this.hemisphere.groundColor.set(0x1a1626)
		} else {
			this.hemisphere.color.set(0xe2efff)
			this.hemisphere.groundColor.set(0x36352e)
		}
		this.updateDayCycle()
	}

	async loadFile(file: File, options: ViewerLoadOptions = {}): Promise<void> {
		if (!isGlbFileName(file.name)) throw new Error('Choose a .glb file')
		if (this.loadingFile) throw new Error('A model is already loading')
		this.loadingFile = true
		let imported: THREE.Group | undefined
		let attached = false
		this.events.onLoading('Lecture du fichier…')
		try {
			this.ensureLoadActive(options.signal)
			const buffer = await file.arrayBuffer()
			this.ensureLoadActive(options.signal)
			this.events.onLoading('Chargement du modèle et des textures…')
			const gltf = await parseEmbeddedGlb(buffer, data => this.loader.parseAsync(data, ''))
			imported = gltf.scene
			this.ensureLoadActive(options.signal)
			const delta = options.originDelta
			if (delta) imported.position.add(new THREE.Vector3(delta.x, delta.y, delta.z))
			this.preparingWorld = true
			// Keep the previous capture until compilation succeeds. RAF is paused during this transaction.
			const previous = [...this.modelRoot.children]
			for (const child of previous) child.visible = false
			this.modelRoot.add(imported)
			attached = true
			this.prepareWorldLighting(imported)
			this.events.onLoading('Préparation de l’affichage 3D…')
			await this.renderer.compileAsync(this.scene, this.camera)
			this.ensureLoadActive(options.signal)
			this.frameModel(imported, options.preserveView)
			this.renderScene()
			for (const child of previous) {
				child.removeFromParent()
				disposeImportedObject(child)
			}
			imported = undefined
			this.events.onFileInfo(file.name, file.size)
			this.events.onEmptyChange(false)
		} catch (error) {
			this.rollbackImport(imported, attached)
			if (error instanceof UnsupportedGlbError || (error instanceof Error && error.name === 'AbortError')) throw error
			throw new Error('Could not read this GLB')
		} finally {
			this.events.onLoading(null)
			this.preparingWorld = false
			this.loadingFile = false
		}
	}

	private ensureLoadActive(signal?: AbortSignal): void {
		if (this.disposed || signal?.aborted) throw new DOMException('Loading cancelled', 'AbortError')
	}

	private rollbackImport(imported: THREE.Group | undefined, attached: boolean): void {
		if (imported) {
			imported.removeFromParent()
			if (!(attached && this.disposed)) disposeImportedObject(imported)
		}
		if (attached) {
			for (const child of this.modelRoot.children) child.visible = true
		}
	}

	setMinutes(minutes: number): void {
		this.dayTime = minutes / 1440
		this.updateDayCycle()
		this.updateSunShadow(true)
	}

	resetView(): void {
		const model = this.modelRoot.children[0]
		if (model) this.frameModel(model)
	}

	snapshot(targetWidth = 400, targetHeight = 250): string | null {
		if (this.modelRoot.children.length === 0) return null
		this.controls.update()
		this.renderScene()
		const sourceWidth = this.canvas.width
		const sourceHeight = this.canvas.height
		if (sourceWidth < 2 || sourceHeight < 2) return null
		const targetAspect = targetWidth / targetHeight
		let cropWidth = sourceWidth
		let cropHeight = sourceHeight
		if (sourceWidth / sourceHeight > targetAspect) cropWidth = sourceHeight * targetAspect
		else cropHeight = sourceWidth / targetAspect
		const output = document.createElement('canvas')
		output.width = targetWidth
		output.height = targetHeight
		const context = output.getContext('2d')
		if (!context) return null
		context.imageSmoothingEnabled = true
		context.imageSmoothingQuality = 'high'
		context.drawImage(
			this.canvas,
			(sourceWidth - cropWidth) / 2,
			(sourceHeight - cropHeight) / 2,
			cropWidth,
			cropHeight,
			0,
			0,
			targetWidth,
			targetHeight
		)
		return output.toDataURL('image/jpeg', 0.8)
	}

	dispose(): void {
		this.disposed = true
		this.renderer.setAnimationLoop(null)
		window.removeEventListener('resize', this.onWindowResize)
		this.resizeObserver.disconnect()
		this.controls.dispose()
		this.clouds.dispose()
		this.clouds.removeFromParent()
		disposeImportedObject(this.scene)
		this.renderer.dispose()
	}

	private frame(timestamp: number): void {
		if (this.disposed || this.preparingWorld) return
		const deltaSeconds = this.previousFrame === 0 ? 0 : Math.min((timestamp - this.previousFrame) / 1000, 0.1)
		this.previousFrame = timestamp

		this.clouds.update(this.camera.position, deltaSeconds)
		this.controls.update()
		this.renderScene()
	}

	private renderScene(): void {
		// Camera framing can change before the next RAF, including thumbnail generation.
		this.sky.position.copy(this.camera.position)
		this.sky.scale.setScalar(Math.max(this.camera.far * 0.88, this.camera.near * 2))
		this.renderer.render(this.scene, this.camera)
	}

	private resize(): void {
		const { width, height } = this.canvas.getBoundingClientRect()
		if (width < 1 || height < 1) return
		this.renderer.setSize(width, height, false)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
	}

	private frameModel(root: THREE.Object3D, preserveView = false): void {
		const bounds = new THREE.Box3().setFromObject(root)
		if (bounds.isEmpty()) return
		const center = bounds.getCenter(new THREE.Vector3())
		const size = bounds.getSize(new THREE.Vector3())
		const largest = Math.max(size.x, size.y, size.z, 1)
		if (!preserveView) this.controls.target.copy(center)
		this.shadowCenter.copy(center)
		this.shadowExtent = Math.max(8, size.length() * 0.65)
		this.clouds.setBaseHeight(bounds.max.y + 24)
		this.updateSunShadow(true)
		if (!preserveView)
			this.camera.position.copy(center).add(new THREE.Vector3(largest * 1.25, largest * 0.9, largest * 1.25))
		this.camera.near = Math.max(0.01, largest / 1000)
		this.camera.far = Math.max(4000, largest * 30)
		this.camera.updateProjectionMatrix()
		this.controls.minDistance = Math.max(0.1, largest * 0.015)
		this.controls.maxDistance = largest * 12
		this.controls.update()
	}

	private updateSunShadow(force = false): void {
		const angle = (this.dayTime - 0.25) * Math.PI * 2
		const sunDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize()
		const right = new THREE.Vector3().crossVectors(sunDirection, new THREE.Vector3(0, 1, 0)).normalize()
		const lightUp = new THREE.Vector3().crossVectors(right, sunDirection).normalize()
		const texelSize = (this.shadowExtent * 2) / this.keyLight.shadow.mapSize.x
		const target = this.shadowCenter.clone()
		const rightPosition = target.dot(right)
		const upPosition = target.dot(lightUp)
		target.addScaledVector(right, Math.round(rightPosition / texelSize) * texelSize - rightPosition)
		target.addScaledVector(lightUp, Math.round(upPosition / texelSize) * texelSize - upPosition)

		this.keyLight.target.position.copy(target)
		this.keyLight.position.copy(target).addScaledVector(sunDirection, this.shadowExtent * 2)
		this.keyLight.shadow.camera.left = -this.shadowExtent
		this.keyLight.shadow.camera.right = this.shadowExtent
		this.keyLight.shadow.camera.top = this.shadowExtent
		this.keyLight.shadow.camera.bottom = -this.shadowExtent
		this.keyLight.shadow.camera.near = 0.1
		this.keyLight.shadow.camera.far = this.shadowExtent * 4
		this.keyLight.shadow.camera.updateProjectionMatrix()

		if (force || !this.hasShadowDirection || this.lastShadowDirection.angleTo(sunDirection) > 0.003) {
			this.lastShadowDirection.copy(sunDirection)
			this.hasShadowDirection = true
			this.keyLight.shadow.needsUpdate = true
			this.renderer.shadowMap.needsUpdate = true
		}
	}

	private prepareMesh(object: THREE.Mesh): void {
		object.castShadow = true
		object.receiveShadow = true
		const materials = Array.isArray(object.material) ? object.material : [object.material]
		let hasOpaqueSurface = false
		for (const material of materials) {
			const pbrMaterial = material as THREE.MeshStandardMaterial
			if (pbrMaterial.isMeshStandardMaterial) {
				pbrMaterial.roughness = 1
				pbrMaterial.metalness = 0
				pbrMaterial.flatShading = true
				pbrMaterial.emissiveIntensity = Math.min(pbrMaterial.emissiveIntensity, 0.14)
			}
			hasOpaqueSurface ||= !material.transparent || material.alphaTest > 0
			for (const texture of [
				pbrMaterial.map,
				pbrMaterial.emissiveMap,
				pbrMaterial.normalMap,
				pbrMaterial.roughnessMap,
				pbrMaterial.metalnessMap,
				pbrMaterial.aoMap,
			]) {
				if (!texture) continue
				texture.magFilter = THREE.NearestFilter
				texture.minFilter = THREE.NearestMipmapNearestFilter
				texture.generateMipmaps = true
				texture.anisotropy = 1
				texture.needsUpdate = true
			}
			material.needsUpdate = true
		}
		object.castShadow = hasOpaqueSurface
		object.receiveShadow = hasOpaqueSurface
	}

	private prepareWorldLighting(root: THREE.Object3D): void {
		const importedLights: ImportedLight[] = []

		root.updateMatrixWorld(true)
		root.traverse(object => {
			if (object instanceof THREE.PointLight) {
				importedLights.push({
					light: object,
					position: object.getWorldPosition(new THREE.Vector3()),
					color: object.color.clone(),
					intensity: object.intensity,
					distance: object.distance,
				})
				return
			}
			if (!(object instanceof THREE.Mesh)) return
			this.prepareMesh(object)
		})

		const cellSize = 6
		const lightCells = new Map<string, ImportedLight>()
		for (const light of importedLights) {
			light.light.removeFromParent()
			const { x, y, z } = light.position
			const cell = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`
			const current = lightCells.get(cell)
			if (!current || light.intensity > current.intensity) lightCells.set(cell, light)
		}

		const selectedLights = [...lightCells.values()].sort((left, right) => right.intensity - left.intensity).slice(0, 32)
		for (const imported of selectedLights) {
			const light = new THREE.PointLight(
				imported.color,
				Math.min(imported.intensity * 0.002, 2),
				Math.min(Math.max(imported.distance, 1), 10),
				2
			)
			light.position.copy(root.worldToLocal(imported.position.clone()))
			root.add(light)
		}
	}

	private updateDayCycle(): void {
		this.dayTime = ((this.dayTime % 1) + 1) % 1
		const minutes = Math.round(this.dayTime * 1440) % 1440
		const angle = (this.dayTime - 0.25) * Math.PI * 2
		const sunHeight = Math.sin(angle)
		const rawLight = THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.2)
		const daylight = THREE.MathUtils.clamp(
			(this.atmosphere.fixedDaylight ?? rawLight) * this.atmosphere.daylightScale,
			0,
			1
		)
		this.skyUniforms.uDay.value = this.dayTime
		this.skyUniforms.uMoonPhase.value = this.lunarAge
		this.keyLight.intensity = 0.015 + daylight * 1.05
		const shouldCastShadow = daylight > 0.08
		if (this.keyLight.castShadow !== shouldCastShadow) {
			this.keyLight.castShadow = shouldCastShadow
			this.keyLight.shadow.needsUpdate = true
			this.renderer.shadowMap.needsUpdate = true
		}
		this.keyLight.color.set(sunHeight < 0.18 ? 0xff9a62 : 0xffedc2)
		if (this.atmosphere.fixedDaylight !== null && !this.atmosphere.celestial) {
			this.keyLight.color.set(0xff8a5c)
		}
		this.hemisphere.intensity = 0.08 + daylight * 0.62
		this.nightFill.intensity = 0.02 + (1 - daylight) * 0.12
		this.updateSunShadow()
		this.clouds.material.color.setRGB(0.22 + daylight * 0.72, 0.26 + daylight * 0.7, 0.38 + daylight * 0.58)
		if (minutes !== this.lastMinutes) {
			this.lastMinutes = minutes
			let glyph = '☀'
			if (daylight < 0.12) glyph = '☾'
			else if (sunHeight < 0.2) glyph = '◒'
			this.events.onCycle({ minutes, glyph, night: daylight < 0.12 })
		}
	}
}

export function formatClock(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
