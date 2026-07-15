import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ============================================================================
// Dirección de arte (decidida por Agus): OSCURIDAD como escenario. No hay
// cuarto: solo un piso negro apenas reflectante, y la ventana como objeto 3D
// protagonista por donde entra la única luz (golden hour, HDRI real blureado).
// La luz impacta la oscuridad: god-rays ocluidos por la cortina real, charco
// de sol en el piso, y la tela dramáticamente iluminada. El cambio de producto
// NO es un crossfade: la cortina vieja SE VA deslizándose por el barral y la
// nueva ENTRA desde el otro lado, ondeando por su propia física.
// ============================================================================

const canvas = document.getElementById('scene');
const hint = document.getElementById('hint');
const productLabel = document.getElementById('productLabel');
const productName = document.getElementById('productName');
const productColor = document.getElementById('productColor');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const measurePanel = document.getElementById('measurePanel');
const anchoValue = document.getElementById('anchoValue');
const altoValue = document.getElementById('altoValue');
const ctaWhatsapp = document.getElementById('ctaWhatsapp');

const WHATSAPP_NUMBER = '5491140813223';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------------------------------------------------------------------------
// Renderer / cámara / escena
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
camera.position.set(0, 1.55, 5.6);
camera.lookAt(0, 1.5, 0);

const isMobile = matchMedia('(max-width:640px)').matches;

// ---------------------------------------------------------------------------
// La ventana (objeto 3D protagonista) y el vacío alrededor
// ---------------------------------------------------------------------------
const WIN_W = 2.7, WIN_H = 2.55, WIN_Y = 0.35;
const backZ = -2.2;
const winTop = WIN_Y + WIN_H;

// Pared "invisible": negro puro no-iluminado, gigante — se funde con el fondo
// y recorta el HDRI para que SOLO se vea por el hueco de la ventana.
const voidShape = new THREE.Shape();
voidShape.moveTo(-40, -20); voidShape.lineTo(40, -20); voidShape.lineTo(40, 30); voidShape.lineTo(-40, 30);
voidShape.closePath();
const voidHole = new THREE.Path();
voidHole.moveTo(-WIN_W / 2, WIN_Y); voidHole.lineTo(WIN_W / 2, WIN_Y);
voidHole.lineTo(WIN_W / 2, winTop); voidHole.lineTo(-WIN_W / 2, winTop);
voidHole.closePath();
voidShape.holes.push(voidHole);
const voidWall = new THREE.Mesh(
  new THREE.ShapeGeometry(voidShape),
  new THREE.MeshBasicMaterial({ color: 0x000000 })
);
voidWall.position.z = backZ;
scene.add(voidWall);
// una segunda pared física (invisible al ojo, negra) que SÍ bloquea el sol
const sunBlocker = new THREE.Mesh(new THREE.ShapeGeometry(voidShape), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }));
sunBlocker.position.z = backZ - 0.01;
sunBlocker.castShadow = true;
sunBlocker.receiveShadow = false;
scene.add(sunBlocker);

// HDRI golden hour: visible solo por el hueco, blureado (haze cálido).
// Rotación calculada del archivo con _scratch/find-sun.mjs (sol en u=0.60).
const ENV_ROT = 2.196;
new RGBELoader().load('img/env/sunset.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.background = hdr;
  scene.backgroundBlurriness = 0.45; // sin línea de horizonte dura: puro resplandor cálido
  scene.backgroundIntensity = 1.12;
  scene.environmentIntensity = 0.1;
  scene.backgroundRotation = new THREE.Euler(0, ENV_ROT, 0);
  scene.environmentRotation = new THREE.Euler(0, ENV_ROT, 0);
});

// Piso de estudio: negro, apenas reflectante — recibe el charco de sol y la
// sombra de la cortina, y se pierde en la oscuridad.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.48, metalness: 0.08 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 10);
floor.receiveShadow = true;
scene.add(floor);

