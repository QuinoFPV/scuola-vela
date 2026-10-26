// Aiuti disegnati sull'acqua, da accendere nel menu: il triangolo dei venti (vento reale, vento apparente,
// velocita' della barca) e l'aria sporca che le vele lasciano sottovento.
import * as THREE from './vendor/three.module.min.js';
import { dirVec, KNOT, clamp, len, sub } from './physics.js';
import { MARK_NAMES, MARK_NEAR, MARK_FAR } from './sim.js';

const M_PER_KN = 1.2;                       // scala delle frecce: un nodo = 1,2 m sull'acqua
const RINGS = [5, 10, 20];

/** Vettori in nodi nel piano del lago (x est, y nord): vento reale e apparente (verso dove soffiano) e barca. */
export function windVectors(s) {
  const wt = dirVec(s.twd + 180), fwd = dirVec(s.heading), stb = dirVec(s.heading + 90);
  const true_ = { x: wt.x * s.tws, y: wt.y * s.tws };
  const boat = { x: (fwd.x * s.u + stb.x * s.v) / KNOT, y: (fwd.y * s.u + stb.y * s.v) / KNOT };
  return { true: true_, boat, app: { x: true_.x - boat.x, y: true_.y - boat.y } };
}

/** Freccia piatta: 4 vertici per l'asta e 3 per la punta, ridisegnata a ogni fotogramma. */
function arrowMesh(color, opacity, order) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6]);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
}

/** Freccia da a a b (coordinate locali x, z): asta larga w, punta lunga head e larga 2 * headW (head 0 = solo asta). */
function setArrow(mesh, a, b, w, head, headW) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  mesh.visible = L > 0.05;
  if (!mesh.visible) return;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const hl = Math.min(head, L * 0.5), hw = head > 0 ? headW * hl / head : 0;
  const cx = b.x - ux * hl, cz = b.z - uz * hl;
  const p = mesh.geometry.attributes.position.array;
  const put = (i, x, z) => { p[i * 3] = x; p[i * 3 + 1] = 0; p[i * 3 + 2] = z; };
  put(0, a.x + nx * w / 2, a.z + nz * w / 2); put(1, a.x - nx * w / 2, a.z - nz * w / 2);
  put(2, cx - nx * w / 2, cz - nz * w / 2); put(3, cx + nx * w / 2, cz + nz * w / 2);
  put(4, cx + nx * hw, cz + nz * hw); put(5, cx - nx * hw, cz - nz * hw); put(6, b.x, b.z);
  mesh.geometry.attributes.position.needsUpdate = true;
}

/** Linea tratteggiata sull'acqua (fino a 40 trattini), ridisegnata a ogni fotogramma. */
function dashMesh(color, opacity, order) {
  const n = 40, g = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < n; i++) { const k = i * 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = order; m.frustumCulled = false; m.userData.n = n;
  return m;
}
function setDash(mesh, a, b, w, dash = 0.55, gap = 0.4) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), p = mesh.geometry.attributes.position.array;
  p.fill(0);
  mesh.visible = L > 0.3;
  if (!mesh.visible) { mesh.geometry.attributes.position.needsUpdate = true; return; }
  const ux = dx / L, uz = dz / L, nx = -uz * w / 2, nz = ux * w / 2;
  for (let i = 0, t = 0; i < mesh.userData.n && t < L; i++, t += dash + gap) {
    const t1 = Math.min(L, t + dash), x0 = a.x + ux * t, z0 = a.z + uz * t, x1 = a.x + ux * t1, z1 = a.z + uz * t1;
    p.set([x0 + nx, 0, z0 + nz, x0 - nx, 0, z0 - nz, x1 - nx, 0, z1 - nz, x1 + nx, 0, z1 + nz], i * 12);
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

const FONT = '"Avenir Next", "SF Pro Display", "Segoe UI", system-ui, sans-serif';
function sprite(W, H, height) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
  sp.scale.set(height * W / H, height, 1);
  sp.renderOrder = 22;
  return { sp, g: canvas.getContext('2d'), tex };
}
const rounded = (g, x, y, w, h, r) => {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);         // Safari prima della 16
};

