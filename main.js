import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

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
const measurePanel = document.getElementById('measurePanel');
const anchoValue = document.getElementById('anchoValue');
const altoValue = document.getElementById('altoValue');
const ctaQuote = document.getElementById('ctaQuote');
const opticalButtons = [...document.querySelectorAll('[data-product]')];
const stage = document.querySelector('.stage');
const quoteSection = document.getElementById('quoteSection');
const quoteClose = document.getElementById('quoteClose');
const quoteDone = document.getElementById('quoteDone');
const quoteForm = document.getElementById('quoteForm');
const quoteFormView = document.getElementById('quoteFormView');
const quoteSuccess = document.getElementById('quoteSuccess');
const quotePhone = document.getElementById('quotePhone');
const quoteSubmit = document.getElementById('quoteSubmit');
const quoteError = document.getElementById('quoteError');
const quoteProduct = document.getElementById('quoteProduct');
const quoteOptics = document.getElementById('quoteOptics');
const quoteSize = document.getElementById('quoteSize');
const quoteTitle = document.getElementById('quoteTitle');
const muteBtn = document.getElementById('muteBtn');
const modeSwitch = document.getElementById('modeSwitch');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const familyButtons = [...document.querySelectorAll('[data-family]')];
const interactionGroup = document.getElementById('interactionGroup');
const interactionTitle = document.getElementById('interactionTitle');
const rollerInstruction = document.getElementById('rollerInstruction');

const QUOTE_API = 'https://www.rollershow.com.ar/api/v2/cotizar';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(0.0001, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const isMobile = matchMedia('(max-width:640px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const memoryKnown = typeof navigator.deviceMemory === 'number';
const deviceMemory = navigator.deviceMemory || 4;
const cpuCores = navigator.hardwareConcurrency || 4;
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const saveData = connection?.saveData === true;
const highDensityMobile = isMobile && (window.devicePixelRatio || 1) >= 2.5;
const requestedQuality = new URLSearchParams(location.search).get('quality');
const forcedQuality = ['full', 'lite'].includes(requestedQuality) ? requestedQuality : null;
// Safari no expone deviceMemory: no degradamos por ausencia de la señal; la
// sonda runtime decide después si ese equipo realmente necesita alivio.
const constrainedDevice = saveData
  || (memoryKnown && deviceMemory <= 4)
  || cpuCores <= 4;
const qualityTier = forcedQuality
  ? forcedQuality
  : (constrainedDevice ? 'lite' : 'full');
const QUALITY = qualityTier === 'full'
  ? { dpr: isMobile ? 1.35 : 1.65, maxPixels: 3000000, shadow: 2048, occlusion: isMobile ? 192 : 288, rays: isMobile ? 36 : 52, smaa: !isMobile }
  : { dpr: 1, maxPixels: 1400000, shadow: 1024, occlusion: 144, rays: 24, smaa: false };
let adaptiveRenderScale = 1;
let performanceMode = forcedQuality ? 'forced' : 'auto';
document.body.classList.add(`quality-${qualityTier}`);

// ---------------------------------------------------------------------------
// Renderer / cámara
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.dpr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// El boot actualiza sombras en cada cuadro hasta componer una escena estable.
// El tier lite adopta su cadencia reducida recién después del reveal.
renderer.shadowMap.autoUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080c);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
const surfaceLoader = new THREE.TextureLoader();

// ---------------------------------------------------------------------------
// Puerta-ventana protagonista en ambiente CLARO minimalista (referencia de
// Agus: cuarto limpio, ventana blanca de paños con grilla, charco de luz
// nítido en el piso). La puerta-ventana va del piso al dintel, en dos hojas
// con grilla de vidrios — los parantes proyectan la sombra en grilla.
// ---------------------------------------------------------------------------
const backZ = -2.2;
// La tela cuelga apenas delante del barral y del marco. Una separacion de
// 35 cm dejaba que el sol se filtrara por debajo del ruedo como puntos falsos.
const CURTAIN_Z = backZ + 0.18;
// Las medidas conservan su proporción real, pero la escala escenográfica se
// normaliza para que el producto siga siendo protagonista en el valor inicial.
// Ventana, marco, barral, luz y cortina se reconstruyen juntos.
let winW = 2.6, winH = 2.72, winY = 0.02, winTop = 2.74, ROD_Y = 2.94;
function windowFromCm(ancho, alto) {
  winW = 2.6 * clamp(ancho / 120, 0.65, 1.7);
  winH = 2.72 * clamp(alto / 150, 0.4, 1.6);
  // Hasta 190 cm es una ventana convencional con antepecho. A partir de
  // 200 cm hace el salto arquitectónico a puerta-ventana apoyada en el piso.
  winY = alto >= 200 ? 0.02 : Math.max(0.34, 1.65 - winH / 2);
  winTop = winY + winH;
  ROD_Y = winTop + 0.2;
}

// Paredes amplias y neutras: superficie limpia que recibe luz
const ROOM = { w: 80, h: 28 };
const plasterColorMap = surfaceLoader.load('img/env/plaster_diff.webp');
const plasterNormalMap = surfaceLoader.load('img/env/plaster_nor.webp');
for (const texture of [plasterColorMap, plasterNormalMap]) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 6);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), qualityTier === 'full' ? 8 : 2);
}
plasterColorMap.colorSpace = THREE.SRGBColorSpace;
const wallMat = new THREE.MeshPhysicalMaterial({
  map: plasterColorMap,
  normalMap: plasterNormalMap,
  normalScale: new THREE.Vector2(0.18, 0.18),
  color: 0x62656b,
  roughness: 0.86,
  metalness: 0,
  clearcoat: 0.02,
  clearcoatRoughness: 0.82,
  // El sol esta detras de la pared: DoubleSide tambien bloquea su shadow map.
  side: THREE.DoubleSide,
});
const backWall = new THREE.Mesh(new THREE.BufferGeometry(), wallMat);
backWall.position.z = backZ;
backWall.receiveShadow = true;
backWall.castShadow = true;
scene.add(backWall);

const ENV_ROT = 2.196; // sol del HDRI centrado en la ventana (calculado del archivo)
let environmentPromise = null;
function loadEnvironment() {
  if (environmentPromise) return environmentPromise;
  environmentPromise = new Promise((resolve) => {
    new RGBELoader().load('img/env/sunset.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdr;
      scene.environmentIntensity = 0.015;
      scene.environmentRotation = new THREE.Euler(0, ENV_ROT, 0);
      resolve();
    }, undefined, resolve);
  });
  return environmentPromise;
}

// Porcelanato marmolado claro: Marble005 CC0 aporta veta, normal y roughness;
// las juntas arquitectónicas viven en world-space para conservar escala real.
const floorColorMap = surfaceLoader.load('img/env/marble_diff.webp');
const floorNormalMap = surfaceLoader.load('img/env/marble_nor.webp');
const floorRoughnessMap = surfaceLoader.load('img/env/marble_rough.webp');
for (const texture of [floorColorMap, floorNormalMap, floorRoughnessMap]) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // El mapa representa una placa grande, no un micropatrón repetido.
  texture.repeat.set(120, 120);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), qualityTier === 'full' ? 8 : 2);
}
floorColorMap.colorSpace = THREE.SRGBColorSpace;
const floorMaterial = new THREE.MeshPhysicalMaterial({
    map: floorColorMap,
    normalMap: floorNormalMap,
    roughnessMap: floorRoughnessMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xf1f0ed,
    roughness: 0.43,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.26,
    envMapIntensity: 0.12,
  });
floorMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = `varying vec3 vFloorWorld;\n${shader.vertexShader}`
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = `varying vec3 vFloorWorld;\n${shader.fragmentShader}`
    .replace('#include <map_fragment>', `#include <map_fragment>
      // Placas 120x80 cm, junta real de 4 mm y antialias por derivadas.
      vec2 tileUv = vec2(vFloorWorld.x / 1.2, vFloorWorld.z / 0.8);
      vec2 edgeDistance = min(fract(tileUv), 1.0 - fract(tileUv));
      float nearestJoint = min(edgeDistance.x, edgeDistance.y);
      float jointAA = max(fwidth(nearestJoint) * 1.35, 0.0015);
      float joint = 1.0 - smoothstep(0.004, 0.004 + jointAA, nearestJoint);
      float plateVariation = fract(sin(dot(floor(tileUv), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= 0.965 + plateVariation * 0.055;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.57, 0.55, 0.52), joint * 0.5);
    `);
};
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 10);
floor.receiveShadow = true;
scene.add(floor);

// Un zocalo real absorbe la junta pared-piso. Es una mascara arquitectonica,
// no un gradiente de pantalla: conserva la perspectiva y recibe la misma luz.
const baseboard = new THREE.Mesh(
  new THREE.BoxGeometry(ROOM.w, 0.1, 0.065),
  new THREE.MeshStandardMaterial({ color: 0x35322e, roughness: 0.72, metalness: 0 })
);
baseboard.position.set(0, 0.05, backZ + 0.045);
baseboard.castShadow = true;
baseboard.receiveShadow = true;
scene.add(baseboard);

const frameMat = new THREE.MeshPhysicalMaterial({
  color: 0xf4f2ec,
  roughness: 0.34,
  metalness: 0,
  clearcoat: 0.42,
  clearcoatRoughness: 0.24,
});
const glassMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf, transparent: true, opacity: 0.16, depthWrite: false });
const rodMat = new THREE.MeshStandardMaterial({ color: 0x57493c, roughness: 0.5, metalness: 0.45 });
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 118, 20, 128, 128, 180);
  grad.addColorStop(0, '#fffdf6');
  grad.addColorStop(0.5, '#ffedc9');
  grad.addColorStop(1, '#f7cf96');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTexture = makeGlowTexture();
const windowGlowMat = new THREE.MeshBasicMaterial({ map: glowTexture, toneMapped: false });