// Marco de ventana moderno: aluminio negro mate, líneas finas, con umbral.
const frameMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.42, metalness: 0.72 });
const F = 0.055; // grosor visual del perfil
function frameBar(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return m;
}
frameBar(WIN_W + F * 2, F, 0.12, 0, winTop + F / 2, backZ);          // dintel
frameBar(WIN_W + F * 2, F * 1.6, 0.16, 0, WIN_Y - F * 0.8, backZ);   // umbral (sill)
frameBar(F, WIN_H + F * 2, 0.12, -WIN_W / 2 - F / 2, WIN_Y + WIN_H / 2, backZ);
frameBar(F, WIN_H + F * 2, 0.12, WIN_W / 2 + F / 2, WIN_Y + WIN_H / 2, backZ);
frameBar(F * 0.72, WIN_H, 0.1, 0, WIN_Y + WIN_H / 2, backZ);         // parante central

// vidrio con tinte apenas perceptible
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(WIN_W - 0.02, WIN_H - 0.02),
  new THREE.MeshBasicMaterial({ color: 0xfff1d8, transparent: true, opacity: 0.07 })
);
glass.position.set(0, WIN_Y + WIN_H / 2, backZ + 0.012);
scene.add(glass);

// Barral de la cortina: caño fino oscuro con soportes, apenas sobre el dintel.
const rodMat = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 0.35, metalness: 0.85 });
const ROD_Y = winTop + 0.22;
const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, WIN_W * 1.5, 12), rodMat);
rod.rotation.z = Math.PI / 2;
rod.position.set(0, ROD_Y, backZ + 0.3);
rod.castShadow = true;
scene.add(rod);
[-WIN_W * 0.72, WIN_W * 0.72].forEach((x) => {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), rodMat);
  cap.position.set(x, ROD_Y, backZ + 0.3);
  scene.add(cap);
});

// ---------------------------------------------------------------------------
// Luz: el sol golden-hour AFUERA, entrando por la ventana. Única luz fuerte.
// ---------------------------------------------------------------------------
const SUN_BASE_INTENSITY = 5.2;
const sun = new THREE.DirectionalLight(0xffc27d, SUN_BASE_INTENSITY);
sun.position.set(1.0, 1.9, backZ - 3.4);
sun.target.position.set(-0.5, 0.4, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 16;
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.002;
scene.add(sun, sun.target);

// Luz de recorte tenue para que la tela se lea contra la oscuridad (fija).
// Spot de recorte (luz de estudio): apunta a la cortina para que el producto
// SIEMPRE se lea contra la oscuridad, sin importar cuánta luz deje pasar.
const keyFill = new THREE.SpotLight(0xffdcb0, 26, 18, 0.72, 0.65, 1.5);
keyFill.position.set(-1.8, 2.4, 3.4);
keyFill.target.position.set(0, 1.4, backZ + 0.3);
scene.add(keyFill, keyFill.target);

const FILL_BASE_INTENSITY = 0.55;
const fill = new THREE.HemisphereLight(0xffe4bb, 0x000000, FILL_BASE_INTENSITY);
scene.add(fill);
const fillFor = (sunFactor) => FILL_BASE_INTENSITY * lerp(0.6, 1, sunFactor);

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Blackout', color: 'Gris', tex: 'img/tela-blackout-gris.png', normal: 'img/normal-blackout-gris.png',
    stiffness: 0.97, gravity: 7.4, friction: 0.962, influence: 0.34, dragCap: 0.028, roughness: 0.9,
    opacity: 1, castShadow: true, tint: 0xb4b9bd, sunFactor: 0.22, repeat: 2.6 },
  { name: 'Gasa', color: 'Beige', tex: 'img/tela-gasa-beige.png', normal: 'img/normal-gasa-beige.png',
    stiffness: 0.93, gravity: 6.2, friction: 0.968, influence: 0.42, dragCap: 0.04, roughness: 0.55,
    opacity: 0.52, castShadow: false, tint: 0xf6ead0, sunFactor: 1.0, repeat: 3.4 },
  { name: 'Torsor', color: 'Blanco', tex: 'img/tela-torsor-blanco.png', normal: 'img/normal-torsor-blanco.png',
    stiffness: 0.95, gravity: 6.8, friction: 0.965, influence: 0.38, dragCap: 0.034, roughness: 0.72,
    opacity: 0.85, castShadow: false, tint: 0xf3ecdc, sunFactor: 0.62, repeat: 3.0 },
];

