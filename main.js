import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ============================================================================
// v5 — Dirección de Agus:
// - Cámara en ángulo (~40°), no frontal. La luz del atardecer entra por la
//   ventana y se refleja en el piso oscuro (sin grano animado: puntitos NO).
// - Haz de luz VOLUMÉTRICO visible (mesh aditivo desde la ventana al piso,
//   estilo RTX) + god-rays sutiles + haze.
// - Cortina en DOS PAÑOS entreabiertos: la luz pasa por el medio. El hover
//   mueve la tela de cada paño.
// - Productos: Blackout BLANCO (opaco total), Gasa beige (más cubriente que
//   antes) y Tusor natural (más cubriente aún). Gasa y tusor dejan pasar luz.
// - Caída ondulada (pliegues S marcados), no recta.
// - Audio ambient generativo tipo Marconi Union, bajísimo y elegante, que
//   varía suavemente cuando la tela se mueve. Arranca con el primer gesto.
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
const muteBtn = document.getElementById('muteBtn');

const WHATSAPP_NUMBER = '5491140813223';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------------------------------------------------------------------------
// Renderer / cámara
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9c2b6);

const isMobile = matchMedia('(max-width:640px)').matches;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

// ---------------------------------------------------------------------------
// Puerta-ventana protagonista en ambiente CLARO minimalista (referencia de
// Agus: cuarto limpio, ventana blanca de paños con grilla, charco de luz
// nítido en el piso). La puerta-ventana va del piso al dintel, en dos hojas
// con grilla de vidrios — los parantes proyectan la sombra en grilla.
// ---------------------------------------------------------------------------
const WIN_W = 2.6, WIN_Y = 0.02, WIN_H = 2.72;
const backZ = -2.2;
const winTop = WIN_Y + WIN_H;

// Paredes y piso claros, sin textura cargada: superficie limpia que recibe luz
const ROOM = { w: 30, h: 12 };
const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc9bf, roughness: 0.95, metalness: 0 });
const wallShape = new THREE.Shape();
wallShape.moveTo(-ROOM.w / 2, 0); wallShape.lineTo(ROOM.w / 2, 0);
wallShape.lineTo(ROOM.w / 2, ROOM.h); wallShape.lineTo(-ROOM.w / 2, ROOM.h);
wallShape.closePath();
const wallHole = new THREE.Path();
wallHole.moveTo(-WIN_W / 2, WIN_Y); wallHole.lineTo(WIN_W / 2, WIN_Y);
wallHole.lineTo(WIN_W / 2, winTop); wallHole.lineTo(-WIN_W / 2, winTop);
wallHole.closePath();
wallShape.holes.push(wallHole);
const backWall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), wallMat);
backWall.position.z = backZ;
backWall.receiveShadow = true;
backWall.castShadow = true;
scene.add(backWall);

const ENV_ROT = 2.196; // sol del HDRI centrado en la ventana (calculado del archivo)
new RGBELoader().load('img/env/sunset.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.background = hdr;
  scene.backgroundBlurriness = 0.5;
  scene.backgroundIntensity = 1.15;
  scene.environmentIntensity = 0.32;
  scene.backgroundRotation = new THREE.Euler(0, ENV_ROT, 0);
  scene.environmentRotation = new THREE.Euler(0, ENV_ROT, 0);
});

// Piso claro, satinado apenas: refleja suave la luz (sin ruido, sin puntitos)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0xbfb8ac, roughness: 0.55, metalness: 0.06 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 10);
floor.receiveShadow = true;
scene.add(floor);