// Haz volumétrico: material global; la geometría se reconstruye con la ventana
const shaftMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: {
    uIntensity: { value: 0.16 },
    uColor: { value: new THREE.Color(1.0, 0.6, 0.28) },
    uTime: { value: 0 },
  },
  vertexShader: [
    'attribute vec2 aBeamUv;',
    'varying vec2 vBeamUv;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vBeamUv = aBeamUv;',
    '  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform float uIntensity;',
    'uniform float uTime;',
    'uniform vec3 uColor;',
    'varying vec2 vBeamUv;',
    'varying vec3 vWorld;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
    'float noise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);',
    '}',
    'float fbm(vec2 p){ float v=0.0; v+=noise(p)*.58; p=p*2.03+7.1; v+=noise(p)*.28; p=p*2.11+3.7; v+=noise(p)*.14; return v; }',
    'void main(){',
    '  float side = smoothstep(0.0,.13,vBeamUv.x) * smoothstep(0.0,.13,1.0-vBeamUv.x);',
    '  float entryFade = smoothstep(0.0,.2,vBeamUv.y);',
    '  float distanceFade = 1.0 - smoothstep(.68,1.0,vBeamUv.y);',
    '  float drift = uTime * .055;',
    '  float organic = fbm(vWorld.xz*.72 + vec2(drift,-drift*.63));',
    '  float breath = .82 + .18*sin(uTime*.19 + vWorld.x*.72 + organic*2.4);',
    '  float density = (.52 + organic*.48) * breath * side * entryFade * (.42 + distanceFade*.58);',
    '  gl_FragColor = vec4(uColor, density * uIntensity);',
    '}',
  ].join('\n'),
});
function makeHazeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const blobs = [
    [128, 128, 112, 1], [92, 120, 78, 0.46], [166, 104, 68, 0.36], [144, 164, 82, 0.32],
  ];
  for (const [x, y, r, alpha] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.36, `rgba(255,255,255,${alpha * 0.48})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const hazeTexture = makeHazeTexture();
const hazeGroup = new THREE.Group();
scene.add(hazeGroup);
const SUN_DIR = new THREE.Vector3(-1.2, -3.0, 7.2).normalize(); // exterior -> piso interior

function makeDiffuseTransmissionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  // La tela destruye la informacion espacial fina del marco. Esta textura no
  // contiene barras: su energia cae gradualmente hacia todos los extremos.
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = Math.abs((x + 0.5) / 128 - 1);
      const ny = Math.abs((y + 0.5) / 128 - 1);
      const edge = Math.max(nx * 0.78, ny);
      const feather = 1 - smoothstep(0.48, 1, edge);
      const radial = Math.max(0, 1 - Math.sqrt(nx * nx * 0.28 + ny * ny * 0.5) * 0.28);
      const alpha = Math.round(255 * feather * radial);
      const i = (y * 256 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const transmittedPoolMat = new THREE.MeshBasicMaterial({
  map: makeDiffuseTransmissionTexture(),
  color: 0xffd9b0,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: true,
});

const windowGroup = new THREE.Group();
scene.add(windowGroup);
let glass = null;
const LATE = {}; // refs que se crean más abajo (sun, glowPlane de oclusión...)

function updateShadowFrustum() {
  if (!LATE.sun) return;
  // En ultrawide el piso visible excede el ancho escenografico inicial. Fuera
  // del shadow map Three lo considera iluminado y aparece una cuña falsa.
  const shadowBaseW = Math.max(10, winW * 2);
  // La camara mira desde +X: al ensanchar el viewport, el extremo izquierdo
  // de pantalla crece hacia el lado positivo del espacio de la luz. Extender
  // solo ese lado evita desperdiciar la mitad de la resolucion del shadow map.
  LATE.sun.shadow.camera.left = -shadowBaseW;
  LATE.sun.shadow.camera.right = Math.max(shadowBaseW, camera.aspect * 9);
  LATE.sun.shadow.camera.top = Math.max(6, winTop + 1.4);
  LATE.sun.shadow.camera.bottom = -4;
  LATE.sun.shadow.camera.updateProjectionMatrix();
}

function buildWindow() {
  for (const child of [...windowGroup.children]) {
    windowGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-ROOM.w / 2, 0); wallShape.lineTo(ROOM.w / 2, 0);
  wallShape.lineTo(ROOM.w / 2, ROOM.h); wallShape.lineTo(-ROOM.w / 2, ROOM.h);
  wallShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-winW / 2, winY); hole.lineTo(winW / 2, winY);
  hole.lineTo(winW / 2, winTop); hole.lineTo(-winW / 2, winTop);
  hole.closePath();
  wallShape.holes.push(hole);
  backWall.geometry.dispose();
  backWall.geometry = new THREE.ShapeGeometry(wallShape);

  const F = 0.06;
  const bar = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    windowGroup.add(m);
  };
  bar(winW + F * 2, F, 0.14, 0, winTop + F / 2, backZ);
  bar(winW + F * 2, F, 0.14, 0, winY - F / 2 + 0.01, backZ);
  bar(F, winH + F * 2, 0.14, -winW / 2 - F / 2, winY + winH / 2, backZ);
  bar(F, winH + F * 2, 0.14, winW / 2 + F / 2, winY + winH / 2, backZ);
  bar(F * 1.3, winH, 0.12, 0, winY + winH / 2, backZ);
  const MUNT = F * 0.5;
  const gridRows = Math.max(2, Math.round(winH / 0.65));
  for (const side of [-1, 1]) {
    const cx = side * winW / 4;
    bar(MUNT, winH, 0.09, cx, winY + winH / 2, backZ);
    for (let r = 1; r < gridRows; r++) bar(winW / 2 - F, MUNT, 0.09, cx, winY + (winH / gridRows) * r, backZ);
  }
  glass = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.02, winH - 0.02), glassMat);
  glass.renderOrder = 1;
  glass.position.set(0, winY + winH / 2, backZ + 0.012);
  windowGroup.add(glass);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(9, winW * 3), Math.max(7, winH * 2.5)),
    windowGlowMat
  );
  glow.position.set(0, winY + winH / 2, backZ - 1.3);
  windowGroup.add(glow);
  // El barral queda completamente contenido detrás del ancho y del borde
  // superior de la tela, incluso en la ondulación máxima.
  const rodLength = winW * 1.24;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, rodLength, 24), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, ROD_Y - 0.24, backZ);
  rod.castShadow = true;
  windowGroup.add(rod);
  LATE.rodParts = [rod];
  for (const x of [-rodLength * 0.5, rodLength * 0.5]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 16), rodMat);
    cap.position.set(x, ROD_Y - 0.24, backZ);
    windowGroup.add(cap);
    LATE.rodParts.push(cap);
  }
  const p2f = (x, y, z) => { const t = y / -SUN_DIR.y; return [x + SUN_DIR.x * t, 0.001, z + SUN_DIR.z * t]; };
  // El volumen excede apenas el vano: el feather ocurre detrás del marco y
  // la luz visible cubre la ventana completa sin el rectángulo recortado.
  const shaftHalfW = winW * 0.58;
  const shaftBottom = Math.max(0.002, winY - winH * 0.035);
  const tl = [-shaftHalfW, winTop + winH * 0.035, backZ + 0.02], tr = [shaftHalfW, winTop + winH * 0.035, backZ + 0.02];
  const bl = [-shaftHalfW, shaftBottom, backZ + 0.02], br = [shaftHalfW, shaftBottom, backZ + 0.02];
  const ftl = p2f(tl[0], tl[1], tl[2]), ftr = p2f(tr[0], tr[1], tr[2]);
  const shaftGeo = new THREE.BufferGeometry();
  const pts = [].concat(tl, tr, bl, br, ftl, ftr);
  shaftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  shaftGeo.setAttribute('aBeamUv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 0.12, 1, 0.12, 0, 1, 1, 1,
  ]), 2));
  shaftGeo.setIndex([0, 1, 5, 0, 5, 4, 2, 3, 5, 2, 5, 4]);
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  windowGroup.add(shaft);
  LATE.shaft = shaft;
  const projectToFloor = (x, y) => {
    const travel = y / Math.max(0.001, -SUN_DIR.y);
    return [x + SUN_DIR.x * travel, 0.004, backZ + 0.03 + SUN_DIR.z * travel];
  };
  const poolBL = projectToFloor(-winW / 2, winY);
  const poolBR = projectToFloor(winW / 2, winY);
  const poolTR = projectToFloor(winW / 2, winTop);
  const poolTL = projectToFloor(-winW / 2, winTop);
  if (!LATE.beamEndWorld) LATE.beamEndWorld = new THREE.Vector3();
  LATE.beamEndWorld.set(
    (poolTL[0] + poolTR[0]) * 0.5,
    0.004,
    (poolTL[2] + poolTR[2]) * 0.5
  );
  const poolGeo = new THREE.BufferGeometry();
  poolGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    ...poolBL, ...poolBR, ...poolTR, ...poolTL,
  ]), 3));
  poolGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
  ]), 2));
  poolGeo.setIndex([0, 1, 2, 0, 2, 3]);
  poolGeo.computeVertexNormals();
  const transmittedPool = new THREE.Mesh(poolGeo, transmittedPoolMat);
  transmittedPool.renderOrder = 2;
  windowGroup.add(transmittedPool);
  LATE.transmittedPool = transmittedPool;
  for (const sprite of [...hazeGroup.children]) sprite.material.dispose();
  hazeGroup.clear();
  // Las viejas capas aditivas pintaban una mancha ámbar a la izquierda sin
  // respetar la ventana. El volumen ahora lo resuelve el pase de oclusión.
  const hazeCount = 0;
  const travelToFloor = (winY + winH * 0.55) / Math.max(0.001, -SUN_DIR.y);
  for (let i = 0; i < hazeCount; i++) {
    // Mas densidad cerca de la fuente: oculta el borde del volumen sin llenar
    // toda la habitacion con una niebla uniforme.
    const p = Math.pow((i + 0.35) / hazeCount, 1.35);
    const travel = travelToFloor * p;
    const material = new THREE.SpriteMaterial({
      map: hazeTexture,
      color: 0xffb868,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    // Capas angostas y levemente desalineadas: si cada sprite cubre todo el
    // volumen, la suma se lee como una mancha plana en vez de aire suspendido.
    const lateral = Math.sin(i * 2.17) * winW * (0.08 + p * 0.18);
    const lift = Math.cos(i * 1.37) * winH * 0.045;
    const depth = Math.sin(i * 0.91) * (0.035 + p * 0.11);
    const baseX = SUN_DIR.x * travel + lateral;
    const baseY = winY + winH * 0.55 + SUN_DIR.y * travel + lift;
    const baseZ = backZ + 0.08 + SUN_DIR.z * travel + depth;
    sprite.position.set(baseX, baseY, baseZ);
    sprite.scale.set(winW * (0.34 + p * 0.58), winH * (0.14 + p * 0.27), 1);
    sprite.material.rotation = (i % 5) * 0.37;
    sprite.userData = {
      baseX, baseY, baseZ, phase: i * 1.73, p,
      density: 0.72 + 0.28 * Math.sin(i * 3.11),
      baseScaleX: winW * (0.34 + p * 0.58),
      baseScaleY: winH * (0.14 + p * 0.27),
    };
    hazeGroup.add(sprite);
  }
  if (LATE.sun) {
    LATE.sun.target.position.set(-winW * 0.2, 0.05, 1.6);
    updateShadowFrustum();
  }
  if (LATE.glowPlane) {
    LATE.glowPlane.scale.set(winW + 0.08, winH + 0.08, 1);
    LATE.glowPlane.position.set(0, winY + winH / 2, backZ - 0.02);
  }
  if (LATE.lightWorldPos) LATE.lightWorldPos.set(0, winY + winH / 2, backZ);
}
windowFromCm(120, 150);
buildWindow();

// ---------------------------------------------------------------------------
// Luz: sol golden-hour desde afuera + spot de recorte + fill mínimo
// ---------------------------------------------------------------------------
const SUN_BASE_INTENSITY = 18;
const sun = new THREE.DirectionalLight(0xffdfb5, SUN_BASE_INTENSITY);
sun.position.set(0.75, 3.0, backZ - 3.0);
sun.target.position.set(-0.45, 0.0, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.018;
sun.shadow.radius = qualityTier === 'full' ? 2 : 1;
scene.add(sun, sun.target);
LATE.sun = sun;

// Fill residual neutro: evita RGB negro, pero no cambia con la tela ni crea
// una segunda direccion. El sol exterior queda como unica luz expresiva.
// Relleno fijo, no reactivo: permite leer color y trama sin convertir la tela
// en luz. La ventana sigue siendo la única fuente expresiva/direccional.
const ambient = new THREE.AmbientLight(0xd7e2f2, 0.2);
scene.add(ambient);
buildWindow();

// (el haz volumétrico se construye en buildWindow)

// ---------------------------------------------------------------------------
// Transmisión física: 0 = la tela bloquea toda la luz; la abertura real entre
// paños se calcula aparte usando la geometría viva.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Blackout', color: 'Blanco', tex: 'img/fabric/blackout-albedo.jpg', normal: 'img/fabric/blackout-nor.webp',
    stiffness: 0.91, gravity: 7.8, friction: 0.977, influence: 0.7, dragCap: 0.075, dragResponse: 0.82, pleatDepth: 0.095, compressionDepth: 0.035, roughness: 0.92,
    opacity: 1, frostMix: 0, frostLod: 0, weaveStrength: 0, foldShade: 0.34, backfaceCap: 0.18, castShadow: true, shadowBlock: 1, tint: 0xffffff, sunFactor: 0, backlight: 0, radianceCap: 0.34, normalScale: 0.14, repeat: 1.6 },
  { name: 'Gasa', color: 'Beige', tex: 'img/fabric/gasa.jpg', normal: 'img/fabric/gasa-nor.webp',
    stiffness: 0.87, gravity: 6.2, friction: 0.972, influence: 0.6, dragCap: 0.075, dragResponse: 0.9, pleatDepth: 0.075, compressionDepth: 0.08, roughness: 0.88,
    opacity: 1, frostMix: 0.74, frostLod: isMobile ? 3.28 : 4.1, weaveStrength: 0.64, foldShade: 0.14, backfaceCap: 1, castShadow: true, shadowBlock: 0.18, tint: 0xfffbf5, sunFactor: 0.84, backlight: 0, radianceCap: 0.62, normalScale: 0.17, repeat: 2.35 },
  { name: 'Tusor', color: 'Natural', tex: 'img/fabric/tusor-albedo.jpg', normal: 'img/fabric/tusor-nor.webp',
    stiffness: 0.9, gravity: 6.9, friction: 0.975, influence: 0.56, dragCap: 0.066, dragResponse: 0.72, pleatDepth: 0.09, compressionDepth: 0.065, roughness: 0.92,
    opacity: 1, frostMix: 0.5, frostLod: 4.2, weaveStrength: 0.68, foldShade: 0.26, backfaceCap: 0.72, castShadow: true, shadowBlock: 0.56, tint: 0xfff8ed, sunFactor: 0.46, backlight: 0, radianceCap: 0.48, normalScale: 0.24, repeat: 2.05 },
];
const INITIAL_PRODUCT_INDEX = 1;
const INITIAL_PRODUCT = PRODUCTS[INITIAL_PRODUCT_INDEX];
const PRODUCT_PRESENTATION = {
  traditional: [
    { name: 'Blackout', color: 'Blanco', optics: 'Bloqueo total', telaId: 2009 },
    { name: 'Gasa', color: 'Beige', optics: 'Mayor paso de luz', telaId: 1999 },
    { name: 'Tusor', color: 'Natural', optics: 'Luz y privacidad', telaId: 2006 },
  ],
  roller: [
    { name: 'Blackout', color: 'Blanco', optics: 'Bloqueo total', telaId: 1746 },
    { name: 'Screen', color: 'Beige', optics: 'Luz y visibilidad exterior', telaId: 1756 },
    { name: 'Decorativa', color: 'Natural', optics: 'Luz y privacidad', telaId: 1585 },
  ],
};
const presentationFamily = () => interactionMode === 'roller' ? 'roller' : 'traditional';
const currentPresentation = () => PRODUCT_PRESENTATION[presentationFamily()][currentIndex];
function syncProductSelector() {
  const family = presentationFamily();
  const labelsByIndex = PRODUCT_PRESENTATION[family];
  opticalButtons.forEach((button) => {
    const index = Number(button.dataset.product);
    const item = labelsByIndex[index];
    button.querySelector('b').textContent = item.name;
    button.querySelector('small').textContent = item.optics;
    button.setAttribute('aria-pressed', String(index === currentIndex));
    button.setAttribute('aria-label', `${item.name}: ${item.optics}`);
  });
}
function syncProductLabel() {
  const item = currentPresentation();
  productName.textContent = item.name;
  productColor.textContent = item.color;
}

// Captura de baja resolución para transmisión difusa. Gasa y Tusor no son
// vidrio alfa: conservan superficie, profundidad y trama, mientras el fondo se
// percibe desenfocado a través de las fibras.
const clothBackdropTarget = new THREE.WebGLRenderTarget(512, 288, {
  minFilter: THREE.LinearMipmapLinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
});
clothBackdropTarget.texture.colorSpace = THREE.SRGBColorSpace;
clothBackdropTarget.texture.generateMipmaps = true;
const clothViewport = new THREE.Vector2(1, 1);
const clothTexel = new THREE.Vector2(1 / 512, 1 / 288);

const texLoader = new THREE.TextureLoader();
const fabricTextureCache = new Map();
const criticalCurtainLoads = [];
function fabricTex(src, srgb, rep, repY) {
  const key = `${src}|${srgb}|${rep}|${repY ?? rep}`;
  if (fabricTextureCache.has(key)) return fabricTextureCache.get(key);
  let resolveLoad;
  const loaded = new Promise((resolve) => { resolveLoad = resolve; });
  const t = texLoader.load(src, resolveLoad, undefined, resolveLoad);
  if (src === INITIAL_PRODUCT.tex || src === INITIAL_PRODUCT.normal) criticalCurtainLoads.push(loaded);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, repY ?? rep);
  t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), qualityTier === 'full' ? 8 : 2);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  fabricTextureCache.set(key, t);
  return t;
}
function makeCurtainMaterial(p) {
  const colorMap = fabricTex(p.tex, true, p.repeat * 0.55, p.repeat);
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    alphaMap: null,
    alphaTest: 0,
    alphaHash: false,
    normalMap: fabricTex(p.normal, false, p.repeat * 0.55, p.repeat),
    normalScale: new THREE.Vector2(p.normalScale || 0.2, p.normalScale || 0.2),
    color: p.tint,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: p.roughness,
    metalness: 0,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  material.userData.shadowBlock = p.shadowBlock;
  // La tela nunca es una fuente emisiva. Recibe el sol/ambiente mediante el
  // BRDF estándar y su transmisión sólo afecta sombra, haze y superficies.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClothRadianceCap = { value: p.radianceCap };
    shader.uniforms.uClothBackdrop = { value: clothBackdropTarget.texture };
    shader.uniforms.uClothViewport = { value: clothViewport };
    shader.uniforms.uClothTexel = { value: clothTexel };
    shader.uniforms.uFrostMix = { value: p.frostMix };
    shader.uniforms.uFrostLod = { value: p.frostLod };
    shader.uniforms.uWeaveStrength = { value: p.weaveStrength };
    shader.uniforms.uBackfaceCap = { value: p.backfaceCap };
    shader.uniforms.uFoldShade = { value: p.foldShade };
    shader.uniforms.uDenseHem = { value: p.denseHem || 0 };
    shader.fragmentShader = `uniform float uClothRadianceCap;
      uniform sampler2D uClothBackdrop;
      uniform vec2 uClothViewport;
      uniform vec2 uClothTexel;
      uniform float uFrostMix;
      uniform float uFrostLod;
      uniform float uWeaveStrength;
      uniform float uBackfaceCap;
      uniform float uFoldShade;
      uniform float uDenseHem;
      float clothHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float clothNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(clothHash(i), clothHash(i + vec2(1.0, 0.0)), f.x),
                   mix(clothHash(i + vec2(0.0, 1.0)), clothHash(i + 1.0), f.x), f.y);
      }\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        vec2 frostUv = gl_FragCoord.xy / uClothViewport;
        vec2 frostStep = uClothTexel * exp2(max(0.0, uFrostLod - 1.0));
        vec3 frost = texture2D(uClothBackdrop, frostUv + vec2(frostStep.x, frostStep.y), uFrostLod).rgb;
        frost += texture2D(uClothBackdrop, frostUv + vec2(-frostStep.x, frostStep.y), uFrostLod).rgb;
        frost += texture2D(uClothBackdrop, frostUv + vec2(frostStep.x, -frostStep.y), uFrostLod).rgb;
        frost += texture2D(uClothBackdrop, frostUv - frostStep, uFrostLod).rgb;
        frost *= 0.25;
        float fiberLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float microWeave = clamp((fiberLuma - 0.48) * 3.2 + 0.5, 0.22, 1.12);
        float macroSlub = mix(0.9, 1.08, clothNoise(vMapUv * vec2(7.0, 13.0)));
        float fiberDensity = mix(1.0, microWeave * macroSlub, uWeaveStrength);
        float pathLength = mix(0.58, 1.0, pow(abs(dot(normal, geometryViewDir)), 0.7));
        vec3 wovenFrost = frost * (0.88 + diffuseColor.rgb * 0.12) * fiberDensity * pathLength;
        // En Roller, los últimos centímetros envuelven el contrapeso. La misma
        // textura continúa, pero esa franja es materialmente densa y no puede
        // muestrear ni transmitir la ventana detrás.
        float denseHem = uDenseHem * (1.0 - smoothstep(0.0, 0.028, vMapUv.y));
        float effectiveFrost = uFrostMix * (1.0 - denseHem);
        outgoingLight = mix(outgoingLight, wovenFrost, effectiveFrost);
        outgoingLight *= mix(1.0, 0.42, denseHem);
        float foldFacing = pow(abs(dot(normal, geometryViewDir)), 0.65);
        outgoingLight *= mix(1.0, mix(0.7, 1.0, foldFacing), uFoldShade);
        if (!gl_FrontFacing) outgoingLight = min(outgoingLight, diffuseColor.rgb * uBackfaceCap);
        // Salvaguarda material: ningún pliegue textil puede convertirse en
        // fuente de bloom ni alcanzar el blanco exterior de la ventana.
        outgoingLight = min(outgoingLight, vec3(uClothRadianceCap));
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => `cloth-frost-mip-${p.frostMix}-${p.frostLod}-${p.weaveStrength}-${p.foldShade}-${p.radianceCap}-${p.backfaceCap}-${p.denseHem || 0}`;
  return material;
}