/** Targhetta a due righe: il nome piccolo nel colore della freccia, il valore grande in bianco. Costante sullo schermo. */
function badge(color, title, height = 0.066) {
  const W = 760, H = 230, { sp, g, tex } = sprite(W, H, height);
  let text = null;
  sp.userData.set = (value) => {
    if (value === text) return;
    text = value;
    g.clearRect(0, 0, W, H);
    g.font = `600 40px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = '5px';
    const tw = g.measureText(title).width;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.font = `700 76px ${FONT}`;
    const vw = g.measureText(value).width;
    const bw = Math.min(W - 24, Math.max(tw, vw) + 112), bh = 176, x0 = (W - bw) / 2, y0 = (H - bh) / 2;
    // fondo scuro con ombra morbida e bordo del colore della freccia
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 22; g.shadowOffsetY = 6;
    g.fillStyle = 'rgba(9,16,27,0.84)';
    rounded(g, x0, y0, bw, bh, 34); g.fill();
    g.restore();
    g.strokeStyle = color; g.lineWidth = 4; g.globalAlpha = 0.85;
    rounded(g, x0 + 2, y0 + 2, bw - 4, bh - 4, 32); g.stroke();
    g.globalAlpha = 1;
    // barretta colorata a sinistra
    g.fillStyle = color;
    rounded(g, x0 + 26, y0 + 34, 9, bh - 68, 4.5); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `600 40px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = '5px';
    g.fillStyle = color; g.fillText(title, x0 + 60, y0 + 66);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.font = `700 76px ${FONT}`; g.fillStyle = '#ffffff';
    g.fillText(value, x0 + 58, y0 + 146);
    tex.needsUpdate = true;
  };
  return sp;
}