// Puerta-ventana blanca de dos hojas con grilla de paños (estilo referencia)
const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55, metalness: 0.05 });
const F = 0.06;
function frameBar(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return m;
}
// marco perimetral
frameBar(WIN_W + F * 2, F, 0.14, 0, winTop + F / 2, backZ);
frameBar(WIN_W + F * 2, F, 0.14, 0, WIN_Y - F / 2 + 0.01, backZ);
frameBar(F, WIN_H + F * 2, 0.14, -WIN_W / 2 - F / 2, WIN_Y + WIN_H / 2, backZ);
frameBar(F, WIN_H + F * 2, 0.14, WIN_W / 2 + F / 2, WIN_Y + WIN_H / 2, backZ);
// parante central (división de las dos hojas, un poco más grueso)
frameBar(F * 1.3, WIN_H, 0.12, 0, WIN_Y + WIN_H / 2, backZ);
// grilla de cada hoja: 1 parante vertical y 3 travesaños => 2x4 vidrios por hoja
const MUNT = F * 0.5;
for (const side of [-1, 1]) {
  const cx = side * WIN_W / 4; // centro de la hoja
  frameBar(MUNT, WIN_H, 0.09, cx, WIN_Y + WIN_H / 2, backZ); // vertical
  for (let r = 1; r <= 3; r++) {
    frameBar(WIN_W / 2 - F, MUNT, 0.09, cx, WIN_Y + (WIN_H / 4) * r, backZ);
  }
}

const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(WIN_W - 0.02, WIN_H - 0.02),
  new THREE.MeshBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0.1, depthWrite: false })
);
glass.renderOrder = 1;
glass.position.set(0, WIN_Y + WIN_H / 2, backZ + 0.012);
scene.add(glass);

const rodMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.4, metalness: 0.7 });
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
// Luz: sol golden-hour desde afuera + spot de recorte + fill mínimo
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

const keyFill = new THREE.SpotLight(0xfff0d8, 9, 18, 0.8, 0.7, 1.6);
keyFill.position.set(-1.8, 2.4, 3.4);
keyFill.target.position.set(0, 1.4, backZ + 0.3);
scene.add(keyFill, keyFill.target);

const FILL_BASE_INTENSITY = 1.35;
const fill = new THREE.HemisphereLight(0xfdf3e3, 0x8a8378, FILL_BASE_INTENSITY);
scene.add(fill);
const fillFor = (sf) => FILL_BASE_INTENSITY * lerp(0.72, 1, sf);

// ---------------------------------------------------------------------------
// HAZ VOLUMÉTRICO: prisma aditivo desde el hueco de la ventana hasta el piso
// siguiendo la dirección real del sol — la luz "se ve" entrar al ambiente.
// ---------------------------------------------------------------------------
const sunDir = new THREE.Vector3().subVectors(sun.target.position, sun.position).normalize();
function projectToFloor(x, y, z) {
  const t = y / -sunDir.y; // distancia hasta y=0
  return [x + sunDir.x * t, 0.001, z + sunDir.z * t];
}
const shaftGeo = new THREE.BufferGeometry();
{
  const tl = [-WIN_W / 2, winTop, backZ + 0.02], tr = [WIN_W / 2, winTop, backZ + 0.02];
  const bl = [-WIN_W / 2, WIN_Y, backZ + 0.02], br = [WIN_W / 2, WIN_Y, backZ + 0.02];
  const ftl = projectToFloor(...tl), ftr = projectToFloor(...tr);
  const positions = new Float32Array([
    ...tl, ...tr, ...bl, ...br,     // 0-3: hueco de la ventana
    ...ftl, ...ftr,                 // 4-5: proyección del borde superior en el piso
  ]);
  // caras: hueco -> piso (dos "cortinas" de luz: superior e inferior del haz)
  const idx = [
    0, 1, 5, 0, 5, 4,   // lámina superior del haz
    2, 3, 5, 2, 5, 4,   // lámina inferior (converge al piso)
  ];
  // intensidad por vértice: fuerte en la ventana, se disuelve al llegar al piso
  const alphas = new Float32Array([0.9, 0.9, 0.55, 0.55, 0.0, 0.0]);
  shaftGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  shaftGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  shaftGeo.setIndex(idx);
}
const shaftMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: {
    uIntensity: { value: 0.16 },
    uColor: { value: new THREE.Color(1.0, 0.78, 0.5) },
  },
  vertexShader: `
    attribute float aAlpha;
    varying float vAlpha;
    void main(){ vAlpha = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uIntensity;
    uniform vec3 uColor;
    varying float vAlpha;
    void main(){ gl_FragColor = vec4(uColor, vAlpha * uIntensity); }`,
});
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
scene.add(shaft);

