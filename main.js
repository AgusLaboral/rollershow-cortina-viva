import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

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
const ctaQuote = document.getElementById('ctaQuote');
const muteBtn = document.getElementById('muteBtn');

const QUOTE_URL = 'https://www.rollershow.com.ar/cotizar/tradicionales';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const isMobile = matchMedia('(max-width:640px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const memoryKnown = typeof navigator.deviceMemory === 'number';
const deviceMemory = navigator.deviceMemory || 4;
const cpuCores = navigator.hardwareConcurrency || 4;
const forcedQuality = new URLSearchParams(location.search).get('quality');
const qualityTier = ['full', 'lite'].includes(forcedQuality)
  ? forcedQuality
  : ((memoryKnown && deviceMemory <= 4) || cpuCores <= 4 ? 'lite' : 'full');
const QUALITY = qualityTier === 'full'
  ? { dpr: isMobile ? 1.35 : 1.65, maxPixels: 3000000, shadow: 1024, occlusion: isMobile ? 192 : 288, rays: isMobile ? 36 : 52, smaa: !isMobile }
  : { dpr: 1, maxPixels: 1400000, shadow: 512, occlusion: 144, rays: 24, smaa: false };

// ---------------------------------------------------------------------------
// Renderer / cámara
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.dpr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090908);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

// ---------------------------------------------------------------------------
// Puerta-ventana protagonista en ambiente CLARO minimalista (referencia de
// Agus: cuarto limpio, ventana blanca de paños con grilla, charco de luz
// nítido en el piso). La puerta-ventana va del piso al dintel, en dos hojas
// con grilla de vidrios — los parantes proyectan la sombra en grilla.
// ---------------------------------------------------------------------------
const backZ = -2.2;
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
const wallMat = new THREE.MeshPhysicalMaterial({
  color: 0x4c4944,
  roughness: 0.58,
  metalness: 0,
  clearcoat: 0.18,
  clearcoatRoughness: 0.36,
});
const backWall = new THREE.Mesh(new THREE.BufferGeometry(), wallMat);
backWall.position.z = backZ;
backWall.receiveShadow = true;
backWall.castShadow = true;
scene.add(backWall);

const ENV_ROT = 2.196; // sol del HDRI centrado en la ventana (calculado del archivo)
new RGBELoader().load('img/env/sunset.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.environmentIntensity = 0.22;
  scene.environmentRotation = new THREE.Euler(0, ENV_ROT, 0);
});

// Piso de madera PBR real. El color y el relieve provienen de mapas CC0:
// nada de gris plano ni clearcoat alto que lo convierta en una placa metalica.
const surfaceLoader = new THREE.TextureLoader();
const floorColorMap = surfaceLoader.load('img/env/wood_diff.jpg');
const floorNormalMap = surfaceLoader.load('img/env/wood_nor.jpg');
for (const texture of [floorColorMap, floorNormalMap]) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // La geometria mide 200 unidades: este repeat deja tablas de escala real
  // dentro del encuadre sin evidenciar el mosaico de la textura.
  texture.repeat.set(40, 40);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), qualityTier === 'full' ? 8 : 2);
}
floorColorMap.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhysicalMaterial({
    map: floorColorMap,
    normalMap: floorNormalMap,
    normalScale: new THREE.Vector2(0.38, 0.38),
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.62,
    envMapIntensity: 0.8,
  })
);
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

// Una mesa lateral y una pieza cerámica hacen visible el rebote de la ventana.
// Son superficies de lectura lumínica, no decoración protagonista.
const roomObjectMat = new THREE.MeshPhysicalMaterial({
  color: 0x34302c,
  roughness: 0.16,
  metalness: 0.08,
  clearcoat: 0.82,
  clearcoatRoughness: 0.12,
});
const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.1, 48), roomObjectMat);
const tableStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.44, 24), roomObjectMat);
const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.39, 0.07, 40), roomObjectMat);
tableTop.position.set(-2.45, 0.49, 0.72);
tableStem.position.set(-2.45, 0.24, 0.72);
tableBase.position.set(-2.45, 0.035, 0.72);
for (const part of [tableTop, tableStem, tableBase]) {
  part.castShadow = true;
  part.receiveShadow = true;
  scene.add(part);
}
const vaseProfile = [
  [0.04, 0], [0.15, 0.025], [0.2, 0.11], [0.18, 0.31],
  [0.12, 0.48], [0.09, 0.56], [0.1, 0.6],
].map(([x, y]) => new THREE.Vector2(x, y));
const ceramic = new THREE.Mesh(
  new THREE.LatheGeometry(vaseProfile, qualityTier === 'full' ? 32 : 18),
  new THREE.MeshPhysicalMaterial({
    color: 0xb9a38d,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
  })
);
ceramic.position.set(-2.38, 0.54, 0.7);
ceramic.castShadow = true;
scene.add(ceramic);

