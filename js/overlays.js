// Aiuti disegnati sull'acqua, da accendere nel menu: il triangolo dei venti (vento reale, vento apparente,
// velocita' della barca) e l'aria sporca che le vele lasciano sottovento.
import * as THREE from './vendor/three.module.min.js';
import { dirVec, KNOT } from './physics.js';
import { MARK_NAMES } from './sim.js';

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

/** Freccia da a a b (coordinate locali x, z), larga w, con punta lunga head (0 = solo asta). */
function setArrow(mesh, a, b, w, head) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  mesh.visible = L > 0.05;
  if (!mesh.visible) return;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const hl = Math.min(head, L * 0.6), hw = head > 0 ? Math.max(w * 1.6, hl * 0.6) : 0;
  const cx = b.x - ux * hl, cz = b.z - uz * hl;
  const p = mesh.geometry.attributes.position.array;
  const put = (i, x, z) => { p[i * 3] = x; p[i * 3 + 1] = 0; p[i * 3 + 2] = z; };
  put(0, a.x + nx * w / 2, a.z + nz * w / 2); put(1, a.x - nx * w / 2, a.z - nz * w / 2);
  put(2, cx - nx * w / 2, cz - nz * w / 2); put(3, cx + nx * w / 2, cz + nz * w / 2);
  put(4, cx + nx * hw, cz + nz * hw); put(5, cx - nx * hw, cz - nz * hw); put(6, b.x, b.z);
  mesh.geometry.attributes.position.needsUpdate = true;
}

/** Etichetta che resta della stessa grandezza sullo schermo; si ridisegna solo quando cambia il testo. */
function label(color, height = 0.042, aspect = 5) {
  const W = 128 * aspect, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
  sprite.scale.set(height * aspect, height, 1);
  sprite.renderOrder = 22;
  let text = null;
  sprite.userData.set = (t) => {
    if (t === text) return;
    text = t;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, 128);
    g.font = 'bold 50px "Avenir Next", "Segoe UI", sans-serif';
    const w = Math.min(W - 20, g.measureText(t).width + 44);
    g.fillStyle = 'rgba(8,18,31,0.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect((W - w) / 2, 22, w, 84, 20); else g.rect((W - w) / 2, 22, w, 84);     // Safari prima della 16
    g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, W / 2, 66, W - 60);
    tex.needsUpdate = true;
  };
  return sprite;
}