// ---------------------------------------------------------------------------
// Productos (corregidos por Agus): blackout BLANCO opaco; gasa y tusor dejan
// pasar luz pero son más cubrientes que antes.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Blackout', color: 'Blanco', tex: 'img/fabric/blackout.jpg', normal: 'img/fabric/blackout-nor.png',
    stiffness: 0.97, gravity: 7.4, friction: 0.962, influence: 0.34, dragCap: 0.028, roughness: 0.85,
    opacity: 1, castShadow: true, tint: 0xffffff, sunFactor: 0.16, repeat: 1.6 },
  { name: 'Gasa', color: 'Beige', tex: 'img/fabric/gasa.jpg', normal: 'img/fabric/gasa-nor.png',
    stiffness: 0.93, gravity: 6.2, friction: 0.968, influence: 0.42, dragCap: 0.04, roughness: 0.6,
    opacity: 0.74, castShadow: false, tint: 0xfaf0dc, sunFactor: 0.75, repeat: 1.8 },
  { name: 'Tusor', color: 'Natural', tex: 'img/fabric/tusor.jpg', normal: 'img/fabric/tusor-nor.png',
    stiffness: 0.95, gravity: 6.8, friction: 0.965, influence: 0.38, dragCap: 0.034, roughness: 0.8,
    opacity: 0.9, castShadow: false, tint: 0xe9dfc9, sunFactor: 0.42, repeat: 1.7 },
];

