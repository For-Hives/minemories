import * as THREE from 'three'
import type { ViewerWeather } from './viewer-effects'

/** A bounded, reusable GPU particle field. No per-frame allocation or terrain mutation. */
export class ViewerPrecipitation {
	private readonly geometry = new THREE.BufferGeometry()
	private readonly uniforms = { time: { value: 0 }, snow: { value: 0 } }
	private readonly material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: this.uniforms,
		vertexShader: `
			uniform float time; uniform float snow;
			void main() {
				vec3 p = position;
				p.y = mod(p.y - time * mix(15.0, 1.8, snow), 32.0) - 4.0;
				p.x += sin(time * 0.7 + position.y) * mix(0.3, 1.4, snow);
				vec4 view = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * view;
				gl_PointSize = clamp(mix(50.0, 70.0, snow) / max(1.0, -view.z), 2.0, 8.0);
			}`,
		fragmentShader: `
			uniform float snow;
			void main() {
				vec2 uv = gl_PointCoord - 0.5;
				float shape = mix(abs(uv.x) * 5.0, length(uv), snow);
				float alpha = (1.0 - smoothstep(0.25, 0.5, shape)) * mix(0.35, 0.7, snow);
				gl_FragColor = vec4(mix(vec3(0.62, 0.76, 0.88), vec3(0.95), snow), alpha);
			}`,
	})
	readonly points = new THREE.Points(this.geometry, this.material)

	constructor() {
		const positions = new Float32Array(768 * 3)
		for (let i = 0; i < positions.length; i += 3) {
			positions[i] = Math.random() * 48 - 24
			positions[i + 1] = Math.random() * 32
			positions[i + 2] = Math.random() * 48 - 24
		}
		this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
		this.points.visible = false
		this.points.frustumCulled = false
	}

	update(delta: number, weather: ViewerWeather, center: THREE.Vector3, enabled: boolean) {
		this.points.visible = enabled && (weather === 'rain' || weather === 'snow')
		if (!this.points.visible) return
		this.points.position.copy(center)
		this.uniforms.time.value = (this.uniforms.time.value + delta) % 160
		this.uniforms.snow.value = Number(weather === 'snow')
	}

	dispose() {
		this.geometry.dispose()
		this.material.dispose()
	}
}