// Sombra de contacto de baja frecuencia: ancla mesa y ceramica sin sumar un
// pase SSAO ni ensuciar el piso con una mancha de bordes duros.
function makeContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.38, 'rgba(0,0,0,0.36)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const tableContactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 1.35),
  new THREE.MeshBasicMaterial({
    map: makeContactShadowTexture(), transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.NormalBlending,
  })
);
tableContactShadow.rotation.x = -Math.PI / 2;
tableContactShadow.position.set(-2.45, 0.004, 0.72);
scene.add(tableContactShadow);

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
const SUN_DIR = new THREE.Vector3(-1.5, -1.5, 5.6).normalize(); // direccion fija del sol (afuera -> adentro)

// RectAreaLight: LA luz físicamente correcta para una ventana — luz de área
// suave que envuelve la tela. (Tecnología que faltaba.)
RectAreaLightUniformsLib.init();
const areaLight = new THREE.RectAreaLight(0xffe3ba, 4, 1, 1);
scene.add(areaLight);

const windowGroup = new THREE.Group();
scene.add(windowGroup);
let glass = null;
const LATE = {}; // refs que se crean más abajo (sun, glowPlane de oclusión...)

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
  rod.position.set(0, ROD_Y - 0.24, backZ + 0.18);
  rod.castShadow = true;
  windowGroup.add(rod);
  for (const x of [-rodLength * 0.5, rodLength * 0.5]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 16), rodMat);
    cap.position.set(x, ROD_Y - 0.24, backZ + 0.18);
    windowGroup.add(cap);
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
  for (const sprite of [...hazeGroup.children]) sprite.material.dispose();
  hazeGroup.clear();
  const hazeCount = qualityTier === 'full' ? 18 : 9;
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
    const baseX = SUN_DIR.x * travel;
    const baseY = winY + winH * 0.55 + SUN_DIR.y * travel;
    const baseZ = backZ + 0.08 + SUN_DIR.z * travel;
    sprite.position.set(baseX, baseY, baseZ);
    sprite.scale.set(winW * (0.74 + p * 1.12), winH * (0.28 + p * 0.48), 1);
    sprite.material.rotation = (i % 5) * 0.37;
    sprite.userData = { baseX, baseY, phase: i * 1.73, p };
    hazeGroup.add(sprite);
  }
  areaLight.width = winW;
  areaLight.height = winH;
  areaLight.position.set(0, winY + winH / 2, backZ + 0.05);
  areaLight.lookAt(0, winY + winH / 2, 10);
  if (LATE.sun) {
    LATE.sun.target.position.set(-winW * 0.2, winY + winH * 0.25, 2.2);
    const shadowHalfW = Math.max(2.8, winW * 1.25);
    LATE.sun.shadow.camera.left = -shadowHalfW;
    LATE.sun.shadow.camera.right = shadowHalfW;
    LATE.sun.shadow.camera.top = Math.max(3.6, winTop + 0.65);
    LATE.sun.shadow.camera.bottom = -1;
    LATE.sun.shadow.camera.updateProjectionMatrix();
  }
  if (LATE.windowProjector) {
    LATE.windowProjector.position.set(0, winY + winH * 0.58, backZ + 0.08);
    LATE.windowProjector.target.position.set(-2.75, 0.24, 0.82);
    LATE.windowProjector.target.updateMatrixWorld();
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
const SUN_BASE_INTENSITY = 9.0;
const sun = new THREE.DirectionalLight(0xffc27d, SUN_BASE_INTENSITY);
sun.position.set(1.0, 1.9, backZ - 3.4);
sun.target.position.set(-0.5, 0.4, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 16;
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.018;
sun.shadow.radius = qualityTier === 'full' ? 2 : 1;
scene.add(sun, sun.target);
LATE.sun = sun;

// Proyección desde el vano: convierte la ventana en una fuente que dibuja
// reflejos sobre piso, banco y cerámica, como una pantalla luminosa real.
const windowProjector = new THREE.SpotLight(0xffc27a, 0, 22, 0.72, 0.78, 1.35);
windowProjector.position.set(0, winY + winH * 0.58, backZ + 0.08);
windowProjector.target.position.set(-2.75, 0.24, 0.82);
windowProjector.castShadow = false;
scene.add(windowProjector, windowProjector.target);
LATE.windowProjector = windowProjector;
buildWindow(); // re-apunta sol, proyector y oclusión ahora que existen

const keyFill = new THREE.SpotLight(0xfff0d8, 9, 18, 0.8, 0.7, 1.6);
keyFill.position.set(-1.8, 2.4, 3.4);
keyFill.target.position.set(0, 1.4, backZ + 0.3);
scene.add(keyFill, keyFill.target);

const FILL_BASE_INTENSITY = 1.2;
const fill = new THREE.HemisphereLight(0xfdf3e3, 0x8a8378, FILL_BASE_INTENSITY);
scene.add(fill);
const fillFor = (sf) => FILL_BASE_INTENSITY * lerp(0.34, 1.18, sf);

// (el haz volumétrico se construye en buildWindow)

// ---------------------------------------------------------------------------
// Transmisión física: 0 = la tela bloquea toda la luz; la abertura real entre
// paños se calcula aparte usando la geometría viva.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { name: 'Blackout', color: 'Blanco', tex: 'img/fabric/blackout.jpg', normal: 'img/fabric/blackout-nor.png',
    stiffness: 0.97, gravity: 7.4, friction: 0.962, influence: 0.34, dragCap: 0.028, roughness: 0.85,
    opacity: 1, castShadow: true, shadowBlock: 1, tint: 0xf2f0eb, sunFactor: 0, backlight: 0.01, repeat: 1.6, colorMap: false },
  { name: 'Gasa', color: 'Beige', tex: 'img/fabric/gasa.jpg', normal: 'img/fabric/gasa-nor.png',
    stiffness: 0.93, gravity: 6.2, friction: 0.968, influence: 0.42, dragCap: 0.04, roughness: 0.6,
    opacity: 0.94, castShadow: true, shadowBlock: 0.34, tint: 0xe8d7bc, sunFactor: 0.62, backlight: 0.16, repeat: 1.8 },
  { name: 'Tusor', color: 'Natural', tex: 'img/fabric/tusor.jpg', normal: 'img/fabric/tusor-nor.png',
    stiffness: 0.95, gravity: 6.8, friction: 0.965, influence: 0.38, dragCap: 0.034, roughness: 0.8,
    opacity: 0.99, castShadow: true, shadowBlock: 0.78, tint: 0xcbbba4, sunFactor: 0.2, backlight: 0.07, repeat: 1.7 },
];

