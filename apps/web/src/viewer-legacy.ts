import type { apiContract } from '@minemories/api-contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { createAuthClient } from 'better-auth/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { formatFileSize, isGlbFileName } from './lib/glb';
import './theme.css';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required page element not found: ${selector}`);
  return element;
}

const app = requireElement<HTMLDivElement>('#app');
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const query = new URLSearchParams(window.location.search);
if (query.has('embed')) document.body.classList.add('embedded-viewer');
const authClient = createAuthClient({ baseURL: apiBase });
const rpcLink = new RPCLink({
  url: `${apiBase}/rpc`,
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: 'include',
    }),
});
const apiClient: ContractRouterClient<typeof apiContract> = createORPCClient(rpcLink);

app.innerHTML = `
  <main class="viewer-shell flex min-h-screen flex-col bg-night px-[4.2vw] font-sans text-[#eef0e9]">
    <header class="viewer-chrome z-[2] flex h-[78px] items-center gap-8 border-b border-night-line max-phone:h-16 max-phone:gap-[7px]">
      <a class="flex items-center gap-[10px] font-sans text-lg font-extrabold tracking-[-0.7px] text-[#f1f3ea] no-underline max-phone:text-base" href="#" aria-label="Minemories, accueil"><span class="grid h-7 w-7 -rotate-[7deg] place-items-center rounded-lg bg-lime-deep font-sans text-[19px] font-extrabold text-[#17200b]">m</span><span>minemories</span></a>
      <div class="ml-auto flex items-center gap-[9px] font-mono text-[11px] text-night-muted max-phone:hidden"><span class="inline-block h-[7px] w-[7px] flex-none rounded-full bg-lime-deep shadow-[0_0_12px_#c9f36a66]"></span> Visionneuse GLB locale
      </div>
      <div class="flex items-center gap-2 max-phone:ml-auto max-phone:gap-[5px]">
        <span class="max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#abb3a2] max-phone:hidden" id="account-name" hidden></span>
        <button class="cursor-pointer whitespace-nowrap rounded-[7px] border border-[#41493a] bg-night-soft px-[11px] py-[9px] text-[11px] font-semibold text-[#dce2d3] transition hover:border-lime-deep hover:text-lime-deep disabled:cursor-progress disabled:opacity-60 max-phone:px-[7px] max-phone:py-2 max-phone:text-[9px]" id="pair-mod" type="button" hidden>↔ Lier le mod</button>
        <button class="cursor-pointer whitespace-nowrap rounded-[7px] border border-[#41493a] bg-night-soft px-[11px] py-[9px] text-[11px] font-semibold text-[#dce2d3] transition hover:border-lime-deep hover:text-lime-deep disabled:cursor-progress disabled:opacity-60 max-phone:px-[7px] max-phone:py-2 max-phone:text-[9px]" id="auth-open" type="button">Se connecter</button>
        <button class="cursor-pointer whitespace-nowrap rounded-[7px] border border-[#41493a] bg-night-soft px-[11px] py-[9px] text-[11px] font-semibold text-[#dce2d3] transition hover:border-lime-deep hover:text-lime-deep disabled:cursor-progress disabled:opacity-60 max-phone:px-[7px] max-phone:py-2 max-phone:text-[9px]" id="auth-logout" type="button" hidden>Déconnexion</button>
      </div>
      <button class="cursor-pointer rounded-[7px] border border-[#444a3d] bg-[#1b1f18] px-[15px] py-[10px] font-sans text-xs font-semibold text-inherit transition hover:border-lime-deep hover:bg-[#22291a] max-phone:ml-auto max-phone:px-[10px] max-phone:py-[9px] max-phone:text-[11px]" id="open-file" type="button"><span class="mr-[6px] text-base text-lime-deep">＋</span> Ouvrir un GLB</button>
      <input id="file-input" type="file" accept=".glb,model/gltf-binary" hidden />
    </header>

    <section class="viewer-stage relative m-[22px_0_14px] min-h-[550px] flex-1 overflow-hidden rounded-[10px] border border-[#292e26] bg-[#11140f] max-phone:mb-0 max-phone:mt-[14px] max-phone:min-h-[calc(100vh-133px)]" id="drop-zone" aria-label="Viewer 3D">
      <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(#283024_1px,transparent_1px),linear-gradient(90deg,#283024_1px,transparent_1px)] bg-[length:42px_42px] opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,#000_0%,transparent_73%)]"></div>
      <canvas class="absolute inset-0 block h-full w-full" id="scene" aria-label="Scène 3D interactive"></canvas>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center" id="empty-state">
        <div class="mb-[29px] grid h-12 w-12 place-items-center rounded-[14px] border border-[#454d3d] bg-[#171c13] text-2xl text-lime-deep shadow-[0_0_42px_#c9f36a0b]"><span>◈</span></div>
        <p class="m-0 mb-[13px] font-mono text-[10px] tracking-[1.8px] text-lime-deep">VOTRE SOUVENIR, EN 3D</p>
        <h1 class="m-0 font-sans text-[clamp(38px,5vw,62px)] font-medium leading-[1.02] tracking-[-3px] text-[#f0f1e9]">Un monde à<br /><em class="font-medium text-lime-deep not-italic">revisiter.</em></h1>
        <p class="mx-0 my-5 mb-[18px] text-[13px] text-[#a0a597] max-phone:max-w-[300px] max-phone:leading-[1.6]">Glissez un fichier <b class="rounded-[3px] bg-[#262a22] px-[5px] py-[3px] font-mono text-[11px] text-[#e9ebdf]">.glb</b> ici, ou ouvrez-le depuis votre ordinateur.</p>
        <button class="pointer-events-auto cursor-pointer rounded-[7px] border border-[#444a3d] bg-[#1b1f18] px-4 py-[11px] font-sans text-xs font-semibold text-inherit transition hover:border-lime-deep hover:bg-[#22291a]" id="drop-open" type="button">Choisir un fichier <span class="ml-3 text-lime-deep">↗</span></button>
      </div>
      <div class="drop-overlay absolute inset-[12px] z-[3] hidden place-items-center rounded-lg border border-dashed border-lime-deep bg-[#13180ee8] font-mono text-sm text-lime-deep" id="drop-overlay">Déposez votre monde ici</div>
      <div class="absolute top-1/2 left-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-lg border border-[#3b4334] bg-night-soft px-[18px] py-[14px] font-mono text-xs text-[#e6eadc]" id="loading" hidden><span class="h-[15px] w-[15px] animate-viewer-spin rounded-full border-2 border-[#4a553c] border-t-lime-deep"></span><span id="loading-label">Chargement du monde…</span></div>
      <div class="absolute top-[18px] left-[18px] z-[1] flex max-w-[min(60%,420px)] items-center gap-[9px] overflow-hidden rounded-md border border-[#33392e] bg-[#141811d9] px-[11px] py-[9px] font-mono text-[10px] text-[#e1e5d8]" id="scene-info" hidden><span class="inline-block h-[7px] w-[7px] flex-none rounded-full bg-lime-deep shadow-[0_0_12px_#c9f36a66]"></span><span class="overflow-hidden text-ellipsis whitespace-nowrap" id="file-name"></span></div>
      <div class="absolute bottom-[17px] left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap rounded-md border border-[#33392e] bg-[#141811d9] px-3 py-2 font-mono text-[9px] text-[#899080] max-phone:bottom-3 max-phone:text-[8px]" id="controls-hint" hidden><span class="text-[#e0e5d7]">Glisser</span> orbiter <i class="px-2 text-[#565d50] not-italic max-phone:px-[3px]">·</i> <span class="text-[#e0e5d7]">Molette</span> zoomer <i class="px-2 text-[#565d50] not-italic max-phone:px-[3px]">·</i> <span class="text-[#e0e5d7]">Clic droit</span> déplacer</div>
      <div class="absolute top-[17px] right-[17px]" id="stage-actions" hidden><button class="h-[34px] w-[34px] cursor-pointer rounded-md border border-[#3b4334] bg-[#171b14d9] font-sans text-xl text-lime-deep" id="reset-view" type="button" title="Recentrer la caméra">◎</button></div>
      <section class="absolute bottom-[22px] left-1/2 z-[2] grid min-h-[52px] w-[min(560px,calc(100%-32px))] -translate-x-1/2 grid-cols-[32px_18px_max-content_minmax(80px,1fr)_42px] items-center gap-[13px] rounded-[9px] border border-[#ffffff24] bg-[#101714c9] px-[14px] py-[9px] text-[#e8eee4] shadow-[0_8px_28px_#0004] backdrop-blur-[14px] max-phone:bottom-[14px] max-phone:gap-2 max-phone:px-[9px] max-phone:py-2 max-phone:grid-cols-[30px_16px_minmax(50px,max-content)_minmax(50px,1fr)_38px]" aria-label="Cycle journalier">
        <button class="cycle-toggle grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-md border border-[#ffffff26] bg-[#ffffff0b] font-sans text-xs text-lime-deep" id="cycle-toggle" type="button" aria-label="Mettre en pause le cycle" title="Mettre en pause le cycle">Ⅱ</button>
        <span class="cycle-icon text-center text-base text-[#ffe49b] [text-shadow:0_0_13px_#ffd36c]" id="cycle-icon" aria-hidden="true">☀</span>
        <label class="whitespace-nowrap text-[10px] text-[#b9c1b2] max-phone:text-[9px]" for="time-slider">Heure du monde</label>
        <input id="time-slider" type="range" min="0" max="1439" value="570" aria-label="Heure du monde" />
        <output class="text-right font-mono text-[11px] text-[#f4f2e8] tabular-nums" id="time-label" for="time-slider">09:30</output>
      </section>
    </section>
    <dialog class="fixed m-auto w-[min(420px,calc(100%-28px))] max-h-[calc(100%-28px)] overflow-auto rounded-xl border border-[#424b39] bg-[#151a13] p-8 text-[#edf0e8] shadow-[0_24px_90px_#0009] backdrop:bg-[#080a08c9] backdrop:backdrop-blur-[5px]" id="auth-dialog" aria-labelledby="auth-title">
      <form class="grid gap-[15px]" id="auth-form">
        <button class="absolute top-3 right-[13px] h-[30px] w-[30px] cursor-pointer rounded-md border border-[#343b2e] bg-[#1b2018] font-sans text-xl leading-none text-[#c4cbbb]" id="auth-close" type="button" aria-label="Fermer">×</button>
        <p class="m-0 mb-[13px] font-mono text-[10px] tracking-[1.8px] text-lime-deep">MINEMORIES</p>
        <h2 class="m-0 font-sans text-2xl font-semibold tracking-[-0.7px] text-[#f1f3eb]" id="auth-title">Connexion</h2>
        <label class="grid gap-[7px] text-[11px] text-[#bac2b3]" id="name-field" hidden>Nom affiché<input class="w-full rounded-md border border-[#394132] bg-[#0f130e] px-3 py-[11px] font-sans text-[13px] text-[#edf0e8] outline-none focus:border-lime-deep" id="auth-name" autocomplete="name" /></label>
        <label class="grid gap-[7px] text-[11px] text-[#bac2b3]">E-mail<input class="w-full rounded-md border border-[#394132] bg-[#0f130e] px-3 py-[11px] font-sans text-[13px] text-[#edf0e8] outline-none focus:border-lime-deep" id="auth-email" type="email" autocomplete="email" required /></label>
        <label class="grid gap-[7px] text-[11px] text-[#bac2b3]">Mot de passe<input class="w-full rounded-md border border-[#394132] bg-[#0f130e] px-3 py-[11px] font-sans text-[13px] text-[#edf0e8] outline-none focus:border-lime-deep" id="auth-password" type="password" autocomplete="current-password" minlength="12" required /></label>
        <p class="m-0 min-h-[15px] text-[11px] leading-[1.5] text-[#aeb69f]" id="auth-message" role="status"></p>
        <button class="cursor-pointer rounded-md border border-lime-deep bg-lime-deep px-[15px] py-[11px] font-sans text-xs font-bold text-[#17200b] disabled:cursor-progress disabled:opacity-60" id="auth-submit" type="submit">Se connecter</button>
        <button class="cursor-pointer border-0 bg-transparent p-[7px] font-sans text-[11px] text-lime-deep" id="auth-switch" type="button">Créer un compte</button>
      </form>
    </dialog>
    <dialog class="fixed m-auto w-[min(420px,calc(100%-28px))] max-h-[calc(100%-28px)] overflow-auto rounded-xl border border-[#424b39] bg-[#151a13] p-8 text-center text-[#edf0e8] shadow-[0_24px_90px_#0009] backdrop:bg-[#080a08c9] backdrop:backdrop-blur-[5px]" id="pairing-dialog" aria-labelledby="pairing-title">
      <button class="absolute top-3 right-[13px] h-[30px] w-[30px] cursor-pointer rounded-md border border-[#343b2e] bg-[#1b2018] font-sans text-xl leading-none text-[#c4cbbb]" id="pairing-close" type="button" aria-label="Fermer">×</button>
      <p class="m-0 mb-[13px] font-mono text-[10px] tracking-[1.8px] text-lime-deep">APPAIRAGE DU MOD</p>
      <h2 class="m-0 font-sans text-2xl font-semibold tracking-[-0.7px] text-[#f1f3eb]" id="pairing-title">Entre ce code dans Minecraft</h2>
      <p class="my-4 text-xs leading-[1.6] text-[#a9b19f]">Dans le jeu, utilise <code class="rounded bg-[#252c20] px-[5px] py-[3px] font-mono text-[11px] text-lime-deep">/memorypoc pair CODE</code>.</p>
      <output class="my-[18px] mb-[3px] block font-mono text-[clamp(38px,12vw,54px)] font-bold leading-[1.1] tracking-[8px] text-lime-deep tabular-nums [text-shadow:0_0_28px_#c9f36a30]" id="pairing-code">······</output>
      <button class="cursor-pointer rounded-md border border-[#434e36] bg-transparent px-[14px] py-[10px] font-sans text-[11px] text-lime-deep" id="copy-pairing-code" type="button">Copier le code</button>
      <p class="m-0 min-h-[15px] text-[11px] leading-[1.5] text-[#aeb69f]" id="pairing-expiry"></p>
      <p class="mb-0 mt-4 text-[10px] leading-[1.6] text-[#a9b19f]">Le code ne fonctionne qu’une fois et expire dans cinq minutes.</p>
    </dialog>
    <footer class="viewer-chrome flex h-[42px] items-center justify-between font-mono text-[10px] text-[#70776a] max-phone:text-[8px]"><span class="max-phone:max-w-[58%]">Les GLB ouverts ici restent dans votre navigateur.</span><span>Minemories <b class="px-1 font-normal text-lime-deep">·</b> Viewer POC</span></footer>
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
const authDialog = requireElement<HTMLDialogElement>('#auth-dialog');
const authForm = requireElement<HTMLFormElement>('#auth-form');
const authMessage = requireElement<HTMLElement>('#auth-message');
const authTitle = requireElement<HTMLElement>('#auth-title');
const authSubmit = requireElement<HTMLButtonElement>('#auth-submit');
const authSwitch = requireElement<HTMLButtonElement>('#auth-switch');
const authName = requireElement<HTMLInputElement>('#auth-name');
const authEmail = requireElement<HTMLInputElement>('#auth-email');
const authPassword = requireElement<HTMLInputElement>('#auth-password');
const nameField = requireElement<HTMLElement>('#name-field');
const accountName = requireElement<HTMLElement>('#account-name');
const authOpen = requireElement<HTMLButtonElement>('#auth-open');
const authLogout = requireElement<HTMLButtonElement>('#auth-logout');
const pairModButton = requireElement<HTMLButtonElement>('#pair-mod');
const pairingDialog = requireElement<HTMLDialogElement>('#pairing-dialog');
const pairingCodeOutput = requireElement<HTMLOutputElement>('#pairing-code');
const pairingExpiry = requireElement<HTMLElement>('#pairing-expiry');
const pairingClose = requireElement<HTMLButtonElement>('#pairing-close');
const pairingCopy = requireElement<HTMLButtonElement>('#copy-pairing-code');
let creatingAccount = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.setClearColor('#11140f');

const scene = new THREE.Scene();
const skyUniforms = {
  uDay: { value: 9.5 / 24 },
  uMoonPhase: { value: 0 },
};
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
      uniform float uMoonPhase;
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
        vec3 sunRight = normalize(cross(sunDirection, vec3(0.0, 1.0, 0.0)));
        vec3 sunUp = normalize(cross(sunRight, sunDirection));
        float sunSquare = step(abs(dot(direction, sunRight)), 0.045) * step(abs(dot(direction, sunUp)), 0.045);
        float sunDisk = sunSquare * smoothstep(-0.12, 0.20, elevation);
        float sunGlow = pow(max(sunDot, 0.0), 48.0) * daylight;
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
        float moonVisible = moonSquare * moonLit * (1.0 - daylight);
        skyColor = mix(skyColor, vec3(0.78, 0.84, 0.94), moonVisible);
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
  const radius = 0.72 + (cloudIndex % 3) * 0.045;
  cloud.position.set(
    Math.cos(angle) * radius,
    0.13 + (cloudIndex % 4) * 0.025,
    Math.sin(angle) * radius,
  );
  cloud.rotation.y = -angle;
  for (const [x, y, z, sx, sy, sz] of cloudShape) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry((sx * 8) / 180, (sy * 5) / 180, (sz * 8) / 180),
      cloudMaterial,
    );
    block.position.set((x * 8) / 180, (y * 5) / 180, (z * 8) / 180);
    cloud.add(block);
  }
  clouds.add(cloud);
}
clouds.frustumCulled = false;
scene.add(clouds);