const texLoader = new THREE.TextureLoader();
function fabricTex(src, srgb, rep) {
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); // nitidez en ángulo/movimiento
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeCurtainMaterial(p) {
  return new THREE.MeshStandardMaterial({
    map: fabricTex(p.tex, true, p.repeat),
    normalMap: fabricTex(p.normal, false, p.repeat),
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: p.tint,
    roughness: p.roughness,
    metalness: 0,
    transparent: true,
    opacity: p.opacity,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Física de tela: DOS simulaciones independientes (una por malla) para que la
// transición sea física de verdad: la vieja se desliza por el barral hacia un
// costado y la nueva entra desde el otro, ondeando con su propio peso.
// ---------------------------------------------------------------------------
const COLS = isMobile ? 14 : 18;
const ROWS = isMobile ? 20 : 26;
const ITERATIONS = 4;
const nx = COLS + 1;

const ANCHO_MIN = 60, ANCHO_MAX = 300, ANCHO_DEF = 120;
const ALTO_MIN = 60, ALTO_MAX = 260, ALTO_DEF = 150;
let anchoCm = ANCHO_DEF, altoCm = ALTO_DEF;

const BASE_W = WIN_W * 1.12, BASE_H = winTop - 0.02;
let W_M = BASE_W, H_M = BASE_H;

// Pliegue de pinza como ESTADO DE REPOSO (las columnas se agrupan; los
// rest-lengths usan esa distancia => la caída natural son curvas en S).
const PLEAT_COUNT = 6;
const PLEAT_AMPLITUDE = 0.5;
const gatheredU = (u) => u + (PLEAT_AMPLITUDE / (PLEAT_COUNT * Math.PI * 2)) * Math.sin(u * PLEAT_COUNT * Math.PI * 2);

function createSim() {
  // Anclaje por columna: pinned_x = offsetX + gatherX + (baseX - gatherX) * spread.
  // spread=1/offset=0 => reposo. spread→0.15 junta la cortina en pliegues hacia
  // gatherX (como al correrla de verdad); offsetX la desliza ya plegada.
  const sim = { points: [], constraints: [], restSpacingX: [], spread: 1, offsetX: 0, gatherX: 0 };
  sim.anchorX = (baseX) => sim.offsetX + sim.gatherX + (baseX - sim.gatherX) * sim.spread;
  sim.build = () => {
    sim.points = []; sim.constraints = []; sim.restSpacingX = [];
    const sy = H_M / ROWS;
    const colX = [];
    for (let x = 0; x <= COLS; x++) colX.push(-W_M / 2 + gatheredU(x / COLS) * W_M);
    for (let x = 0; x < COLS; x++) sim.restSpacingX.push(Math.abs(colX[x + 1] - colX[x]));
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x <= COLS; x++) {
        const px = sim.anchorX(colX[x]), py = ROD_Y - 0.03 - y * sy;
        sim.points.push({ x: px, y: py, px, py, baseX: colX[x], pinned: y === 0, u: x / COLS, v: y / ROWS });
        const i = sim.points.length - 1;
        if (x > 0) sim.constraints.push({ a: i - 1, b: i, len: sim.restSpacingX[x - 1] });
        if (y > 0) sim.constraints.push({ a: i - (COLS + 1), b: i, len: sy });
      }
    }
  };
  sim.step = (dt, params, ptr, tiltX) => {
    // Modo cinemático (transición de carrusel): cada punto sigue su posición
    // coreografiada con un lag suave por fila — plegado SIEMPRE prolijo, sin
    // caos de física. La simulación libre retoma al terminar.
    if (sim.kinematic) {
      const k = sim.kinematic;
      const sy = H_M / ROWS;
      for (const p of sim.points) {
        const tRow = clamp((k.t * 1.18 - p.v * 0.18), 0, 1);
        const e = easeInOut(tRow);
        const spread = lerp(k.from.spread, k.to.spread, e);
        const offset = lerp(k.from.offsetX, k.to.offsetX, e);
        p.x = offset + k.gatherX + (p.baseX - k.gatherX) * spread;
        p.y = ROD_Y - 0.03 - p.v * ROWS * sy;
        p.px = p.x; p.py = p.y;
      }
      return;
    }
    const dt2 = dt * dt;
    for (const p of sim.points) {
      if (p.pinned) { p.x = sim.anchorX(p.baseX); p.px = p.x; continue; }
      // clamp de velocidad: evita que la tela "explote" cuando el anclaje se
      // mueve rápido (transición de carrusel) o ante un drag violento
      const MAXV = 0.11;
      const vx = clamp((p.x - p.px) * params.friction, -MAXV, MAXV);
      const vy = clamp((p.y - p.py) * params.friction, -MAXV, MAXV);
      p.px = p.x; p.py = p.y;
      p.x += vx + tiltX * dt2;
      p.y += vy - params.gravity * dt2;
      if (ptr && ptr.active) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y;
        if (dx * dx + dy * dy < params.influence * params.influence) {
          p.px = p.x - clamp(ptr.x - ptr.px, -params.dragCap, params.dragCap);
          p.py = p.y - clamp(ptr.y - ptr.py, -params.dragCap, params.dragCap);
        }
      }
      if (p.y < 0.015) { p.y = 0.015; p.py = p.y; }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (const c of sim.constraints) {
        const p1 = sim.points[c.a], p2 = sim.points[c.b];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const diff = (c.len - dist) / dist * params.stiffness;
        const ox = dx * 0.5 * diff, oy = dy * 0.5 * diff;
        if (!p1.pinned) { p1.x -= ox; p1.y -= oy; }
        if (!p2.pinned) { p2.x += ox; p2.y += oy; }
      }
    }
  };
  sim.build();
  return sim;
}