// La tela bloquea la componente DIRECCIONAL incluso cuando es translucida.
// Su luz transmitida se recompone como un charco difuso separado; permitir que
// el shadow map atraviese fibras copiaba la grilla nitida sobre el piso.
function makeShadowMaterial(p) {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Física: CUATRO simulaciones (2 paños x 2 sets para el carrusel).
// Cada paño cubre poco más de la mitad de la ventana y cuelga entreabierto:
// la luz pasa por el medio. Ondulado marcado como estado de reposo.
// ---------------------------------------------------------------------------
const COLS = qualityTier === 'full' ? 32 : 18;   // por paño
const ROWS = qualityTier === 'full' ? 56 : 30;
const ITERATIONS = qualityTier === 'full' ? 5 : 3;
const nx = COLS + 1;

const ANCHO_MIN = 60, ANCHO_MAX = 300, ANCHO_DEF = 120;
const ALTO_MIN = 60, ALTO_MAX = 260, ALTO_DEF = 150;
let anchoCm = ANCHO_DEF, altoCm = ALTO_DEF;

let FULL_W = winW * 1.34;              // ancho total del par de paños
const FLOOR_Y = 0.015;
// Terminación "float": el ruedo apenas se separa del piso. Evita que la
// colisión lo comprima y lo haga doblarse hacia arriba como tela sobrante.
const HEM_CLEARANCE = 0.006;
const WINDOW_HEM_OVERLAP = 0.1;
let CURTAIN_BOTTOM = Math.max(FLOOR_Y + HEM_CLEARANCE, winY - WINDOW_HEM_OVERLAP);
let W_M = FULL_W, H_M = ROD_Y + 0.035 - CURTAIN_BOTTOM;
const PANEL_GAP = 0.18;                // apertura central en reposo (más juntos, pasa un haz)

const PLEAT_COUNT = qualityTier === 'full' ? 6 : 5;
const PLEAT_AMPLITUDE = 0.55;
const gatheredU = (u) => u + (PLEAT_AMPLITUDE / (PLEAT_COUNT * Math.PI * 2)) * Math.sin(u * PLEAT_COUNT * Math.PI * 2);

// side: -1 = paño izquierdo (cuelga desde el borde izquierdo hacia el centro)
function createSim(side) {
  const sim = {
    side, points: [], constraints: [], tethers: [], restSpacingX: [],
    spread: 1, openTargetSpread: 1, openVelocity: 0,
    offsetX: 0, kinematic: null, relaxing: null,
  };
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
    sim.points = []; sim.constraints = []; sim.tethers = []; sim.restSpacingX = []; sim.relaxing = null;
    const { outer, inner } = sim.panelRange();
    const sy = H_M / ROWS;
    const colX = [];
    for (let x = 0; x <= COLS; x++) colX.push(outer + gatheredU(x / COLS) * (inner - outer));
    for (let x = 0; x < COLS; x++) sim.restSpacingX.push(Math.abs(colX[x + 1] - colX[x]));
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x <= COLS; x++) {
        const px = sim.anchorX(colX[x]), py = ROD_Y + 0.035 - y * sy;
        sim.points.push({ x: px, y: py, px, py, baseX: colX[x], pinned: y === 0, u: x / COLS, v: y / ROWS });
        const i = sim.points.length - 1;
        if (y > 0) sim.tethers.push({ anchor: x, point: i, maxLen: y * sy });
        if (x > 0) sim.constraints.push({
          a: i - 1, b: i, len: sim.restSpacingX[x - 1], axis: 'x', xLen: sim.restSpacingX[x - 1], yLen: 0,
        });
        if (y > 0) sim.constraints.push({
          a: i - (COLS + 1), b: i, len: sy, axis: 'y', xLen: 0, yLen: sy,
        });
        if (x > 0 && y > 0) {
          const diag = Math.hypot(sim.restSpacingX[x - 1], sy);
          sim.constraints.push({
            a: i - (COLS + 2), b: i, len: diag, axis: 'diag', xLen: sim.restSpacingX[x - 1], yLen: sy, factor: 0.42,
          });
        }
        if (x < COLS && y > 0) {
          const diag = Math.hypot(sim.restSpacingX[x], sy);
          sim.constraints.push({
            a: i - COLS, b: i, len: diag, axis: 'diag', xLen: sim.restSpacingX[x], yLen: sy, factor: 0.42,
          });
        }
        if (x > 1) sim.constraints.push({
          a: i - 2, b: i,
          len: sim.restSpacingX[x - 2] + sim.restSpacingX[x - 1],
          axis: 'x', xLen: sim.restSpacingX[x - 2] + sim.restSpacingX[x - 1], yLen: 0,
          factor: 0.13,
        });
        if (y > 1) sim.constraints.push({
          a: i - 2 * (COLS + 1), b: i, len: sy * 2,
          axis: 'y', xLen: 0, yLen: sy * 2,
          factor: 0.1,
        });
      }
    }
  };
  sim.startRelax = () => {
    sim.relaxing = {
      startedAt: performance.now(),
      from: sim.points.map((p) => ({ x: p.x, y: p.y })),
    };
  };
  sim.cancelRelax = () => { sim.relaxing = null; };
  sim.step = (dt, params, ptr, tiltX, gravityTilt) => {
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
        p.y = ROD_Y + 0.035 - p.v * ROWS * sy;
        p.px = p.x; p.py = p.y;
      }
      return;
    }
    if (interactionMode === 'open') {
      // El riel responde al dedo con un resorte amortiguado. El cuerpo no se
      // teletransporta: los anclajes superiores arrastran la tela y cada fila
      // llega con un pequeno retraso, como una cortina recogida de verdad.
      const spring = 82;
      const damping = Math.exp(-13.5 * dt);
      sim.openVelocity = (sim.openVelocity + (sim.openTargetSpread - sim.spread) * spring * dt) * damping;
      sim.spread = clamp(sim.spread + sim.openVelocity * dt, GATHER_SPREAD, 1);
      if ((sim.spread === GATHER_SPREAD && sim.openVelocity < 0) || (sim.spread === 1 && sim.openVelocity > 0)) {
        sim.openVelocity = 0;
      }
    }
    if (sim.relaxing) {
      const progress = clamp((performance.now() - sim.relaxing.startedAt) / 520, 0, 1);
      const e = easeInOut(progress);
      for (let i = 0; i < sim.points.length; i++) {
        const p = sim.points[i], from = sim.relaxing.from[i];
        const targetX = sim.anchorX(p.baseX);
        const targetY = ROD_Y + 0.035 - p.v * H_M;
        p.x = lerp(from.x, targetX, e);
        p.y = lerp(from.y, targetY, e);
        p.px = p.x; p.py = p.y;
      }
      if (progress >= 1) sim.relaxing = null;
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
      p.y += vy - params.gravity * (1 + gravityTilt) * dt2;
      if (ptr && ptr.active) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y;
        if (dx * dx + dy * dy < params.influence * params.influence) {
          p.px = p.x - clamp(ptr.x - ptr.px, -params.dragCap, params.dragCap) * params.dragResponse;
          p.py = p.y - clamp(ptr.y - ptr.py, -params.dragCap, params.dragCap) * params.dragResponse;
        }
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (const c of sim.constraints) {
        const p1 = sim.points[c.a], p2 = sim.points[c.b];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        // Al recoger, la longitud proyectada en X disminuye y reaparece como
        // profundidad de pliegue en uploadGeometry(). Verticalmente la tela
        // conserva el mismo largo: no se escala ni se estiran sus pixeles.
        let targetLen = c.len;
        if (interactionMode === 'open') {
          targetLen = c.axis === 'x'
            ? c.xLen * sim.spread
            : (c.axis === 'diag' ? Math.hypot(c.xLen * sim.spread, c.yLen) : c.len);
        }
        const diff = (targetLen - dist) / dist * params.stiffness * (c.factor ?? 1);
        const w1 = p1.pinned ? 0 : 1, w2 = p2.pinned ? 0 : 1;
        const weight = w1 + w2 || 1;
        const ox = dx * diff / weight, oy = dy * diff / weight;
        if (w1) { p1.x -= ox * w1; p1.y -= oy * w1; }
        if (w2) { p2.x += ox * w2; p2.y += oy * w2; }
      }
      // La urdimbre no se alarga hacia el piso. El límite es sólo vertical:
      // conserva el largo real sin restringir el desplazamiento lateral.
      for (const tether of sim.tethers) {
        const anchor = sim.points[tether.anchor], p = sim.points[tether.point];
        const minY = anchor.y - tether.maxLen;
        if (p.y >= minY) continue;
        p.py += minY - p.y;
        p.y = minY;
      }
    }
    // No hay colisión con el piso: el largo inextensible termina antes y evita
    // por construcción el recorte que doblaba vértices hacia arriba.
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
      const product = sim.product;
      const baseDepth = product?.pleatDepth ?? 0.085;
      const dynamicDepth = compress * (product?.compressionDepth ?? 0.08);
      const wave = Math.sin(p.u * Math.PI * 2 * PLEAT_COUNT)
        * (baseDepth + dynamicDepth);
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
  set.sims.forEach((sim) => { sim.product = product; });
  set.geos = [makePanelGeometry(), makePanelGeometry()];
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(set.geos[i], makeCurtainMaterial(product));
    mesh.customDepthMaterial = makeShadowMaterial(product);
    mesh.renderOrder = 3;
    mesh.position.z = CURTAIN_Z;
    mesh.receiveShadow = true;
    // La malla cambia de bounds durante el carrusel. Three conserva el primer
    // bounding sphere (a veces calculado cuando el paño está fuera de cuadro),
    // por lo que en mobile podía seguir descartándolo aun después de entrar.
    mesh.frustumCulled = false;
    mesh.layers.enable(2);
    scene.add(mesh);
    set.meshes.push(mesh);
  }
  set.setVisible = (v) => { set.visible = v; set.meshes.forEach((m) => { m.visible = v; }); };
  set.setCastShadow = (v) => set.meshes.forEach((m) => { m.castShadow = v; });
  set.setMaterial = (product) => set.meshes.forEach((m) => {
    m.material?.dispose();
    m.customDepthMaterial?.alphaMap?.dispose();
    m.customDepthMaterial?.dispose();
    m.material = makeCurtainMaterial(product);
    m.customDepthMaterial = makeShadowMaterial(product);
  });
  const setMaterialBase = set.setMaterial;
  set.setMaterial = (product) => {
    set.sims.forEach((sim) => { sim.product = product; });
    setMaterialBase(product);
  };
  set.opacity = () => set.meshes[0].material.opacity;
  return set;
}

