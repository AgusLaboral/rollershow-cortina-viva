import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ============================================================================
// Escena 3D real (no foto): ambiente simple + cortina de tela física + luz
// cálida real. En vez de un truco de bloom global, la luz que entra es un
// god-ray (radial-blur clásico) calculado contra un pase de oclusión que
// renderiza la silueta REAL del cuarto + la cortina deformada contra el
// cielo brillante — así el haz de luz cambia de forma cuadro a cuadro según
// cómo está plegada/corrida la tela en ESE instante, no un número global.
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

// ---------------------------------------------------------------------------
// Renderer / cámara / escena
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140d09);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
camera.position.set(0, 1.55, 5.6);
camera.lookAt(0, 1.5, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// ---------------------------------------------------------------------------
// Ambiente minimal: pared trasera con abertura de ventana, piso, pared lateral.
// Sin fotos: color plano + roughness, la luz hace el trabajo.
// ---------------------------------------------------------------------------
const ROOM_W = 5.2, ROOM_H = 3.4, ROOM_D = 12; // profundo: la cámara (z≈7.2 en retrato) queda SIEMPRE adentro
const WIN_W = 2.7, WIN_H = 2.55, WIN_Y = 0.05; // alto desde el piso

// Texturas PBR reales (Poly Haven, CC0) — detalle fotográfico tileable, liviano
const texLoader = new THREE.TextureLoader();
function pbrTex(src, srgb, repX, repY) {
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const wallMat = new THREE.MeshStandardMaterial({
  map: pbrTex('img/env/plaster_diff.jpg', true, 2.6, 1.7),
  normalMap: pbrTex('img/env/plaster_nor.jpg', false, 2.6, 1.7),
  color: 0xeed9b4, roughness: 0.94, metalness: 0,
});
const floorMat = new THREE.MeshStandardMaterial({
  map: pbrTex('img/env/wood_diff.jpg', true, 2.4, 2.4),
  normalMap: pbrTex('img/env/wood_nor.jpg', false, 2.4, 2.4),
  color: 0xc9a074, roughness: 0.62, metalness: 0.02,
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c140d, roughness: 0.5, metalness: 0.3 });

// HDRI fotográfico de atardecer (Poly Haven): iluminación global realista +
// ES lo que se ve por la ventana. backgroundBlurriness = el haze cálido pedido.
// Rotación calculada analizando el archivo (el sol del HDRI está en u=0.60;
// la ventana mira a -Z que muestrea u=0.25): (0.60-0.25)*2π ≈ 2.2 rad.
const ENV_ROT = 2.196;
new RGBELoader().load('img/env/sunset.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.background = hdr;
  scene.backgroundBlurriness = 0.22; // haze cálido natural
  scene.backgroundIntensity = 1.0;
  scene.environmentIntensity = 0.22; // la IBL rellena suave; el sol real lo pone la DirectionalLight
  scene.backgroundRotation = new THREE.Euler(0, ENV_ROT, 0);
  scene.environmentRotation = new THREE.Euler(0, ENV_ROT, 0);
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, ROOM_D / 2 - 2.2);
floor.receiveShadow = true;
scene.add(floor);

const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
sideWall.position.set(-ROOM_W / 2, ROOM_H / 2, ROOM_D / 2 - 2.2);
sideWall.rotation.y = Math.PI / 2;
sideWall.receiveShadow = true;
scene.add(sideWall);

// cuarto CERRADO: pared derecha y techo (si no, se ve el HDRI crudo y entra
// sol por los costados aunque el blackout tape la ventana)
const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
rightWall.position.set(ROOM_W / 2, ROOM_H / 2, ROOM_D / 2 - 2.2);
rightWall.rotation.y = -Math.PI / 2;
rightWall.receiveShadow = true;
rightWall.castShadow = true;
scene.add(rightWall);

const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), wallMat);
ceiling.position.set(0, ROOM_H, ROOM_D / 2 - 2.2);
ceiling.rotation.x = Math.PI / 2;
ceiling.receiveShadow = true;
scene.add(ceiling);