const texLoader = new THREE.TextureLoader();
function fabricTex(src, srgb, rep, repY) {
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, repY ?? rep);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeCurtainMaterial(p) {
  return new THREE.MeshStandardMaterial({
    map: fabricTex(p.tex, true, p.repeat * 0.55, p.repeat),
    normalMap: fabricTex(p.normal, false, p.repeat * 0.55, p.repeat),
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
// Física: CUATRO simulaciones (2 paños x 2 sets para el carrusel).
// Cada paño cubre poco más de la mitad de la ventana y cuelga entreabierto:
// la luz pasa por el medio. Ondulado marcado como estado de reposo.
// ---------------------------------------------------------------------------
const COLS = isMobile ? 9 : 11;   // por paño
const ROWS = isMobile ? 20 : 26;
const ITERATIONS = 4;
const nx = COLS + 1;

const ANCHO_MIN = 60, ANCHO_MAX = 300, ANCHO_DEF = 120;
const ALTO_MIN = 60, ALTO_MAX = 260, ALTO_DEF = 150;
let anchoCm = ANCHO_DEF, altoCm = ALTO_DEF;

const FULL_W = WIN_W * 1.28;           // ancho total del par de paños
let W_M = FULL_W, H_M = winTop + 0.16; // el ruedo besa el piso
const PANEL_GAP = 0.18;                // apertura central en reposo (más juntos, pasa un haz)

const PLEAT_COUNT = 7;                 // ondas por paño (wave fold denso)
const PLEAT_AMPLITUDE = 0.55;
const gatheredU = (u) => u + (PLEAT_AMPLITUDE / (PLEAT_COUNT * Math.PI * 2)) * Math.sin(u * PLEAT_COUNT * Math.PI * 2);

// side: -1 = paño izquierdo (cuelga desde el borde izquierdo hacia el centro)
function createSim(side) {
  const sim = { side, points: [], constraints: [], restSpacingX: [], spread: 1, offsetX: 0, kinematic: null };
  // reposo del paño: desde el borde exterior hasta cerca del centro (gap)
  sim.panelRange = () => {
    const half = W_M / 2;
    const panelW = half * (1 - PANEL_GAP / 2);
    const outer = side * half;
    const inner = side * (half - panelW);
    return { outer, inner, w: Math.abs(outer - inner) };
  };
  // el paño se pliega SIEMPRE hacia su borde exterior
  sim.anchorX = (baseX) => {
    const { outer } = sim.panelRange();
    return sim.offsetX + outer + (baseX - outer) * sim.spread;
  };
  sim.build = () => {
    sim.points = []; sim.constraints = []; sim.restSpacingX = [];
    const { outer, inner } = sim.panelRange();
    const sy = H_M / ROWS;
    const colX = [];
    for (let x = 0; x <= COLS; x++) colX.push(outer + gatheredU(x / COLS) * (inner - outer));
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
    if (sim.kinematic) {
      const k = sim.kinematic;
      const sy = H_M / ROWS;
      const { outer } = sim.panelRange();
      for (const p of sim.points) {
        const tRow = clamp((k.t * 1.18 - p.v * 0.18), 0, 1);
        const e = easeInOut(tRow);
        const spread = lerp(k.from.spread, k.to.spread, e);
        const offset = lerp(k.from.offsetX, k.to.offsetX, e);
        p.x = offset + outer + (p.baseX - outer) * spread;
        p.y = ROD_Y - 0.03 - p.v * ROWS * sy;
        p.px = p.x; p.py = p.y;
      }
      return;
    }
    const dt2 = dt * dt;
    const MAXV = 0.11;
    for (const p of sim.points) {
      if (p.pinned) { p.x = sim.anchorX(p.baseX); p.px = p.x; continue; }
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

function makePanelGeometry() { return new THREE.PlaneGeometry(1, 1, COLS, ROWS); }
function uploadGeometry(geo, sim) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      const i = y * nx + x;
      const p = sim.points[i];
      // onda S real (wave fold): alterna adelante/atrás como una cortina de
      // riel; la compresión local profundiza la onda (al juntarla se pliega más)
      let compress = 0;
      if (x > 0 && x < COLS) {
        const l = sim.points[i - 1], r = sim.points[i + 1];
        const span = Math.hypot(r.x - l.x, r.y - l.y);
        const rest = sim.restSpacingX[x - 1] + sim.restSpacingX[x];
        compress = clamp((rest - span) / rest, 0, 1);
      }
      const wave = Math.sin(p.u * Math.PI * 2 * PLEAT_COUNT) * (0.085 + compress * 0.12);
      pos.setXYZ(i, p.x, p.y, wave);
      uv.setXY(i, p.u, 1 - p.v);
    }
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  geo.computeVertexNormals();
}

// un "set" = dos paños (izq + der) con el mismo material/producto
function createSet(product) {
  const set = { sims: [createSim(-1), createSim(1)], meshes: [], visible: true };
  set.geos = [makePanelGeometry(), makePanelGeometry()];
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(set.geos[i], makeCurtainMaterial(product));
    mesh.renderOrder = 3;
    mesh.position.z = backZ + 0.3;
    scene.add(mesh);
    set.meshes.push(mesh);
  }
  set.setVisible = (v) => { set.visible = v; set.meshes.forEach((m) => { m.visible = v; }); };
  set.setCastShadow = (v) => set.meshes.forEach((m) => { m.castShadow = v; });
  set.setMaterial = (product) => set.meshes.forEach((m) => { m.material.dispose(); m.material = makeCurtainMaterial(product); });
  set.opacity = () => set.meshes[0].material.opacity;
  return set;
}

const setA = createSet(PRODUCTS[0]);
const setB = createSet(PRODUCTS[1]);
setB.setVisible(false);
setA.setCastShadow(PRODUCTS[0].castShadow);

let currentIndex = 0;
let active = PRODUCTS[0];
let activeSet = setA, idleSet = setB;
let lightMix = { from: PRODUCTS[0], to: PRODUCTS[0], t: 1 };

// ---------------------------------------------------------------------------
// God-rays sutiles (la oclusión real de los paños modula el resplandor)
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
const occCurtain = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
const occSwap = new Map();
const curtainMeshes = new Set([...setA.meshes, ...setB.meshes]);

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
    if (!o.isMesh || o === glowPlane || o === glass || o === shaft) return;
    occSwap.set(o, o.material);
    if (curtainMeshes.has(o)) { occCurtain.opacity = o.material.opacity; o.material = occCurtain; }
    else o.material = occOpaque;
  });
  camera.layers.disableAll(); camera.layers.enable(0);
  renderer.render(scene, camera);
  occSwap.forEach((mat, o) => { o.material = mat; });

  renderer.autoClear = prevAutoClear;
  scene.background = prevBg;
  renderer.setRenderTarget(prevTarget);
}