/** Il triangolo dei venti intorno alla barca, come visto dall'alto. */
export class WindTriangle {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    for (const kn of RINGS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(kn * M_PER_KN - 0.07, kn * M_PER_KN + 0.07, 96).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, toneMapped: false }));
      ring.renderOrder = 18;
      this.root.add(ring);
    }
    this.ringLabels = RINGS.map((kn) => { const l = label('rgba(255,255,255,0.8)', 0.028); l.userData.set(kn === 20 ? '20 nodi' : `${kn}`); this.root.add(l); return l; });
    const css = { true: '#59b3ff', app: '#ffd933', boat: '#6dff7a' };
    this.arrows = {}; this.shadows = {}; this.labels = {};
    for (const k of ['true', 'app', 'boat']) {
      this.shadows[k] = arrowMesh(0x000000, 0.35, 19);
      this.arrows[k] = arrowMesh(new THREE.Color(css[k]), 0.95, 20);
      this.labels[k] = label(css[k]);
      this.root.add(this.shadows[k], this.arrows[k], this.labels[k]);
    }
    // il lato che chiude il triangolo: il vento creato dal moto della barca
    this.motion = arrowMesh(new THREE.Color(css.boat), 0.45, 20);
    this.root.add(this.motion);
  }

  update(s, on, waves, camera) {
    this.root.visible = on;
    if (!on) return;
    this.root.position.set(s.pos.x, waves.amp + 0.15, -s.pos.y);
    const v = windVectors(s), k = M_PER_KN;
    const L = (p) => ({ x: p.x * k, z: -p.y * k });                       // nodi -> metri locali della scena
    const O = { x: 0, z: 0 }, tT = L({ x: -v.true.x, y: -v.true.y }), tA = L({ x: -v.app.x, y: -v.app.y }), tip = L(v.boat);
    const draw = (key, a, b) => { setArrow(this.shadows[key], a, b, 0.95, 2.6); setArrow(this.arrows[key], a, b, 0.65, 2.3); };
    draw('true', tT, O);
    draw('app', tA, O);
    draw('boat', O, tip);
    setArrow(this.motion, tT, tA, 0.22, 0);
    const kn = Math.hypot(v.boat.x, v.boat.y);
    this.arrows.boat.visible = this.shadows.boat.visible = this.labels.boat.visible = kn > 0.3;
    // etichette appena oltre la coda dei venti e la punta della barca
    const beyond = (p, d) => { const l = Math.hypot(p.x, p.z) || 1; return { x: p.x * (1 + d / l), z: p.z * (1 + d / l) }; };
    const place = (key, p, text) => { const q = beyond(p, 2.2); this.labels[key].position.set(q.x, 0, q.z); this.labels[key].userData.set(text); };
    place('true', tT, `VENTO REALE ${s.tws.toFixed(0)} nodi`);
    place('app', tA, `APPARENTE ${s.aws.toFixed(0)} nodi`);
    // le code dei due venti sono vicine: le etichette si scostano ognuna dal suo lato sullo schermo
    const sx = (p) => new THREE.Vector3(p.x, 0, p.z).add(this.root.position).project(camera).x;
    const appRight = sx(tA) > sx(tT);
    this.labels.true.center.set(appRight ? 0.95 : 0.05, 0.5);
    this.labels.app.center.set(appRight ? 0.05 : 0.95, 0.5);
    place('boat', tip, `BARCA ${kn.toFixed(1)} nodi`);
    // i numeri dei cerchi a poppa, dove non ci sono frecce
    const back = dirVec(s.heading + 180);
    this.ringLabels.forEach((l, i) => l.position.set(back.x * RINGS[i] * k, 0, -back.y * RINGS[i] * k));
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
    // particelle d'aria che scorrono via dalle vele col vento apparente
    const count = 70;
    this.seeds = Array.from({ length: count }, (_, i) => ({ s: i / count, side: Math.sin(i * 12.9898) * 0.8 }));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x4a1d63, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.root = new THREE.Group();
    this.root.add(this.mesh, this.points);
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
    const q = this.points.geometry.attributes.position.array, speed = aws * KNOT;
    this.seeds.forEach((sd, i) => {
      const f = (sd.s + s.time * speed / L) % 1, dist = f * L;
      const pt = at(dist, sd.side * width(dist) / 2);
      q[i * 3] = pt.x; q[i * 3 + 1] = y + 0.02; q[i * 3 + 2] = pt.z;
    });
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 0.8 * (1 - 0.6 * Math.max(s.mainLuff, s.jibLuff));
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
 *  Quella della prossima boa e' accesa e gira; un cartello sopra la boa lo ricorda (con gli aiuti). */
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
    const y = waves.amp + 0.08, t = sim.shown.time;
    this.arrows.forEach((m, i) => {
      const p = sim.marks[i], next = i === sim.nextMark;
      m.position.set(p.x, y, -p.y);
      m.rotation.y = next ? t * 0.9 : 0;                 // y positivo = antiorario visto dall'alto
      m.material.uniforms.opacity.value = next ? 0.9 : 0.3;
    });
    const p = sim.marks[sim.nextMark];
    this.sign.visible = sim.settings.aids;
    this.sign.position.set(p.x, 4.4, -p.y);
    this.sign.userData.set(`${MARK_NAMES[sim.nextMark]} · lasciala a sinistra ↺`);
  }
}
