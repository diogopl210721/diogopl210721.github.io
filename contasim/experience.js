import * as THREE from '../vendor/three.module.js';

const host = document.getElementById('gl');
const section = document.getElementById('experience');
const panels = [...document.querySelectorAll('.scene-panel')];
const dots = [...document.querySelectorAll('.scene-dots button')];
const toggle = document.getElementById('motion-toggle');
const meter = document.getElementById('scene-meter');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const isMobile = () => innerWidth < 820;

let disabled = reduce.matches, renderer, scene, camera, points, uniforms, group;
let frame = 0, target = 0, prog = 0, pX = 0, pY = 0, vX = 0, vY = 0, lastScene = -1, visible = true, t0 = performance.now();
const N = isMobile() ? 5500 : 10000;
const SCENES = 5;

/* ---------- deterministic random ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- shapes: each returns {pos:Float32Array(3N), val:Float32Array(N), hi:Float32Array(N)} ---------- */
function blank() { return { pos: new Float32Array(N * 3), val: new Float32Array(N).fill(2), hi: new Float32Array(N) }; }
function put(s, i, x, y, z, v = 2, h = 0) { s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z; s.val[i] = v; s.hi[i] = h; }
function rot(x, y, z, rx, ry, rz) {
  let c = Math.cos(rx), s = Math.sin(rx), y1 = y * c - z * s, z1 = y * s + z * c; y = y1; z = z1;
  c = Math.cos(ry); s = Math.sin(ry); const x2 = x * c + z * s, z2 = -x * s + z * c; x = x2; z = z2;
  c = Math.cos(rz); s = Math.sin(rz); const x3 = x * c - y * s, y3 = x * s + y * c; return [x3, y3, z];
}