const texLoader = new THREE.TextureLoader();
const fabricTextureCache = new Map();
function fabricTex(src, srgb, rep, repY) {
  const key = `${src}|${srgb}|${rep}|${repY ?? rep}`;
  if (fabricTextureCache.has(key)) return fabricTextureCache.get(key);
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, repY ?? rep);
  t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), qualityTier === 'full' ? 8 : 2);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  fabricTextureCache.set(key, t);
  return t;
}
function makeCurtainMaterial(p) {
  const material = new THREE.MeshStandardMaterial({
    map: p.colorMap === false ? null : fabricTex(p.tex, true, p.repeat * 0.55, p.repeat),
    normalMap: fabricTex(p.normal, false, p.repeat * 0.55, p.repeat),
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: p.tint,
    emissive: p.tint,
    emissiveIntensity: p.backlight,
    roughness: p.roughness,
    metalness: 0,
    transparent: true,
    opacity: p.opacity,
    side: THREE.DoubleSide,
  });
  material.userData.shadowBlock = p.shadowBlock;
  return material;
}

// Sombra parcial estable: una máscara Bayer hace que PCF integre una sombra
// proporcional sin convertir gasa/tusor en un bloque negro opaco.
function makeShadowMaterial(p) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  const image = g.createImageData(8, 8);
  const bayer = [
    0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
    12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
    3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
    15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21,
  ];
  const cutoff = Math.round(p.shadowBlock * 64);
  for (let i = 0; i < 64; i++) {
    const on = bayer[i] < cutoff ? 255 : 0;
    image.data.set([on, on, on, 255], i * 4);
  }
  g.putImageData(image, 0, 0);
  const alpha = new THREE.CanvasTexture(c);
  alpha.wrapS = alpha.wrapT = THREE.RepeatWrapping;
  alpha.repeat.set(32, 32);
  alpha.magFilter = THREE.NearestFilter;
  alpha.minFilter = THREE.NearestFilter;
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaMap: alpha,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Física: CUATRO simulaciones (2 paños x 2 sets para el carrusel).
// Cada paño cubre poco más de la mitad de la ventana y cuelga entreabierto:
// la luz pasa por el medio. Ondulado marcado como estado de reposo.
// ---------------------------------------------------------------------------
const COLS = qualityTier === 'full' ? 11 : 8;   // por paño
const ROWS = qualityTier === 'full' ? 26 : 18;
const ITERATIONS = qualityTier === 'full' ? 4 : 3;
const nx = COLS + 1;