// Pared trasera con abertura de ventana: un solo Shape con un hueco rectangular
// (mucho más simple y sin bugs de armado que 4 paneles a mano).
const backZ = -2.2;
const winLeft = -WIN_W / 2, winRight = WIN_W / 2, winTop = WIN_Y + WIN_H, winBottom = WIN_Y;
const wallShape = new THREE.Shape();
wallShape.moveTo(-ROOM_W / 2, 0);
wallShape.lineTo(ROOM_W / 2, 0);
wallShape.lineTo(ROOM_W / 2, ROOM_H);
wallShape.lineTo(-ROOM_W / 2, ROOM_H);
wallShape.closePath();
const hole = new THREE.Path();
hole.moveTo(winLeft, winBottom);
hole.lineTo(winRight, winBottom);
hole.lineTo(winRight, winTop);
hole.lineTo(winLeft, winTop);
hole.closePath();
wallShape.holes.push(hole);
const backWall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), wallMat);
backWall.position.z = backZ;
backWall.receiveShadow = true;
scene.add(backWall);

// marco oscuro de la ventana
const frameThick = 0.06;
[[0, winTop, ROOM_W, frameThick], [0, winBottom, ROOM_W, frameThick]].forEach(([x, y, , h]) => {
  const f = new THREE.Mesh(new THREE.BoxGeometry(WIN_W + frameThick * 2, h, frameThick), frameMat);
  f.position.set(x, y, backZ + 0.01);
  scene.add(f);
});
[[winLeft, WIN_H], [winRight, WIN_H]].forEach(([x]) => {
  const f = new THREE.Mesh(new THREE.BoxGeometry(frameThick, WIN_H + frameThick * 2, frameThick), frameMat);
  f.position.set(x, WIN_Y + WIN_H / 2, backZ + 0.01);
  scene.add(f);
});
const mullion = new THREE.Mesh(new THREE.BoxGeometry(frameThick * 0.8, WIN_H, frameThick), frameMat);
mullion.position.set(0, WIN_Y + WIN_H / 2, backZ + 0.01);
scene.add(mullion);

// vidrio: simple y barato (transparente por alpha, no transmission real —
// carísimo en GPU/mobile y acá no aporta nada que el alpha no dé ya).
const glassMat = new THREE.MeshBasicMaterial({ color: 0xf6e2bb, transparent: true, opacity: 0.12 });
const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W - 0.02, WIN_H - 0.02), glassMat);
glass.position.set(0, WIN_Y + WIN_H / 2, backZ + 0.015);
scene.add(glass);

// "Fuente" para los god-rays: un plano brillante EN el hueco de la ventana,
// visible SOLO en el pase de oclusión (layer 1). La fuente de luz percibida
// es la ventana misma — el HDRI de fondo es lo que se ve a través del vidrio.
const glowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(WIN_W - 0.04, WIN_H - 0.04),
  new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
);
glowPlane.position.set(0, WIN_Y + WIN_H / 2, backZ - 0.02);
glowPlane.layers.set(1); // no existe en el render normal, solo como fuente de rayos
scene.add(glowPlane);

// ---------------------------------------------------------------------------
// Sol golden-hour: AFUERA del cuarto, entrando por la ventana. La pared, el
// marco y la cortina (con castShadow) son los oclusores reales del haz.
// ---------------------------------------------------------------------------
const SUN_BASE_INTENSITY = 5.5;
const sun = new THREE.DirectionalLight(0xffc27d, SUN_BASE_INTENSITY);
sun.position.set(1.1, 2.0, backZ - 3.2); // detrás de la pared trasera (afuera)
sun.target.position.set(-0.4, 0.5, 1.6); // apunta hacia adentro del cuarto
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 14;
sun.shadow.camera.left = -3.5; sun.shadow.camera.right = 3.5;
sun.shadow.camera.top = 3.5; sun.shadow.camera.bottom = -3.5;
sun.shadow.bias = -0.002;
scene.add(sun, sun.target);
backWall.castShadow = true; // la pared bloquea el sol: solo entra por el hueco

const FILL_BASE_INTENSITY = 0.8;
const fill = new THREE.HemisphereLight(0xffedd2, 0x241811, FILL_BASE_INTENSITY);
scene.add(fill);
// El fill nunca baja de un piso: con blackout el cuarto queda EN PENUMBRA
// (dramático y creíble) pero la tela y el ambiente se siguen leyendo.
const fillFor = (sunFactor) => FILL_BASE_INTENSITY * lerp(0.55, 1, sunFactor);