function makeCurtainGeometry() { return new THREE.PlaneGeometry(1, 1, COLS, ROWS); }
function uploadGeometry(geo, sim) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      const i = y * nx + x;
      const p = sim.points[i];
      let bulge = 0;
      if (x > 0 && x < COLS) {
        const l = sim.points[i - 1], r = sim.points[i + 1];
        const span = Math.hypot(r.x - l.x, r.y - l.y);
        const rest = sim.restSpacingX[x - 1] + sim.restSpacingX[x];
        bulge = clamp((rest - span) / rest, -0.5, 1) * 0.16;
      }
      pos.setXYZ(i, p.x, p.y, bulge);
      uv.setXY(i, p.u, 1 - p.v);
    }
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  geo.computeVertexNormals();
}

const simA = createSim(), simB = createSim();
const geoA = makeCurtainGeometry(), geoB = makeCurtainGeometry();
const meshA = new THREE.Mesh(geoA, makeCurtainMaterial(PRODUCTS[0]));
const meshB = new THREE.Mesh(geoB, makeCurtainMaterial(PRODUCTS[1]));
meshA.position.z = backZ + 0.3;
meshB.position.z = backZ + 0.3;
meshA.castShadow = PRODUCTS[0].castShadow;
meshB.visible = false;
scene.add(meshA, meshB);

let currentIndex = 0;
let active = PRODUCTS[0];
let activeMesh = meshA, activeSim = simA;
let idleMesh = meshB, idleSim = simB;
let lightMix = { from: PRODUCTS[0], to: PRODUCTS[0], t: 1 };

// ---------------------------------------------------------------------------
// God-rays: la luz entrando desde la ventana, ocluida por la silueta REAL de
// la cortina (con la opacidad de su tela). En la oscuridad, el haz es el alma
// de la escena.
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const glowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(WIN_W - 0.04, WIN_H - 0.04),
  new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
);
glowPlane.position.set(0, WIN_Y + WIN_H / 2, backZ - 0.02);
glowPlane.layers.set(1);
scene.add(glowPlane);

const OCC_SIZE = isMobile ? 160 : 256;
const occlusionTarget = new THREE.WebGLRenderTarget(OCC_SIZE, Math.round(OCC_SIZE * 1.5));
const occOpaque = new THREE.MeshBasicMaterial({ color: 0x000000 });
const occCurtainA = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
const occCurtainB = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
const occSwap = new Map();

function renderOcclusionPass() {
  const prevTarget = renderer.getRenderTarget();
  const prevBg = scene.background;
  const prevAutoClear = renderer.autoClear;
  scene.background = null;
  renderer.autoClear = false;
  renderer.setRenderTarget(occlusionTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);

  camera.layers.disableAll(); camera.layers.enable(1);
  renderer.render(scene, camera);

  renderer.clearDepth();
  occSwap.clear();
  scene.traverse((o) => {
    if (!o.isMesh || o === glowPlane || o === glass) return;
    occSwap.set(o, o.material);
    if (o === meshA) { occCurtainA.opacity = meshA.material.opacity; o.material = occCurtainA; }
    else if (o === meshB) { occCurtainB.opacity = meshB.material.opacity; o.material = occCurtainB; }
    else o.material = occOpaque;
  });
  camera.layers.disableAll(); camera.layers.enable(0);
  renderer.render(scene, camera);
  occSwap.forEach((mat, o) => { o.material = mat; });

  renderer.autoClear = prevAutoClear;
  scene.background = prevBg;
  renderer.setRenderTarget(prevTarget);
}