const setA = createSet(INITIAL_PRODUCT);
// El segundo set reutiliza Gasa durante el arranque. Blackout y Tusor se
// precargan después del primer cuadro para no competir con el producto visible.
const setB = createSet(INITIAL_PRODUCT);
setB.setVisible(false);
setA.setCastShadow(INITIAL_PRODUCT.castShadow);

let currentIndex = INITIAL_PRODUCT_INDEX;
let active = INITIAL_PRODUCT;
let activeSet = setA, idleSet = setB;
let lightMix = { from: INITIAL_PRODUCT, to: INITIAL_PRODUCT, t: 1 };

// Prototipo Roller: comparte el motor textil y de sombra, pero usa una sola
// lamina vertical. No crea otra escena ni un segundo render loop.
const ROLLER_COLS = qualityTier === 'full' ? 40 : 24;
const ROLLER_ROWS = qualityTier === 'full' ? 32 : 20;
const rollerGeo = new THREE.PlaneGeometry(1, 1, ROLLER_COLS, ROLLER_ROWS);
function makeRollerSheetMaterial(product) {
  // Una Roller queda tensada y casi plana. Reducir únicamente su radio de
  // difusión evita sumar una segunda grilla fantasma sobre la sombra real del
  // marco, sin cambiar el motor frost aprobado de las cortinas tradicionales.
  return makeCurtainMaterial({
    ...product,
    frostLod: product.frostLod * 0.72,
    foldShade: product.foldShade * 0.35,
    denseHem: 1,
  });
}
const rollerMesh = new THREE.Mesh(rollerGeo, makeRollerSheetMaterial(INITIAL_PRODUCT));
rollerMesh.customDepthMaterial = makeShadowMaterial(INITIAL_PRODUCT);
rollerMesh.position.z = CURTAIN_Z;
rollerMesh.renderOrder = 3;
// La captura frost ya contiene el marco detrás. Recibir además su shadow map
// lo duplicaba y producía las barras oscuras falsas señaladas por Agus.
rollerMesh.receiveShadow = false;
rollerMesh.castShadow = true;
rollerMesh.frustumCulled = false;
rollerMesh.layers.enable(2);
rollerMesh.visible = false;
scene.add(rollerMesh);
const rollerBar = new THREE.Group();
const rollerRoll = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, qualityTier === 'full' ? 40 : 24, 1, false),
  new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.72, metalness: 0 }),
);
rollerRoll.castShadow = true;
rollerBar.add(rollerRoll);
rollerBar.rotation.z = Math.PI / 2;
rollerBar.visible = false;
scene.add(rollerBar);
// Contrapeso inferior: aluminio oculto dentro de un bolsillo de la misma tela.
// Es una pieza densa en todos los productos; nunca usa frost ni translucidez.
const rollerWeight = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  makeRollerWeightMaterial(INITIAL_PRODUCT),
);
rollerWeight.material.userData.shadowBlock = 1;
rollerWeight.castShadow = true;
rollerWeight.receiveShadow = false;
rollerWeight.renderOrder = 4;
rollerWeight.frustumCulled = false;
rollerWeight.layers.enable(2);
rollerWeight.visible = false;
scene.add(rollerWeight);
let rollerDrop = 1;
let rollerTargetDrop = 1;
let rollerVelocity = 0;
let rollerRadius = 0.032;
let rollerAngle = 0;
const ROLLER_CORE_RADIUS = 0.032;
// Espesor visual efectivo del tejido enrollado. No intenta representar cada
// fibra: convierte longitud guardada en seccion de rollo con conservacion de area.
const ROLLER_EFFECTIVE_THICKNESS = 0.0052;
function makeRollMaterial(p) {
  return new THREE.MeshStandardMaterial({
    map: fabricTex(p.tex, true, p.repeat * 0.7, p.repeat * 0.5),
    normalMap: fabricTex(p.normal, false, p.repeat * 0.7, p.repeat * 0.5),
    // En incidencia rasante una normal fuerte convertia la trama en una hilera
    // de destellos sobre el borde del rollo. Las capas conservan textura, pero
    // con microrelieve mas contenido y rugosidad propia de tela comprimida.
    normalScale: new THREE.Vector2((p.normalScale || 0.2) * 0.35, (p.normalScale || 0.2) * 0.35),
    color: p.tint,
    roughness: Math.max(0.94, p.roughness),
    metalness: 0,
  });
}
function makeRollerWeightMaterial(p) {
  // El bolsillo queda a contraluz: se lee como una banda textil densa, no como
  // aluminio blanco iluminado. MeshBasic evita que el sol exterior lo queme.
  const material = new THREE.MeshBasicMaterial({
    map: fabricTex(p.tex, true, p.repeat * 0.85, p.repeat * 0.28),
    color: new THREE.Color(p.tint).multiplyScalar(0.22),
    side: THREE.DoubleSide,
  });
  material.userData.shadowBlock = 1;
  return material;
}
function uploadRollerGeometry() {
  const pos = rollerGeo.attributes.position;
  const uv = rollerGeo.attributes.uv;
  const rolledLength = H_M * (1 - rollerDrop);
  rollerRadius = Math.sqrt(
    ROLLER_CORE_RADIUS * ROLLER_CORE_RADIUS
    + rolledLength * ROLLER_EFFECTIVE_THICKNESS / Math.PI,
  );
  const rollCenterY = ROD_Y + 0.067;
  const top = rollCenterY - rollerRadius;
  for (let y = 0; y <= ROLLER_ROWS; y++) {
    const v = y / ROLLER_ROWS;
    for (let x = 0; x <= ROLLER_COLS; x++) {
      const u = x / ROLLER_COLS;
      const i = y * (ROLLER_COLS + 1) + x;
      // La barra inferior mantiene la Roller tensada: sólo queda un bombeo
      // milimétrico, no una onda ancha que deforme la ventana detrás.
      const z = -Math.sin(u * Math.PI) * 0.0025;
      pos.setXYZ(i, (u - 0.5) * W_M, top - v * H_M * rollerDrop, z);
      // Se muestra solo el tramo de tela que aun cuelga. Mantener el rango UV
      // proporcional a su longitud evita que la trama completa se estire al subir.
      const sourceV = (1 - rollerDrop) + v * rollerDrop;
      uv.setXY(i, u, 1 - sourceV);
    }
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  rollerGeo.computeVertexNormals();
  rollerAngle = rolledLength / Math.max(0.001, (ROLLER_CORE_RADIUS + rollerRadius) * 0.5);
  rollerRoll.scale.set(rollerRadius, W_M * 1.02, rollerRadius);
  rollerRoll.rotation.y = -rollerAngle;
  rollerBar.position.set(0, rollCenterY, CURTAIN_Z - 0.012);
  const bottomY = top - H_M * rollerDrop;
  // Se retrae 3% por lado: el bolsillo de tela tapa el aluminio y no deja
  // asomar tapas o puntas desde el ángulo oblicuo de cámara.
  rollerWeight.scale.set(W_M * 0.94, 0.04, 0.022);
  rollerWeight.position.set(0, bottomY + 0.018, CURTAIN_Z - 0.012);
}
function setRollerMaterial(product) {
  rollerMesh.material?.dispose();
  rollerMesh.customDepthMaterial?.dispose();
  rollerRoll.material?.dispose();
  rollerWeight.material?.dispose();
  rollerMesh.material = makeRollerSheetMaterial(product);
  rollerMesh.customDepthMaterial = makeShadowMaterial(product);
  // Las capas superpuestas del rollo se ven densas incluso en Gasa/Tusor;
  // el frost aprobado sigue viviendo solamente en la lamina desplegada.
  rollerRoll.material = makeRollMaterial(product);
  rollerWeight.material = makeRollerWeightMaterial(product);
  // Toda tela bloquea la proyeccion direccional del marco. Gasa y Tusor
  // recuperan energia mediante la transmision difusa del piso, no con grilla.
  rollerMesh.castShadow = true;
}
function stepRoller(dt) {
  if (interactionMode !== 'roller') return;
  // SmoothDamp critico: conserva inercia sin overshoot y sigue siendo estable
  // tanto a 120 Hz como en un telefono que cae momentaneamente de cuadros.
  const smoothTime = 0.18;
  const omega = 2 / smoothTime;
  const safeDt = Math.min(dt, 0.1);
  const x = omega * safeDt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = rollerDrop - rollerTargetDrop;
  const temp = (rollerVelocity + omega * change) * safeDt;
  rollerVelocity = (rollerVelocity - omega * temp) * decay;
  const previous = rollerDrop;
  rollerDrop = clamp(rollerTargetDrop + (change + temp) * decay, 0.08, 1);
  if ((rollerDrop === 0.08 && rollerVelocity < 0) || (rollerDrop === 1 && rollerVelocity > 0)) rollerVelocity = 0;
  if (Math.abs(rollerDrop - previous) > 0.00001 || Math.abs(rollerVelocity) > 0.0001) uploadRollerGeometry();
}
uploadRollerGeometry();

// ---------------------------------------------------------------------------
// God-rays marcados: la oclusión real de los paños modula el resplandor.
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const glowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
);
glowPlane.layers.set(1);
scene.add(glowPlane);
LATE.glowPlane = glowPlane;

