import * as THREE from 'three'
import type { ViewerWeather } from './viewer-effects'

const RAIN_DROPS = 5000
const SNOW_FLAKES = 2500
const SPREAD = 56
const HEIGHT = 32
const STREAK = 0.9

const wrapVertex = `
	uniform float time; uniform float speed; uniform float sway;
	vec3 fall(vec3 position) {
		vec3 p = position;
		float variance = mix(0.75, 1.25, fract(position.x * 7.13 + position.z * 3.71));
		p.y = mod(p.y - time * speed * variance, ${HEIGHT.toFixed(1)}) - 4.0;
		p.x += sin(time * 0.7 + position.y) * sway;
		return p;
	}`

/** Minecraft-style weather: crisp 1px blue streaks for rain, hard white squares for snow. */
export class ViewerPrecipitation {
	private readonly rainGeometry = new THREE.BufferGeometry()
	private readonly snowGeometry = new THREE.BufferGeometry()
	private readonly uniforms = {
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
			uniform float light;
			void main() { gl_FragColor = vec4(vec3(0.52, 0.62, 0.9) * mix(0.3, 1.0, light), 0.62); }`,
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
			uniform float light;
			void main() { gl_FragColor = vec4(vec3(0.96) * mix(0.35, 1.0, light), 0.9); }`,
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

	dispose() {
		this.rainGeometry.dispose()
		this.snowGeometry.dispose()
		this.rainMaterial.dispose()
		this.snowMaterial.dispose()
	}
}