// Shader final: god-rays + viñeta + grano fino — look de fotografía, no render.
const GODRAY_FRAG = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tOcclusion;
  uniform vec2 lightPos;
  uniform float exposure;
  uniform float decay;
  uniform float density;
  uniform float weight;
  uniform float strength;
  uniform float time;
  uniform vec3 tint;
  varying vec2 vUv;
  const int NUM_SAMPLES = ${isMobile ? 28 : 48};
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 deltaTextCoord = (vUv - lightPos) * (density / float(NUM_SAMPLES));
    vec2 coord = vUv;
    float illumination = 0.0;
    float currentDecay = 1.0;
    for (int i = 0; i < NUM_SAMPLES; i++) {
      coord -= deltaTextCoord;
      float s = texture2D(tOcclusion, coord).r;
      illumination += s * currentDecay * weight;
      currentDecay *= decay;
    }
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 col = base.rgb + tint * illumination * exposure * strength;
    // viñeta suave (mirada fotográfica, centra el ojo en la ventana)
    float d = distance(vUv, vec2(0.5, 0.48));
    col *= smoothstep(1.05, 0.42, d) * 0.35 + 0.65;
    // grano fino animado (mata el look "render limpio")
    float g = (hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 61.7) - 0.5) * 0.028;
    col += g;
    gl_FragColor = vec4(col, base.a);
  }