const hemisphere = new THREE.HemisphereLight(0xe2efff, 0x36352e, 0.65);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight(0xffedc2, 1.05);
keyLight.position.set(8, 14, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(512, 512);
keyLight.shadow.bias = -0.00015;
keyLight.shadow.normalBias = 0.025;
keyLight.shadow.autoUpdate = false;
keyLight.shadow.camera.left = -32;
keyLight.shadow.camera.right = 32;
keyLight.shadow.camera.top = 32;
keyLight.shadow.camera.bottom = -32;
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 128;
scene.add(keyLight.target);
scene.add(keyLight);
const nightFill = new THREE.DirectionalLight(0x7799ff, 0.04);
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
let lunarAge = 0;
const shadowCenter = new THREE.Vector3();
let shadowExtent = 32;
const lastShadowDirection = new THREE.Vector3();
let hasShadowDirection = false;

function updateSunShadow(force = false) {
  const angle = (dayTime - 0.25) * Math.PI * 2;
  const sunDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize();
  const right = new THREE.Vector3()
    .crossVectors(sunDirection, new THREE.Vector3(0, 1, 0))
    .normalize();
  const lightUp = new THREE.Vector3().crossVectors(right, sunDirection).normalize();
  const texelSize = (shadowExtent * 2) / keyLight.shadow.mapSize.x;
  const target = shadowCenter.clone();
  const rightPosition = target.dot(right);
  const upPosition = target.dot(lightUp);
  target.addScaledVector(right, Math.round(rightPosition / texelSize) * texelSize - rightPosition);
  target.addScaledVector(lightUp, Math.round(upPosition / texelSize) * texelSize - upPosition);

  keyLight.target.position.copy(target);
  keyLight.position.copy(target).addScaledVector(sunDirection, shadowExtent * 2);
  keyLight.shadow.camera.left = -shadowExtent;
  keyLight.shadow.camera.right = shadowExtent;
  keyLight.shadow.camera.top = shadowExtent;
  keyLight.shadow.camera.bottom = -shadowExtent;
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = shadowExtent * 4;
  keyLight.shadow.camera.updateProjectionMatrix();

  if (force || !hasShadowDirection || lastShadowDirection.angleTo(sunDirection) > 0.003) {
    lastShadowDirection.copy(sunDirection);
    hasShadowDirection = true;
    keyLight.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }
}

function prepareWorldLighting(root: THREE.Object3D) {
  const importedLights: {
    light: THREE.PointLight;
    position: THREE.Vector3;
    color: THREE.Color;
    intensity: number;
    distance: number;
  }[] = [];

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof THREE.PointLight) {
      importedLights.push({
        light: object,
        position: object.getWorldPosition(new THREE.Vector3()),
        color: object.color.clone(),
        intensity: object.intensity,
        distance: object.distance,
      });
      return;
    }
    if (!(object instanceof THREE.Mesh)) return;

    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let hasOpaqueSurface = false;
    for (const material of materials) {
      const pbrMaterial = material as THREE.MeshStandardMaterial;
      if (pbrMaterial.isMeshStandardMaterial) {
        pbrMaterial.roughness = 1;
        pbrMaterial.metalness = 0;
        pbrMaterial.flatShading = true;
        pbrMaterial.emissiveIntensity = Math.min(pbrMaterial.emissiveIntensity, 0.14);
      }
      hasOpaqueSurface ||= !material.transparent || material.alphaTest > 0;
      for (const texture of [
        pbrMaterial.map,
        pbrMaterial.emissiveMap,
        pbrMaterial.normalMap,
        pbrMaterial.roughnessMap,
        pbrMaterial.metalnessMap,
        pbrMaterial.aoMap,
      ]) {
        if (!texture) continue;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapNearestFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 1;
        texture.needsUpdate = true;
      }
      material.needsUpdate = true;
    }
    object.castShadow = hasOpaqueSurface;
    object.receiveShadow = hasOpaqueSurface;
  });

  const cellSize = 6;
  const lightCells = new Map<string, (typeof importedLights)[number]>();
  for (const light of importedLights) {
    light.light.removeFromParent();
    const { x, y, z } = light.position;
    const cell = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
    const current = lightCells.get(cell);
    if (!current || light.intensity > current.intensity) lightCells.set(cell, light);
  }

  const selectedLights = [...lightCells.values()]
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 32);
  for (const imported of selectedLights) {
    const light = new THREE.PointLight(
      imported.color,
      Math.min(imported.intensity * 0.002, 2),
      Math.min(Math.max(imported.distance, 1), 10),
      2,
    );
    light.position.copy(imported.position);
    modelRoot.add(light);
  }
}