function shapePaper(R) {
  const s = blank(), sheets = [];
  for (let k = 0; k < 15; k++) sheets.push({ x: (R() - .5) * 4.6, y: (R() - .5) * 3.6, z: (R() - .5) * 3.0, rx: (R() - .5) * .9, ry: (R() - .5) * 1.1, rz: (R() - .5) * .9 });
  const W = 1.25, H = 1.7;
  for (let i = 0; i < N; i++) {
    const sh = sheets[i % sheets.length], r = R();
    let x, y, h = 0;
    if (r < .46) { x = (R() - .5) * W * .86; y = (Math.floor(R() * 9) / 9 - .46) * H; }
    else if (r < .70) { const e = Math.floor(R() * 4), u = R(); if (e === 0) { x = (u - .5) * W; y = -H / 2; } else if (e === 1) { x = (u - .5) * W; y = H / 2; } else if (e === 2) { x = -W / 2; y = (u - .5) * H; } else { x = W / 2; y = (u - .5) * H; } h = 1; }
    else { x = (R() - .5) * W * .8; y = (R() - .5) * H * .8; }
    const [a, b, c] = rot(x, y, 0, sh.rx, sh.ry, sh.rz);
    put(s, i, a + sh.x, b + sh.y, c + sh.z, 2, h);
  }
  return s;
}
function shapeDB(R) {
  const s = blank();
  for (let i = 0; i < N; i++) {
    const r = R(), disc = Math.floor(R() * 3), cy = (disc - 1) * 1.15, th = R() * Math.PI * 2, rad = 1.55;
    let x, y, z, h = 0;
    if (r < .52) { x = Math.cos(th) * rad; z = Math.sin(th) * rad; y = cy + (R() - .5) * .72; }
    else if (r < .78) { const rr = Math.sqrt(R()) * rad; x = Math.cos(th) * rr; z = Math.sin(th) * rr; y = cy + (R() < .5 ? .36 : -.36); h = rr > rad * .8 ? 1 : 0; }
    else { const a = Math.floor(R() * 10) / 10 * Math.PI * 2; x = Math.cos(a) * (.3 + R() * 1.1); z = Math.sin(a) * (.3 + R() * 1.1); y = (R() - .5) * 4.4; h = 1; }
    put(s, i, x, y, z, 2, h);
  }
  return s;
}
function shapeGrid(R) {
  const s = blank(), cols = 8, rows = 5, units = cols * rows, sp = .62;
  const w = .4, h = .26, d = .3, rh = .16;
  const C = [[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d],[-w,-h,d],[w,-h,d],[w,h,d],[-w,h,d]].map(p => [p[0] / 2, p[1] / 2, p[2] / 2]);
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const roofA = [0, h / 2 + rh, -d / 2], roofB = [0, h / 2 + rh, d / 2];
  const roofE = [[C[3], roofA],[C[2], roofA],[C[7], roofB],[C[6], roofB],[roofA, roofB]];
  const all = E.map(e => [C[e[0]], C[e[1]]]).concat(roofE);
  for (let i = 0; i < N; i++) {
    const u = i % units, c = u % cols, rw = Math.floor(u / cols);
    const cx = (c - (cols - 1) / 2) * sp, cy = (rw - (rows - 1) / 2) * sp * 1.05;
    const e = all[Math.floor(R() * all.length)], t = R();
    const x = e[0][0] + (e[1][0] - e[0][0]) * t, y = e[0][1] + (e[1][1] - e[0][1]) * t, z = e[0][2] + (e[1][2] - e[0][2]) * t;
    const [rx, ry, rz] = rot(x, y, z, -.5, .35, 0);
    put(s, i, cx + rx, cy + ry, rz, (u * 0.6180339) % 1, 0);
  }
  return s;
}
function shapeDial(R) {
  const s = blank();
  for (let i = 0; i < N; i++) {
    const r = R(), th = R() * Math.PI * 2;
    let x, y, z = (R() - .5) * .16, h = 0;
    if (r < .38) { const rr = 1.85 + (R() - .5) * .16; x = Math.cos(th) * rr; y = Math.sin(th) * rr; }
    else if (r < .56) { const k = Math.floor(R() * 48) / 48 * Math.PI * 2, rr = 1.45 + R() * (Math.floor(R() * 4) === 0 ? .32 : .18); x = Math.cos(k) * rr; y = Math.sin(k) * rr; h = .5; }
    else if (r < .80) { const e = R(); const wx = 2.7, wy = .8; if (e < .5) { x = (R() - .5) * wx; y = (R() < .5 ? .5 : -.5) * wy; } else { x = (Math.floor(R() * 6) / 5 - .5) * wx; y = (R() - .5) * wy; } y -= .15; h = 1; }
    else if (r < .88) { const l = R() * 1.35, a = -.9; x = Math.cos(a) * l; y = Math.sin(a) * l + 1.0; }
    else { const rr = Math.sqrt(R()) * 1.6; x = Math.cos(th) * rr; y = Math.sin(th) * rr; z = (R() - .5) * .5; }
    put(s, i, x, y, z, 2, h);
  }
  return s;
}
function shapeShield(R) {
  const s = blank(), poly = [[0, 2.1], [1.45, 1.6], [1.45, .2], [0, -2.1], [-1.45, .2], [-1.45, 1.6]];
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const chk = [[-.62, -.05], [-.18, -.55], [.7, .6]];
  for (let i = 0; i < N; i++) {
    const r = R(); let x, y, z = (R() - .5) * .3, v = 2, h = 0;
    if (r < .62) { do { x = (R() - .5) * 2.9; y = (R() - .5) * 4.2; } while (!inside(x, y) || (Math.abs(x) < .1 && R() < 0)); }
    else if (r < .82) { const e = Math.floor(R() * poly.length), p = poly[e], q = poly[(e + 1) % poly.length], u = R(); x = p[0] + (q[0] - p[0]) * u; y = p[1] + (q[1] - p[1]) * u; h = 1; }
    else { const e = R() < .35 ? 0 : 1, p = chk[e], q = chk[e + 1], u = R(); x = p[0] + (q[0] - p[0]) * u + (R() - .5) * .13; y = p[1] + (q[1] - p[1]) * u + (R() - .5) * .13; z = .2 + R() * .1; v = 0; h = 1; }
    put(s, i, x, y, z, v, h);
  }
  return s;
}