`;
const godrayPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tOcclusion: { value: occlusionTarget.texture },
    lightPos: { value: new THREE.Vector2(0.5, 0.5) },
    exposure: { value: 0.62 },
    decay: { value: 0.968 },
    density: { value: 0.95 },
    weight: { value: 0.52 },
    strength: { value: 1.0 },
    time: { value: 0 },
    tint: { value: new THREE.Vector3(1.0, 0.8, 0.52) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: GODRAY_FRAG,
});
composer.addPass(godrayPass);
composer.addPass(new OutputPass());

const lightWorldPos = new THREE.Vector3(0, WIN_Y + WIN_H / 2, backZ);
const lightProjected = new THREE.Vector3();
function updateLightScreenPos() {
  lightProjected.copy(lightWorldPos).project(camera);
  godrayPass.uniforms.lightPos.value.set(lightProjected.x * 0.5 + 0.5, lightProjected.y * 0.5 + 0.5);
}

function applyLightMix() {
  const t = lightMix.t;
  const sf = lerp(lightMix.from.sunFactor, lightMix.to.sunFactor, t);
  sun.intensity = SUN_BASE_INTENSITY * sf;
  fill.intensity = fillFor(sf);
  godrayPass.uniforms.strength.value = sf;
}

// ---------------------------------------------------------------------------
// Puntero (hover sin clic / dedo) + acelerómetro — actúan sobre la sim activa
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const curtainPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(backZ + 0.3));
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const ptr = { active: false, x: 0, y: 0, px: 0, py: 0 };
let tiltX = 0, motionEnabled = false;
const TILT_STRENGTH = 1.6;

function pointerToWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(curtainPlane, hitPoint)) return hitPoint;
  return null;
}
canvas.addEventListener('mouseenter', (e) => {
  ensureMotionPermission(); revealPanel();
  const w = pointerToWorld(e.clientX, e.clientY);
  if (w) { ptr.x = ptr.px = w.x; ptr.y = ptr.py = w.y; ptr.active = true; }
});
canvas.addEventListener('mousemove', (e) => {
  const w = pointerToWorld(e.clientX, e.clientY);
  if (w) { ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = w.x; ptr.y = w.y; ptr.active = true; }
  revealPanel();
});
canvas.addEventListener('mouseleave', () => { ptr.active = false; });
canvas.addEventListener('touchstart', (e) => {
  ensureMotionPermission(); revealPanel();
  const t = e.touches[0], w = pointerToWorld(t.clientX, t.clientY);
  if (w) { ptr.x = ptr.px = w.x; ptr.y = ptr.py = w.y; ptr.active = true; }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0], w = pointerToWorld(t.clientX, t.clientY);
  if (w) { ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = w.x; ptr.y = w.y; ptr.active = true; }
}, { passive: false });
const endTouch = () => { ptr.active = false; };
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);
window.addEventListener('resize', resize);

function onOrientation(e) {
  if (e.gamma == null) return;
  const target = clamp(Math.sin(e.gamma * Math.PI / 180), -1, 1) * TILT_STRENGTH;
  tiltX += (target - tiltX) * 0.08;
}
function ensureMotionPermission() {
  if (motionEnabled) return;
  motionEnabled = true;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((s) => { if (s === 'granted') window.addEventListener('deviceorientation', onOrientation); }).catch(() => {});
  } else if ('DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientation', onOrientation);
  }
}

// ---------------------------------------------------------------------------
// Carrusel: la cortina saliente SE DESLIZA por el barral hacia un lado y la
// entrante llega desde el otro — la física hace el ondeo del movimiento.
// ---------------------------------------------------------------------------
// La transición avanza en TIEMPO DE SIMULACIÓN (dentro de los sub-pasos de
// física): el barral nunca salta más de SLIDE_DIST*dt por paso, a cualquier
// framerate — sin telas enredadas en dispositivos lentos.
let switching = false;
let transitionState = null;
const GATHER_SPREAD = 0.16;             // cuánto se pliega al juntarse (16% del ancho)
const OFF_DIST = WIN_W * 0.95 + 0.7;    // corrimiento fuera de escena del paquete plegado
const TRANSITION_SECS = 1.6;            // juntar -> salir / entrar -> desplegar

function goTo(next, dir) {
  if (switching) return;
  switching = true;
  prevBtn.disabled = true; nextBtn.disabled = true;
  const to = PRODUCTS[next];

  // preparar la entrante: plegada, fuera de escena, del lado opuesto al que
  // sale la vieja. Ambas quedan en modo cinemático hasta terminar.
  idleMesh.material.dispose();
  idleMesh.material = makeCurtainMaterial(to);
  idleSim.spread = GATHER_SPREAD;
  idleSim.gatherX = dir * (W_M / 2);
  idleSim.offsetX = dir * OFF_DIST;
  idleSim.build();
  idleSim.kinematic = {
    t: 0,
    from: { spread: GATHER_SPREAD, offsetX: dir * OFF_DIST },
    to: { spread: 1, offsetX: 0 },
    gatherX: dir * (W_M / 2),
  };
  activeSim.kinematic = {
    t: 0,
    from: { spread: 1, offsetX: 0 },
    to: { spread: GATHER_SPREAD, offsetX: -dir * OFF_DIST },
    gatherX: -dir * (W_M / 2),
  };
  idleMesh.visible = true;
  idleMesh.castShadow = false;

  lightMix = { from: active, to, t: 0 };
  transitionState = { next, dir, to, t: 0, outSim: activeSim, inSim: idleSim, outMesh: activeMesh, inMesh: idleMesh };

  productLabel.classList.add('switching');
  setTimeout(() => { productName.textContent = to.name; productColor.textContent = to.color; productLabel.classList.remove('switching'); }, 380);
}

// avanza un sub-paso de la transición (coreografía cinemática de ambas telas)
function stepTransition() {
  const ts = transitionState;
  if (!ts) return false;
  ts.t = Math.min(1, ts.t + PHYS_DT / TRANSITION_SECS);
  ts.outSim.kinematic.t = ts.t;
  ts.inSim.kinematic.t = ts.t;
  lightMix.t = easeInOut(ts.t);
  return ts.t >= 1;
}

function finishTransition() {
  const ts = transitionState;
  ts.outMesh.visible = false;
  ts.inSim.kinematic = null; ts.outSim.kinematic = null; // la física libre retoma
  ts.inSim.spread = 1; ts.inSim.offsetX = 0; ts.inSim.gatherX = 0;
  active = ts.to; currentIndex = ts.next;
  activeMesh = ts.inMesh; idleMesh = ts.outMesh;
  activeSim = ts.inSim; idleSim = ts.outSim;
  activeMesh.castShadow = ts.to.castShadow;
  lightMix = { from: ts.to, to: ts.to, t: 1 };
  transitionState = null;
  switching = false;
  prevBtn.disabled = false; nextBtn.disabled = false;
  updateWhatsappLink();
  applyLightMix();
}
prevBtn.addEventListener('click', () => goTo((currentIndex - 1 + PRODUCTS.length) % PRODUCTS.length, -1));
nextBtn.addEventListener('click', () => goTo((currentIndex + 1) % PRODUCTS.length, 1));

// ---------------------------------------------------------------------------
// Steppers + WhatsApp
// ---------------------------------------------------------------------------
function applySize() {
  W_M = BASE_W * clamp(anchoCm / ANCHO_DEF, 0.5, 1.6);
  H_M = BASE_H * clamp(altoCm / ALTO_DEF, 0.45, 1.3);
  activeSim.spread = 1; activeSim.offsetX = 0; activeSim.gatherX = 0;
  activeSim.build();
  if (idleMesh.visible) idleSim.build();
}
document.querySelectorAll('[data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dir = Number(btn.dataset.dir);
    if (btn.dataset.step === 'ancho') { anchoCm = clamp(anchoCm + dir * 10, ANCHO_MIN, ANCHO_MAX); anchoValue.textContent = anchoCm; }
    else { altoCm = clamp(altoCm + dir * 10, ALTO_MIN, ALTO_MAX); altoValue.textContent = altoCm; }
    applySize();
    updateWhatsappLink();
  });
});
function updateWhatsappLink() {
  const p = PRODUCTS[currentIndex];
  const msg = `Hola! Quiero cotizar una cortina ${p.name} ${p.color} de ${anchoCm}x${altoCm}cm`;
  ctaWhatsapp.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

let revealed = false;
function revealPanel() {
  if (revealed) return;
  revealed = true;
  measurePanel.classList.add('visible');
  productLabel.classList.add('raised');
  hint.classList.add('hidden');
}
setTimeout(revealPanel, 2600);

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
function resize() {
  const r = canvas.getBoundingClientRect();
  camera.aspect = r.width / r.height;
  if (camera.aspect < 0.8) { camera.fov = 50; camera.position.set(0, 1.5, 7.2); }
  else { camera.fov = 38; camera.position.set(0, 1.55, 5.6); }
  camera.lookAt(0, 1.5, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height, false);
  composer.setSize(r.width, r.height);
}
resize();
applyLightMix();
updateWhatsappLink();

// Física con sub-pasos fijos de 1/60s: el comportamiento de la tela es
// idéntico a cualquier framerate (un teléfono a 25fps integra más sub-pasos
// por frame en vez de quedarse atrás del barral durante la transición).
const PHYS_DT = 1 / 60;
const MAX_SUBSTEPS = 6;
let last = performance.now();
function loop(now) {
  const elapsed = Math.min((now - last) / 1000, 0.16);
  last = now;
  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(elapsed / PHYS_DT)));
  let transitionDone = false;
  for (let s = 0; s < steps; s++) {
    if (transitionState) transitionDone = stepTransition() || transitionDone;
    activeSim.step(PHYS_DT, active, ptr, tiltX); // la activa (saliente durante el switch) usa SU tela
    if (idleMesh.visible) idleSim.step(PHYS_DT, lightMix.to, null, tiltX); // la entrante, la tela nueva
  }
  if (transitionState) applyLightMix();
  if (transitionDone) finishTransition();
  uploadGeometry(activeMesh === meshA ? geoA : geoB, activeSim);
  if (idleMesh.visible) uploadGeometry(idleMesh === meshA ? geoA : geoB, idleSim);
  updateLightScreenPos();
  godrayPass.uniforms.time.value = now / 1000;
  renderOcclusionPass();
  composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__cortina = {
  getState: () => ({
    currentIndex, anchoCm, altoCm, switching,
    productName: PRODUCTS[currentIndex].name, productColor: PRODUCTS[currentIndex].color,
  }),
  pokeScreen: (clientX, clientY, dClientX, dClientY) => {
    const w1 = pointerToWorld(clientX - dClientX, clientY - dClientY);
    const w2 = pointerToWorld(clientX, clientY);
    if (w1 && w2) { ptr.active = true; ptr.px = w1.x; ptr.py = w1.y; ptr.x = w2.x; ptr.y = w2.y; }
  },
};