function updateDayCycle() {
  dayTime = ((dayTime % 1) + 1) % 1;
  const minutes = Math.floor(dayTime * 1440);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const angle = (dayTime - 0.25) * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.2);
  skyUniforms.uDay.value = dayTime;
  skyUniforms.uMoonPhase.value = lunarAge;
  keyLight.intensity = 0.015 + daylight * 1.05;
  const shouldCastShadow = daylight > 0.08;
  if (keyLight.castShadow !== shouldCastShadow) {
    keyLight.castShadow = shouldCastShadow;
    keyLight.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }
  keyLight.color.set(sunHeight < 0.18 ? 0xff9a62 : 0xffedc2);
  hemisphere.intensity = 0.08 + daylight * 0.62;
  nightFill.intensity = 0.02 + (1 - daylight) * 0.12;
  updateSunShadow();
  cloudMaterial.color.setRGB(0.22 + daylight * 0.72, 0.26 + daylight * 0.7, 0.38 + daylight * 0.58);
  timeSlider.value = String(minutes);
  timeLabel.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  timeLabel.textContent = timeLabel.value;
  cycleIcon.textContent = daylight < 0.12 ? '☾' : sunHeight < 0.2 ? '◒' : '☀';
  cycleIcon.classList.toggle('night', daylight < 0.12);
}

