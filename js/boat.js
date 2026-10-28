// Il modello 3D della barca Sportaction. Riferimento locale: prua verso -Z, dritta verso +X,
// Y in alto, linea di galleggiamento a y = 0 (come nella versione Mac).
import * as THREE from './vendor/three.module.min.js';
import { rad, clamp, dirVec, mainReefs, stormJib } from './physics.js';
import { sailTexture, hullTexture, boomTexture, foamTexture, dropTexture, stormTexture, spiTexture, mainChord } from './textures.js';

// Protagonist 7.50, misure dal certificato ORC: lunghezza 7,495 m, larghezza 2,422 m, pescaggio 1,76 m;
// albero 2,67 m dietro lo strallo (J), che e' 0,26 m dietro la prua; boma 1,13 m sopra la coperta (BAS),
// inferitura della randa 8,50 m (P), strallo a 8,645 m sull'albero (I).
export const LOA = 7.5, HL = LOA / 2, BEAM = 2.42;
export const MAST_Z = -0.82, BOOM_Y = 1.86, HEAD_Y = 10.36;
const STAY0 = new THREE.Vector3(0, 0.86, -3.49), STAY1 = new THREE.Vector3(0, 9.37, MAST_Z);
const TACK = new THREE.Vector3(0, 0.95, -3.45);
const JIB_FOOT = 3.83, COCKPIT_Z = 0.5, FLOOR_Y = 0.30, SIDE_DECK = 0.36;
// barra: lunga 1,7 m dall'asse del timone, la punta 0,55 m sull'acqua; prolunga di 1,2 m incernierata in punta
const TILLER_L = 1.697, TILLER_Y = 0.552, EXT_L = 1.2;
// scotta randa: bozzello sul boma a 2,1 m dall'albero, bozzello con strozzatore sul fondo del pozzetto, al centro,
// 35 cm davanti alla punta della barra
const MS_BOOM = 2.1, MS_Z = 1.3;

export const halfBeam = (t) => t < 0.6 ? BEAM / 2 * Math.pow(Math.sin(t / 0.6 * Math.PI / 2), 0.82) : BEAM / 2 * (1 - 0.08 * ((t - 0.6) / 0.4) ** 2);
export const sheer = (t) => 0.62 + 0.22 * Math.pow(1 - t, 1.5);
// prua con un po' di slancio: il piede di ruota esce dall'acqua circa mezzo metro dietro la prua
const keelLine = (t) => 0.22 - 0.27 * t - 0.5 * Math.sin(Math.PI * Math.pow(t, 0.75));
export const tAt = (z) => clamp((z + HL) / LOA, 0, 1);
export function deckY(t, x) {
  const b = Math.max(0.01, halfBeam(t)), u = clamp(x / b, -1, 1);
  return sheer(t) + 0.06 * (1 - u * u) * Math.min(1, b / 0.6);
}
function waterlineHalf(t) {
  const top = sheer(t), bot = keelLine(t);
  if (bot >= 0) return 0.05;
  const sn = Math.pow(top / (top - bot), 1 / 0.85);
  return halfBeam(t) * Math.pow(Math.sqrt(Math.max(0, 1 - Math.min(1, sn * sn))), 0.62);
}

const std = (color, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function geometry(pos, idx, uv = null, normals = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); else g.computeVertexNormals();
  return g;
}
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
/** Cilindro da a a b (sartie, candelieri, tubi). */
export function rod(a, b, radius, mat, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, d.length(), seg), mat);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Materiale delle vele: la tela in controluce si illumina (il sole passa attraverso). */
function sailMaterial(map, sunDir) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.5, side: THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.sunDirView = sunDir;
    sh.fragmentShader = 'uniform vec3 sunDirView;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.95, 0.85) * max(0.0, -dot(normal, sunDirView)) * 0.55;');
  };
  return m;
}