/* ---------- shaders ---------- */
const vert = `
attribute vec3 aA; attribute vec3 aB; attribute float aVA; attribute float aVB; attribute float aHA; attribute float aHB; attribute float aR;
uniform float uMix; uniform float uTime; uniform float uPx; uniform float uGreen; uniform float uSize;
varying float vV; varying float vH; varying float vR; varying float vFog;
void main(){
  float e = uMix*uMix*(3.0-2.0*uMix);
  vec3 p = mix(aA,aB,e);
  float burst = sin(3.14159*e);
  vec3 sw = vec3(sin(aR*37.0+uTime*.9), cos(aR*23.0+uTime*.7), sin(aR*51.0+uTime*.8));
  p += sw*burst*(0.9+aR*1.6);
  p += vec3(sin(uTime*.6+aR*80.0), cos(uTime*.5+aR*60.0), sin(uTime*.4+aR*40.0))*0.018;
  vV = uMix<.5? aVA : aVB; vH = mix(aHA,aHB,e); vR = aR;
  vec4 mv = modelViewMatrix*vec4(p,1.0);
  gl_Position = projectionMatrix*mv;
  float s = uSize*(.55+aR*.9)*(1.0+vH*.35);
  gl_PointSize = s*uPx*(7.0/-mv.z);
  vFog = clamp(1.0-(-mv.z-6.0)/14.0,.25,1.0);
}`;
const frag = `
precision mediump float;
uniform float uGreen; uniform float uFlame;
varying float vV; varying float vH; varying float vR; varying float vFog;
void main(){
  float d = length(gl_PointCoord-.5);
  float a = smoothstep(.5,.05,d);
  vec3 blue = vec3(.22,.61,1.0), cyan = vec3(.39,.87,1.0), green = vec3(.13,.75,.48), flame = vec3(1.0,.34,.19);
  vec3 c = mix(blue,cyan,clamp(vR*1.2+vH*.5,0.,1.));
  c = mix(c, flame, uFlame*vH*step(.55,vR));
  if(vV<uGreen) c = mix(green, vec3(.6,1.0,.8), vH*.6);
  gl_FragColor = vec4(c, a*vFog*(.55+vH*.45));
}`;

