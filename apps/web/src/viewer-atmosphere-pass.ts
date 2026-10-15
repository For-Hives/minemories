import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/** Reuses scene depth, including alpha-tested foliage: no second geometry pass. */
export class AtmospherePass extends ShaderPass {
	declare uniforms: Record<
		| 'tDiffuse'
		| 'tDepth'
		| 'inverseProjection'
		| 'cameraWorld'
		| 'projection'
		| 'resolution'
		| 'strength'
		| 'radius'
		| 'fogDensity'
		| 'fogHeight'
		| 'fogColor'
		| 'sun'
		| 'shafts'
		| 'daylight',
		THREE.IUniform
	>

	constructor(private readonly camera: THREE.PerspectiveCamera) {
		super({
			uniforms: {
				tDiffuse: { value: null },
				tDepth: { value: null },
				inverseProjection: { value: camera.projectionMatrixInverse },
				cameraWorld: { value: camera.matrixWorld },
				projection: { value: camera.projectionMatrix },
				resolution: { value: new THREE.Vector2(1, 1) },
				strength: { value: 1.1 },
				radius: { value: 1.8 },
				fogDensity: { value: 0.002 },
				fogHeight: { value: 0 },
				fogColor: { value: new THREE.Color(0.65, 0.74, 0.82) },
				sun: { value: new THREE.Vector2(0.5, 0.8) },
				shafts: { value: 0 },
				daylight: { value: 1 },
			},
			vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
			fragmentShader: `
			varying vec2 vUv;
			uniform sampler2D tDiffuse, tDepth;
			uniform mat4 projection, inverseProjection, cameraWorld;
			uniform vec2 resolution, sun;
			uniform vec3 fogColor;
			uniform float radius, strength, fogDensity, fogHeight, shafts, daylight;
			vec3 positionAt(vec2 uv) {
				vec4 p = inverseProjection * vec4(uv*2.0-1.0, texture2D(tDepth,uv).r*2.0-1.0, 1.0);
				return p.xyz / max(p.w,0.000001);
			}
			void main() {
				vec3 color = texture2D(tDiffuse,vUv).rgb;
				float depth = texture2D(tDepth,vUv).r;
				vec3 p = positionAt(vUv);
				// Never normalize a zero derivative (Firefox/NVIDIA can propagate NaNs into bloom).
				vec3 crossNormal = cross(dFdx(p), dFdy(p));
				vec3 normal = crossNormal / max(length(crossNormal),0.000001);
				if(dot(normal,-p)<0.0) normal=-normal;
				float occlusion=0.0;
				if(depth < 0.999999 && strength > 0.0) {
					for(int i=0;i<12;i++) {
						float fi=float(i)+0.5;
						float a=fi*2.399963;
						vec2 offset=vec2(cos(a),sin(a))*sqrt(fi/12.0)*radius*projection[1][1]/max(-p.z,0.01)*0.5;
						offset.x*=resolution.y/resolution.x;
						vec2 uv=clamp(vUv+offset,vec2(0.001),vec2(0.999));
						vec3 delta=positionAt(uv)-p;
						float distance=length(delta);
						float facing=max(dot(normal,delta/max(distance,0.0001))-0.12,0.0);
						occlusion+=facing*(1.0-smoothstep(radius*0.2,radius,distance));
					}
					color*=1.0-clamp(occlusion/12.0*strength*4.0,0.0,0.62);
				}
				if(depth < 0.999999) {
					float height=(cameraWorld*vec4(p,1.0)).y;
					float haze=1.0-exp(-length(p)*fogDensity*exp(-max(height-fogHeight,0.0)*0.025));
					color=mix(color,fogColor,clamp(haze,0.0,0.55));
				}
				if(shafts > 0.0) {
					float rays=0.0;
					for(int i=0;i<12;i++) {
						vec2 uv=mix(vUv,sun,(float(i)+0.5)/16.0);
						rays+=step(0.999999,texture2D(tDepth,clamp(uv,vec2(0.001),vec2(0.999))).r);
					}
					color+=vec3(1.0,0.71,0.38)*rays/12.0*shafts*exp(-length(vUv-sun)*3.0);
				}
				float luminance=dot(color,vec3(0.2126,0.7152,0.0722));
				color=mix(vec3(luminance),color,1.06);
				// Cool indirect light, warm highlights, subtle optical falloff.
				color*=mix(vec3(0.88,0.96,1.08),vec3(1.055,1.015,0.95),clamp(luminance*0.7,0.0,1.0)*daylight);
				color*=1.0-0.13*smoothstep(0.25,0.75,length(vUv-0.5));
				gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
			}`,
		})
		this.material.depthTest = false
		this.material.depthWrite = false
	}

	override render(
		renderer: THREE.WebGLRenderer,
		write: THREE.WebGLRenderTarget,
		read: THREE.WebGLRenderTarget,
		delta: number,
		mask: boolean
	): void {
		this.uniforms.tDepth.value = read.depthTexture
		this.uniforms.inverseProjection.value = this.camera.projectionMatrixInverse
		this.uniforms.cameraWorld.value = this.camera.matrixWorld
		this.uniforms.resolution.value.set(read.width, read.height)
		super.render(renderer, write, read, delta, mask)
	}
}