timeSlider.addEventListener('input', () => {
  if (cyclePlaying) {
    cyclePlaying = false;
    cycleToggle.textContent = '▶';
    cycleToggle.setAttribute('aria-label', 'Reprendre le cycle');
    cycleToggle.title = 'Reprendre le cycle';
  }
  dayTime = Number(timeSlider.value) / 1440;
  updateDayCycle();
  updateSunShadow(true);
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

function setAuthMode(createAccount: boolean) {
  creatingAccount = createAccount;
  authTitle.textContent = createAccount ? 'Créer un compte' : 'Connexion';
  authSubmit.textContent = createAccount ? 'Créer mon compte' : 'Se connecter';
  authSwitch.textContent = createAccount ? 'J’ai déjà un compte' : 'Créer un compte';
  nameField.hidden = !createAccount;
  authName.required = createAccount;
  authPassword.autocomplete = createAccount ? 'new-password' : 'current-password';
  authMessage.textContent = '';
}

async function refreshAccount() {
  try {
    const result = await authClient.getSession();
    const user = result.data?.user;
    accountName.textContent = user?.name ?? '';
    accountName.hidden = !user;
    pairModButton.hidden = !user;
    authOpen.hidden = Boolean(user);
    authLogout.hidden = !user;
  } catch {
    accountName.hidden = true;
    pairModButton.hidden = true;
    authOpen.hidden = false;
    authLogout.hidden = true;
  }
}

authOpen.addEventListener('click', () => {
  setAuthMode(false);
  authDialog.showModal();
});
requireElement<HTMLButtonElement>('#auth-close').addEventListener('click', () =>
  authDialog.close(),
);
authSwitch.addEventListener('click', () => setAuthMode(!creatingAccount));
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authMessage.textContent = 'Connexion en cours…';
  try {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    const result = creatingAccount
      ? await authClient.signUp.email({ email, password, name: authName.value.trim() })
      : await authClient.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.message);
    authDialog.close();
    authForm.reset();
    await refreshAccount();
  } catch (error) {
    authMessage.textContent =
      error instanceof Error ? error.message : 'Impossible de se connecter.';
  } finally {
    authSubmit.disabled = false;
  }
});