// Shader final: god-rays + viñeta. SIN grano animado (los "puntitos" molestaban).
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
    vec3 col = base.rgb + tint * illumination * exposure * strength;
    float d = distance(vUv, vec2(0.5, 0.48));
    col *= smoothstep(1.05, 0.42, d) * 0.35 + 0.65;
    gl_FragColor = vec4(col, base.a);
  }
`;
const godrayPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tOcclusion: { value: occlusionTarget.texture },
    lightPos: { value: new THREE.Vector2(0.5, 0.5) },
    exposure: { value: 0.4 },
    decay: { value: 0.968 },
    density: { value: 0.95 },
    weight: { value: 0.5 },
    strength: { value: 1.0 },
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
  // el haz volumétrico: los paños tapan los costados pero el medio queda
  // abierto — el haz respira con el producto (blackout casi lo apaga)
  shaftMat.uniforms.uIntensity.value = 0.015 + 0.065 * sf;
}

// ---------------------------------------------------------------------------
// Audio ambient generativo (tipo Marconi Union): pad suave con osciladores
// detuneados + filtro + delay. Bajísimo. El movimiento de la tela abre
// apenas el filtro y sube 1-2 dB, muy gradual. Sin assets externos.
// ---------------------------------------------------------------------------
let audio = null;
let audioMuted = false;
function initAudio() {
  if (audio || audioMuted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.4;

    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.62;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    delay.connect(feedback); feedback.connect(delay);

    filter.connect(master);
    filter.connect(delay); delay.connect(master);

    // acorde suave (La mayor con novena): A2, E3, C#4, B3 — voces detuneadas
    const freqs = [110, 164.81, 277.18, 246.94];
    const gains = [0.5, 0.34, 0.16, 0.12];
    freqs.forEach((f, i) => {
      [-3, 3].forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = f;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = gains[i] * 0.5;
        osc.connect(g); g.connect(filter);
        osc.start();
      });
    });

    // respiración lenta del filtro (independiente del movimiento)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    lfo.start();

    // fade-in de 3s al volumen base (muy bajo)
    master.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 3);

    audio = { ctx, master, filter, baseGain: 0.028, energy: 0 };
  } catch { audio = null; }
}
// el movimiento de la tela modula el pad, suave y con inercia
function audioModulate(motionEnergy) {
  if (!audio || audioMuted) return;
  audio.energy += (clamp(motionEnergy * 6, 0, 1) - audio.energy) * 0.04;
  const t = audio.ctx.currentTime;
  audio.filter.frequency.setTargetAtTime(420 + audio.energy * 520, t, 0.4);
  audio.master.gain.setTargetAtTime(audio.baseGain * (1 + audio.energy * 0.5), t, 0.5);
}
muteBtn.addEventListener('click', () => {
  audioMuted = !audioMuted;
  muteBtn.classList.toggle('muted', audioMuted);
  if (audio) audio.master.gain.setTargetAtTime(audioMuted ? 0 : audio.baseGain, audio.ctx.currentTime, 0.3);
  else if (!audioMuted) initAudio();
});

// ---------------------------------------------------------------------------
// Puntero (hover sin clic / dedo) + acelerómetro
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
function firstGesture() { ensureMotionPermission(); initAudio(); revealPanel(); }
canvas.addEventListener('mouseenter', (e) => {
  firstGesture();
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
  firstGesture();
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
// Carrusel: cada paño se pliega hacia SU borde y sale; los nuevos entran
// plegados desde afuera y se despliegan (cinemático, con lag por fila).
// ---------------------------------------------------------------------------
let switching = false;
let transitionState = null;
const GATHER_SPREAD = 0.16;
const OFF_DIST = WIN_W * 0.75 + 0.6;
const TRANSITION_SECS = 1.5;

function goTo(next) {
  if (switching) return;
  switching = true;
  prevBtn.disabled = true; nextBtn.disabled = true;
  const to = PRODUCTS[next];

  idleSet.setMaterial(to);
  idleSet.setVisible(true);
  idleSet.setCastShadow(false);
  for (const sim of idleSet.sims) {
    sim.spread = GATHER_SPREAD;
    sim.offsetX = sim.side * OFF_DIST;
    sim.build();
    sim.kinematic = { t: 0, from: { spread: GATHER_SPREAD, offsetX: sim.side * OFF_DIST }, to: { spread: 1, offsetX: 0 } };
  }
  for (const sim of activeSet.sims) {
    sim.kinematic = { t: 0, from: { spread: 1, offsetX: 0 }, to: { spread: GATHER_SPREAD, offsetX: sim.side * OFF_DIST } };
  }
  lightMix = { from: active, to, t: 0 };
  transitionState = { next, to };

  productLabel.classList.add('switching');
  setTimeout(() => { productName.textContent = to.name; productColor.textContent = to.color; productLabel.classList.remove('switching'); }, 380);
}

function stepTransition() {
  const ts = transitionState;
  if (!ts) return false;
  let done = true;
  for (const set of [activeSet, idleSet]) {
    for (const sim of set.sims) {
      sim.kinematic.t = Math.min(1, sim.kinematic.t + PHYS_DT / TRANSITION_SECS);
      if (sim.kinematic.t < 1) done = false;
    }
  }
  lightMix.t = easeInOut(activeSet.sims[0].kinematic.t);
  return done;
}

function finishTransition() {
  const ts = transitionState;
  activeSet.setVisible(false);
  for (const sim of [...activeSet.sims, ...idleSet.sims]) sim.kinematic = null;
  for (const sim of idleSet.sims) { sim.spread = 1; sim.offsetX = 0; }
  active = ts.to; currentIndex = ts.next;
  [activeSet, idleSet] = [idleSet, activeSet];
  activeSet.setCastShadow(ts.to.castShadow);
  lightMix = { from: ts.to, to: ts.to, t: 1 };
  transitionState = null;
  switching = false;
  prevBtn.disabled = false; nextBtn.disabled = false;
  updateWhatsappLink();
  applyLightMix();
}

prevBtn.addEventListener('click', () => goTo((currentIndex - 1 + PRODUCTS.length) % PRODUCTS.length));
nextBtn.addEventListener('click', () => goTo((currentIndex + 1) % PRODUCTS.length));

// ---------------------------------------------------------------------------
// Steppers + WhatsApp
// ---------------------------------------------------------------------------
function applySize() {
  W_M = FULL_W * clamp(anchoCm / ANCHO_DEF, 0.5, 1.6);
  H_M = (winTop - 0.02) * clamp(altoCm / ALTO_DEF, 0.45, 1.3);
  for (const sim of activeSet.sims) { sim.spread = 1; sim.offsetX = 0; sim.build(); }
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
// Cámara en ángulo + resize
// ---------------------------------------------------------------------------
function resize() {
  const r = canvas.getBoundingClientRect();
  camera.aspect = r.width / r.height;
  // vista en ángulo (~40°): la ventana en perspectiva, la luz cruza hacia la cámara
  if (camera.aspect < 0.8) {
    camera.fov = 54;
    camera.position.set(3.4, 1.75, 5.2);
  } else {
    camera.fov = 42;
    camera.position.set(3.1, 1.7, 3.9);
  }
  camera.lookAt(-0.45, 1.35, backZ);
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height, false);
  composer.setSize(r.width, r.height);
}
resize();
applyLightMix();
updateWhatsappLink();

// ---------------------------------------------------------------------------
// Loop con física en sub-pasos fijos (independiente del framerate)
// ---------------------------------------------------------------------------
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
    for (const sim of activeSet.sims) sim.step(PHYS_DT, transitionState ? lightMix.from : active, ptr, tiltX);
    if (idleSet.visible) for (const sim of idleSet.sims) sim.step(PHYS_DT, lightMix.to, null, tiltX);
  }
  for (let i = 0; i < 2; i++) uploadGeometry(activeSet.geos[i], activeSet.sims[i]);
  if (idleSet.visible) for (let i = 0; i < 2; i++) uploadGeometry(idleSet.geos[i], idleSet.sims[i]);
  if (transitionState) applyLightMix();
  if (transitionDone) finishTransition();

  // audio: energía de movimiento del puntero (y del tilt)
  const motion = ptr.active ? Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py) : Math.abs(tiltX) * 0.02;
  audioModulate(motion);

  updateLightScreenPos();
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