// Luz interior tenue y FIJA (independiente del producto): la "luz de la
// habitación". Sin esto, la cara interior del blackout queda negra ilegible
// porque el sol viene desde atrás de la tela.
const roomLight = new THREE.PointLight(0xffdcb0, 8, 12, 2);
roomLight.position.set(-1.0, 1.9, 2.6);
scene.add(roomLight);

// ---------------------------------------------------------------------------
// Cortina: física Verlet (igual que antes) mapeada a una malla 3D real.
// Dos capas superpuestas para el crossfade del carrusel.
// ---------------------------------------------------------------------------
const isMobile = matchMedia('(max-width:640px)').matches;
const COLS = isMobile ? 14 : 18;
const ROWS = isMobile ? 18 : 24;
const ITERATIONS = 3;

const ANCHO_MIN = 60, ANCHO_MAX = 300, ANCHO_DEF = 120;
const ALTO_MIN = 60, ALTO_MAX = 260, ALTO_DEF = 150;
let anchoCm = ANCHO_DEF, altoCm = ALTO_DEF;

const CURTAIN_TOP_Y = WIN_Y + WIN_H + 0.08; // roller/barral apenas arriba del marco
const BASE_W = WIN_W * 1.05, BASE_H = WIN_H + 0.35;

const PRODUCTS = [
  { name: 'Blackout', color: 'Gris', tex: 'img/tela-blackout-gris.png', normal: 'img/normal-blackout-gris.png',
    stiffness: 0.94, gravity: 4.6, friction: 0.985, influence: 0.42, dragCap: 0.05, roughness: 0.88,
    opacity: 1, castShadow: true, tint: 0x8a8f92, sunFactor: 0.18 },
  { name: 'Gasa', color: 'Beige', tex: 'img/tela-gasa-beige.png', normal: 'img/normal-gasa-beige.png',
    stiffness: 0.86, gravity: 3.6, friction: 0.975, influence: 0.5, dragCap: 0.07, roughness: 0.55,
    opacity: 0.55, castShadow: false, tint: 0xf3e6c8, sunFactor: 1.0 },
  { name: 'Torsor', color: 'Blanco', tex: 'img/tela-torsor-blanco.png', normal: 'img/normal-torsor-blanco.png',
    stiffness: 0.9, gravity: 4.1, friction: 0.98, influence: 0.46, dragCap: 0.06, roughness: 0.7,
    opacity: 0.82, castShadow: false, tint: 0xf2ead8, sunFactor: 0.75 },
];

const loader = new THREE.TextureLoader();
function loadTex(src, srgb) {
  const t = loader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let W_M = BASE_W, H_M = BASE_H; // dimensiones actuales de la cortina, en metros de escena
let points = [], constraints = [];
let restSpacingX = []; // referencia de "reposo" plegado, por columna (para el bulge en Z)

// Pliegue de pinza (pinch pleat): en vez de una grilla pareja, las columnas se
// agrupan periódicamente (como el cabezal de una cortina tradicional tomada).
// El "rest length" de los constraints horizontales usa ESTA distancia agrupada,
// así el plegado es el estado de equilibrio real (estable, no una grilla que
// la física intenta aplanar) y se nota en toda la altura, no solo arriba.
const PLEAT_COUNT = 5;
const PLEAT_AMPLITUDE = 0.62;
function gatheredU(u) {
  return u + (PLEAT_AMPLITUDE / (PLEAT_COUNT * Math.PI * 2)) * Math.sin(u * PLEAT_COUNT * Math.PI * 2);
}

function buildPhysics() {
  points = []; constraints = []; restSpacingX = [];
  const sy = H_M / ROWS;
  const colX = [];
  for (let x = 0; x <= COLS; x++) colX.push(-W_M / 2 + gatheredU(x / COLS) * W_M);
  for (let x = 0; x < COLS; x++) restSpacingX.push(Math.abs(colX[x + 1] - colX[x]));

  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      const px = colX[x], py = CURTAIN_TOP_Y - y * sy;
      points.push({ x: px, y: py, px, py, pinned: y === 0, u: x / COLS, v: y / ROWS });
      const i = points.length - 1;
      if (x > 0) constraints.push({ a: i - 1, b: i, len: restSpacingX[x - 1] });
      if (y > 0) constraints.push({ a: i - (COLS + 1), b: i, len: sy });
    }
  }
}
buildPhysics();

function makeCurtainGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, COLS, ROWS); // placeholder, posiciones reales via BufferAttribute
  return geo;
}

