import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { formatFileSize, isGlbFileName } from './lib/glb';
import './style.css';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required page element not found: ${selector}`);
  return element;
}

const app = requireElement<HTMLDivElement>('#app');
app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Minemories, accueil"><span class="brand-mark">m</span><span>minemories</span></a>
      <div class="topbar-note"><span class="status-dot"></span> Viewer local · aucun upload
      </div>
      <button class="open-button" id="open-file" type="button"><span>＋</span> Ouvrir un GLB</button>
      <input id="file-input" type="file" accept=".glb,model/gltf-binary" hidden />
    </header>

    <section class="stage" id="drop-zone" aria-label="Viewer 3D">
      <div class="stage-grid"></div>
      <canvas id="scene" aria-label="Scène 3D interactive"></canvas>
      <div class="empty-state" id="empty-state">
        <div class="cube-icon"><span>◈</span></div>
        <p class="eyebrow">VOTRE SOUVENIR, EN 3D</p>
        <h1>Un monde à<br /><em>revisiter.</em></h1>
        <p class="hint">Glissez un fichier <b>.glb</b> ici, ou ouvrez-le depuis votre ordinateur.</p>
        <button class="drop-button" id="drop-open" type="button">Choisir un fichier <span>↗</span></button>
      </div>
      <div class="drop-overlay" id="drop-overlay">Déposez votre monde ici</div>
      <div class="loading" id="loading" hidden><span class="spinner"></span><span id="loading-label">Chargement du monde…</span></div>
      <div class="scene-info" id="scene-info" hidden><span class="status-dot"></span><span id="file-name"></span></div>
      <div class="controls-hint" id="controls-hint" hidden><span>Glisser</span> orbiter <i>·</i> <span>Molette</span> zoomer <i>·</i> <span>Clic droit</span> déplacer</div>
      <div class="stage-actions" id="stage-actions" hidden><button id="reset-view" type="button" title="Recentrer la caméra">◎</button></div>
      <section class="day-cycle" aria-label="Cycle journalier">
        <button class="cycle-toggle" id="cycle-toggle" type="button" aria-label="Mettre en pause le cycle" title="Mettre en pause le cycle">Ⅱ</button>
        <span class="cycle-icon" id="cycle-icon" aria-hidden="true">☀</span>
        <label class="time-slider-label" for="time-slider">Heure du monde</label>
        <input id="time-slider" type="range" min="0" max="1439" value="570" aria-label="Heure du monde" />
        <output id="time-label" for="time-slider">09:30</output>
      </section>
    </section>
    <footer class="footer"><span>Un fichier à la fois, directement dans votre navigateur.</span><span>Minemories <b>·</b> Viewer POC</span></footer>
  </main>`;

const canvas = requireElement<HTMLCanvasElement>('#scene');
const input = requireElement<HTMLInputElement>('#file-input');
const dropZone = requireElement<HTMLElement>('#drop-zone');
const emptyState = requireElement<HTMLElement>('#empty-state');
const loading = requireElement<HTMLElement>('#loading');
const loadingLabel = requireElement<HTMLElement>('#loading-label');
const overlay = requireElement<HTMLElement>('#drop-overlay');
const sceneInfo = requireElement<HTMLElement>('#scene-info');
const controlHint = requireElement<HTMLElement>('#controls-hint');
const stageActions = requireElement<HTMLElement>('#stage-actions');
const timeSlider = requireElement<HTMLInputElement>('#time-slider');
const timeLabel = requireElement<HTMLOutputElement>('#time-label');
const cycleToggle = requireElement<HTMLButtonElement>('#cycle-toggle');
const cycleIcon = requireElement<HTMLElement>('#cycle-icon');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor('#11140f');