const ANCHO_MIN = 60, ANCHO_MAX = 300, ANCHO_DEF = 120;
const ALTO_MIN = 60, ALTO_MAX = 260, ALTO_DEF = 150;
let anchoCm = ANCHO_DEF, altoCm = ALTO_DEF;

let FULL_W = winW * 1.34;              // ancho total del par de paños
let CURTAIN_BOTTOM = Math.max(0.015, winY - 0.06);
let W_M = FULL_W, H_M = ROD_Y + 0.035 - CURTAIN_BOTTOM;
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
        const px = sim.anchorX(colX[x]), py = ROD_Y + 0.035 - y * sy;
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
        p.y = ROD_Y + 0.035 - p.v * ROWS * sy;
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
      if (p.y < CURTAIN_BOTTOM) { p.y = CURTAIN_BOTTOM; p.py = p.y; }
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
    mesh.customDepthMaterial = makeShadowMaterial(product);
    mesh.renderOrder = 3;
    mesh.position.z = backZ + 0.35;
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
const occOpaque = new THREE.MeshBasicMaterial({ color: 0x000000 });
const occSwap = new Map();
const curtainMeshes = new Set([...setA.meshes, ...setB.meshes]);
const occCurtainMats = new Map([...curtainMeshes].map((mesh) => [
  mesh, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true }),
]));

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
    if (!o.isMesh || o === glowPlane || o === glass || o === LATE.shaft) return;
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

  renderer.autoClear = prevAutoClear;
  renderer.shadowMap.enabled = prevShadows;
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
    vec3 col = base.rgb + tint * illumination * exposure * strength * haze;
    // Halo solo alrededor del vano: suaviza la fuente sin lavar la tela.
    float halo = pow(clamp(1.0 - distance(vUv, lightPos) / 0.48, 0.0, 1.0), 3.0);
    col += tint * halo * (0.018 + 0.024 * strength);
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
    lightPos: { value: new THREE.Vector2(0.5, 0.5) },
    exposure: { value: 0.78 },
    decay: { value: 0.975 },
    density: { value: 1.08 },
    weight: { value: 0.68 },
    strength: { value: 1.0 },
    time: { value: 0 },
    tint: { value: new THREE.Vector3(1.0, 0.68, 0.32) },
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
function updateLightScreenPos() {
  lightProjected.copy(lightWorldPos).project(camera);
  godrayPass.uniforms.lightPos.value.set(lightProjected.x * 0.5 + 0.5, lightProjected.y * 0.5 + 0.5);
}