function makeCurtainMaterial(p) {
  // Alpha blending simple (no `transmission`, carísimo por el render-to-texture
  // que exige) — en una escena 3D real, la opacidad ya deja ver lo que hay
  // detrás (vidrio, cielo, luz), así que alcanza para el efecto de traslucidez.
  return new THREE.MeshStandardMaterial({
    map: loadTex(p.tex, true),
    normalMap: loadTex(p.normal, false),
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: p.tint,
    roughness: p.roughness,
    metalness: 0,
    transparent: true,
    opacity: p.opacity,
    side: THREE.DoubleSide,
  });
}

// dos capas para el crossfade (misma geometría lógica, distinto material)
const geoA = makeCurtainGeometry(), geoB = makeCurtainGeometry();
const meshA = new THREE.Mesh(geoA, makeCurtainMaterial(PRODUCTS[0]));
const meshB = new THREE.Mesh(geoB, makeCurtainMaterial(PRODUCTS[1]));
meshA.castShadow = PRODUCTS[0].castShadow;
meshB.castShadow = false;
meshB.visible = false;
scene.add(meshA, meshB);

function setUVRepeat(mesh, product) {
  const rep = product.name === 'Blackout' ? 3.2 : product.name === 'Gasa' ? 4.5 : 3.8;
  [mesh.material.map, mesh.material.normalMap].forEach((t) => { if (t) t.repeat.set(rep, rep * (H_M / W_M) * (W_M / H_M) * 1.0); });
}

// ---------------------------------------------------------------------------
// God-rays reales: la luz que entra se calcula contra una silueta de
// oclusión de la escena real (pared+marco+cortina, en negro) contra el
// cielo brillante (única cosa en layer 1). Como la cortina comparte la
// MISMA geometría deformada por la física, el rayo de luz cambia de forma
// con cada pliegue/gesto — no es un número global, es la tela tapando luz.
// ---------------------------------------------------------------------------
const OCC_SIZE = isMobile ? 160 : 256;
const occlusionTarget = new THREE.WebGLRenderTarget(OCC_SIZE, Math.round(OCC_SIZE * 1.5));
// Oclusores: negro opaco para paredes/piso/marco; para la cortina, negro CON
// la opacidad actual de la tela — así la gasa deja pasar ~45% del haz y el
// blackout lo bloquea entero. La transparencia del producto ES la del rayo.
const occOpaque = new THREE.MeshBasicMaterial({ color: 0x000000 });
const occCurtainA = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
const occCurtainB = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
const occSwap = new Map();

function renderOcclusionPass() {
  const prevTarget = renderer.getRenderTarget();
  const prevBg = scene.background;
  const prevAutoClear = renderer.autoClear;
  scene.background = null; // el HDRI no participa: la fuente es SOLO la ventana
  renderer.autoClear = false;
  renderer.setRenderTarget(occlusionTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);

  // 1) la fuente: el plano brillante del hueco de la ventana (layer 1)
  camera.layers.disableAll(); camera.layers.enable(1);
  renderer.render(scene, camera);

  // 2) los oclusores encima, en negro (cortina con su transparencia real)
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

  camera.layers.disableAll(); camera.layers.enable(0);
  renderer.autoClear = prevAutoClear;
  scene.background = prevBg;
  renderer.setRenderTarget(prevTarget);
}

const GODRAY_FRAG = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tOcclusion;
  uniform vec2 lightPos;
  uniform float exposure;
  uniform float decay;
  uniform float density;
  uniform float weight;
  uniform float strength;
  uniform vec3 tint;
  varying vec2 vUv;
  const int NUM_SAMPLES = ${isMobile ? 28 : 48};
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
    gl_FragColor = vec4(base.rgb + tint * illumination * exposure * strength, base.a);
  }