const OCC_SIZE = QUALITY.occlusion;
const occlusionTarget = new THREE.WebGLRenderTarget(OCC_SIZE, Math.round(OCC_SIZE * 1.5));
const clothMaskTarget = new THREE.WebGLRenderTarget(OCC_SIZE, Math.round(OCC_SIZE * 1.5), {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
});
const occOpaque = new THREE.MeshBasicMaterial({ color: 0x000000 });
const occSwap = new Map();
const curtainMeshes = new Set([...setA.meshes, ...setB.meshes, rollerMesh, rollerWeight]);
const occCurtainMats = new Map([...curtainMeshes].map((mesh) => [
  mesh, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true }),
]));
const clothMaskMats = new Map([...curtainMeshes].map((mesh) => [
  mesh, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false }),
]));

let backdropFrame = 0;
function renderClothBackdrop() {
  // La captura se renueva a baja cadencia: la difusión textil no necesita la
  // frecuencia completa y el tier lite ahorra otro tercio de ese costo.
  backdropFrame += 1;
  const cadence = qualityTier === 'full' ? 2 : 3;
  if (backdropFrame % cadence !== 0) return;
  const visibility = new Map([...curtainMeshes].map((mesh) => [mesh, mesh.visible]));
  curtainMeshes.forEach((mesh) => { mesh.visible = false; });
  const prevTarget = renderer.getRenderTarget();
  const prevShadowAuto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(clothBackdropTarget);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.setRenderTarget(prevTarget);
  renderer.shadowMap.autoUpdate = prevShadowAuto;
  visibility.forEach((visible, mesh) => { mesh.visible = visible; });
}

function renderOcclusionPass() {
  const prevTarget = renderer.getRenderTarget();
  const prevBg = scene.background;
  const prevAutoClear = renderer.autoClear;
  const prevShadows = renderer.shadowMap.enabled;
  scene.background = null;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(occlusionTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);

  camera.layers.disableAll(); camera.layers.enable(1);
  renderer.render(scene, camera);

  renderer.clearDepth();
  occSwap.clear();
  scene.traverse((o) => {
    if (!o.isMesh || o === glowPlane || o === glass || o === LATE.shaft || o === LATE.transmittedPool) return;
    occSwap.set(o, o.material);
    if (curtainMeshes.has(o)) {
      const occMat = occCurtainMats.get(o);
      occMat.opacity = o.material.userData.shadowBlock ?? o.material.opacity;
      o.material = occMat;
    }
    else o.material = occOpaque;
  });
  camera.layers.disableAll(); camera.layers.enable(0);
  renderer.render(scene, camera);
  occSwap.forEach((mat, o) => { o.material = mat; });

  // Máscara propia de tela: impide que el haze de pantalla vuelva a pintar
  // brillo sobre Blackout después del cap del material. Gasa/Tusor conservan
  // una fracción del volumen según su bloqueo óptico.
  renderer.setRenderTarget(clothMaskTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  for (const mesh of curtainMeshes) {
    const original = mesh.material;
    const mask = clothMaskMats.get(mesh);
    mask.opacity = original.userData.shadowBlock ?? 1;
    mesh.material = mask;
  }
  camera.layers.disableAll(); camera.layers.enable(2);
  renderer.render(scene, camera);
  for (const mesh of curtainMeshes) mesh.material = occSwap.get(mesh) ?? mesh.material;
  camera.layers.disableAll(); camera.layers.enable(0);

  renderer.autoClear = prevAutoClear;
  renderer.shadowMap.enabled = prevShadows;
  scene.background = prevBg;
  renderer.setRenderTarget(prevTarget);
}

// Shader final: god-rays + viñeta. SIN grano animado (los "puntitos" molestaban).
const GODRAY_FRAG = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tOcclusion;
  uniform sampler2D tClothMask;
  uniform vec2 lightPos;
  uniform vec2 beamEnd;
  uniform float exposure;
  uniform float decay;
  uniform float density;
  uniform float weight;
  uniform float strength;
  uniform float time;
  uniform vec3 tint;
  varying vec2 vUv;
  const int NUM_SAMPLES = ${QUALITY.rays};
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
    float haze = .84 + .16 * sin(vUv.x * 8.7 + time * .11 + sin(vUv.y * 6.1 - time * .07));
    vec2 beamDirection = normalize(beamEnd - lightPos);
    vec2 beamRelative = vUv - lightPos;
    float beamAlong = dot(beamRelative, beamDirection);
    float beamAcross = abs(beamRelative.x * beamDirection.y - beamRelative.y * beamDirection.x);
    float beamCone = smoothstep(-0.02, 0.08, beamAlong)
      * (1.0 - smoothstep(0.1, 0.38, beamAcross / max(beamAlong, 0.08)))
      * (1.0 - smoothstep(0.78, 1.16, beamAlong));
    float clothMask = texture2D(tClothMask, vUv).r;
    vec3 col = base.rgb + tint * illumination * exposure * strength * haze * beamCone * (1.0 - clothMask);
    // Vineta asimetrica: protege los extremos del set y deja el producto limpio.
    vec2 lens = (vUv - vec2(0.52, 0.49)) * vec2(0.84, 1.08);
    float vignette = 1.0 - 0.20 * smoothstep(0.43, 0.78, length(lens));
    col *= vignette;
    gl_FragColor = vec4(col, base.a);
  }