/* ---------- init ---------- */
function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { document.body.classList.add('no-gl'); return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, .1, 60);
  camera.position.set(0, 0, 8.2);
  const R = rng(7);
  const shapes = [shapePaper(R), shapeDB(R), shapeGrid(R), shapeDial(R), shapeShield(R)];
  const geo = new THREE.BufferGeometry();
  const rnd = new Float32Array(N); for (let i = 0; i < N; i++) rnd[i] = R();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const mk = (n, a, sz) => { const at = new THREE.BufferAttribute(a, sz); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); return at; };
  const attrs = { aA: mk('aA', shapes[0].pos.slice(), 3), aB: mk('aB', shapes[1].pos.slice(), 3), aVA: mk('aVA', shapes[0].val.slice(), 1), aVB: mk('aVB', shapes[1].val.slice(), 1), aHA: mk('aHA', shapes[0].hi.slice(), 1), aHB: mk('aHB', shapes[1].hi.slice(), 1) };
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  uniforms = { uMix: { value: 0 }, uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uGreen: { value: 0 }, uSize: { value: isMobile() ? 3.4 : 3.0 }, uFlame: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  points = new THREE.Points(geo, mat); points.frustumCulled = false;
  group = new THREE.Group(); group.add(points); scene.add(group);
  init.shapes = shapes; init.attrs = attrs; lastScene = 0;
  measure();
  return true;
}
function setSegment(i) {
  const { shapes, attrs } = init, a = shapes[i], b = shapes[i + 1];
  attrs.aA.array.set(a.pos); attrs.aB.array.set(b.pos); attrs.aVA.array.set(a.val); attrs.aVB.array.set(b.val); attrs.aHA.array.set(a.hi); attrs.aHB.array.set(b.hi);
  for (const k in attrs) attrs[k].needsUpdate = true;
  lastScene = i;
}
function measure() {
  if (!renderer) return;
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
function sectionProgress() {
  const range = section.offsetHeight - innerHeight;
  return clamp((scrollY - section.offsetTop) / Math.max(1, range));
}
function setActive(idx) {
  panels.forEach((p, i) => { p.classList.toggle('active', i === idx); p.inert = i !== idx; });
  dots.forEach((d, i) => d.classList.toggle('on', i === idx));
  if (meter) meter.textContent = String(idx + 1).padStart(2, '0') + ' / 0' + SCENES;
}
setActive.last = -1;

function render(now) {
  frame = 0;
  if (disabled || !renderer) return;
  const time = (now - t0) / 1000;
  target = sectionProgress();
  prog += (target - prog) * .09;
  const f = prog * (SCENES - 1), seg = Math.min(SCENES - 2, Math.floor(f)), t = f - seg;
  if (seg !== lastScene) setSegment(seg);
  const mix = smooth(.28, .72, t);
  uniforms.uMix.value = mix; uniforms.uTime.value = time;
  // grid scene (index 2) -> validation turns green as it is reached
  const gridGreen = .6 * smooth(1.7, 2.0, f) * (1 - smooth(2.15, 2.5, f));
  const checkGreen = .02 * smooth(3.5, 3.9, f);
  uniforms.uGreen.value = Math.max(gridGreen, checkGreen);
  uniforms.uFlame.value = smooth(2.5, 3.0, f) * (1 - smooth(3.0, 3.5, f));
  const idx = Math.round(f);
  if (idx !== setActive.last) { setActive(idx); setActive.last = idx; }
  // camera/group motion
  vX += (pX - vX) * .06; vY += (pY - vY) * .06;
  const mob = isMobile();
  group.position.x += ((mob ? 0 : 2.35) - group.position.x) * .08;
  group.position.y += ((mob ? 1.7 : 0) - group.position.y) * .08;
  const sc = mob ? .62 : 1; group.scale.setScalar(sc);
  group.rotation.y = time * .12 + f * .55 + vX * .35;
  group.rotation.x = -.12 + vY * .2 + Math.sin(time * .3) * .05;
  renderer.render(scene, camera);
  requestFrame();
}
function requestFrame() { if (!frame && !disabled && visible) frame = requestAnimationFrame(render); }

function setStatic(v) {
  disabled = v;
  document.body.classList.toggle('motion-off', v);
  if (toggle) { toggle.setAttribute('aria-pressed', String(v)); toggle.textContent = v ? 'Ativar experiência 3D' : 'Reduzir movimento'; }
  if (v) { cancelAnimationFrame(frame); frame = 0; panels.forEach(p => { p.inert = false; }); }
  else { if (!renderer && !init()) return; setActive.last = -1; measure(); requestFrame(); }
}

dots.forEach(d => d.addEventListener('click', () => {
  const range = section.offsetHeight - innerHeight;
  scrollTo({ top: section.offsetTop + range * Number(d.dataset.p), behavior: 'smooth' });
}));
if (toggle) toggle.addEventListener('click', () => setStatic(!disabled));
reduce.addEventListener('change', e => setStatic(e.matches));
addEventListener('resize', () => { measure(); });
addEventListener('pointermove', e => { pX = (e.clientX / innerWidth - .5) * 2; pY = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) requestFrame(); }, { threshold: 0 }).observe(section);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestFrame(); });

if (disabled) { document.body.classList.add('motion-off'); if (toggle) { toggle.hidden = false; toggle.textContent = 'Ativar experiência 3D'; toggle.setAttribute('aria-pressed', 'true'); } }
else if (init()) { if (toggle) toggle.hidden = false; setActive(0); setActive.last = 0; requestFrame(); }
else if (toggle) toggle.hidden = true;
window.__cs = { get progress() { return prog; } };