`;
const godrayPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tOcclusion: { value: occlusionTarget.texture },
    lightPos: { value: new THREE.Vector2(0.5, 0.5) },
    exposure: { value: 0.55 },
    decay: { value: 0.965 },
    density: { value: 0.9 },
    weight: { value: 0.5 },
    strength: { value: 1.0 },
    tint: { value: new THREE.Vector3(1.0, 0.82, 0.56) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: GODRAY_FRAG,
});
composer.addPass(godrayPass);
composer.addPass(new OutputPass());

const lightWorldPos = new THREE.Vector3(0, WIN_Y + WIN_H / 2, backZ); // centro de la ventana: LA fuente
const lightProjected = new THREE.Vector3();
function updateLightScreenPos() {
  lightProjected.copy(lightWorldPos).project(camera);
  godrayPass.uniforms.lightPos.value.set(lightProjected.x * 0.5 + 0.5, lightProjected.y * 0.5 + 0.5);
}

let currentIndex = 0;
let active = PRODUCTS[0];
let transition = null;
setUVRepeat(meshA, active);

// ---------------------------------------------------------------------------
// Física: Verlet (misma lógica que la versión 2D, ahora en metros/3D)
// ---------------------------------------------------------------------------
const ptr = { active: false, x: 0, y: 0, px: 0, py: 0 };
let tiltX = 0, motionEnabled = false;
const TILT_STRENGTH = 2.4;

function param(k) { return transition ? lerp(transition.from[k], transition.to[k], transition.t) : active[k]; }

function updatePhysics(dt) {
  const dt2 = dt * dt;
  const gravity = param('gravity'), friction = param('friction');
  const influence = param('influence'), dragCap = param('dragCap'), stiffness = param('stiffness');
  for (const p of points) {
    if (p.pinned) continue;
    const vx = (p.x - p.px) * friction, vy = (p.y - p.py) * friction;
    p.px = p.x; p.py = p.y;
    p.x += vx + tiltX * dt2;
    p.y += vy - gravity * dt2;
    if (ptr.active) {
      const dx = p.x - ptr.x, dy = p.y - ptr.y;
      if (dx * dx + dy * dy < influence * influence) {
        p.px = p.x - clamp(ptr.x - ptr.px, -dragCap, dragCap);
        p.py = p.y - clamp(ptr.y - ptr.py, -dragCap, dragCap);
      }
    }
    if (p.y < 0.02) { p.y = 0.02; p.py = p.y; }
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (const c of constraints) {
      const p1 = points[c.a], p2 = points[c.b];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const diff = (c.len - dist) / dist * stiffness;
      const ox = dx * 0.5 * diff, oy = dy * 0.5 * diff;
      if (!p1.pinned) { p1.x -= ox; p1.y -= oy; }
      if (!p2.pinned) { p2.x += ox; p2.y += oy; }
    }
  }
  ptr.px = ptr.x; ptr.py = ptr.y;
}

// sube posiciones + bulge en Z (según compresión horizontal local = pliegue real en profundidad)
const nx = COLS + 1;
function uploadGeometry(geo) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      const i = y * nx + x;
      const p = points[i];
      // bulge: compara el ancho local contra el reposo plegado (no el plano) —
      // así el pliegue de pinza se ve en profundidad en toda la altura de la tela.
      let bulge = 0;
      if (x > 0 && x < COLS) {
        const left = points[i - 1], right = points[i + 1];
        const span = Math.hypot(right.x - left.x, right.y - left.y);
        const rest = restSpacingX[x - 1] + restSpacingX[x];
        bulge = clamp((rest - span) / rest, -0.5, 1) * 0.2;
      }
      pos.setXYZ(i, p.x, p.y, bulge);
      uv.setXY(i, p.u, 1 - p.v);
    }
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  geo.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Puntero: raycast al plano de la cortina (z=0). Hover en desktop, dedo en mobile.
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const curtainPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

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
  const t = e.touches[0]; const w = pointerToWorld(t.clientX, t.clientY);
  if (w) { ptr.x = ptr.px = w.x; ptr.y = ptr.py = w.y; ptr.active = true; }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0]; const w = pointerToWorld(t.clientX, t.clientY);
  if (w) { ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = w.x; ptr.y = w.y; ptr.active = true; }
}, { passive: false });
const endTouch = () => { ptr.active = false; };
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

// ---------------------------------------------------------------------------
// Acelerómetro
// ---------------------------------------------------------------------------
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
// Carrusel: crossfade de opacity/transmission entre meshA/meshB + la luz
// reacciona: al blackout se le habilita sombra real, a las translúcidas no.
// ---------------------------------------------------------------------------
let switching = false;
function goTo(next) {
  if (switching) return;
  switching = true; prevBtn.disabled = true; nextBtn.disabled = true;
  const to = PRODUCTS[next];
  const incoming = meshA.visible && !meshB.visible ? meshB : meshA;
  const outgoing = incoming === meshA ? meshB : meshA;
  incoming.material = makeCurtainMaterial(to);
  incoming.material.opacity = 0;
  incoming.visible = true;
  incoming.castShadow = false;
  setUVRepeat(incoming, to);
  transition = { from: active, to, t: 0, duration: 620, incoming, outgoing };
  productLabel.classList.add('switching');
  setTimeout(() => { productName.textContent = to.name; productColor.textContent = to.color; productLabel.classList.remove('switching'); }, 280);
  const start = performance.now();
  function step(now) {
    const raw = clamp((now - start) / transition.duration, 0, 1);
    transition.t = 1 - Math.pow(1 - raw, 3);
    incoming.material.opacity = transition.t * to.opacity;
    outgoing.material.opacity = (1 - transition.t) * transition.from.opacity;
    sun.intensity = SUN_BASE_INTENSITY * lerp(transition.from.sunFactor, to.sunFactor, transition.t);
    fill.intensity = fillFor(lerp(transition.from.sunFactor, to.sunFactor, transition.t));
    godrayPass.uniforms.strength.value = lerp(transition.from.sunFactor, to.sunFactor, transition.t);
    if (raw < 1) requestAnimationFrame(step);
    else {
      outgoing.visible = false;
      active = to; currentIndex = next; transition = null; switching = false;
      incoming.castShadow = to.castShadow;
      sun.castShadow = true;
      prevBtn.disabled = false; nextBtn.disabled = false;
      updateWhatsappLink();
    }
  }
  requestAnimationFrame(step);
}
prevBtn.addEventListener('click', () => goTo((currentIndex - 1 + PRODUCTS.length) % PRODUCTS.length));
nextBtn.addEventListener('click', () => goTo((currentIndex + 1) % PRODUCTS.length));

// ---------------------------------------------------------------------------
// Steppers ancho/alto: reconstruye la física a la nueva escala en metros
// ---------------------------------------------------------------------------
function applySize() {
  const wFrac = clamp(anchoCm / ANCHO_DEF, 0.5, 1.7);
  const hFrac = clamp(altoCm / ALTO_DEF, 0.45, 1.35);
  W_M = BASE_W * wFrac;
  H_M = BASE_H * hFrac;
  buildPhysics();
  setUVRepeat(meshA, active);
  if (meshB.visible) setUVRepeat(meshB, transition ? transition.to : active);
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
  // Encuadre por aspecto: en retrato la cámara se aleja y abre para que la
  // ventana con su cortina entren completas (si no, mobile recorta la escena).
  if (camera.aspect < 0.8) {
    camera.fov = 50;
    camera.position.set(0, 1.5, 7.2);
  } else {
    camera.fov = 38;
    camera.position.set(0, 1.55, 5.6);
  }
  camera.lookAt(0, 1.5, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height, false);
  composer.setSize(r.width, r.height);
}
window.addEventListener('resize', resize);
resize();

meshA.castShadow = PRODUCTS[0].castShadow;
sun.intensity = SUN_BASE_INTENSITY * PRODUCTS[0].sunFactor;
fill.intensity = fillFor(PRODUCTS[0].sunFactor);
godrayPass.uniforms.strength.value = PRODUCTS[0].sunFactor;

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  updatePhysics(dt);
  uploadGeometry(geoA);
  if (meshB.visible) uploadGeometry(geoB);
  updateLightScreenPos();
  renderOcclusionPass();
  composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
updateWhatsappLink();

window.__cortina = {
  getState: () => ({
    currentIndex, anchoCm, altoCm, switching,
    productName: PRODUCTS[currentIndex].name, productColor: PRODUCTS[currentIndex].color,
  }),
  poke: (nx_, ny_, dx, dy) => {
    // coordenadas de mundo directas (usadas por la verificación, no pixeles de pantalla)
    ptr.active = true; ptr.px = nx_ - dx; ptr.py = ny_ - dy; ptr.x = nx_; ptr.y = ny_;
  },
  pokeScreen: (clientX, clientY, dClientX, dClientY) => {
    const w1 = pointerToWorld(clientX - dClientX, clientY - dClientY);
    const w2 = pointerToWorld(clientX, clientY);
    if (w1 && w2) { ptr.active = true; ptr.px = w1.x; ptr.py = w1.y; ptr.x = w2.x; ptr.y = w2.y; }
  },
};