`;
const godrayPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tOcclusion: { value: occlusionTarget.texture },
    tClothMask: { value: clothMaskTarget.texture },
    lightPos: { value: new THREE.Vector2(0.5, 0.5) },
    beamEnd: { value: new THREE.Vector2(0.5, 0.1) },
    exposure: { value: 0.5 },
    decay: { value: 0.975 },
    density: { value: 0.62 },
    weight: { value: 0.36 },
    strength: { value: 1.0 },
    time: { value: 0 },
    tint: { value: new THREE.Vector3(1.0, 0.84, 0.66) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: GODRAY_FRAG,
});
composer.addPass(godrayPass);
// blur atmosférico: bloom suave sobre las altas luces (la ventana, el charco)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.62, 0.72);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass(1, 1); // mata el aliasing del barral en ángulo
if (QUALITY.smaa) composer.addPass(smaaPass);
composer.addPass(new OutputPass());

const lightWorldPos = new THREE.Vector3(0, winY + winH / 2, backZ);
LATE.lightWorldPos = lightWorldPos;
const lightProjected = new THREE.Vector3();
const beamEndProjected = new THREE.Vector3();
function updateLightScreenPos() {
  lightProjected.copy(lightWorldPos).project(camera);
  godrayPass.uniforms.lightPos.value.set(lightProjected.x * 0.5 + 0.5, lightProjected.y * 0.5 + 0.5);
  if (LATE.beamEndWorld) {
    beamEndProjected.copy(LATE.beamEndWorld).project(camera);
    godrayPass.uniforms.beamEnd.value.set(beamEndProjected.x * 0.5 + 0.5, beamEndProjected.y * 0.5 + 0.5);
  }
}

function physicalOpening(set) {
  let gap = 0;
  for (let y = 0; y <= ROWS; y++) {
    const i = y * nx + COLS;
    gap += Math.max(0, set.sims[1].points[i].x - set.sims[0].points[i].x);
  }
  return clamp((gap / (ROWS + 1)) / Math.max(W_M, 0.001), 0, 0.7);
}

let interactionMode = 'fabric';
let lastTraditionalMode = 'fabric';
function currentPhysicalOpening(set = activeSet) {
  return interactionMode === 'roller'
    ? clamp((1 - rollerDrop) * 0.7, 0, 0.7)
    : physicalOpening(set);
}

let interactionOpenEnergy = 0;
let sceneRevealAt = Infinity;
function applyLightMix() {
  const t = lightMix.t;
  const transmission = lerp(lightMix.from.sunFactor, lightMix.to.sunFactor, t);
  const opening = transitionState
    ? lerp(currentPhysicalOpening(activeSet), currentPhysicalOpening(idleSet), t)
    : currentPhysicalOpening(activeSet);
  // La tela aporta transmisión; la separación física entre paños aporta luz
  // directa. Blackout tiene transmisión cero: nunca pasa luz por su superficie.
  const normalizedOpening = smoothstep(0.065, 0.22, opening);
  const directEnergy = Math.pow(Math.max(normalizedOpening, interactionOpenEnergy * 0.72), 1.7);
  const sourceEnergy = 1 - (1 - transmission) * (1 - directEnergy);
  // Compresión suave de altas luces: la Gasa sigue siendo muy luminosa sin
  // quemar marco, textura y superficies cuando el paño se abre por completo.
  const atmosphereEnergy = (Math.exp(2.4 * sourceEnergy) - 1) / (Math.exp(2.4) - 1);
  // La intensidad exterior es constante. La pared y la sombra de la tela
  // determinan fisicamente donde llega el sol y cuanto crece la huella.
  sun.intensity = SUN_BASE_INTENSITY;
  const clothCoverage = 1 - normalizedOpening * 0.88;
  transmittedPoolMat.opacity = transmission * clothCoverage * 0.2;
  // El radial blur 2D se mantiene fuera: al no conocer profundidad sumaba luz
  // por encima de la tela. La bruma 3D sí queda ocluida por cada paño.
  // Bruma alineada con la ventana y ocluida por la tela. Reemplaza las capas
  // aditivas que generaban luz falsa en la pared izquierda.
  const revealEnergy = Number.isFinite(sceneRevealAt)
    ? smoothstep(0, 900, performance.now() - sceneRevealAt)
    : 0;
  godrayPass.uniforms.strength.value = atmosphereEnergy * 0.27 * revealEnergy;
  shaftMat.uniforms.uIntensity.value = 0;
  // La ventana mantiene luminancia y bloom constantes. Al abrirse sólo queda
  // expuesta una superficie mayor; no se aumenta artificialmente su potencia.
  bloomPass.strength = 0.36;
  LATE.hazeStrength = atmosphereEnergy;
  LATE.sourceEnergy = sourceEnergy;
}

// ---------------------------------------------------------------------------
// Audio ambient generativo (tipo Marconi Union): pad suave con osciladores
// detuneados + filtro + delay. Bajísimo. El movimiento de la tela abre
// apenas el filtro y sube 1-2 dB, muy gradual. Sin assets externos.
// ---------------------------------------------------------------------------
let audio = null;
let audioMuted = false;
function initAudio() {
  if (audio) {
    if (!audioMuted && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return;
  }
  if (audioMuted) return;
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
const curtainPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -CURTAIN_Z);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const ptr = { active: false, x: 0, y: 0, px: 0, py: 0 };
let tiltX = 0, tiltGravity = 0, motionRequested = false, motionGranted = false;
let motionBaselineLateral = null, motionBaselineGravity = null;
const TILT_STRENGTH = 1.25;
const TILT_GRAVITY_STRENGTH = 0.12;

function exciteAtmosphere(x, y, deltaX) {
  interactionOpenEnergy = Math.max(interactionOpenEnergy, clamp(Math.abs(deltaX) * 14, 0, 1));
}

function pointerToWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(curtainPlane, hitPoint)) return hitPoint;
  return null;
}
function worldToClient(x, y, z = CURTAIN_Z) {
  const point = new THREE.Vector3(x, y, z).project(camera);
  const r = canvas.getBoundingClientRect();
  return {
    x: (point.x * 0.5 + 0.5) * r.width + r.left,
    y: (-point.y * 0.5 + 0.5) * r.height + r.top,
  };
}
function firstInteraction() { initAudio(); revealPanel(); }
let fabricResetTimer = 0;
let modeGesture = null;
function cancelFabricReset() {
  clearTimeout(fabricResetTimer);
  fabricResetTimer = 0;
  for (const sim of activeSet.sims) sim.cancelRelax();
}
function scheduleFabricReset() {
  if (interactionMode !== 'fabric') return;
  clearTimeout(fabricResetTimer);
  fabricResetTimer = setTimeout(() => {
    ptr.active = false;
    for (const sim of activeSet.sims) sim.startRelax();
  }, 1000);
}
function beginModeGesture(w) {
  if (!w || interactionMode === 'fabric') return;
  if (interactionMode === 'open') {
    const sim = activeSet.sims[w.x < 0 ? 0 : 1];
    modeGesture = { mode: 'open', sim, startX: w.x, startSpread: sim.openTargetSpread };
  } else {
    modeGesture = { mode: 'roller', startY: w.y, startDrop: rollerTargetDrop };
  }
}
function updateModeGesture(w) {
  if (!w || !modeGesture) return;
  if (modeGesture.mode === 'open') {
    const outward = modeGesture.sim.side * (w.x - modeGesture.startX);
    modeGesture.sim.openTargetSpread = clamp(modeGesture.startSpread - outward / Math.max(0.3, W_M * 0.38), GATHER_SPREAD, 1);
    modeGesture.sim.cancelRelax();
    interactionOpenEnergy = Math.max(interactionOpenEnergy, 1 - modeGesture.sim.openTargetSpread);
  } else {
    rollerTargetDrop = clamp(modeGesture.startDrop - (w.y - modeGesture.startY) / Math.max(0.4, H_M), 0.08, 1);
    interactionOpenEnergy = Math.max(interactionOpenEnergy, 1 - rollerTargetDrop);
  }
}
function endModeGesture() { modeGesture = null; ptr.active = false; }
function setInteractionMode(mode) {
  if (!['fabric', 'open', 'roller'].includes(mode) || mode === interactionMode || switching) return;
  cancelFabricReset();
  endModeGesture();
  interactionMode = mode;
  if (mode !== 'roller') lastTraditionalMode = mode;
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  const isRoller = mode === 'roller';
  familyButtons.forEach((button) => button.setAttribute(
    'aria-pressed',
    String(button.dataset.family === (isRoller ? 'roller' : 'traditional')),
  ));
  interactionGroup.classList.toggle('is-roller', isRoller);
  interactionTitle.textContent = isRoller ? 'Cómo usarla' : 'Cómo querés probarla';
  modeSwitch.hidden = isRoller;
  rollerInstruction.hidden = !isRoller;
  syncProductLabel();
  syncProductSelector();
  updateQuoteSummary();
  for (const sim of activeSet.sims) {
    sim.spread = 1;
    sim.openTargetSpread = 1;
    sim.openVelocity = 0;
    sim.offsetX = 0;
    sim.build();
  }
  idleSet.setVisible(false);
  activeSet.setVisible(!isRoller);
  rollerMesh.visible = isRoller;
  rollerBar.visible = isRoller;
  rollerWeight.visible = isRoller;
  LATE.rodParts?.forEach((part) => { part.visible = !isRoller; });
  if (isRoller) {
    rollerDrop = 1;
    rollerTargetDrop = 1;
    rollerVelocity = 0;
    setRollerMaterial(active);
    uploadRollerGeometry();
  }
  const messages = {
    fabric: 'Mové la tela. Vuelve a su caída natural después de un segundo.',
    open: 'Arrastrá cada paño hacia el costado para abrirlo.',
    roller: 'Deslizá la tela hacia arriba o abajo.',
  };
  hint.textContent = messages[mode];
  hint.classList.remove('hidden');
  clearTimeout(setInteractionMode.hintTimer);
  setInteractionMode.hintTimer = setTimeout(() => hint.classList.add('hidden'), 2200);
  applyLightMix();
}
modeButtons.forEach((button) => button.addEventListener('click', () => setInteractionMode(button.dataset.mode)));
familyButtons.forEach((button) => button.addEventListener('click', () => {
  const nextMode = button.dataset.family === 'roller' ? 'roller' : lastTraditionalMode;
  setInteractionMode(nextMode);
}));
canvas.addEventListener('mouseenter', (e) => {
  firstInteraction();
  if (interactionMode !== 'fabric') return;
  const w = pointerToWorld(e.clientX, e.clientY);
  if (w) { cancelFabricReset(); ptr.x = ptr.px = w.x; ptr.y = ptr.py = w.y; ptr.active = true; }
});
canvas.addEventListener('mousedown', (e) => {
  if (interactionMode === 'fabric') return;
  firstInteraction();
  beginModeGesture(pointerToWorld(e.clientX, e.clientY));
});
canvas.addEventListener('mousemove', (e) => {
  const w = pointerToWorld(e.clientX, e.clientY);
  if (interactionMode !== 'fabric') {
    updateModeGesture(w);
    return;
  }
  if (w) {
    cancelFabricReset();
    exciteAtmosphere(w.x, w.y, w.x - ptr.x);
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = w.x; ptr.y = w.y; ptr.active = true;
    scheduleFabricReset();
  }
  revealPanel();
});
canvas.addEventListener('mouseleave', () => {
  ptr.active = false;
  if (interactionMode === 'fabric') scheduleFabricReset();
  else endModeGesture();
});
window.addEventListener('mouseup', endModeGesture);
canvas.addEventListener('touchstart', (e) => {
  firstInteraction();
  ensureMotionPermission();
  const t = e.touches[0], w = pointerToWorld(t.clientX, t.clientY);
  if (interactionMode === 'fabric') {
    if (w) { cancelFabricReset(); ptr.x = ptr.px = w.x; ptr.y = ptr.py = w.y; ptr.active = true; }
  } else beginModeGesture(w);
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0], w = pointerToWorld(t.clientX, t.clientY);
  if (interactionMode !== 'fabric') {
    updateModeGesture(w);
    return;
  }
  if (w) {
    cancelFabricReset();
    exciteAtmosphere(w.x, w.y, w.x - ptr.x);
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = w.x; ptr.y = w.y; ptr.active = true;
  }
}, { passive: false });
const endTouch = () => {
  ptr.active = false;
  if (interactionMode === 'fabric') scheduleFabricReset();
  else endModeGesture();
};
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);
window.addEventListener('resize', resize);

function onOrientation(e) {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const landscape = Math.abs(angle) === 90;
  const lateralAngle = landscape
    ? (e.beta == null ? null : e.beta * (angle === 90 ? 1 : -1))
    : (e.gamma == null ? null : e.gamma * (angle === 180 ? -1 : 1));
  const gravityAngle = landscape
    ? (e.gamma == null ? null : e.gamma * (angle === 90 ? -1 : 1))
    : e.beta;
  if (lateralAngle != null) {
    if (motionBaselineLateral == null) motionBaselineLateral = lateralAngle;
    const deltaLateral = ((lateralAngle - motionBaselineLateral + 540) % 360) - 180;
    const targetX = clamp(deltaLateral / 22, -1, 1) * TILT_STRENGTH;
    tiltX += (targetX - tiltX) * 0.08;
  }
  if (gravityAngle != null) {
    if (motionBaselineGravity == null) motionBaselineGravity = gravityAngle;
    const deltaGravity = ((gravityAngle - motionBaselineGravity + 540) % 360) - 180;
    const targetGravity = clamp(deltaGravity / 28, -1, 1) * TILT_GRAVITY_STRENGTH;
    tiltGravity += (targetGravity - tiltGravity) * 0.07;
  }
}
function resetOrientationBaseline() {
  motionBaselineLateral = null;
  motionBaselineGravity = null;
  tiltX = 0;
  tiltGravity = 0;
}
screen.orientation?.addEventListener?.('change', resetOrientationBaseline);
window.addEventListener('orientationchange', resetOrientationBaseline);
function ensureMotionPermission() {
  if (motionRequested || motionGranted) return;
  motionRequested = true;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((s) => {
      if (s === 'granted') {
        motionGranted = true;
        window.addEventListener('deviceorientation', onOrientation);
      }
    }).catch(() => { motionRequested = false; });
  } else if ('DeviceOrientationEvent' in window) {
    motionGranted = true;
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
let OFF_DIST = winW * 0.75 + 0.6;
const TRANSITION_SECS = 1.5;

function goTo(next) {
  if (switching || next === currentIndex || !PRODUCTS[next]) return;
  if (interactionMode === 'roller') {
    const to = PRODUCTS[next];
    activeSet.setMaterial(to);
    activeSet.setCastShadow(to.castShadow);
    setRollerMaterial(to);
    active = to;
    currentIndex = next;
    lightMix = { from: to, to, t: 1 };
    syncProductLabel();
    syncProductSelector();
    updateQuoteSummary();
    applyLightMix();
    return;
  }
  switching = true;
  opticalButtons.forEach((button) => { button.disabled = true; });
  const to = PRODUCTS[next];

  idleSet.setMaterial(to);
  idleSet.setVisible(true);
  idleSet.setCastShadow(to.castShadow);
  for (const sim of idleSet.sims) {
    sim.spread = GATHER_SPREAD;
    sim.openTargetSpread = 1;
    sim.openVelocity = 0;
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
  opticalButtons.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.product) === next)));
  setTimeout(() => {
    const item = PRODUCT_PRESENTATION[presentationFamily()][next];
    productName.textContent = item.name;
    productColor.textContent = item.color;
    productLabel.classList.remove('switching');
  }, 380);
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
  for (const sim of idleSet.sims) {
    sim.spread = 1;
    sim.openTargetSpread = 1;
    sim.openVelocity = 0;
    sim.offsetX = 0;
  }
  active = ts.to; currentIndex = ts.next;
  [activeSet, idleSet] = [idleSet, activeSet];
  activeSet.setCastShadow(ts.to.castShadow);
  lightMix = { from: ts.to, to: ts.to, t: 1 };
  transitionState = null;
  switching = false;
  opticalButtons.forEach((button) => { button.disabled = false; });
  syncProductSelector();
  updateQuoteSummary();
  applyLightMix();
}

opticalButtons.forEach((button) => button.addEventListener('click', () => goTo(Number(button.dataset.product))));

// ---------------------------------------------------------------------------
// Steppers + cotizador RollerShow
// ---------------------------------------------------------------------------
function applySize() {
  // la VENTANA y la cortina se reconstruyen juntas con las medidas reales
  windowFromCm(anchoCm, altoCm);
  buildWindow();
  FULL_W = winW * 1.34;
  OFF_DIST = winW * 0.75 + 0.6;
  W_M = FULL_W;
  CURTAIN_BOTTOM = Math.max(FLOOR_Y + HEM_CLEARANCE, winY - WINDOW_HEM_OVERLAP);
  H_M = ROD_Y + 0.035 - CURTAIN_BOTTOM;
  for (const sim of activeSet.sims) {
    sim.spread = 1;
    sim.openTargetSpread = 1;
    sim.openVelocity = 0;
    sim.offsetX = 0;
    sim.build();
  }
  if (idleSet.visible) for (const sim of idleSet.sims) sim.build();
  uploadRollerGeometry();
  LATE.rodParts?.forEach((part) => { part.visible = interactionMode !== 'roller'; });
  updateCameraBase();
}
document.querySelectorAll('[data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dir = Number(btn.dataset.dir);
    if (btn.dataset.step === 'ancho') setDimensions(anchoCm + dir * 10, altoCm);
    else setDimensions(anchoCm, altoCm + dir * 10);
  });
});

let sizeInputTimer = 0;
function setDimensions(nextWidth, nextHeight, rebuild = true) {
  anchoCm = clamp(Math.round(nextWidth / 10) * 10, ANCHO_MIN, ANCHO_MAX);
  altoCm = clamp(Math.round(nextHeight / 10) * 10, ALTO_MIN, ALTO_MAX);
  anchoValue.value = anchoCm;
  altoValue.value = altoCm;
  if (rebuild) applySize();
  updateQuoteSummary();
}
function commitDimensionInputs() {
  const width = Number(anchoValue.value);
  const height = Number(altoValue.value);
  setDimensions(Number.isFinite(width) ? width : anchoCm, Number.isFinite(height) ? height : altoCm);
}
[anchoValue, altoValue].forEach((input) => {
  input.addEventListener('input', () => {
    clearTimeout(sizeInputTimer);
    const width = Number(anchoValue.value);
    const height = Number(altoValue.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || !anchoValue.value || !altoValue.value) return;
    sizeInputTimer = setTimeout(commitDimensionInputs, 160);
  });
  input.addEventListener('blur', commitDimensionInputs);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
  });
});

function updateQuoteSummary() {
  if (!quoteProduct) return;
  const item = currentPresentation();
  const familyName = presentationFamily() === 'roller' ? 'Roller' : 'Tradicional';
  quoteProduct.textContent = `${item.name} ${familyName}`;
  quoteOptics.textContent = item.optics;
  quoteSize.textContent = `${anchoCm} × ${altoCm} cm`;
}
function openQuoteSection() {
  updateQuoteSummary();
  quoteFormView.hidden = false;
  quoteSuccess.hidden = true;
  quoteError.hidden = true;
  quoteSubmit.disabled = false;
  quoteSubmit.textContent = 'Solicitar mi cotización';
  quoteSection.hidden = false;
  requestAnimationFrame(() => {
    quoteSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => quoteTitle.focus({ preventScroll: true }), reducedMotion ? 0 : 520);
  });
}
function returnToSimulation() {
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => ctaQuote.focus({ preventScroll: true }), reducedMotion ? 0 : 520);
}
ctaQuote.addEventListener('click', openQuoteSection);
quoteClose.addEventListener('click', returnToSimulation);
quoteDone.addEventListener('click', returnToSimulation);
quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = quotePhone.value.trim();
  if (phone.replace(/\D/g, '').length < 8) {
    quoteError.textContent = 'Ingresá un WhatsApp válido para que podamos enviarte la cotización.';
    quoteError.hidden = false;
    quotePhone.focus();
    return;
  }
  const item = currentPresentation();
  const family = presentationFamily();
  const format = new FormData(quoteForm).get('formato') || 'pdf';
  const payload = {
    telefono: phone,
    tela_id: item.telaId,
    ancho_cm: anchoCm,
    alto_cm: altoCm,
    formato: format,
    detalle: `${item.name} ${family === 'roller' ? 'Roller' : 'Tradicional'} ${anchoCm} × ${altoCm} cm`,
    origen: 'cortina-viva',
    landing_url: location.href,
    referer_url: document.referrer || undefined,
  };
  quoteError.hidden = true;
  quoteSubmit.disabled = true;
  quoteSubmit.textContent = 'Enviando…';
  try {
    const response = await fetch(QUOTE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.message || 'No pudimos crear la solicitud.');
    }
    quoteFormView.hidden = true;
    quoteSuccess.hidden = false;
  } catch (error) {
    quoteError.textContent = error.message || 'No pudimos enviar la solicitud. Probá nuevamente.';
    quoteError.hidden = false;
    quoteSubmit.disabled = false;
    quoteSubmit.textContent = 'Reintentar solicitud';
  }
});

syncProductLabel();
syncProductSelector();
updateQuoteSummary();

let revealed = false;
function revealPanel() {
  if (revealed) return;
  revealed = true;
  measurePanel.classList.add('visible');
  productLabel.classList.add('raised');
  hint.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Cámara en ángulo + resize
// ---------------------------------------------------------------------------
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCameraBase() {
  // dolly automático: la escena entra en cuadro para cualquier medida
  const scale = Math.max(0.82, winW / 2.6, winTop / 2.94);
  if (camera.aspect < 0.8) {
    camera.fov = 54;
    camBase.set(3.4 * scale, 1.75, 5.2 * scale);
  } else {
    camera.fov = 42;
    camBase.set(3.1 * scale, 1.7, 3.9 * scale);
  }
  camLook.set(-0.45, winY + winH * 0.42, backZ);
  camera.position.copy(camBase);
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}
function resize() {
  const r = canvas.getBoundingClientRect();
  camera.aspect = r.width / r.height;
  updateCameraBase();
  updateShadowFrustum();
  const pixelCapDpr = Math.sqrt(QUALITY.maxPixels / Math.max(1, r.width * r.height));
  const renderDpr = Math.min(window.devicePixelRatio || 1, QUALITY.dpr, pixelCapDpr) * adaptiveRenderScale;
  renderer.setPixelRatio(renderDpr);
  renderer.setSize(r.width, r.height, false);
  const auxiliaryScale = Math.max(0.82, adaptiveRenderScale);
  const occlusionW = Math.round(QUALITY.occlusion * auxiliaryScale);
  occlusionTarget.setSize(occlusionW, Math.max(88, Math.round(occlusionW / camera.aspect)));
  clothMaskTarget.setSize(occlusionW, Math.max(88, Math.round(occlusionW / camera.aspect)));
  const backdropW = qualityTier === 'full' ? 512 : 320;
  const backdropH = Math.max(180, Math.round(backdropW / camera.aspect));
  clothBackdropTarget.setSize(backdropW, backdropH);
  renderer.getDrawingBufferSize(clothViewport);
  clothTexel.set(1 / backdropW, 1 / backdropH);
  composer.setPixelRatio(renderDpr);
  composer.setSize(r.width, r.height);
}
resize();

// parallax sutil con el mouse (vida premium, no marea)
let parTX = 0, parTY = 0, parX = 0, parY = 0;
window.addEventListener('mousemove', (e) => {
  parTX = (e.clientX / window.innerWidth) * 2 - 1;
  parTY = (e.clientY / window.innerHeight) * 2 - 1;
});
applyLightMix();
updateQuoteSummary();

// ---------------------------------------------------------------------------
// Loop con física en sub-pasos fijos (independiente del framerate)
// ---------------------------------------------------------------------------
const PHYS_DT = 1 / 60;
const MAX_SUBSTEPS = 6;
let last = performance.now();
let probeFrames = 0, probeWindowFrames = 0, probeSeconds = 0, slowProbeWindows = 0;
let performanceSettled = Boolean(forcedQuality);
let shadowFrame = 0;
function probePerformance(elapsed) {
  if (performanceSettled || document.hidden || elapsed <= 0) return;
  // Los primeros cuadros incluyen compilación de shaders y no representan
  // rendimiento sostenido. Medimos luego una ventana corta y actuamos una vez.
  if (probeFrames < 20) { probeFrames += 1; return; }
  probeFrames += 1;
  probeWindowFrames += 1;
  probeSeconds += elapsed;
  if (probeSeconds < 1.1 && probeWindowFrames < 72) return;
  const averageFrame = probeSeconds / Math.max(1, probeWindowFrames);
  if (averageFrame > 0.024) slowProbeWindows += 1;
  if (slowProbeWindows >= 2) {
    adaptiveRenderScale = qualityTier === 'full' ? 0.82 : 0.78;
    performanceMode = 'adaptive';
    resize();
    performanceSettled = true;
  } else if (averageFrame <= 0.024) {
    performanceMode = 'stable';
    performanceSettled = true;
  } else {
    probeWindowFrames = 0;
    probeSeconds = 0;
  }
}
let resolveFirstFrame;
const firstFrameRendered = new Promise((resolve) => { resolveFirstFrame = resolve; });
let bootComposedFrames = 0;
let bootStableFrames = 0;
const bootProbePixel = new Uint8Array(4);
function loop(now) {
  const elapsed = Math.min((now - last) / 1000, 0.16);
  last = now;
  if (document.hidden) { requestAnimationFrame(loop); return; }
  probePerformance(elapsed);
  stepRoller(elapsed);
  interactionOpenEnergy += (0 - interactionOpenEnergy) * 0.035;
  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(elapsed / PHYS_DT)));
  let transitionDone = false;
  for (let s = 0; s < steps; s++) {
    if (transitionState) transitionDone = stepTransition() || transitionDone;
    // El delta del puntero es un impulso, no una fuerza continua. Aplicarlo en
    // cada subpaso hacia que una sola entrada se acumulara hasta romper la tela.
    const impulse = s === 0 && interactionMode === 'fabric' ? ptr : null;
    for (const sim of activeSet.sims) sim.step(PHYS_DT, transitionState ? lightMix.from : active, impulse, tiltX, tiltGravity);
    if (idleSet.visible) for (const sim of idleSet.sims) sim.step(PHYS_DT, lightMix.to, null, tiltX, tiltGravity);
  }
  if (ptr.active) { ptr.px = ptr.x; ptr.py = ptr.y; }
  for (let i = 0; i < 2; i++) uploadGeometry(activeSet.geos[i], activeSet.sims[i]);
  if (idleSet.visible) for (let i = 0; i < 2; i++) uploadGeometry(idleSet.geos[i], idleSet.sims[i]);
  applyLightMix();
  const atmosphereTime = reducedMotion ? 0 : now * 0.001;
  shaftMat.uniforms.uTime.value = atmosphereTime;
  godrayPass.uniforms.time.value = atmosphereTime;
  const hazeStrength = LATE.hazeStrength || 0;
  for (const sprite of hazeGroup.children) {
    const { baseX, baseY, baseZ, baseScaleX, baseScaleY, phase, p, density } = sprite.userData;
    sprite.position.x = baseX + Math.sin(atmosphereTime * 0.15 + phase) * (0.035 + p * 0.075);
    sprite.position.y = baseY + Math.cos(atmosphereTime * 0.11 + phase * 0.7) * (0.018 + p * 0.035);
    sprite.position.z = baseZ + Math.sin(atmosphereTime * 0.09 + phase * 1.21) * (0.024 + p * 0.07);
    const hazeBreath = 0.93 + 0.07 * Math.sin(atmosphereTime * 0.16 + phase * 0.63);
    sprite.scale.set(baseScaleX * hazeBreath, baseScaleY / hazeBreath, 1);
    sprite.material.rotation += reducedMotion ? 0 : 0.00028 * (phase % 2 ? 1 : -1);
    sprite.material.opacity = (0.002 + hazeStrength * 0.11) * density
      * (0.76 + 0.24 * Math.sin(atmosphereTime * 0.13 + phase));
  }
  if (transitionDone) finishTransition();

  // audio: energía de movimiento del puntero (y del tilt)
  const motion = ptr.active ? Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py) : Math.abs(tiltX) * 0.02;
  audioModulate(motion);

  // parallax suave de cámara
  parX += (parTX - parX) * 0.04;
  parY += (parTY - parY) * 0.04;
  camera.position.set(camBase.x + parX * 0.14, camBase.y - parY * 0.09, camBase.z);
  camera.lookAt(camLook);

  updateLightScreenPos();
  renderClothBackdrop();
  renderOcclusionPass();
  shadowFrame += 1;
  const relaxing = activeSet.sims.some((sim) => sim.relaxing);
  const dynamicShadow = ptr.active || Boolean(modeGesture) || relaxing || switching || Math.abs(tiltX) > 0.03 || Math.abs(tiltGravity) > 0.01;
  if (!renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = dynamicShadow || shadowFrame % 2 === 0;
  composer.render();
  if (resolveFirstFrame) {
    bootComposedFrames += 1;
    // El pase volumetrico puede tardar algunos cuadros en estabilizar sus
    // targets. Se prueba un pixel del extremo que debe ser oscuro y se revela
    // la escena solo tras tres cuadros coherentes, con fallback acotado.
    const gl = renderer.getContext();
    gl.readPixels(4, Math.max(1, gl.drawingBufferHeight - 5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bootProbePixel);
    const edgeLuma = bootProbePixel[0] * 0.2126 + bootProbePixel[1] * 0.7152 + bootProbePixel[2] * 0.0722;
    bootStableFrames = edgeLuma < 88 ? bootStableFrames + 1 : 0;
    if ((bootComposedFrames >= 4 && bootStableFrames >= 3) || bootComposedFrames >= 90) {
      resolveFirstFrame(); resolveFirstFrame = null;
    }
  }
  requestAnimationFrame(loop);
}

async function revealSceneWhenReady() {
  await Promise.race([
    Promise.all(criticalCurtainLoads),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await Promise.race([
    loadEnvironment(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  // La simulacion y los shaders arrancan con los mapas del producto inicial
  // resueltos. Evita compilar una Gasa incompleta durante el boot.
  ptr.x = ptr.px = 0;
  ptr.y = ptr.py = CURTAIN_BOTTOM + H_M * 0.5;
  ptr.active = true;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
  // La primera composición ocurre oculta y compila el pipeline real una sola
  // vez. No hacemos un compile extra que duplicaría el trabajo de arranque.
  await firstFrameRendered;
  ptr.active = false;
  await new Promise(requestAnimationFrame);
  // Chrome mobile puede conservar el primer buffer WebGL hasta que la capa UI
  // cambia de estado. Se compone ese estado mientras todo sigue oculto y se
  // revierte antes del reveal; el AudioContext suspendido se reanuda luego con
  // el primer gesto real.
  firstInteraction();
  await new Promise(requestAnimationFrame);
  measurePanel.classList.remove('visible');
  productLabel.classList.remove('raised');
  hint.classList.remove('hidden');
  revealed = false;
  await new Promise(requestAnimationFrame);
  document.body.classList.add('scene-ready');
  sceneRevealAt = performance.now();
  // El conteo empieza cuando la escena ya es visible. Antes arrancaba durante
  // la carga y el reset atomico podia cancelar el panel para siempre.
  setTimeout(revealPanel, 2600);
  renderer.shadowMap.autoUpdate = qualityTier === 'full';
  const startDeferred = () => {
    for (const product of PRODUCTS.filter((_, index) => index !== INITIAL_PRODUCT_INDEX)) {
      fabricTex(product.tex, true, product.repeat * 0.55, product.repeat);
      fabricTex(product.normal, false, product.repeat * 0.55, product.repeat);
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(startDeferred, { timeout: 1800 });
  else setTimeout(startDeferred, 700);
}
revealSceneWhenReady();

window.__cortina = {
  getState: () => ({
    currentIndex, anchoCm, altoCm, switching, interactionMode, rollerDrop, rollerTargetDrop,
    rollerRadius, rollerAngle, rollerWidth: W_M * 1.02,
    rollerWeight: {
      visible: rollerWeight.visible,
      width: rollerWeight.scale.x,
      height: rollerWeight.scale.y,
      y: rollerWeight.position.y,
      opaque: rollerWeight.material.userData.shadowBlock === 1,
    },
    rollerUvSpan: Math.abs(
      rollerGeo.attributes.uv.getY(0)
      - rollerGeo.attributes.uv.getY(ROLLER_ROWS * (ROLLER_COLS + 1)),
    ),
    qualityTier, performanceMode,
    sceneReady: document.body.classList.contains('scene-ready'),
    adaptiveRenderScale, renderDpr: renderer.getPixelRatio(),
    qualitySignals: { memoryKnown, deviceMemory, cpuCores, saveData, highDensityMobile, constrainedDevice },
    motion: {
      requested: motionRequested, granted: motionGranted, tiltX, tiltGravity,
      baselineLateral: motionBaselineLateral, baselineGravity: motionBaselineGravity,
    },
    winW, winH, winY, curtainBottom: CURTAIN_BOTTOM, floorY: FLOOR_Y,
    interactionTargets: {
      left: worldToClient(-W_M * 0.28, CURTAIN_BOTTOM + H_M * 0.55),
      right: worldToClient(W_M * 0.28, CURTAIN_BOTTOM + H_M * 0.55),
      roller: worldToClient(0, CURTAIN_BOTTOM + H_M * 0.45),
    },
    sourceEnergy: LATE.sourceEnergy || 0, hazeStrength: LATE.hazeStrength || 0, interactionOpenEnergy,
    floorProjection: {
      transmittedOpacity: transmittedPoolMat.opacity,
      diffuseTexture: transmittedPoolMat.map === null ? false : true,
      directionalBlockedByFabric: interactionMode === 'roller'
        ? rollerMesh.castShadow
        : activeSet.meshes.every((mesh) => mesh.castShadow),
    },
    opening: currentPhysicalOpening(activeSet),
    panelSpreads: activeSet.sims.map((sim) => sim.spread),
    panelSpreadTargets: activeSet.sims.map((sim) => sim.openTargetSpread),
    panelOpenVelocities: activeSet.sims.map((sim) => sim.openVelocity),
    productName: PRODUCTS[currentIndex].name, productColor: PRODUCTS[currentIndex].color,
    panels: activeSet.meshes.map((m, panelIndex) => {
      const a = m.geometry.getAttribute('position');
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let restDisplacement = 0;
      for (let i = 0; i < a.count; i++) {
        minX = Math.min(minX, a.getX(i)); maxX = Math.max(maxX, a.getX(i));
        minY = Math.min(minY, a.getY(i)); maxY = Math.max(maxY, a.getY(i));
        minZ = Math.min(minZ, a.getZ(i)); maxZ = Math.max(maxZ, a.getZ(i));
        const p = activeSet.sims[panelIndex].points[i];
        restDisplacement += Math.hypot(
          p.x - activeSet.sims[panelIndex].anchorX(p.baseX),
          p.y - (ROD_Y + 0.035 - p.v * H_M),
        );
      }
      let hemMinY = Infinity, hemMaxY = -Infinity;
      let hemMaxAbsZ = 0;
      for (let i = ROWS * nx; i < a.count; i++) {
        hemMinY = Math.min(hemMinY, a.getY(i)); hemMaxY = Math.max(hemMaxY, a.getY(i));
        hemMaxAbsZ = Math.max(hemMaxAbsZ, Math.abs(a.getZ(i)));
      }
      let outerEdgeMinX = Infinity, outerEdgeMaxX = -Infinity;
      const edgeTopX = a.getX(0), edgeBottomX = a.getX(ROWS * nx);
      let outerEdgeCurveMax = 0;
      for (let y = 0; y <= ROWS; y++) {
        const edgeX = a.getX(y * nx);
        outerEdgeMinX = Math.min(outerEdgeMinX, edgeX); outerEdgeMaxX = Math.max(outerEdgeMaxX, edgeX);
        outerEdgeCurveMax = Math.max(outerEdgeCurveMax, Math.abs(edgeX - lerp(edgeTopX, edgeBottomX, y / ROWS)));
      }
      const hemStart = ROWS * nx;
      const bottomCornerDepth = Math.max(
        Math.abs(a.getZ(hemStart + 1)),
        Math.abs(a.getZ(hemStart + COLS - 1)),
      );
      const projectedHem = [];
      for (let x = 0; x <= COLS; x++) {
        const i = hemStart + x;
        const point = new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
        m.localToWorld(point).project(camera);
        projectedHem.push([
          (point.x * 0.5 + 0.5) * canvas.clientWidth,
          (-point.y * 0.5 + 0.5) * canvas.clientHeight,
        ]);
      }
      const [lineStartX, lineStartY] = projectedHem[0];
      const [lineEndX, lineEndY] = projectedHem[projectedHem.length - 1];
      const lineDx = lineEndX - lineStartX, lineDy = lineEndY - lineStartY;
      const lineLength = Math.hypot(lineDx, lineDy) || 1;
      let hemProjectedDeviationPx = 0;
      for (const [x, y] of projectedHem) {
        const distance = Math.abs(lineDy * x - lineDx * y + lineEndX * lineStartY - lineEndY * lineStartX) / lineLength;
        hemProjectedDeviationPx = Math.max(hemProjectedDeviationPx, distance);
      }
      let hemProjectedKinkPx = 0;
      for (let i = 1; i < projectedHem.length - 1; i++) {
        const [leftX, leftY] = projectedHem[i - 1];
        const [midX, midY] = projectedHem[i];
        const [rightX, rightY] = projectedHem[i + 1];
        const neighborDx = rightX - leftX;
        const neighborDy = rightY - leftY;
        const neighborLength = Math.hypot(neighborDx, neighborDy) || 1;
        const localDistance = Math.abs(
          neighborDy * midX - neighborDx * midY + rightX * leftY - rightY * leftX,
        ) / neighborLength;
        hemProjectedKinkPx = Math.max(hemProjectedKinkPx, localDistance);
      }
      return {
        visible: m.visible, opacity: m.material?.opacity ?? null,
        minX, maxX, minY, maxY, minZ, maxZ, hemMinY, hemMaxY, hemMaxAbsZ,
        outerEdgeMinX, outerEdgeMaxX, outerEdgeSpan: outerEdgeMaxX - outerEdgeMinX,
        outerEdgeCurveMax, bottomCornerDepth, hemProjectedDeviationPx, hemProjectedKinkPx,
        meanRestDisplacement: restDisplacement / a.count,
      };
    }),
  }),
  pokeScreen: (clientX, clientY, dClientX, dClientY) => {
    const w1 = pointerToWorld(clientX - dClientX, clientY - dClientY);
    const w2 = pointerToWorld(clientX, clientY);
    if (w1 && w2) {
      exciteAtmosphere(w2.x, w2.y, w2.x - w1.x);
      cancelFabricReset();
      ptr.active = true; ptr.px = w1.x; ptr.py = w1.y; ptr.x = w2.x; ptr.y = w2.y;
      scheduleFabricReset();
    }
  },
  setMode: setInteractionMode,
  screenToWorld: (x, y) => {
    const point = pointerToWorld(x, y);
    return point ? { x: point.x, y: point.y } : null;
  },
  dragMode: (fromX, fromY, toX, toY) => {
    const startHit = pointerToWorld(fromX, fromY);
    const start = startHit ? { x: startHit.x, y: startHit.y } : null;
    const endHit = pointerToWorld(toX, toY);
    const end = endHit ? { x: endHit.x, y: endHit.y } : null;
    beginModeGesture(start);
    updateModeGesture(end);
    const result = {
      start: start ? { x: start.x, y: start.y } : null,
      end: end ? { x: end.x, y: end.y } : null,
      spreads: activeSet.sims.map((sim) => sim.spread),
      spreadTargets: activeSet.sims.map((sim) => sim.openTargetSpread),
      rollerDrop, rollerTargetDrop,
    };
    endModeGesture();
    return result;
  },
  injectOrientation: (beta, gamma) => onOrientation({ beta, gamma }),
  jumpToProduct: (next) => {
    if (next === currentIndex || next < 0 || next >= PRODUCTS.length) return;
    const product = PRODUCTS[next];
    activeSet.setMaterial(product);
    activeSet.setCastShadow(product.castShadow);
    setRollerMaterial(product);
    for (const sim of activeSet.sims) {
      sim.spread = 1;
      sim.openTargetSpread = 1;
      sim.openVelocity = 0;
      sim.offsetX = 0;
      sim.build();
      sim.kinematic = null;
    }
    active = product;
    currentIndex = next;
    lightMix = { from: product, to: product, t: 1 };
    syncProductLabel();
    syncProductSelector();
    updateQuoteSummary();
    for (let i = 0; i < 2; i++) uploadGeometry(activeSet.geos[i], activeSet.sims[i]);
    applyLightMix();
  },
  setSize: (ancho, alto) => {
    setDimensions(ancho, alto);
  },
};
