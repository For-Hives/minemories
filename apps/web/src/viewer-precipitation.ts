import * as THREE from 'three'
import type { Ceiling } from './lib/ceiling'
import type { ViewerWeather } from './viewer-effects'

const RAIN_DROPS = 5000
const SNOW_FLAKES = 2500
const SPREAD = 56
const HEIGHT = 32
const STREAK = 0.9

// Like Minecraft, weather stops at the highest block of each column: under a roof nothing falls.
const wrapVertex = `
	uniform float time; uniform float speed; uniform float sway;
	uniform sampler2D ceilingMap; uniform vec4 ceilingRect; uniform float hasCeiling;
	varying float vSheltered;
	vec3 fall(vec3 position) {
		vec3 p = position;
		float variance = mix(0.75, 1.25, fract(position.x * 7.13 + position.z * 3.71));
		p.y = mod(p.y - time * speed * variance, ${HEIGHT.toFixed(1)}) - 4.0;
		p.x += sin(time * 0.7 + position.y) * sway;
		vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
		vec2 uv = (world.xz - ceilingRect.xy) / ceilingRect.zw;
		bool inside = hasCeiling > 0.5 && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
		vSheltered = inside && texture2D(ceilingMap, uv).r > world.y ? 1.0 : 0.0;
		return p;
	}`
const shelteredFragment = 'varying float vSheltered;'
const discardSheltered = 'if (vSheltered > 0.5) discard;'

/** Minecraft-style weather: crisp 1px blue streaks for rain, hard white squares for snow. */
export class ViewerPrecipitation {
	private readonly rainGeometry = new THREE.BufferGeometry()
	private readonly snowGeometry = new THREE.BufferGeometry()
	private ceilingTexture: THREE.DataTexture | null = null
	private readonly uniforms = {
		ceilingMap: { value: null as THREE.Texture | null },
		ceilingRect: { value: new THREE.Vector4(0, 0, 1, 1) },
		hasCeiling: { value: 0 },
		time: { value: 0 },
		light: { value: 1 },
		rainSpeed: { value: 22 },
		snowSpeed: { value: 2.2 },
	}
	private readonly rainMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: { ...this.uniforms, speed: this.uniforms.rainSpeed, sway: { value: 0 } },
		vertexShader: `${wrapVertex}
			attribute float tail;
			void main() {
				vec3 p = fall(position);
				p.y += tail * ${STREAK.toFixed(2)};
				gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
			}`,
		fragmentShader: `
			uniform float light; ${shelteredFragment}
			void main() { ${discardSheltered} gl_FragColor = vec4(vec3(0.52, 0.62, 0.9) * mix(0.3, 1.0, light), 0.62); }`,
	})
	private readonly snowMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: { ...this.uniforms, speed: this.uniforms.snowSpeed, sway: { value: 1.2 } },
		vertexShader: `${wrapVertex}
			void main() {
				vec4 view = modelViewMatrix * vec4(fall(position), 1.0);
				gl_Position = projectionMatrix * view;
				gl_PointSize = max(floor(60.0 / max(1.0, -view.z)), 2.0);
			}`,
		fragmentShader: `
			uniform float light; ${shelteredFragment}
			void main() { ${discardSheltered} gl_FragColor = vec4(vec3(0.96) * mix(0.35, 1.0, light), 0.9); }`,
	})
	private readonly rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial)
	private readonly snow = new THREE.Points(this.snowGeometry, this.snowMaterial)
	readonly object = new THREE.Group()

	constructor() {
		const spread = () => Math.random() * SPREAD - SPREAD / 2
		const drops = new Float32Array(RAIN_DROPS * 6)
		const tails = new Float32Array(RAIN_DROPS * 2)
		for (let i = 0; i < RAIN_DROPS; i++) {
			const x = spread()
			const y = Math.random() * HEIGHT
			const z = spread()
			drops.set([x, y, z, x, y, z], i * 6)
			tails[i * 2 + 1] = 1
		}
		this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(drops, 3))
		this.rainGeometry.setAttribute('tail', new THREE.BufferAttribute(tails, 1))
		const flakes = new Float32Array(SNOW_FLAKES * 3)
		for (let i = 0; i < flakes.length; i += 3) flakes.set([spread(), Math.random() * HEIGHT, spread()], i)
		this.snowGeometry.setAttribute('position', new THREE.BufferAttribute(flakes, 3))
		for (const part of [this.rain, this.snow]) part.frustumCulled = false
		this.object.add(this.rain, this.snow)
		this.object.visible = false
	}

	update(delta: number, weather: ViewerWeather, center: THREE.Vector3, enabled: boolean, light = 1) {
		this.rain.visible = enabled && weather === 'rain'
		this.snow.visible = enabled && weather === 'snow'
		this.object.visible = this.rain.visible || this.snow.visible
		if (!this.object.visible) return
		this.object.position.copy(center)
		this.uniforms.time.value = (this.uniforms.time.value + delta) % 160
		this.uniforms.light.value = light
	}

	/** Highest surface per column in scene coordinates, or null to let weather fall everywhere. */
	setCeiling(ceiling: Ceiling | null) {
		this.ceilingTexture?.dispose()
		this.ceilingTexture = null
		this.uniforms.hasCeiling.value = ceiling ? 1 : 0
		this.uniforms.ceilingMap.value = null
		if (!ceiling) return
		const texture = new THREE.DataTexture(ceiling.data, ceiling.width, ceiling.depth, THREE.RedFormat, THREE.FloatType)
		texture.magFilter = THREE.NearestFilter
		texture.minFilter = THREE.NearestFilter
		texture.needsUpdate = true
		this.ceilingTexture = texture
		this.uniforms.ceilingMap.value = texture
		this.uniforms.ceilingRect.value.set(
			ceiling.minX,
			ceiling.minZ,
			ceiling.width * ceiling.cell,
			ceiling.depth * ceiling.cell
		)
	}

	dispose() {
		this.ceilingTexture?.dispose()
		this.rainGeometry.dispose()
		this.snowGeometry.dispose()
		this.rainMaterial.dispose()
		this.snowMaterial.dispose()
	}
}