/** Scritta piccola senza fondo (i numeri dei cerchi), con un'ombra per staccarla dall'acqua. */
function tag(text, height = 0.03) {
  const W = 300, H = 110, { sp, g, tex } = sprite(W, H, height);
  g.font = `600 58px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 10;
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(text, W / 2, H / 2);
  tex.needsUpdate = true;
  return sp;
}

/** Etichetta semplice a una riga (il cartello sopra la boa). */
function label(color, height = 0.042, aspect = 5) {
  const W = 128 * aspect, { sp, g, tex } = sprite(W, 128, height);
  let text = null;
  sp.userData.set = (t) => {
    if (t === text) return;
    text = t;
    g.clearRect(0, 0, W, 128);
    g.font = `bold 50px ${FONT}`;
    const w = Math.min(W - 20, g.measureText(t).width + 44);
    g.fillStyle = 'rgba(8,18,31,0.72)';
    rounded(g, (W - w) / 2, 22, w, 84, 20); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, W / 2, 66, W - 60);
    tex.needsUpdate = true;
  };
  return sp;
}

const COLORS = { true: '#4fb0ff', app: '#ffd23f', boat: '#5ef08a' };
const TITLES = { true: 'VENTO REALE', app: 'VENTO APPARENTE', boat: 'VELOCITÀ BARCA' };

/** Il triangolo dei venti intorno alla barca, come visto dall'alto. */
export class WindTriangle {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    for (const kn of RINGS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(kn * M_PER_KN - 0.035, kn * M_PER_KN + 0.035, 128).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, toneMapped: false }));
      ring.renderOrder = 18;
      this.root.add(ring);
    }
    this.ringLabels = RINGS.map((kn) => { const l = tag(kn === 20 ? '20 nodi' : `${kn}`); this.root.add(l); return l; });
    this.arrows = {}; this.shadows = {}; this.labels = {};
    for (const k of ['true', 'app', 'boat']) {
      this.shadows[k] = arrowMesh(0x05080d, 0.45, 19);
      this.arrows[k] = arrowMesh(new THREE.Color(COLORS[k]), 1, 20);
      this.labels[k] = badge(COLORS[k], TITLES[k]);
      this.root.add(this.shadows[k], this.arrows[k], this.labels[k]);
    }
    // il lato che chiude il triangolo, tratteggiato: il vento creato dal moto della barca
    this.motion = dashMesh(new THREE.Color(COLORS.boat), 0.55, 20);
    this.root.add(this.motion);
  }

  /** Centro del triangolo rispetto alla barca (metri della scena): la vista dall'alto lo inquadra tutto. */
  focus(s) {
    const v = windVectors(s), k = M_PER_KN;
    const tx = -(v.true.x + v.app.x) / 2 * k, tz = (v.true.y + v.app.y) / 2 * k;
    return { x: tx * 0.55 + v.boat.x * k * 0.1, z: tz * 0.55 - v.boat.y * k * 0.1 };
  }

  update(s, on, waves, camera) {
    this.root.visible = on;
    if (!on) return;
    this.root.position.set(s.pos.x, waves.amp + 0.15, -s.pos.y);
    const v = windVectors(s), k = M_PER_KN;
    const L = (p) => ({ x: p.x * k, z: -p.y * k });                       // nodi -> metri locali della scena
    const O = { x: 0, z: 0 }, tT = L({ x: -v.true.x, y: -v.true.y }), tA = L({ x: -v.app.x, y: -v.app.y }), tip = L(v.boat);
    // frecce sottili con punta slanciata e un filo di contorno scuro per staccarle dall'acqua
    const draw = (key, a, b) => { setArrow(this.shadows[key], a, b, 0.34, 1.5, 0.5); setArrow(this.arrows[key], a, b, 0.17, 1.3, 0.36); };
    draw('true', tT, O);
    draw('app', tA, O);
    draw('boat', O, tip);
    setDash(this.motion, tT, tA, 0.1);
    const kn = Math.hypot(v.boat.x, v.boat.y);
    this.arrows.boat.visible = this.shadows.boat.visible = this.labels.boat.visible = kn > 0.3;
    // etichette appena oltre la coda dei venti e la punta della barca
    const beyond = (p, d) => { const l = Math.hypot(p.x, p.z) || 1; return { x: p.x * (1 + d / l), z: p.z * (1 + d / l) }; };
    const place = (key, p, text) => { const q = beyond(p, 1.6); this.labels[key].position.set(q.x, 0, q.z); this.labels[key].userData.set(text); };
    place('true', tT, `${s.tws.toFixed(1)} nodi`);
    place('app', tA, `${s.aws.toFixed(1)} nodi · ${Math.abs(s.awa).toFixed(0)}°`);
    // le code dei due venti sono vicine: le targhette si scostano ognuna dal suo lato sullo schermo
    const sx = (p) => new THREE.Vector3(p.x, 0, p.z).add(this.root.position).project(camera).x;
    const appRight = sx(tA) > sx(tT);
    this.labels.true.center.set(appRight ? 0.92 : 0.08, 0.5);
    this.labels.app.center.set(appRight ? 0.08 : 0.92, 0.5);
    place('boat', tip, `${kn.toFixed(1)} nodi`);
    // i numeri dei cerchi a poppa, dove non ci sono frecce
    const back = dirVec(s.heading + 180);
    this.ringLabels.forEach((l, i) => l.position.set(back.x * (RINGS[i] * k + 0.6), 0, -back.y * (RINGS[i] * k + 0.6)));
  }
}

const PLUME_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLUME_FRAG = /* glsl */`
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
void main() {
  float a = opacity * smoothstep(0.0, 0.08, vUv.x) * pow(1.0 - vUv.x, 1.3) * (1.0 - vUv.y * vUv.y);
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}`;

/** Aria sporca: il cono di vento disturbato che parte dalle vele lungo il vento apparente. */
export class DirtyAir {
  constructor() {
    this.length = 90;                       // circa 8 volte l'altezza dell'albero
    this.n = 24;
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
    const uv = [], idx = [];
    for (let i = 0; i <= n; i++) { uv.push(i / n, -1, i / n, 1); if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xc77dff) }, opacity: { value: 0.6 } },
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  update(s, on, waves) {
    const v = windVectors(s), aws = Math.hypot(v.app.x, v.app.y);
    this.root.visible = on && aws > 0.5;
    if (!this.root.visible) return;
    const d = { x: v.app.x / aws, y: v.app.y / aws }, nrm = { x: -d.y, y: d.x };
    const y = waves.amp + 0.06, L = this.length, width = (dist) => 3 + dist * 0.3;
    const at = (dist, side) => ({ x: s.pos.x + d.x * dist + nrm.x * side, z: -(s.pos.y + d.y * dist + nrm.y * side) });
    const p = this.mesh.geometry.attributes.position.array;
    for (let i = 0; i <= this.n; i++) {
      const dist = i / this.n * L, w = width(dist) / 2;
      const l = at(dist, w), r = at(dist, -w);
      p.set([l.x, y, l.z, r.x, y, r.z], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    // con le vele che sbattono l'aria sporca quasi sparisce
    this.mat.uniforms.opacity.value = 0.6 * (1 - 0.75 * Math.max(s.mainLuff, s.jibLuff));
  }
}

const ARROW_FRAG = /* glsl */`
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(color, opacity * (0.12 + 0.88 * vUv.x));      // la coda sfuma, la punta e' piena
  #include <colorspace_fragment>
}`;

/** Freccia curva piatta (raggio r, larga w) che gira in senso antiorario per span gradi, gia' distesa sull'acqua. */
function curvedArrow(r, w, spanDeg) {
  const n = 48, span = spanDeg * Math.PI / 180, head = 3.0 / r, body = span - head;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = body * i / n;
    for (const rr of [r - w / 2, r + w / 2]) { pos.push(rr * Math.cos(a), rr * Math.sin(a), 0); uv.push(i / n * 0.9, 0); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const b = pos.length / 3;
  pos.push((r - w * 1.2) * Math.cos(body), (r - w * 1.2) * Math.sin(body), 0, (r + w * 1.2) * Math.cos(body), (r + w * 1.2) * Math.sin(body), 0,
           r * Math.cos(span), r * Math.sin(span), 0);
  uv.push(0.9, 0, 0.9, 0, 1, 0);
  idx.push(b, b + 1, b + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g.rotateX(-Math.PI / 2);                      // (est, nord) del lago -> (x, -z) della scena
}

/** Frecce sull'acqua intorno alle boe: si girano in senso antiorario, lasciandole a sinistra.
 *  Compaiono solo da vicino (da lontano la boa la indica il freccione giallo): quella della prossima boa
 *  e' accesa e gira, e un cartello sopra la boa lo ricorda (con gli aiuti). */
export class RoundingArrows {
  constructor(count) {
    this.root = new THREE.Group();
    const geo = curvedArrow(8, 1.1, 250);
    this.arrows = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.9 } },
        vertexShader: PLUME_VERT, fragmentShader: ARROW_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = 6;
      this.root.add(m);
      return m;
    });
    this.sign = label('#ffd94d', 0.04, 9);
    this.root.add(this.sign);
  }

  update(sim, waves) {
    const s = sim.shown, y = waves.amp + 0.08, t = s.time;
    const near = (p) => clamp((MARK_FAR - len(sub(p, s.pos))) / (MARK_FAR - MARK_NEAR), 0, 1);
    this.arrows.forEach((m, i) => {
      const p = sim.marks[i], next = i === sim.nextMark, k = near(p);
      m.visible = k > 0;
      m.position.set(p.x, y, -p.y);
      m.rotation.y = next ? t * 0.9 : 0;                 // y positivo = antiorario visto dall'alto
      m.material.uniforms.opacity.value = (next ? 0.9 : 0.3) * k;
    });
    const p = sim.marks[sim.nextMark], k = near(p);
    this.sign.visible = sim.settings.aids && k > 0;
    this.sign.material.opacity = k;
    this.sign.position.set(p.x, 4.4, -p.y);
    this.sign.userData.set(`${MARK_NAMES[sim.nextMark]} · lasciala a sinistra ↺`);
  }
}