/** Una persona dell'equipaggio: gambe e braccia snodate, cerata e giubbotto salvagente. Guarda verso -Z. */
class Sailor {
  constructor(vest, jacket, cap) {
    this.root = new THREE.Group();
    const skin = std(0xdba885, 0.6), trousers = std(0x1f2438, 0.8), jk = std(jacket, 0.55), vs = std(vest, 0.6);
    const capsule = (r, h, m) => mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), 4, 12), m);
    this.hips = []; this.knees = []; this.shoulders = []; this.elbows = [];
    for (const sd of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sd * 0.1, 0, 0);
      const thigh = capsule(0.078, 0.46, trousers); thigh.rotation.x = Math.PI / 2; thigh.position.z = -0.22; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.z = -0.44;
      const shin = capsule(0.065, 0.46, trousers); shin.position.y = -0.22; knee.add(shin);
      const shoe = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), std(0xe6e6e6, 0.6)); shoe.position.set(0, -0.46, -0.07); knee.add(shoe);
      hip.add(knee); this.root.add(hip);
      this.hips.push(hip); this.knees.push(knee);
    }
    this.torso = new THREE.Group(); this.root.add(this.torso);
    const pelvis = mesh(new THREE.BoxGeometry(0.32, 0.16, 0.22), trousers); pelvis.position.y = 0.05; this.torso.add(pelvis);
    const body = capsule(0.15, 0.58, jk); body.position.y = 0.33; this.torso.add(body);
    const vestN = capsule(0.19, 0.42, vs); vestN.position.y = 0.42; vestN.scale.set(1.05, 1, 0.82); this.torso.add(vestN);
    const collar = mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 16), vs); collar.rotation.x = Math.PI / 2; collar.position.y = 0.66; this.torso.add(collar);
    const head = mesh(new THREE.SphereGeometry(0.1, 16, 12), skin); head.position.y = 0.79; this.torso.add(head);
    const capM = std(cap, 0.7);
    const capG = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 16), capM); capG.position.y = 0.865; this.torso.add(capG);
    const visor = mesh(new THREE.BoxGeometry(0.15, 0.015, 0.12), capM); visor.position.set(0, 0.84, -0.13); this.torso.add(visor);
    const glasses = mesh(new THREE.BoxGeometry(0.17, 0.035, 0.02), std(0x0d0d0d, 0.1)); glasses.position.set(0, 0.8, -0.095); this.torso.add(glasses);
    for (const sd of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sd * 0.22, 0.58, 0);
      const upper = capsule(0.052, 0.32, jk); upper.position.y = -0.15; sh.add(upper);
      const el = new THREE.Group(); el.position.y = -0.3;
      const fore = capsule(0.046, 0.3, jk); fore.position.y = -0.14; el.add(fore);
      const hand = mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); hand.position.y = -0.3; el.add(hand);
      sh.add(el); this.torso.add(sh);
      this.shoulders.push(sh); this.elbows.push(el);
    }
  }
  /** Seduto sul bordo con i piedi nel pozzetto; hike = quanto si sporge fuori (0...1). */
  sit(hike, arms) {
    this.torso.rotation.x = 0.08 + hike * 0.6;
    for (const h of this.hips) h.rotation.x = 0.15 + hike * 0.15;
    for (const k of this.knees) k.rotation.x = -0.65 - hike * 0.2;
    this.shoulders.forEach((s, i) => { s.rotation.set(arms + hike * 0.3 + (i === 0 ? 0.1 : -0.1), 0, 0); });
    for (const e of this.elbows) e.rotation.set(0.7, 0, 0);
  }
  /** In piedi (dietro la ruota), con le braccia in avanti. */
  stand(armsForward) {
    this.torso.rotation.x = -0.05;
    for (const h of this.hips) h.rotation.x = -Math.PI / 2;
    for (const k of this.knees) k.rotation.x = Math.PI / 2 - 0.05;
    for (const s of this.shoulders) s.rotation.set(armsForward, 0, 0);
    for (const e of this.elbows) e.rotation.set(0.5, 0, 0);
  }
  /** Dal sistema di `node` a quello della barca (il genitore di root). */
  chain(node) {
    const list = [], m = new THREE.Matrix4();
    for (let o = node; o; o = o.parent) { list.push(o); if (o === this.root) break; }
    for (let i = list.length - 1; i >= 0; i--) { list[i].updateMatrix(); m.multiply(list[i].matrix); }
    return m;
  }
  /** Porta la mano i (0 sinistra, 1 destra) sul punto p della barca: braccio e avambraccio da 30 cm, gomito in basso e
   *  in fuori (cinematica inversa a due segmenti). Se il punto e' troppo lontano il braccio si tende verso di lui.
   *  Restituisce dove arriva la mano. */
  reach(i, p) {
    const sh = this.shoulders[i], el = this.elbows[i], A = 0.3, B = 0.3;
    const toBoat = this.chain(this.torso);
    const d = p.clone().applyMatrix4(toBoat.clone().invert()).sub(sh.position);
    const dist = clamp(d.length(), 0.1, A + B - 0.002), u = d.normalize();
    // il gomito sta nel piano del braccio, dalla parte del polo (giu', in fuori, un po' indietro)
    const pole = V(i ? 0.6 : -0.6, -1, 0.4), w = pole.addScaledVector(u, -pole.dot(u)).normalize();
    const a = Math.acos(clamp((A * A + dist * dist - B * B) / (2 * A * dist), -1, 1));
    const upper = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    sh.quaternion.setFromUnitVectors(DOWN, upper);
    const hand = sh.position.clone().addScaledVector(u, dist), elbow = sh.position.clone().addScaledVector(upper, A);
    const fore = hand.clone().sub(elbow).normalize().applyQuaternion(sh.quaternion.clone().invert());
    el.quaternion.setFromUnitVectors(DOWN, fore);
    return hand.applyMatrix4(toBoat);
  }
}

