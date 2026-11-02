import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { type Atmosphere, getAtmosphere } from './lib/atmosphere'
import { CeilingGrid } from './lib/ceiling'
import { isGlbFileName, parseEmbeddedGlb, UnsupportedGlbError } from './lib/glb'
import { dayDelta, Glide } from './lib/transitions'
import type { BlockBounds, BlockPoint } from './lib/world-evolution'
import { type CloudContext, MinecraftClouds } from './viewer-clouds'
import { ViewerEffects, type ViewerQuality, type ViewerWeather } from './viewer-effects'
import { framingBounds, isLightBeam, orbitFocus, surfaceFocus } from './viewer-framing'
import { ViewerNavigation } from './viewer-navigation'
import { ViewerPivot } from './viewer-pivot'
import { ViewerPrecipitation } from './viewer-precipitation'
import { prepareWater } from './viewer-water'
import { chooseLights, prepareLayer, type WorldLayer, type WorldLight } from './viewer-world'

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
	onQuality?(label: string): void
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
		uWeather: { value: 0 },
		uDay: { value: 9.5 / 24 },
		uMoonPhase: { value: 0 },
		uDayZenith: { value: new THREE.Vector3(0.055, 0.24, 0.52) },
		uDayHorizon: { value: new THREE.Vector3(0.36, 0.57, 0.7) },
		uNightZenith: { value: new THREE.Vector3(0.018, 0.028, 0.075) },
		uNightHorizon: { value: new THREE.Vector3(0.1, 0.12, 0.2) },
		uStars: { value: 1 },
		uCelestial: { value: 1 },
		uFixed: { value: -1 },
	}
	private readonly precipitation = new ViewerPrecipitation()
	private readonly worldLights = Array.from({ length: 12 }, () => new THREE.PointLight(0xffffff, 0, 1, 2))
	private readonly pivot = new ViewerPivot()
	private readonly groundRay = new THREE.Raycaster()
	private readonly probedTarget = new THREE.Vector3(Number.NaN, 0, 0)
	private ground: number | null = null
	private lastProbe = 0
	private focusRoot: THREE.Object3D | null = null
	private ceilingDirty = true
	private cameraGlide: { glide: Glide; from: THREE.Vector3; to: THREE.Vector3; camera: THREE.Vector3 } | null = null
	private timeGlide: { glide: Glide; from: number; delta: number } | null = null
	private daylight = 1
	private captureFocus: THREE.Vector3 | null = null
	private readonly navigation: ViewerNavigation
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
	private readonly waterTime = { value: 0 }
	private disposed = false
	private preparingWorld = false
	private loadingFile = false
	private readonly effects: ViewerEffects
	private readonly environmentGenerator: THREE.PMREMGenerator
	private environment: THREE.WebGLRenderTarget | null = null
	private quality: ViewerQuality = 'auto'
	private weather: ViewerWeather = 'clear'
	private pixelRatio = Math.min(window.devicePixelRatio, 1.5)
	private slowFrames = 0
	private measuredFrames = 0
	private interactionTimer = 0
	private readonly onInteractionStart = () => {
		window.clearTimeout(this.interactionTimer)
		this.cameraGlide = null
		this.pivot.show()
		// Drop resolution while the camera moves so orbiting stays fluid, then restore it.
		if (this.quality === 'cinematic' || this.pixelRatio <= 1) return
		this.applyPixelRatio(Math.max(1, this.pixelRatio * 0.7))
	}
	private readonly onInteractionEnd = () => {
		this.pivot.release()
		window.clearTimeout(this.interactionTimer)
		this.interactionTimer = window.setTimeout(() => this.applyPixelRatio(this.pixelRatio), 220)
	}
	private readonly onDoubleClick = () => {
		if (!this.navigation.active) this.resetView()
	}
	private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

	constructor(canvas: HTMLCanvasElement, events: ViewerSceneEvents) {
		this.canvas = canvas
		this.events = events
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance',
		})
		this.renderer.setPixelRatio(this.pixelRatio)
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping
		this.renderer.toneMappingExposure = 0.92
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
      uniform float uWeather;
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
        float sunset = (1.0 - smoothstep(0.0, 0.5, abs(elevation))) * uCelestial;
        skyColor = mix(skyColor, vec3(0.92, 0.47, 0.15), sunset * (1.0 - horizon) * 0.72);
        skyColor = mix(skyColor, vec3(0.42, 0.49, 0.54) * (0.12 + daylight * 0.88), uWeather * 0.72);
        vec3 sunDirection = normalize(vec3(cos(angle), elevation, 0.30));
        float sunDot = dot(direction, sunDirection);
        vec3 sunRight = normalize(cross(sunDirection, vec3(0.0, 1.0, 0.0)));
        vec3 sunUp = normalize(cross(sunRight, sunDirection));
        float sunSquare = step(abs(dot(direction, sunRight)), 0.045) * step(abs(dot(direction, sunUp)), 0.045);
        float sunDisk = sunSquare * step(0.0, sunDot) * smoothstep(-0.12, 0.20, elevation) * uCelestial;
        float sunGlow = pow(max(sunDot, 0.0), 48.0) * daylight * uCelestial;
        vec3 sunColor = mix(vec3(1.0, 0.48, 0.20), vec3(1.0, 0.91, 0.68), smoothstep(0.0, 0.45, elevation));
        skyColor = mix(skyColor, sunColor, max(sunDisk * daylight, sunGlow * 0.38) * (1.0 - uWeather * 0.9));
        vec3 moonDirection = -sunDirection;
        vec3 moonRight = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.0)));
        vec3 moonUp = normalize(cross(moonRight, moonDirection));
        float moonSquare = step(abs(dot(direction, moonRight)), 0.030) * step(abs(dot(direction, moonUp)), 0.030);
        float moonPhase = mod(floor(uMoonPhase), 8.0);
        float phaseEdge = cos(moonPhase * 0.78539816339);
        float moonX = dot(direction, moonRight) / 0.030;
        float moonLit = moonPhase < 4.0 ? step(-phaseEdge, moonX) : step(moonX, phaseEdge);
        float moonVisible = moonSquare * step(0.0, dot(direction, moonDirection)) * moonLit * (1.0 - daylight) * uCelestial;
        skyColor = mix(skyColor, vec3(0.78, 0.84, 0.94), moonVisible);
        float stars = step(0.9988, fract(sin(dot(floor(direction * 420.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
        skyColor += vec3(0.72, 0.82, 1.0) * stars * (1.0 - daylight) * smoothstep(0.0, 0.15, direction.y) * uStars;
        skyColor *= mix(0.28, 1.0, smoothstep(-0.85, 0.12, direction.y));
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
		this.keyLight.shadow.mapSize.set(2048, 2048)
		this.keyLight.shadow.bias = -0.00015
		this.keyLight.shadow.normalBias = 0.035
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
		this.navigation = new ViewerNavigation(this.camera, canvas)
		this.camera.position.set(8, 7, 8)
		this.controls = new OrbitControls(this.camera, this.canvas)
		this.controls.enablePan = true
		this.controls.screenSpacePanning = true
		// Zooming toward the cursor would drag the orbit pivot along; keep the pivot where the user put it.
		this.controls.zoomToCursor = false
		this.controls.enableDamping = true
		this.controls.dampingFactor = 0.08
		this.scene.add(this.modelRoot, this.precipitation.object, this.pivot.object)
		this.effects = new ViewerEffects(this.renderer, this.scene, this.camera)
		this.environmentGenerator = new THREE.PMREMGenerator(this.renderer)
		this.controls.autoRotateSpeed = 0.35
		this.controls.addEventListener('start', this.onInteractionStart)
		this.controls.addEventListener('end', this.onInteractionEnd)
		this.canvas.addEventListener('dblclick', this.onDoubleClick)
		this.nightFill.position.set(-20, 30, -20)

		this.onWindowResize = () => this.resize()
		window.addEventListener('resize', this.onWindowResize)
		this.resizeObserver = new ResizeObserver(() => this.resize())
		if (this.canvas.parentElement) this.resizeObserver.observe(this.canvas.parentElement)
		this.renderer.setAnimationLoop(timestamp => this.frame(timestamp))
		this.resize()
		this.updateDayCycle()
		this.updateEnvironment()
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
		this.updateEnvironment()
	}

	async loadFile(file: File, options: ViewerLoadOptions = {}): Promise<void> {
		if (!isGlbFileName(file.name)) throw new Error('Choose a .glb file')
		if (this.loadingFile) throw new Error('A model is already loading')
		this.loadingFile = true
		let imported: THREE.Group | undefined
		let attached = false
		this.events.onLoading('Reading the file…')
		try {
			this.ensureLoadActive(options.signal)
			const buffer = await file.arrayBuffer()
			this.ensureLoadActive(options.signal)
			this.events.onLoading('Loading the model and textures…')
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
			this.ceilingDirty = true
			this.events.onLoading('Preparing the 3D display…')
			await this.renderer.compileAsync(this.scene, this.camera)
			this.ensureLoadActive(options.signal)
			this.frameModel(imported, options.preserveView)
			this.updateEnvironment()
			this.clouds.update(this.camera.position, 0)
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

	/** Adds one capture of an evolving world next to the others; it draws nothing until composed. */
	async addLayer(
		file: File,
		capture: { origin: BlockPoint; bounds: BlockBounds; offset: BlockPoint },
		signal?: AbortSignal
	): Promise<WorldLayer> {
		const buffer = await file.arrayBuffer()
		this.ensureLoadActive(signal)
		const gltf = await parseEmbeddedGlb(buffer, data => this.loader.parseAsync(data, ''))
		const root = gltf.scene
		try {
			this.ensureLoadActive(signal)
			const layer = prepareLayer(root, capture.origin, capture.bounds)
			const offset = new THREE.Vector3(capture.offset.x, capture.offset.y, capture.offset.z)
			root.position.copy(offset)
			for (const light of layer.lights) light.position.add(offset)
			root.traverse(object => {
				if (object instanceof THREE.Mesh) this.prepareMesh(object)
			})
			const first = this.modelRoot.children.length === 0
			this.modelRoot.add(root)
			await this.renderer.compileAsync(root, this.camera, this.scene)
			this.ensureLoadActive(signal)
			if (first) {
				this.frameModel(root)
				this.updateEnvironment()
				this.events.onEmptyChange(false)
			}
			return layer
		} catch (error) {
			root.removeFromParent()
			if (!this.disposed) disposeImportedObject(root)
			throw error
		}
	}

	/** Shows the composed world: constant light count (no shader recompilation) and refreshed shadows. */
	showWorld(lights: readonly WorldLight[]): void {
		const focus = this.captureFocus ?? this.controls.target
		const selected = chooseLights(lights, focus)
		for (const [position, light] of this.worldLights.entries()) {
			if (!light.parent) this.modelRoot.add(light)
			const source = selected[position]
			light.intensity = source ? Math.min(source.intensity * 0.01, 12) : 0
			if (!source) continue
			light.color.copy(source.color).multiply(new THREE.Color(1, 0.82, 0.65))
			light.distance = Math.min(Math.max(source.distance, 1), 10)
			light.position.copy(source.position)
		}
		this.keyLight.shadow.needsUpdate = true
		this.renderer.shadowMap.needsUpdate = true
		this.ceilingDirty = true
	}

	/** Frames one capture of the world, keeping the others in place. */
	focusLayer(root: THREE.Object3D, preserveView = false): void {
		this.focusRoot = root
		this.frameModel(root, preserveView)
		this.updateEnvironment()
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

	/** `smooth` turns the sun the short way to the new time instead of jumping there. */
	setMinutes(minutes: number, smooth = false): void {
		const target = minutes / 1440
		this.timeGlide = null
		if (smooth && !this.reducedMotion) {
			const delta = dayDelta(this.dayTime, target)
			if (Math.abs(delta) > 0.001) {
				this.timeGlide = { glide: new Glide(1.6), from: this.dayTime, delta }
				return
			}
		}
		this.dayTime = target
		this.updateDayCycle()
		this.updateSunShadow(true)
		this.updateEnvironment()
	}

	/** Moves the orbit pivot to a capture, carrying the camera along so the viewing angle and distance stay. */
	glideToLayer(root: THREE.Object3D): void {
		if (framingBounds(root).isEmpty()) return
		const focus = orbitFocus(root)
		this.focusRoot = root
		this.cameraGlide = null
		if (this.navigation.active) return
		if (this.reducedMotion) {
			this.camera.position.add(focus.clone().sub(this.controls.target))
			this.controls.target.copy(focus)
			this.settleFocus(focus)
			return
		}
		this.cameraGlide = {
			glide: new Glide(1.1),
			from: this.controls.target.clone(),
			to: focus,
			camera: this.camera.position.clone(),
		}
	}

	private settleFocus(focus: THREE.Vector3): void {
		this.captureFocus = focus.clone()
		this.shadowCenter.copy(focus)
		this.updateSunShadow(true)
	}

	private advanceGlides(delta: number): void {
		const camera = this.cameraGlide
		if (camera) {
			const offset = camera.to.clone().sub(camera.from).multiplyScalar(camera.glide.advance(delta))
			this.controls.target.copy(camera.from).add(offset)
			this.camera.position.copy(camera.camera).add(offset)
			if (camera.glide.done) {
				this.cameraGlide = null
				this.settleFocus(camera.to)
			}
		}
		const time = this.timeGlide
		if (!time) return
		this.dayTime = time.from + time.delta * time.glide.advance(delta)
		this.updateDayCycle()
		this.updateSunShadow()
		if (!time.glide.done) return
		this.timeGlide = null
		this.updateSunShadow(true)
		this.updateEnvironment()
	}

	/** Weather stops at the highest visible surface of each column, recomputed when the shown geometry changes. */
	private refreshCeiling(): void {
		this.modelRoot.updateMatrixWorld(true)
		const bounds = framingBounds(this.modelRoot)
		if (bounds.isEmpty()) {
			this.precipitation.setCeiling(null)
			return
		}
		const grid = new CeilingGrid(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z)
		const a = new THREE.Vector3(),
			b = new THREE.Vector3(),
			c = new THREE.Vector3()
		this.modelRoot.traverseVisible(object => {
			if (!(object instanceof THREE.Mesh) || isLightBeam(object.material as THREE.Material)) return
			const geometry = object.geometry as THREE.BufferGeometry
			const position = geometry.getAttribute('position')
			const index = geometry.index
			const end = Math.min(index ? index.count : position.count, geometry.drawRange.start + geometry.drawRange.count)
			const vertex = (corner: number) => (index ? index.getX(corner) : corner)
			for (let corner = geometry.drawRange.start; corner + 2 < end; corner += 3) {
				a.fromBufferAttribute(position, vertex(corner)).applyMatrix4(object.matrixWorld)
				b.fromBufferAttribute(position, vertex(corner + 1)).applyMatrix4(object.matrixWorld)
				c.fromBufferAttribute(position, vertex(corner + 2)).applyMatrix4(object.matrixWorld)
				grid.addTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
			}
		})
		this.precipitation.setCeiling(grid.value)
	}

	/** Height of the visible surface right below the orbit pivot, measured only while its gizmo is shown. */
	private probeGround(timestamp: number): void {
		const target = this.controls.target
		if (!this.pivot.wanted || this.navigation.active) return
		if (target.distanceToSquared(this.probedTarget) < 0.0025 || timestamp - this.lastProbe < 120) return
		this.lastProbe = timestamp
		this.probedTarget.copy(target)
		const meshes: THREE.Object3D[] = []
		this.modelRoot.traverseVisible(object => {
			if (object instanceof THREE.Mesh && !isLightBeam(object.material as THREE.Material)) meshes.push(object)
		})
		// A framed pivot often sits inside the terrain: take the surface vertically closest to it, above or below.
		this.groundRay.set(new THREE.Vector3(target.x, target.y + 256, target.z), new THREE.Vector3(0, -1, 0))
		this.groundRay.far = 768
		let nearest: number | null = null
		for (const hit of this.groundRay.intersectObjects(meshes, false))
			if (nearest === null || Math.abs(hit.point.y - target.y) < Math.abs(nearest - target.y)) nearest = hit.point.y
		this.ground = nearest
	}

	setQuality(quality: ViewerQuality): void {
		this.quality = quality
		this.pixelRatio = Math.min(window.devicePixelRatio, quality === 'cinematic' ? 2 : 1.25)
		if (quality === 'eco') this.pixelRatio = 1
		this.renderer.setPixelRatio(this.pixelRatio)
		this.effects.setQuality(quality)
		this.slowFrames = 0
		this.measuredFrames = 0
		this.resize()
		this.events.onQuality?.(quality)
	}

	setWeather(weather: ViewerWeather): void {
		this.weather = weather
		this.skyUniforms.uWeather.value = ['overcast', 'rain', 'snow'].includes(weather) ? 1 : 0
		this.updateDayCycle()
		this.updateEnvironment()
	}

	setFirstPerson(enabled: boolean): void {
		this.controls.autoRotate = false
		this.controls.enabled = !enabled
		if (enabled) {
			this.camera.position.copy(this.captureFocus ?? this.controls.target).add(new THREE.Vector3(0, 1.62, 0))
			const rotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
			rotation.x = 0
			rotation.z = 0
			this.camera.quaternion.setFromEuler(rotation)
		}
		if (!enabled && this.navigation.active) {
			this.navigation.setActive(false)
			this.resetView()
		}
		this.camera.near = 0.02
		this.camera.updateProjectionMatrix()
		this.navigation.setActive(enabled)
	}

	moveFirstPerson(direction: 'forward' | 'back' | 'up' | 'down', pressed: boolean): void {
		this.navigation.move(direction, pressed)
	}

	setTour(enabled: boolean): void {
		this.controls.autoRotate = enabled
	}

	private adaptQuality(delta: number): void {
		if (this.quality !== 'auto' || delta === 0 || this.modelRoot.children.length === 0) return
		this.measuredFrames++
		if (delta > 0.026) this.slowFrames++
		if (this.measuredFrames < 180) return
		if (this.slowFrames > 100 && this.pixelRatio > 0.75) {
			this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25)
			this.renderer.setPixelRatio(this.pixelRatio)
			this.effects.setQuality(this.pixelRatio <= 1 ? 'eco' : 'auto')
			this.resize()
			this.events.onQuality?.('adaptive')
		}
		this.measuredFrames = 0
		this.slowFrames = 0
	}

	private updateEnvironment(): void {
		if (this.modelRoot.children.length === 0) return
		const environmentScene = new THREE.Scene()
		const sky = new THREE.Mesh(this.sky.geometry, this.sky.material)
		sky.scale.setScalar(100)
		environmentScene.add(sky)
		const previous = this.environment
		this.environment = this.environmentGenerator.fromScene(environmentScene, 0.08, 0.1, 200)
		this.scene.environment = this.environment.texture
		previous?.dispose()
		const daylight =
			this.atmosphere.fixedDaylight ??
			THREE.MathUtils.smoothstep(Math.sin((this.dayTime - 0.25) * Math.PI * 2), -0.12, 0.2)
		const horizon = new THREE.Color()
			.setRGB(...this.atmosphere.nightHorizon)
			.lerp(new THREE.Color().setRGB(...this.atmosphere.dayHorizon), daylight)
		const density = this.weather === 'mist' ? 0.006 : 0.0004
		this.scene.fog = new THREE.FogExp2(horizon, density / Math.max(1, this.shadowExtent / 32))
		const angle = (this.dayTime - 0.25) * Math.PI * 2
		const sun = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize()
		this.effects.setAtmosphere(sun, daylight, this.weather, this.shadowCenter.y, horizon, this.atmosphere.celestial)
	}

	/** Frames the capture last focused (the one shown in a world), else the first one. */
	resetView(): void {
		const model = this.focusRoot?.parent ? this.focusRoot : this.modelRoot.children[0]
		if (model) this.frameModel(model)
	}

	snapshot(targetWidth = 400, targetHeight = 250): string | null {
		if (this.modelRoot.children.length === 0) return null
		if (!this.navigation.active) this.controls.update()
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
		window.clearTimeout(this.interactionTimer)
		this.canvas.removeEventListener('dblclick', this.onDoubleClick)
		this.renderer.setAnimationLoop(null)
		window.removeEventListener('resize', this.onWindowResize)
		this.resizeObserver.disconnect()
		this.navigation.dispose()
		this.controls.dispose()
		this.clouds.dispose()
		this.scene.remove(this.precipitation.object, this.pivot.object)
		this.pivot.dispose()
		this.precipitation.dispose()
		this.clouds.removeFromParent()
		disposeImportedObject(this.scene)
		this.keyLight.shadow.dispose()
		this.effects.dispose()
		this.environment?.dispose()
		this.environmentGenerator.dispose()
		this.renderer.dispose()
	}

	private frame(timestamp: number): void {
		if (this.disposed || this.preparingWorld || document.hidden || this.modelRoot.children.length === 0) {
			this.previousFrame = 0
			return
		}
		const deltaSeconds = this.previousFrame === 0 ? 0 : Math.min((timestamp - this.previousFrame) / 1000, 0.1)
		this.previousFrame = timestamp
		this.adaptQuality(deltaSeconds)
		if (!this.reducedMotion) this.waterTime.value += deltaSeconds

		this.clouds.update(this.camera.position, this.reducedMotion ? 0 : deltaSeconds)
		this.advanceGlides(deltaSeconds)
		if (this.navigation.active) this.navigation.update(deltaSeconds)
		else this.controls.update(deltaSeconds)
		if (this.ceilingDirty && (this.weather === 'rain' || this.weather === 'snow')) {
			this.ceilingDirty = false
			this.refreshCeiling()
		}
		this.precipitation.update(
			deltaSeconds,
			this.weather,
			this.navigation.active ? this.camera.position : this.controls.target,
			this.quality !== 'eco' && !this.reducedMotion && this.atmosphere.celestial,
			this.daylight
		)
		this.probeGround(timestamp)
		this.pivot.update(deltaSeconds, this.camera, this.controls.target, !this.navigation.active, this.ground)
		this.renderScene()
	}

	private renderScene(): void {
		// Camera framing can change before the next RAF, including thumbnail generation.
		this.sky.position.copy(this.camera.position)
		this.sky.scale.setScalar(Math.max(this.camera.far * 0.88, this.camera.near * 2))
		this.effects.renderFrame()
	}

	private applyPixelRatio(ratio: number): void {
		if (this.disposed) return
		this.renderer.setPixelRatio(ratio)
		this.resize(ratio)
	}

	private resize(ratio = this.pixelRatio): void {
		const { width, height } = this.canvas.getBoundingClientRect()
		if (width < 1 || height < 1) return
		this.renderer.setSize(width, height, false)
		this.effects.resize(width, height, ratio)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
	}

	private frameModel(root: THREE.Object3D, preserveView = false): void {
		const bounds = framingBounds(root)
		if (bounds.isEmpty()) return
		const size = bounds.getSize(new THREE.Vector3())
		const largest = Math.max(size.x, size.y, size.z, 1)
		const footprint = Math.max(size.x, size.z, 1)
		const focus = orbitFocus(root)
		this.captureFocus = focus.clone()
		if (!(preserveView && this.navigation.active)) {
			const offset = focus.clone().sub(this.controls.target)
			if (preserveView) this.camera.position.add(offset)
			this.controls.target.copy(focus)
		}
		this.shadowCenter.copy(focus)
		this.shadowExtent = Math.max(12, footprint * 0.85)
		this.clouds.setBaseHeight(bounds.max.y + Math.max(32, footprint * 1.6))
		this.updateSunShadow(true)
		const distance = footprint * 0.78 * Math.max(1, 1 / this.camera.aspect)
		if (!preserveView)
			this.camera.position.copy(focus).add(new THREE.Vector3(distance, distance * 0.46, distance * 0.85))
		if (!preserveView && this.navigation.active) this.camera.position.copy(focus).add(new THREE.Vector3(0, 1.62, 0))
		this.camera.near = 0.02
		this.camera.far = Math.max(4000, largest * 30)
		this.camera.updateProjectionMatrix()
		this.controls.minDistance = Math.max(0.1, largest * 0.015)
		this.controls.maxDistance = largest * 12
		if (!this.navigation.active) this.controls.update()
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
				pbrMaterial.roughness = pbrMaterial.transparent ? 0.18 : 0.92
				pbrMaterial.envMapIntensity = 0.09 + Number(pbrMaterial.transparent) * 0.7
				pbrMaterial.metalness = 0
				// Keep GLTFLoader’s normals/shading choice. Derivative-based flat normals can
				// produce NaNs on Firefox/NVIDIA and spread across the HDR bloom buffers.
				pbrMaterial.emissiveIntensity = Math.min(pbrMaterial.emissiveIntensity, 1.6)
				prepareWater(pbrMaterial, this.waterTime)
			}
			hasOpaqueSurface ||= !isLightBeam(material) && (!material.transparent || material.alphaTest > 0)
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
				texture.minFilter = THREE.NearestMipmapLinearFilter
				texture.generateMipmaps = true
				texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy())
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

		for (const light of importedLights) light.light.removeFromParent()
		const selectedLights = chooseLights(importedLights, surfaceFocus(framingBounds(root)))
		for (const imported of selectedLights) {
			const light = new THREE.PointLight(
				imported.color.clone().multiply(new THREE.Color(1, 0.82, 0.65)),
				Math.min(imported.intensity * 0.01, 12),
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
		this.daylight = daylight
		this.skyUniforms.uDay.value = this.dayTime
		this.skyUniforms.uMoonPhase.value = this.lunarAge
		this.keyLight.intensity =
			(0.025 + daylight * 4.8) * (['overcast', 'rain', 'snow'].includes(this.weather) ? 0.35 : 1)
		const shouldCastShadow = daylight > 0.08
		if (this.keyLight.castShadow !== shouldCastShadow) {
			this.keyLight.castShadow = shouldCastShadow
			this.keyLight.shadow.needsUpdate = true
			this.renderer.shadowMap.needsUpdate = true
		}
		this.keyLight.color.set(sunHeight < 0.35 ? 0xffa344 : 0xffe4b5)
		if (this.atmosphere.fixedDaylight !== null && !this.atmosphere.celestial) {
			this.keyLight.color.set(0xff8a5c)
		}
		this.hemisphere.intensity = 0.1 + daylight * 0.18
		this.nightFill.intensity = 0.02 + (1 - daylight) * 0.2
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