authLogout.addEventListener('click', async () => {
  await authClient.signOut();
  await refreshAccount();
});

pairModButton.addEventListener('click', async () => {
  pairModButton.disabled = true;
  pairingExpiry.textContent = 'Génération du code…';
  pairingDialog.showModal();
  try {
    const pairing = await apiClient.pairing.create();
    pairingCodeOutput.textContent = pairing.code;
    pairingExpiry.textContent = `Expire à ${new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    pairingExpiry.textContent =
      error instanceof Error ? error.message : 'Impossible de créer le code.';
  } finally {
    pairModButton.disabled = false;
  }
});

pairingClose.addEventListener('click', () => pairingDialog.close());
pairingCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(pairingCodeOutput.textContent ?? '');
  pairingCopy.textContent = 'Code copié';
  window.setTimeout(() => {
    pairingCopy.textContent = 'Copier le code';
  }, 1600);
});
void refreshAccount();

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
  shadowCenter.copy(center);
  shadowExtent = Math.max(8, size.length() * 0.65);
  updateSunShadow(true);
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
    prepareWorldLighting(gltf.scene);
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
    const elapsedDay = deltaSeconds / 120;
    dayTime += elapsedDay;
    lunarAge += elapsedDay;
    updateDayCycle();
  }
  sky.position.copy(camera.position);
  sky.scale.setScalar(Math.max(camera.far * 0.88, camera.near * 2));
  clouds.position.copy(camera.position);
  clouds.scale.setScalar(Math.max(camera.far * 0.82, camera.near * 2));
  clouds.rotation.y += deltaSeconds * 0.001;
  controls.update();
  renderer.render(scene, camera);
});
resize();

const memoryId = query.get('memory');
if (memoryId) {
  void fetch(`${apiBase}/api/memories/${encodeURIComponent(memoryId)}/file`, {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Impossible de charger ce souvenir.');
      const file = new File([await response.blob()], 'souvenir.glb', {
        type: 'model/gltf-binary',
      });
      await openFile(file);
    })
    .catch((error: unknown) => {
      loading.hidden = false;
      loadingLabel.textContent =
        error instanceof Error ? error.message : 'Impossible de charger ce souvenir.';
    });
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== window.location.origin || typeof event.data !== 'object' || !event.data)
    return;
  const message = event.data as { type?: string; file?: unknown };
  if (message.type === 'load-glb' && message.file instanceof File) void openFile(message.file);
});