/** Scafo (superficie esterna), con le coordinate della tela per le scritte. */
export function hullGeometry() {
  const K = 56, M = 36, pos = [], uv = [], idx = [];
  for (let k = 0; k <= K; k++) {
    const t = k / K, z = -HL + LOA * t;
    const b = Math.max(0.01, halfBeam(t)), top = sheer(t), bot = keelLine(t);
    for (let m = 0; m <= M; m++) {
      const th = m / M * Math.PI, c = Math.cos(th), s = Math.sin(th);
      pos.push(b * Math.sign(c || 1) * Math.pow(Math.abs(c), 0.62), top - (top - bot) * Math.pow(s, 0.85), z);
      uv.push(m <= M / 2 ? 0.5 * (1 - t) : 0.5 + 0.5 * t, (pos[pos.length - 2] + 0.45) / 1.6);
    }
  }
  // triangoli rivolti verso l'esterno
  for (let k = 0; k < K; k++) for (let m = 0; m < M; m++) {
    const a = k * (M + 1) + m, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return geometry(pos, idx, uv);
}

export class BoatModel {
  constructor() {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.sunDirView = { value: new THREE.Vector3(0, 1, 0) };
    this.wheel = false;
    this.crewHidden = false;
    this.smooth = { pitch: 0, roll: 0, heave: 0 };
    this.lineMat = std(0x262626, 0.6);
    this.textures = {};
    this.hullMat = new THREE.MeshStandardMaterial({ roughness: 0.18 });
    this.mainMat = sailMaterial(null, this.sunDirView);
    this.jibMat = sailMaterial(null, this.sunDirView);
    this.stormMat = sailMaterial(stormTexture(), this.sunDirView);
    this.spiMat = sailMaterial(spiTexture(), this.sunDirView);
    this.buildHull();
    this.buildDeck();
    this.buildRig();
    this.buildFittings();
    this.buildCrew();
    this.buildSails();
    this.buildBowWave();
    this.setStyle('black');
  }

  /** Barca nera (SPORTACTION.IT sul fiocco) o bianca (ITA 09). */
  setStyle(style) {
    if (this.style === style) return;
    this.style = style;
    const k = (name, make) => this.textures[style + name] ??= make();
    this.mainMat.map = k('main', () => sailTexture(style, true));
    this.reefBundle.material.color.set(style === 'black' ? 0x1c1d20 : 0xeeeeea);
    this.jibMat.map = k('jib', () => sailTexture(style, false));
    this.hullMat.map = k('hull', () => hullTexture(style));
    for (const m of [this.mainMat, this.jibMat, this.hullMat]) m.needsUpdate = true;
  }

  buildHull() {
    this.tilt.add(mesh(hullGeometry(), this.hullMat));
    this.buildTransom();
  }

  buildTransom() {
    // specchio di poppa aperto sul pozzetto
    const tb = halfBeam(1), ttop = sheer(1), tbot = keelLine(1), inner = tb - SIDE_DECK, cell = 0.035;
    const tp = [], ti = [];
    for (let y = tbot; y < ttop; y += cell) for (let x = -tb; x < tb; x += cell) {
      const cx = x + cell / 2, cy = y + cell / 2;
      const sn = Math.pow(clamp((ttop - cy) / (ttop - tbot), 0, 1), 1 / 0.85);
      const xmax = tb * Math.pow(Math.sqrt(Math.max(0, 1 - sn * sn)), 0.62);
      if (Math.abs(cx) <= xmax && (cy <= FLOOR_Y || Math.abs(cx) >= inner)) {
        const base = tp.length / 3;
        const zt = HL - 0.001;
        tp.push(x, y, zt, x + cell, y, zt, x + cell, y + cell, zt, x, y + cell, zt);
        ti.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const tn = new Array(tp.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0));
    const transom = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.2, side: THREE.DoubleSide });
    this.tilt.add(mesh(geometry(tp, ti, null, tn), transom));
    // chiglia con bulbo e timone
    const keelMat = std(0x121212, 0.45);
    const fin = mesh(new THREE.BoxGeometry(0.12, 1.3, 0.9), keelMat); fin.position.y = -1.05; this.tilt.add(fin);
    const bulb = mesh(new THREE.CapsuleGeometry(0.2, 1.1, 6, 12), keelMat); bulb.rotation.x = Math.PI / 2; bulb.position.set(0, -1.56, 0.1); this.tilt.add(bulb);
    this.rudderPivot = new THREE.Group(); this.rudderPivot.position.z = HL - 0.4; this.tilt.add(this.rudderPivot);
    const blade = mesh(new THREE.BoxGeometry(0.05, 1.25, 0.42), keelMat); blade.position.set(0, -0.6, 0.18); this.rudderPivot.add(blade);
    this.tillerNode = new THREE.Group();
    const tiller = mesh(new THREE.BoxGeometry(0.05, 0.06, 1.7), std(0x8c5c2e, 0.4)); tiller.position.set(0, 0.62, -0.85); tiller.rotation.x = -0.08;
    this.tillerNode.add(tiller); this.rudderPivot.add(this.tillerNode);
    // prolunga: asta nera con l'impugnatura in fondo, snodata in punta alla barra; la tiene il timoniere
    this.extension = mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 8), std(0x30343a, 0.35, 0.6));
    this.extGrip = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 10), std(0x111111, 0.8));
    this.extJoint = mesh(new THREE.SphereGeometry(0.025, 10, 8), std(0x111111, 0.5));
    this.tilt.add(this.extension, this.extGrip, this.extJoint);
    const stock = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), this.lineMat); stock.position.y = 0.45; this.rudderPivot.add(stock);
    // ruota su colonnina (opzione)
    const steel = std(0xd1d1d1, 0.2, 1);
    this.wheelNode = new THREE.Group();
    const pedestal = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 12), steel); pedestal.position.set(0, 0.68, 2.65); this.wheelNode.add(pedestal);
    const compass = mesh(new THREE.SphereGeometry(0.11, 16, 12), std(0x141414, 0.15)); compass.position.set(0, 1.1, 2.65); this.wheelNode.add(compass);
    this.wheelSpin = new THREE.Group(); this.wheelSpin.position.set(0, 0.95, 2.8); this.wheelNode.add(this.wheelSpin);
    this.wheelSpin.add(mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 40), steel));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; this.wheelSpin.add(rod(V(0, 0, 0), V(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0), 0.015, steel)); }
    const mark = mesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), std(0xdd2222, 0.5)); mark.position.y = 0.5; this.wheelSpin.add(mark);
    this.wheelNode.visible = false;
    this.tilt.add(this.wheelNode);
  }

  /** Coperta piatta con passavanti, pozzetto aperto a poppa, tuga bassa con oblo' tondi. */
  buildDeck() {
    const zs = [];
    for (let i = 0; i <= 56; i++) zs.push(-HL + LOA * i / 56);
    zs.push(COCKPIT_Z); zs.sort((a, b) => a - b);
    const cols = 10, row = cols + 3, pos = [], idx = [];
    for (const z of zs) {
      const t = tAt(z), b = halfBeam(t) * 0.995, inner = Math.max(0, b - SIDE_DECK);
      const xs = [-b, -inner];
      for (let c = 1; c < cols; c++) xs.push(-inner + 2 * inner * c / cols);
      xs.push(inner, b);
      for (const x of xs) pos.push(x, deckY(t, x), z);
    }
    for (let k = 0; k < zs.length - 1; k++) {
      const cockpit = (zs[k] + zs[k + 1]) / 2 > COCKPIT_Z;
      for (let c = 0; c < row - 1; c++) {
        if (cockpit && c >= 1 && c < row - 2) continue;
        const a = k * row + c, b = a + 1, cc = a + row, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    this.tilt.add(mesh(geometry(pos, idx), std(0xd9d9d3, 0.75)));
    // pozzetto: pagliolo, fianchi e paratia
    const cp = [], ci = [];
    const czs = zs.filter((z) => z >= COCKPIT_Z - 0.001);
    czs.forEach((z, k) => {
      const t = tAt(z), inner = halfBeam(t) * 0.995 - SIDE_DECK, top = deckY(t, inner);
      cp.push(-inner, top, z, -inner, FLOOR_Y, z, inner, FLOOR_Y, z, inner, top, z);
      if (k > 0) {
        const a = (k - 1) * 4, b = k * 4;
        ci.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    });
    ci.push(0, 1, 3, 1, 2, 3);
    this.tilt.add(mesh(geometry(cp, ci), new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6, side: THREE.DoubleSide })));
    // tuga bassa e arrotondata
    const shape = new THREE.Shape(), w = 1.45 / 2, h = 0.25, r = 0.15;
    shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r); shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
    // tuga: comincia poco davanti all'albero e arriva al pozzetto, come sulla Protagonist
    const cabinLen = COCKPIT_Z - (MAST_Z - 0.35) - 0.08;
    const cabinGeo = new THREE.ExtrudeGeometry(shape, { depth: cabinLen, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 3 });
    const cabin = mesh(cabinGeo, std(0xf2f2f2, 0.25));
    cabin.position.set(0, 0.76, COCKPIT_Z - cabinLen - 0.08);
    this.tilt.add(cabin);
    const glass = std(0x0a0a0a, 0.08);
    const port = (x, y, z, axis) => {
      const p = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), glass);
      p.position.set(x, y, z);
      if (axis === 'z') p.rotation.x = Math.PI / 2; else p.rotation.z = Math.PI / 2;
      this.tilt.add(p);
    };
    for (const sd of [-1, 1]) {
      port(sd * 0.45, 0.86, COCKPIT_Z + 0.005, 'z');
      for (const z of [-0.55, 0.05]) port(sd * 0.795, 0.86, z, 'x');
    }
    const comp = mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), std(0x1f1f1f, 0.3)); comp.position.set(0, 0.66, COCKPIT_Z + 0.01); this.tilt.add(comp);
    // pulpiti: a poppa ai due angoli, a prua
    const steel = std(0xd1d1d1, 0.22, 1);
    for (const sd of [-1, 1]) {
      const pts = [V(sd * 1.05, 0.64, 2.94), V(sd * 1.05, 1.24, 3.04), V(sd * 0.95, 1.24, HL - 0.1), V(sd * 0.95, 0.62, HL - 0.05)];
      for (let i = 0; i < 3; i++) this.tilt.add(rod(pts[i], pts[i + 1], 0.014, steel));
    }
    const top = 1.42;
    this.tilt.add(rod(V(-0.42, 0.82, -2.82), V(-0.42, top, -2.92), 0.014, steel));
    this.tilt.add(rod(V(0.42, 0.82, -2.82), V(0.42, top, -2.92), 0.014, steel));
    this.tilt.add(rod(V(-0.42, top, -2.92), V(0, top, -HL + 0.2), 0.014, steel));
    this.tilt.add(rod(V(0.42, top, -2.92), V(0, top, -HL + 0.2), 0.014, steel));
  }

  buildRig() {
    const paint = std(0xededed, 0.3, 0.2), mz = MAST_Z;
    this.tilt.add(rod(V(0, 1.0, mz), V(0, HEAD_Y + 0.2, mz), 0.06, paint, 12));
    for (const s of [-1, 1]) {
      const chain = V(s * 1.1, 0.72, mz + 0.35), sp1 = V(s * 0.72, 4.0, mz + 0.18), sp2 = V(s * 0.48, 7.0, mz + 0.12);
      this.tilt.add(rod(V(0, 4.0, mz), sp1, 0.018, paint));
      this.tilt.add(rod(V(0, 7.0, mz), sp2, 0.015, paint));
      for (const [a, b] of [[chain, sp1], [sp1, sp2], [sp2, V(0, STAY1.y, mz)], [chain, V(0, 4.0, mz)], [sp1, V(0, 7.0, mz)]]) {
        this.tilt.add(rod(a, b, 0.005, this.lineMat, 5));
      }
    }
    this.tilt.add(rod(STAY0, STAY1, 0.007, this.lineMat, 5));
    this.tilt.add(rod(V(0, HEAD_Y + 0.15, mz), V(0, 0.62, HL - 0.05), 0.006, this.lineMat, 5));
    // boma bianco con SPORTACTION sui due lati
    this.boomPivot = new THREE.Group(); this.boomPivot.position.set(0, BOOM_Y - 0.05, mz); this.tilt.add(this.boomPivot);
    const plain = std(0xf2f2f2, 0.3);
    const lettered = (c) => new THREE.MeshStandardMaterial({ map: boomTexture(c), roughness: 0.3 });
    const boom = mesh(new THREE.BoxGeometry(0.08, 0.14, 3.55), [lettered(0.42), lettered(0.58), plain, plain, plain, plain]);
    boom.position.z = 1.77;
    this.boomPivot.add(boom);
    this.boomPivot.add(rod(V(0, -0.03, 0.95), V(0, -0.6, 0.12), 0.018, std(0x262626, 0.4)));
    const boomBlock = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), std(0x151515, 0.4));
    boomBlock.rotation.z = Math.PI / 2; boomBlock.position.set(0, -0.17, MS_BOOM); this.boomPivot.add(boomBlock);
    // tela dei terzaroli raccolta sul boma
    this.reefBundle = mesh(new THREE.CylinderGeometry(1, 1, 3.1, 12), std(0x1c1d20, 0.6));
    this.reefBundle.rotation.x = Math.PI / 2;
    this.reefBundle.position.set(0, 0.1, 1.65);
    this.reefBundle.visible = false;
    this.boomPivot.add(this.reefBundle);
    // segnavento
    this.windex = new THREE.Group(); this.windex.position.set(0, HEAD_Y + 0.25, mz); this.tilt.add(this.windex);
    const arrow = mesh(new THREE.BoxGeometry(0.02, 0.02, 0.55), std(0x000000)); arrow.position.z = -0.05; this.windex.add(arrow);
    const vane = mesh(new THREE.BoxGeometry(0.01, 0.14, 0.14), std(0xdd2222)); vane.position.z = 0.22; this.windex.add(vane);
  }

  /** Candelieri neri e draglie, winch, trasto, osteriggio, luci di via. */
  buildFittings() {
    const black = std(0x151515, 0.4), wire = std(0xb3b3b3, 0.3, 0.8), steel = std(0xd1d1d1, 0.22, 1);
    for (const sd of [-1, 1]) {
      const tops = [V(sd * 0.42, 1.42, -2.92)], mids = [V(sd * 0.42, 1.12, -2.87)];
      for (const z of [-2.15, -1.05, 0.0, 1.05, 2.1]) {
        const t = tAt(z), x = sd * (halfBeam(t) - 0.06), y = sheer(t);
        this.tilt.add(rod(V(x, y, z), V(x, y + 0.6, z), 0.013, black));
        tops.push(V(x, y + 0.6, z)); mids.push(V(x, y + 0.3, z));
      }
      tops.push(V(sd * 1.05, 1.24, 3.04)); mids.push(V(sd * 1.05, 0.94, 2.99));
      for (const line of [tops, mids]) for (let i = 0; i < line.length - 1; i++) this.tilt.add(rod(line[i], line[i + 1], 0.004, wire, 4));
      const tw = tAt(1.45), wx = sd * (halfBeam(tw) - 0.2);
      for (const [p, r] of [[V(wx, deckY(tw, wx) + 0.07, 1.45), 0.085], [V(sd * 0.45, 1.06, 0.3), 0.065]]) {
        const drum = mesh(new THREE.CylinderGeometry(r, r, 0.13, 16), steel); drum.position.copy(p); this.tilt.add(drum);
        const topc = mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.05, 16), std(0x1f1f1f, 0.5)); topc.position.set(p.x, p.y + 0.09, p.z); this.tilt.add(topc);
      }
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: sd < 0 ? 0xff2020 : 0x20ff50 }));
      light.position.set(sd * 0.18, 0.88, -HL + 0.38); this.tilt.add(light);
    }
    // bozzello della scotta randa sul fondo del pozzetto: base girevole, strozzatore e puleggia; si gira verso la coda
    this.msBlock = new THREE.Group(); this.msBlock.position.set(0, FLOOR_Y, MS_Z); this.tilt.add(this.msBlock);
    const dark = std(0x151515, 0.4);
    const base = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 18), steel); base.position.y = 0.015; this.msBlock.add(base);
    const post = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), steel); post.position.y = 0.08; this.msBlock.add(post);
    for (const sd of [-1, 1]) { const jaw = mesh(new THREE.BoxGeometry(0.02, 0.03, 0.07), dark); jaw.position.set(sd * 0.022, 0.15, 0.03); this.msBlock.add(jaw); }
    const sheave = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 16), dark); sheave.rotation.z = Math.PI / 2; sheave.position.y = 0.21; this.msBlock.add(sheave);
    const glass = std(0x0d1419, 0.08);
    const hatch = mesh(new THREE.BoxGeometry(0.55, 0.05, 0.55), glass); hatch.position.set(0, deckY(tAt(-1.95), 0) + 0.03, -1.95); this.tilt.add(hatch);
    const slide = mesh(new THREE.BoxGeometry(0.6, 0.04, 0.6), glass); slide.position.set(0, 1.02, 0.15); this.tilt.add(slide);
    // scotte (aggiornate a ogni fotogramma): la randa a paranco con tre passate e la coda in mano al prodiere
    const line = () => mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 6), this.lineMat);
    this.mainSheetLines = [line(), line(), line()];
    this.mainTail = [line(), line(), line()];
    this.jibSheetLine = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), this.lineMat);
    this.tilt.add(...this.mainSheetLines, ...this.mainTail, this.jibSheetLine);
    this.haul = 0;
    // tangone: tiene fuori il fiocco quando si va a farfalla
    this.pole = mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 8), std(0xc8ccd0, 0.3, 0.8));
    this.pole.visible = false;
    this.tilt.add(this.pole);
  }

  buildCrew() {
    this.crew = [new Sailor(0xe62619, 0x26385f, 0xf2f2f2), new Sailor(0xffb80d, 0xebebeb, 0x1a4db3)];
    for (const p of this.crew) { p.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.tilt.add(p.root); }
  }

  buildSails() {
    const make = (R, C, mat) => {
      const n = (R + 1) * (C + 1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
      const uv = [];
      for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) uv.push(c / C, r / R);
      for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) uv.push(1 - c / C, r / R);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const idx = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const a = r * (C + 1) + c, b = a + 1, cc = a + C + 1, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
        idx.push(a + n, cc + n, b + n, b + n, cc + n, d + n);
      }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.frustumCulled = false;
      this.tilt.add(m);
      return { mesh: m, R, C, n };
    };
    this.main = make(14, 10, this.mainMat);
    this.jib = make(12, 8, this.jibMat);
    this.spiSail = make(14, 12, this.spiMat);
    // tangone, braccio e scotta dello spi; fiocco avvolto sullo strallo
    this.spiPole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), std(0xc8ccd0, 0.3, 0.8));
    this.spiGuy = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), this.lineMat);
    this.spiSheet = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), this.lineMat);
    this.furled = mesh(new THREE.CylinderGeometry(0.05, 0.035, 1, 8), std(0x2a2b2e, 0.7));
    this.tilt.add(this.spiPole, this.spiGuy, this.spiSheet, this.furled);
    this.setLine(this.furled, STAY0.clone().lerp(STAY1, 0.03), STAY0.clone().lerp(STAY1, 0.86));
  }

  /** Scrive i punti di una vela (gia' calcolati per la faccia davanti) e fa la faccia dietro. */
  writeSail(sail, pts) {
    const g = sail.mesh.geometry, p = g.attributes.position.array, n = sail.n;
    for (let i = 0; i < n; i++) {
      p[i * 3] = pts[i * 3]; p[i * 3 + 1] = pts[i * 3 + 1]; p[i * 3 + 2] = pts[i * 3 + 2];
      p[(i + n) * 3] = pts[i * 3]; p[(i + n) * 3 + 1] = pts[i * 3 + 1]; p[(i + n) * 3 + 2] = pts[i * 3 + 2];
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    // leggero distacco tra le due facce per evitare sfarfallii
    const nr = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) p[i] += nr[i] * 0.004;
  }

  buildBowWave() {
    this.foam = foamMaterial();
    this.bowWave = new THREE.Mesh(new THREE.BufferGeometry(), this.foam);
    this.bowWave.renderOrder = 6;
    this.bowWave.frustumCulled = false;
    this.root.add(this.bowWave);
    // spruzzi: piccole gocce nel mondo
    this.spray = { n: 260, life: new Float32Array(260), vel: new Float32Array(260 * 3), next: 0, acc: 0 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3).fill(-9999), 3));
    this.sprayPoints = new THREE.Points(g, new THREE.PointsMaterial({ map: dropTexture(), size: 0.09, transparent: true, depthWrite: false, opacity: 0.85 }));
    this.sprayPoints.frustumCulled = false;
  }

  /** Mette la barca nello stato s sulle onde. */
  update(s, waves, time, dt) {
    const x = s.pos.x, z = -s.pos.y;
    const fwd = dirVec(s.heading), side = dirVec(s.heading + 90);
    const hAt = (a, b) => waves.sample(x + fwd.x * a + side.x * b, z - fwd.y * a - side.y * b).h;
    const bow = hAt(3, 0), stern = hAt(-3, 0), stb = hAt(0, 1.3), port = hAt(0, -1.3);
    const sm = this.smooth;
    sm.pitch += (Math.atan2(bow - stern, 6) * 0.8 - sm.pitch) * 0.2;
    sm.roll += (Math.atan2(stb - port, 2.6) * 0.6 - sm.roll) * 0.2;
    sm.heave += ((bow + stern + stb + port) / 4 - 0.02 - sm.heave) * 0.3;
    this.root.position.set(x, sm.heave, z);
    this.root.rotation.set(0, -rad(s.heading), 0);
    this.tilt.rotation.set(sm.pitch, 0, -(rad(s.heel) + sm.roll));
    this.root.updateMatrixWorld(true);

    this.rudderPivot.rotation.y = rad(s.rudder);
    this.tillerNode.visible = !this.wheel;
    this.wheelNode.visible = this.wheel;
    this.wheelSpin.rotation.z = -rad(s.rudder) * 4;
    this.boomPivot.rotation.y = rad(s.mainAngle);
    this.windex.rotation.y = -rad(s.awa);

    this.updateMain(s, time);
    const clew = this.updateJib(s, time);
    this.updateSpi(s, time);
    // con lo spi su il fiocco e' avvolto sullo strallo
    this.jib.mesh.visible = this.jibSheetLine.visible = s.jibFurl < 0.5;
    this.furled.visible = s.jibFurl >= 0.5;
    const a = rad(s.mainAngle);
    // scotta randa: tre passate dal bozzello del boma a quello del pozzetto
    const ax = V(Math.sin(a), 0, Math.cos(a)), top = V(ax.x * MS_BOOM, BOOM_Y - 0.25, MAST_Z + ax.z * MS_BOOM);
    this.mainSheetLines.forEach((m, i) => {
      const o = (i - 1) * 0.025;
      this.setLine(m, top.clone().addScaledVector(ax, o), V(o, FLOOR_Y + 0.24, MS_Z));
    });
    // il genoa sormonta l'albero: il carrello della scotta e' sul passavanti dietro le sartie
    const tl = tAt(0.75);
    this.setLine(this.jibSheetLine, clew, V(s.jibSide * (halfBeam(tl) - 0.15), sheer(tl) + 0.05, 0.75));
    this.pole.visible = s.farfalla;
    if (s.farfalla) this.setLine(this.pole, V(0, 1.35, MAST_Z - 0.08), clew);

    // equipaggio sopravento, sporto fuori quando la barca sbanda
    const sideK = clamp(s.crew * 1.6, -1, 1);
    const hike = clamp((Math.abs(s.heel) - 6) / 20, 0, 1) * Math.min(1, Math.abs(s.crew));
    this.crew.forEach((p, k) => {
      p.root.visible = !this.crewHidden;
      if (k === 1 && s.backMain) {
        // randa scontrata: in piedi accanto al boma, lo spinge fuori con le braccia tese
        const L = 1.3, side = s.backMain, P = V(Math.sin(a) * L, BOOM_Y, MAST_Z + Math.cos(a) * L);
        const nx = side * Math.cos(a), nz = -side * Math.sin(a);
        const fx = P.x - nx * 0.5, fz = P.z - nz * 0.5, t = tAt(fz);
        const xx = clamp(fx, -(halfBeam(t) - 0.15), halfBeam(t) - 0.15);
        p.root.position.set(xx, deckY(t, xx) + 0.9, fz);
        p.root.rotation.set(0, Math.atan2(-nx, -nz), 0);
        p.stand(0.95);
        return;
      }
      if (k === 0 && this.wheel) {
        p.root.position.set(s.crew * 0.15, FLOOR_Y + 0.92, 3.2);
        p.root.rotation.set(0, 0, rad(s.heel) * 0.7);
        p.stand(1.15);
        return;
      }
      if (k === 0) {
        // timoniere: sopravento, girato in avanti verso il centro, la mano sottovento sulla prolunga
        const t = tAt(2.35), xx = s.crew * (halfBeam(t) - 0.2);
        p.root.position.set(xx, deckY(t, xx) + 0.07, 2.35);
        p.root.rotation.set(0, 0.6 * sideK, 0);
        p.sit(hike, 0.4);
        this.steer(p, s, sideK);
        return;
      }
      // prodiere: sopravento davanti al timoniere, girato verso il centro, lavora la scotta randa
      const t = tAt(1.15), xx = s.crew * (halfBeam(t) - 0.2);
      p.root.position.set(xx, deckY(t, xx) + 0.07, 1.15);
      p.root.rotation.set(0, Math.PI / 2 * sideK, 0);
      p.sit(hike, 0.55);
      p.torso.rotation.x -= 0.3 * (1 - hike);                // piegato in avanti verso il bozzello, se non e' fuori
      this.trim(p, s, sideK);
    });
    this.extension.visible = this.extGrip.visible = this.extJoint.visible = !this.wheel && !this.crewHidden;
    for (const m of this.mainTail) m.visible = !this.crewHidden && !s.backMain;
    this.lastMainSheet = s.mainSheet;
    this.updateBowWave(s, waves, dt);
  }

  /** La prolunga va dalla punta della barra alla mano sottovento del timoniere, l'altra mano sul ginocchio.
   *  Se la barra e' lontana (tutta sottovento in virata) il timoniere scivola verso il centro, fino a 30 cm, si sporge
   *  meno fuori e la mano scorre verso il fondo della prolunga. */
  steer(p, s, sideK) {
    const r = rad(s.rudder), tip = V(-TILLER_L * Math.sin(r), TILLER_Y + 0.03, this.rudderPivot.position.z - TILLER_L * Math.cos(r));
    const pos = p.root.position, i = sideK >= 0 ? 0 : 1;        // sopravento a dritta la mano sottovento e' la sinistra
    const comfort = V(pos.x - sideK * 0.4, pos.y + 0.4, pos.z - 0.25);
    const grip = tip.clone().addScaledVector(comfort.sub(tip).normalize(), EXT_L - 0.12);
    const shoulder = p.shoulders[i].position.clone().applyMatrix4(p.chain(p.torso));
    const short = shoulder.distanceTo(grip) - 0.56;
    if (short > 0) pos.x -= Math.sign(pos.x || 1) * Math.min(short, 0.3);
    if (short > 0.3) p.torso.rotation.x = Math.max(0.08, p.torso.rotation.x - (short - 0.3) * 1.5);
    const hand = p.reach(i, grip);
    p.reach(1 - i, V(0, 0.1, 0.03).applyMatrix4(p.chain(p.knees[1 - i])));
    const dir = hand.clone().sub(tip), len = Math.max(EXT_L, dir.length() + 0.04);
    dir.normalize();
    const end = tip.clone().addScaledVector(dir, len);
    this.setLine(this.extension, tip, end);
    this.setLine(this.extGrip, tip.clone().addScaledVector(dir, len - 0.24), end);
    this.extJoint.position.copy(tip);
  }

  /** Il prodiere lavora la scotta randa: la coda esce dallo strozzatore e passa nelle sue due mani, poi pende.
   *  Quando si cazza la recupera a bracciate: la mano avanti va verso il bozzello e tira verso di se'. */
  trim(p, s, sideK) {
    const chest = V(0, 0.4, -0.08).applyMatrix4(p.chain(p.torso));
    const flat = V(chest.x, 0, chest.z - MS_Z).normalize(), cleat = V(flat.x * 0.04, FLOOR_Y + 0.16, MS_Z + flat.z * 0.04);
    const dir = chest.clone().sub(cleat), L = dir.length();
    dir.normalize();
    this.haul = (this.haul + Math.max(0, (this.lastMainSheet ?? s.mainSheet) - s.mainSheet) * 80) % (2 * Math.PI);
    const stroke = 0.5 - 0.5 * Math.cos(this.haul), lead = sideK >= 0 ? 0 : 1;
    const out = Math.min(L - 0.15, 0.36 - 0.18 * stroke);
    const a = p.reach(lead, chest.clone().addScaledVector(dir, -out));
    // l'altra mano tiene la coda in basso, davanti alla sua spalla
    const sh = p.shoulders[1 - lead].position.clone().applyMatrix4(p.chain(p.torso));
    const b = p.reach(1 - lead, sh.addScaledVector(dir, -0.22).add(V(0, -0.38, 0)));
    const end = b.clone().add(V(0, -0.4, 0)).addScaledVector(dir, 0.08);
    this.setLine(this.mainTail[0], cleat, a);
    this.setLine(this.mainTail[1], a, b);
    this.setLine(this.mainTail[2], b, end);
    this.msBlock.rotation.y = Math.atan2(dir.x, dir.z);
  }

  setLine(m, a, b) {
    const d = new THREE.Vector3().subVectors(b, a), l = d.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.scale.set(1, l, 1);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }

  /** Randa: dall'albero alla balumina, con grasso, svergolamento e fileggiare. */
  updateMain(s, time) {
    const { R, C } = this.main, pts = new Float32Array((R + 1) * (C + 1) * 3);
    // scontrata, il vento la gonfia dalla parte di fuori: il grasso e lo svergolamento vanno verso l'interno
    const side = s.mainBacked ? -s.mainSide : s.mainSide, twist = 3 + 16 * s.mainSheet, fill = 1 - s.mainLuff;
    // terzaroli: la randa si abbassa di 1,35 m per mano; la parte bassa resta piegata sul boma
    const reefs = mainReefs(s), H = HEAD_Y - BOOM_Y, drop = 1.35 * reefs, Hv = H - drop;
    this.reefBundle.visible = reefs > 0;
    this.reefBundle.scale.set(0.06 + 0.04 * reefs, 1, 0.06 + 0.04 * reefs);
    if (this.main.reef !== reefs) {
      this.main.reef = reefs;
      const uv = this.main.mesh.geometry.attributes.uv.array, n = this.main.n;
      for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) {
        const k = r * (C + 1) + c, fo = (drop + r / R * Hv) / H;
        uv[k * 2 + 1] = fo; uv[(k + n) * 2 + 1] = fo;
      }
      this.main.mesh.geometry.attributes.uv.needsUpdate = true;
    }
    let i = 0;
    for (let r = 0; r <= R; r++) {
      const f = r / R, y = BOOM_Y + f * Hv, fo = (drop + f * Hv) / H;
      const chord = mainChord(fo);
      const a = rad(s.mainAngle + side * twist * f);
      const dx = Math.sin(a), dz = Math.cos(a), nx = Math.cos(a) * side, nz = -Math.sin(a) * side;
      for (let c = 0; c <= C; c++) {
        const xc = c / C, prof = 4.83 * xc * Math.pow(1 - xc, 1.3);
        let belly = 0.1 * chord * prof * (1 - 0.3 * f) * fill;
        if (s.mainLuff > 0) belly += 0.07 * chord * prof * s.mainLuff * Math.sin(time * 13 - xc * 9 + f * 5);
        pts[i++] = dx * xc * chord + nx * belly;
        pts[i++] = y;
        pts[i++] = MAST_Z + dz * xc * chord + nz * belly;
      }
    }
    this.writeSail(this.main, pts);
  }

  /** Spinnaker: dal tangone sopravento alla scotta sottovento, gonfio verso dove va il vento; sale lungo l'albero quando si issa. */
  updateSpi(s, time) {
    const up = s.spiUp, on = up > 0.01;
    for (const o of [this.spiSail.mesh, this.spiPole, this.spiSheet, this.spiGuy]) o.visible = on;
    if (!on) return;
    const { R, C } = this.spiSail, pts = new Float32Array((R + 1) * (C + 1) * 3);
    const ws = s.spiSide, awa = rad(s.awa), absA = Math.abs(s.awa);
    // tangone: avanti sui laschi stretti, quasi al traverso in poppa
    const phi = rad(clamp(20 + (absA - 60) * 0.55, 20, 85));
    const mast = V(0, 1.3, MAST_Z);
    const tack = V(ws * Math.sin(phi) * 3.25, 1.25, MAST_Z - Math.cos(phi) * 3.25);
    // vento apparente nella barca (x dritta, z poppa); la base della vela gli sta di traverso, verso sottovento e indietro
    const flow = V(-Math.sin(awa), 0, Math.cos(awa));
    const foot = V(Math.cos(awa), 0, Math.sin(awa));
    if (Math.sign(foot.x) === ws) foot.negate();
    foot.x -= ws * 0.6; foot.normalize();
    const clew = tack.clone().addScaledVector(foot, 6.0 * (0.35 + 0.65 * up));
    clew.y = 2.3;                                         // la bugna sta alta: sbandando non deve toccare l'acqua
    // in poppa la randa e' aperta quasi di traverso: lo spi, bugna compresa, deve stare tutto davanti a lei
    const run = clamp((absA - 115) / 45, 0, 1);
    clew.z = Math.min(clew.z, MAST_Z - 2.2 * run + 3 * (1 - run));
    tack.z = Math.min(tack.z, MAST_Z - 1.2 * run + 3 * (1 - run));
    const headY = 1.6 + up * (9.39 - 1.6), head = V(0, headY, MAST_Z - 1.0);
    const luff = s.spiLuff, depth = 2.7 * (1 - 0.65 * luff) * up;
    // piano della randa (boma dall'albero): nessun punto dello spi deve finirle dietro o troppo vicino
    const ma = rad(s.mainAngle), bx = Math.sin(ma), bz = Math.cos(ma), msd = Math.sign(s.mainAngle) || 1;
    const nx = msd * bz, nz = -msd * bx;                  // normale verso prua della randa
    const clearOfMain = (px, y, pz) => {
      const fo = clamp((y - BOOM_Y) / (HEAD_Y - BOOM_Y), 0, 1), chord = mainChord(fo) + 0.4;
      const dx = px, dz = pz - MAST_Z, along = dx * bx + dz * bz, ahead = dx * nx + dz * nz;
      const need = 0.7 - ahead;
      return along > -0.2 && along < chord && need > 0 ? need : 0;
    };
    let i = 0;
    for (let r = 0; r <= R; r++) {
      const f = r / R, sh = f * f;                        // larga fin quasi in cima, come le spalle di uno spi
      const y = tack.y + (headY - tack.y) * f;
      const girth = 1 + 0.15 * Math.sin(Math.PI * Math.min(1, f * 1.2));   // a meta' altezza larga quanto la base (SHW = SFL)
      const L = tack.clone().lerp(head, sh), T = clew.clone().lerp(head, sh);
      const cen = L.clone().lerp(T, 0.5), half = T.clone().sub(L).multiplyScalar(0.5 * girth);
      L.copy(cen).sub(half); T.copy(cen).add(half);
      const ahead = (1.1 + 0.6 * run) * Math.sin(Math.PI * Math.min(1, f * 1.1)) * up;   // il pallone sta davanti alla prua
      for (let c = 0; c <= C; c++) {
        const u = c / C, p = L.clone().lerp(T, u);
        const belly = depth * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.05 + 0.03)), 0.7);
        const flap = luff * 0.35 * Math.sin(time * 9 + u * 6 + f * 4) * Math.sin(Math.PI * u);
        let px = p.x + flow.x * (belly + flap), pz = p.z + flow.z * (belly + flap) - ahead * (0.6 + 0.4 * Math.sin(Math.PI * u));
        const push = clearOfMain(px, y, pz);
        px += nx * push; pz += nz * push;
        pts[i++] = px;
        pts[i++] = y + belly * 0.12;
        pts[i++] = pz;
      }
    }
    this.writeSail(this.spiSail, pts);
    this.setLine(this.spiPole, mast, tack);
    this.setLine(this.spiGuy, tack, V(ws * 1.15, 0.75, 3.3));
    this.setLine(this.spiSheet, clew, V(-ws * 1.15, 0.75, 3.3));
  }

  /** Fiocco; restituisce il punto di scotta. */
  updateJib(s, time) {
    const { R, C } = this.jib, pts = new Float32Array((R + 1) * (C + 1) * 3);
    // la tormentina e' piu' piccola: penna piu' bassa sullo strallo, base corta, mura sollevata
    const storm = stormJib(s);
    this.jib.mesh.material = storm ? this.stormMat : this.jibMat;
    const tack = storm ? TACK.clone().add(V(0, 0.45, 0.25)) : TACK;
    const head = TACK.clone().lerp(STAY1, storm ? 0.58 : 0.97);
    const a = rad(s.jibAngle), foot = storm ? 1.8 : JIB_FOOT;
    const clew = V(tack.x + Math.sin(a) * foot, tack.y + (storm ? 0.25 : 0.2), tack.z + Math.cos(a) * foot);
    // in cappa il vento prende il fiocco dalla parte di fuori: il grasso va verso l'interno
    const side = s.jibBacked ? -s.jibSide : s.jibSide, fill = 1 - s.jibLuff;
    const luff = new THREE.Vector3(), leech = new THREE.Vector3(), ch = new THREE.Vector3();
    let i = 0;
    for (let r = 0; r <= R; r++) {
      const f = r / R;
      luff.copy(tack).lerp(head, f);
      leech.copy(clew).lerp(head, f);
      ch.subVectors(leech, luff);
      const L = ch.length();
      const nl = Math.hypot(ch.z, ch.x) || 1, nx = ch.z / nl * side, nz = -ch.x / nl * side;
      for (let c = 0; c <= C; c++) {
        const xc = c / C, prof = 4.83 * xc * Math.pow(1 - xc, 1.3);
        let belly = 0.12 * L * prof * fill;
        if (s.jibLuff > 0) belly += 0.08 * L * prof * s.jibLuff * Math.sin(time * 17 - xc * 10 + f * 6);
        pts[i++] = luff.x + ch.x * xc + nx * belly;
        pts[i++] = luff.y + ch.y * xc;
        pts[i++] = luff.z + ch.z * xc + nz * belly;
      }
    }
    this.writeSail(this.jib, pts);
    return clew;
  }

  /** Onda di prua lungo i fianchi e spruzzi quando si va forte sull'onda. */
  updateBowWave(s, waves, dt) {
    const speed = Math.max(0, Math.hypot(s.u, s.v) / 0.514444 * Math.sign(s.u));
    const strength = clamp((speed - 1.2) / 4.5, 0, 1);
    this.bowWave.visible = strength > 0.01;
    if (this.bowWave.visible) {
      const pos = [], uv = [], idx = [];
      for (const sd of [-1, 1]) {
        const base = pos.length / 3, n = 12;
        for (let i = 0; i <= n; i++) {
          const f = i / n, z = -HL + 0.15 + f * 5.0, t = tAt(z);
          const inner = waterlineHalf(t) + 0.02;
          const lee = 1 + 0.6 * clamp(s.heel * sd / 20, -0.5, 1);
          const width = (0.15 + f * 1.3) * (0.5 + strength) * lee;
          pos.push(sd * inner, 0.06, z, sd * (inner + width), 0.04, z + width * 0.4);
          const age = f * 0.85 + (1 - strength) * 0.15;
          uv.push(0.5, 1 - age, 1.0, 1 - age);
          if (i > 0) { const a = base + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
      }
      this.bowWave.geometry.dispose();
      this.bowWave.geometry = geometry(pos, idx, uv, new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)));
      this.foam.uniforms.opacity.value = 0.35 + 0.65 * strength;
    }
    // spruzzi
    const sp = this.spray, arr = this.sprayPoints.geometry.attributes.position.array;
    sp.acc += Math.max(0, speed - 4.5) * (0.4 + waves.amp * 4) * 70 * dt;
    const bowW = new THREE.Vector3(0, 0.35, -HL + 0.55).applyMatrix4(this.tilt.matrixWorld);
    const fw = dirVec(s.heading);
    while (sp.acc >= 1) {
      sp.acc -= 1;
      const k = sp.next; sp.next = (sp.next + 1) % sp.n;
      arr[k * 3] = bowW.x + (Math.random() - 0.5) * 0.9; arr[k * 3 + 1] = bowW.y; arr[k * 3 + 2] = bowW.z + (Math.random() - 0.5) * 0.5;
      const sideways = (Math.random() - 0.5) * 3;
      sp.vel[k * 3] = fw.x * 1.5 + Math.cos(rad(s.heading)) * sideways;
      sp.vel[k * 3 + 1] = 1.5 + Math.random() * 2;
      sp.vel[k * 3 + 2] = -fw.y * 1.5 + Math.sin(rad(s.heading)) * sideways;
      sp.life[k] = 0.6 + Math.random() * 0.5;
    }
    for (let k = 0; k < sp.n; k++) {
      if (sp.life[k] <= 0) { arr[k * 3 + 1] = -9999; continue; }
      sp.life[k] -= dt;
      sp.vel[k * 3 + 1] -= 9.8 * dt;
      arr[k * 3] += sp.vel[k * 3] * dt; arr[k * 3 + 1] += sp.vel[k * 3 + 1] * dt; arr[k * 3 + 2] += sp.vel[k * 3 + 2] * dt;
    }
    this.sprayPoints.geometry.attributes.position.needsUpdate = true;
  }
}

/** Schiuma trasparente: sfuma ai bordi (u) e con l'eta' (v, 1 = nuova). */
export function foamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: foamTexture() }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv;
      void main() {
        float across = abs(vUv.x * 2.0 - 1.0);
        float a = clamp(vUv.y, 0.0, 1.0) * (1.0 - across * across) * texture2D(map, vUv * vec2(1.0, 4.0)).r * 0.9 * opacity;
        gl_FragColor = vec4(vec3(0.93, 0.97, 1.0), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