const scene = new THREE.Scene();
const skyUniforms = { uDay: { value: 9.5 / 24 } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 20),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uDay;
      void main() {
        vec3 direction = normalize(vDirection);
        float angle = (uDay - 0.25) * 6.28318530718;
        float elevation = sin(angle);
        float daylight = smoothstep(-0.12, 0.20, elevation);
        vec3 nightZenith = vec3(0.018, 0.028, 0.075);
        vec3 nightHorizon = vec3(0.10, 0.12, 0.20);
        vec3 dayZenith = vec3(0.20, 0.53, 0.88);
        vec3 dayHorizon = vec3(0.64, 0.80, 0.94);
        float horizon = smoothstep(-0.30, 0.85, direction.y);
        vec3 skyColor = mix(mix(nightHorizon, nightZenith, horizon), mix(dayHorizon, dayZenith, horizon), daylight);
        vec3 sunDirection = normalize(vec3(cos(angle), elevation, 0.30));
        float sunDot = dot(direction, sunDirection);
        float sunDisk = smoothstep(0.9990, 0.9995, sunDot);
        float sunGlow = pow(max(sunDot, 0.0), 48.0) * daylight;
        vec3 sunColor = mix(vec3(1.0, 0.48, 0.20), vec3(1.0, 0.91, 0.68), smoothstep(0.0, 0.45, elevation));
        skyColor = mix(skyColor, sunColor, max(sunDisk * daylight, sunGlow * 0.38));
        float stars = step(0.9988, fract(sin(dot(floor(direction * 420.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
        skyColor += vec3(0.72, 0.82, 1.0) * stars * (1.0 - daylight) * smoothstep(0.0, 0.15, direction.y);
        gl_FragColor = vec4(skyColor, 1.0);
      }`,
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -100;
scene.add(sky);

const clouds = new THREE.Group();
const cloudMaterial = new THREE.MeshBasicMaterial({
  color: 0xf2f5f0,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
const cloudShape: Array<[number, number, number, number, number, number]> = [
  [-2, 0, 0, 3, 1, 1],
  [0, 0, 0, 4, 1, 1],
  [2, 0, 0, 3, 1, 1],
  [-1, 1, 0, 2, 1, 1],
  [1, 1, 0, 2, 1, 1],
];
for (let cloudIndex = 0; cloudIndex < 10; cloudIndex += 1) {
  const cloud = new THREE.Group();
  const angle = (cloudIndex * Math.PI * 2) / 10;
  const radius = 180 + (cloudIndex % 3) * 35;
  cloud.position.set(Math.cos(angle) * radius, 55 + (cloudIndex % 4) * 9, Math.sin(angle) * radius);
  cloud.rotation.y = -angle;
  for (const [x, y, z, sx, sy, sz] of cloudShape) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(sx * 8, sy * 5, sz * 8), cloudMaterial);
    block.position.set(x * 8, y * 5, z * 8);
    cloud.add(block);
  }
  clouds.add(cloud);
}
clouds.frustumCulled = false;
scene.add(clouds);

const hemisphere = new THREE.HemisphereLight(0xe2efff, 0x36352e, 1.25);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight(0xffedc2, 3.2);
keyLight.position.set(8, 14, 10);
scene.add(keyLight);
const nightFill = new THREE.DirectionalLight(0x7799ff, 0.18);
scene.add(nightFill);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
camera.position.set(8, 7, 8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
const modelRoot = new THREE.Group();
scene.add(modelRoot);
const loader = new GLTFLoader();
let dayTime = 9.5 / 24;
let cyclePlaying = true;

function updateDayCycle() {
  dayTime = ((dayTime % 1) + 1) % 1;
  const minutes = Math.floor(dayTime * 1440);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const angle = (dayTime - 0.25) * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const sunX = Math.cos(angle);
  const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.2);
  skyUniforms.uDay.value = dayTime;
  keyLight.position.set(sunX * 120, sunHeight * 120, 36);
  keyLight.intensity = 0.08 + daylight * 3.5;
  keyLight.color.set(sunHeight < 0.18 ? 0xff9a62 : 0xffedc2);
  hemisphere.intensity = 0.16 + daylight * 1.45;
  nightFill.intensity = 0.12 + (1 - daylight) * 0.42;
  timeSlider.value = String(minutes);
  timeLabel.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  timeLabel.textContent = timeLabel.value;
  cycleIcon.textContent = daylight < 0.12 ? '☾' : sunHeight < 0.2 ? '◒' : '☀';
  cycleIcon.classList.toggle('night', daylight < 0.12);
}

timeSlider.addEventListener('input', () => {
  dayTime = Number(timeSlider.value) / 1440;
  updateDayCycle();
});
cycleToggle.addEventListener('click', () => {
  cyclePlaying = !cyclePlaying;
  cycleToggle.textContent = cyclePlaying ? 'Ⅱ' : '▶';
  cycleToggle.setAttribute(
    'aria-label',
    cyclePlaying ? 'Mettre en pause le cycle' : 'Reprendre le cycle',
  );
  cycleToggle.title = cyclePlaying ? 'Mettre en pause le cycle' : 'Reprendre le cycle';
});
updateDayCycle();
function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  if (width < 1 || height < 1) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frameModel(root: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1);
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(largest * 1.25, largest * 0.9, largest * 1.25));
  camera.near = Math.max(0.01, largest / 1000);
  camera.far = largest * 30;
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(0.1, largest * 0.015);
  controls.maxDistance = largest * 12;
  controls.update();
}

async function openFile(file?: File) {
  if (!file) return;
  if (!isGlbFileName(file.name)) {
    loading.hidden = false;
    loadingLabel.textContent = 'Choisissez un fichier .glb';
    window.setTimeout(() => {
      loading.hidden = true;
    }, 2200);
    return;
  }
  loading.hidden = false;
  loadingLabel.textContent = 'Chargement du monde…';
  try {
    const buffer = await file.arrayBuffer();
    const gltf = await loader.parseAsync(buffer, '');
    for (const child of [...modelRoot.children]) {
      modelRoot.remove(child);
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => {
            material.dispose();
          });
        } else if (mesh.material) mesh.material.dispose();
      });
    }
    modelRoot.add(gltf.scene);
    frameModel(gltf.scene);
    emptyState.hidden = true;
    sceneInfo.hidden = false;
    controlHint.hidden = false;
    stageActions.hidden = false;
    requireElement<HTMLElement>('#file-name').textContent =
      `${file.name} · ${formatFileSize(file.size)}`;
    loading.hidden = true;
  } catch (error) {
    console.error(error);
    loadingLabel.textContent = 'Impossible de lire ce GLB';
    window.setTimeout(() => {
      loading.hidden = true;
    }, 3500);
  }
}

function chooseFile() {
  input.click();
}
requireElement<HTMLButtonElement>('#open-file').addEventListener('click', chooseFile);
requireElement<HTMLButtonElement>('#drop-open').addEventListener('click', chooseFile);
input.addEventListener('change', () => {
  void openFile(input.files?.[0]);
  input.value = '';
});
requireElement<HTMLButtonElement>('#reset-view').addEventListener('click', () => {
  const model = modelRoot.children[0];
  if (model) frameModel(model);
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    overlay.classList.add('visible');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === 'drop') void openFile((event as DragEvent).dataTransfer?.files[0]);
    overlay.classList.remove('visible');
  });
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(dropZone);
let previousFrame = 0;
renderer.setAnimationLoop((timestamp) => {
  const deltaSeconds = previousFrame === 0 ? 0 : Math.min((timestamp - previousFrame) / 1000, 0.1);
  previousFrame = timestamp;
  if (cyclePlaying) {
    dayTime += deltaSeconds / 120;
    updateDayCycle();
  }
  sky.position.copy(camera.position);
  sky.scale.setScalar(Math.max(camera.far * 0.75, 1000));
  controls.update();
  renderer.render(scene, camera);
});
resize();