const navLeftWorld = new THREE.Vector3();
const navRightWorld = new THREE.Vector3();
function updateNavScreenPosition() {
  const r = canvas.getBoundingClientRect();
  const y = CURTAIN_BOTTOM + H_M * 0.55;
  navLeftWorld.set(-FULL_W * 0.61, y, backZ + 0.35).project(camera);
  navRightWorld.set(FULL_W * 0.61, y, backZ + 0.35).project(camera);
  const place = (button, point) => {
    const x = clamp((point.x * 0.5 + 0.5) * r.width, 40, r.width - 40);
    const top = clamp((-point.y * 0.5 + 0.5) * r.height, 74, r.height - 170);
    button.style.left = `${x}px`;
    button.style.top = `${top}px`;
  };
  place(prevBtn, navLeftWorld);
  place(nextBtn, navRightWorld);
}

function applyLightMix() {
  const t = lightMix.t;
  const transmission = lerp(lightMix.from.sunFactor, lightMix.to.sunFactor, t);
  const openingFor = (set) => {
    let gap = 0;
    for (let y = 0; y <= ROWS; y++) {
      const i = y * nx + COLS;
      gap += Math.max(0, set.sims[1].points[i].x - set.sims[0].points[i].x);
    }
    return clamp((gap / (ROWS + 1)) / Math.max(W_M, 0.001), 0, 0.7);
  };
  const opening = transitionState
    ? lerp(openingFor(activeSet), openingFor(idleSet), t)
    : openingFor(activeSet);
  const motionFor = (set) => {
    let total = 0;
    let count = 0;
    for (const sim of set.sims) {
      for (const p of sim.points) {
        if (p.pinned) continue;
        total += Math.hypot(p.x - p.px, p.y - p.py);
        count++;
      }
    }
    return clamp((total / Math.max(count, 1)) / Math.max(W_M * 0.0025, 0.001), 0, 1);
  };
  const motion = transitionState
    ? lerp(motionFor(activeSet), motionFor(idleSet), t)
    : motionFor(activeSet);
  // La tela aporta transmisión; la separación física entre paños aporta luz
  // directa. Blackout tiene transmisión cero: nunca pasa luz por su superficie.
  const weaveShift = transmission > 0 ? motion * 0.24 : 0;
  const sf = clamp(transmission + (1 - transmission) * opening * 1.15 + weaveShift, 0, 1);
  // Compresión suave de altas luces: la Gasa sigue siendo muy luminosa sin
  // quemar marco, textura y superficies cuando el paño se abre por completo.
  const lightLevel = 1 - Math.exp(-sf * 1.45);
  sun.intensity = SUN_BASE_INTENSITY * lightLevel * 0.72;
  keyFill.intensity = 0.55 + 2.5 * lightLevel;
  fill.intensity = fillFor(lightLevel);
  godrayPass.uniforms.strength.value = 0.38 + 2.1 * lightLevel;
  shaftMat.uniforms.uIntensity.value = 0;
  bloomPass.strength = 0.12 + 0.52 * lightLevel;
  areaLight.intensity = 0.18 + 3.4 * lightLevel;
  windowProjector.intensity = 0.12 + 13 * lightLevel;
  LATE.hazeStrength = lightLevel;
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
let OFF_DIST = winW * 0.75 + 0.6;
const TRANSITION_SECS = 1.5;

function goTo(next) {
  if (switching) return;
  switching = true;
  prevBtn.disabled = true; nextBtn.disabled = true;
  const to = PRODUCTS[next];

  idleSet.setMaterial(to);
  idleSet.setVisible(true);
  idleSet.setCastShadow(to.castShadow);
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
  updateQuoteLink();
  applyLightMix();
}

prevBtn.addEventListener('click', () => goTo((currentIndex - 1 + PRODUCTS.length) % PRODUCTS.length));
nextBtn.addEventListener('click', () => goTo((currentIndex + 1) % PRODUCTS.length));

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
  CURTAIN_BOTTOM = Math.max(0.015, winY - 0.06);
  H_M = ROD_Y + 0.035 - CURTAIN_BOTTOM;
  for (const sim of activeSet.sims) { sim.spread = 1; sim.offsetX = 0; sim.build(); }
  if (idleSet.visible) for (const sim of idleSet.sims) sim.build();
  updateCameraBase();
}
document.querySelectorAll('[data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dir = Number(btn.dataset.dir);
    if (btn.dataset.step === 'ancho') { anchoCm = clamp(anchoCm + dir * 10, ANCHO_MIN, ANCHO_MAX); anchoValue.textContent = anchoCm; }
    else { altoCm = clamp(altoCm + dir * 10, ALTO_MIN, ALTO_MAX); altoValue.textContent = altoCm; }
    applySize();
    updateQuoteLink();
  });
});
function updateQuoteLink() {
  ctaQuote.href = QUOTE_URL;
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
  const pixelCapDpr = Math.sqrt(QUALITY.maxPixels / Math.max(1, r.width * r.height));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.dpr, pixelCapDpr));
  renderer.setSize(r.width, r.height, false);
  occlusionTarget.setSize(QUALITY.occlusion, Math.max(96, Math.round(QUALITY.occlusion / camera.aspect)));
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
updateQuoteLink();

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
  applyLightMix();
  const atmosphereTime = reducedMotion ? 0 : now * 0.001;
  shaftMat.uniforms.uTime.value = atmosphereTime;
  godrayPass.uniforms.time.value = atmosphereTime;
  const hazeStrength = LATE.hazeStrength || 0;
  for (const sprite of hazeGroup.children) {
    const { baseX, baseY, phase, p } = sprite.userData;
    sprite.position.x = baseX + Math.sin(atmosphereTime * 0.11 + phase) * (0.025 + p * 0.045);
    sprite.position.y = baseY + Math.cos(atmosphereTime * 0.09 + phase * 0.7) * 0.025;
    sprite.material.rotation += reducedMotion ? 0 : 0.00028 * (phase % 2 ? 1 : -1);
    sprite.material.opacity = (0.008 + hazeStrength * 0.065) * (0.72 + 0.28 * Math.sin(atmosphereTime * 0.13 + phase));
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
  updateNavScreenPosition();
  renderOcclusionPass();
  composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__cortina = {
  getState: () => ({
    currentIndex, anchoCm, altoCm, switching, qualityTier, winW, winH, winY,
    productName: PRODUCTS[currentIndex].name, productColor: PRODUCTS[currentIndex].color,
    panels: activeSet.meshes.map((m) => {
      const a = m.geometry.getAttribute('position');
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < a.count; i++) {
        minX = Math.min(minX, a.getX(i)); maxX = Math.max(maxX, a.getX(i));
        minZ = Math.min(minZ, a.getZ(i)); maxZ = Math.max(maxZ, a.getZ(i));
      }
      return { visible: m.visible, opacity: m.material?.opacity ?? null, minX, maxX, minZ, maxZ };
    }),
  }),
  pokeScreen: (clientX, clientY, dClientX, dClientY) => {
    const w1 = pointerToWorld(clientX - dClientX, clientY - dClientY);
    const w2 = pointerToWorld(clientX, clientY);
    if (w1 && w2) { ptr.active = true; ptr.px = w1.x; ptr.py = w1.y; ptr.x = w2.x; ptr.y = w2.y; }
  },
  jumpToProduct: (next) => {
    if (next === currentIndex || next < 0 || next >= PRODUCTS.length) return;
    const product = PRODUCTS[next];
    activeSet.setMaterial(product);
    activeSet.setCastShadow(product.castShadow);
    for (const sim of activeSet.sims) {
      sim.spread = 1;
      sim.offsetX = 0;
      sim.build();
      sim.kinematic = null;
    }
    active = product;
    currentIndex = next;
    lightMix = { from: product, to: product, t: 1 };
    productName.textContent = product.name;
    productColor.textContent = product.color;
    for (let i = 0; i < 2; i++) uploadGeometry(activeSet.geos[i], activeSet.sims[i]);
    applyLightMix();
  },
  setSize: (ancho, alto) => {
    anchoCm = clamp(ancho, ANCHO_MIN, ANCHO_MAX);
    altoCm = clamp(alto, ALTO_MIN, ALTO_MAX);
    anchoValue.textContent = anchoCm;
    altoValue.textContent = altoCm;
    applySize();
    updateQuoteLink();
  },
};
