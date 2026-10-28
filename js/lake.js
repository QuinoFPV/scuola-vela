// Il lago d'Iseo intorno alla base Sportaction (spiaggia di Castro): quote, profondita',
// contorni, alberi e case. Origine = punto di partenza; x = est, y = nord (metri).
import { clamp, dirVec, norm360, add, mul, Rng } from './physics.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

class Grid {
  constructor(n, half, h) { this.n = n; this.half = half; this.h = h; }
  value(x, y) {
    const n = this.n, s = (n - 1) / (2 * this.half);
    const fx = clamp((x + this.half) * s, 0, n - 1.001), fy = clamp((y + this.half) * s, 0, n - 1.001);
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    const h = this.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 10;
  }
}

export class Lake {
  /** load(name) deve restituire un ArrayBuffer (o del testo per info.json). */
  static async load(fetchBuffer) {
    const lake = new Lake();
    const t = new DataView(await fetchBuffer('terrain.bin'));
    let off = 4;
    lake.grids = [];
    for (let k = 0; k < 2; k++) {
      const n = t.getInt32(off, true), half = t.getFloat32(off + 4, true);
      off += 8;
      lake.grids.push(new Grid(n, half, new Int16Array(t.buffer.slice(t.byteOffset + off, t.byteOffset + off + n * n * 2))));
      off += n * n * 2;
    }
    [lake.outer, lake.inner] = lake.grids;
    const r = new DataView(await fetchBuffer('lake.bin'));
    lake.rings = [];
    off = 0;
    const count = r.getInt32(off, true); off += 4;
    for (let k = 0; k < count; k++) {
      const n = r.getInt32(off, true); off += 4;
      const ring = [];
      for (let i = 0; i < n; i++) { ring.push({ x: r.getFloat32(off, true), y: r.getFloat32(off + 4, true) }); off += 8; }
      lake.rings.push(ring);
    }
    const info = JSON.parse(new TextDecoder().decode(await fetchBuffer('info.json')));
    lake.axis = info.axis;
    lake.shoreOut = norm360(info.axis + 90);
    const out = dirVec(lake.shoreOut);
    // il campo un po' piu' al largo, dove c'e' spazio per un percorso di 600 m
    lake.center = { x: info.center[0] + out.x * 250, y: info.center[1] + out.y * 250 };
    lake.treesData = new DataView(await fetchBuffer('trees.bin'));
    lake.housesData = new DataView(await fetchBuffer('houses.bin'));
    lake.prepareBase();
    return lake;
  }

  // --- la base Sportaction ------------------------------------------------------------------
  // Il modello del terreno (quote ogni 30 m) vede una parete ripida fino all'acqua; in realta' tra il
  // lago e la statale SS469 c'e' una striscia piana con il prato, gli ombrelloni e il punto ristoro.
  // Qui si ricava la riva vera dal contorno del lago, si spiana la striscia e si dispongono strada,
  // ombrelloni, edifici, pontile e barche all'ormeggio, come nelle foto aeree.

  prepareBase() {
    const ring = this.rings[0];
    let best = 0, bestD = 1e9;
    ring.forEach((p, i) => { const d = Math.hypot(p.x, p.y); if (d < bestD) { bestD = d; best = i; } });
    // riva come linea continua, ~800 m per parte, ordinata da sud a nord
    const walk = (step) => {
      const out = []; let i = best, L = 0;
      while (L < 800) {
        const j = (i + step + ring.length) % ring.length;
        L += Math.hypot(ring[j].x - ring[i].x, ring[j].y - ring[i].y);
        out.push(ring[j]); i = j;
      }
      return out;
    };
    let line = [...walk(-1).reverse(), ring[best], ...walk(1)];
    const ax = dirVec(this.axis);
    const first = line[0], lastP = line[line.length - 1];
    if ((lastP.x - first.x) * ax.x + (lastP.y - first.y) * ax.y < 0) line.reverse();
    // ricampiona ogni 5 m, con s = 0 nel punto piu' vicino alla base
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
    let s0 = 0, dmin = 1e9;
    line.forEach((p, i) => { const d = Math.hypot(p.x, p.y); if (d < dmin) { dmin = d; s0 = cum[i]; } });
    const at = (L) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < L) i++;
      const k = clamp((L - cum[i - 1]) / Math.max(0.01, cum[i] - cum[i - 1]), 0, 1);
      return { x: line[i - 1].x + (line[i].x - line[i - 1].x) * k, y: line[i - 1].y + (line[i].y - line[i - 1].y) * k };
    };
    const shore = [];
    for (let s = -700; s <= 700; s += 5) shore.push({ s, ...at(s0 + s) });
    // direzione verso l'acqua (media su ±20 m, per non seguire ogni dentello del contorno)
    shore.forEach((p, i) => {
      const a = shore[Math.max(0, i - 4)], b = shore[Math.min(shore.length - 1, i + 4)];
      let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      let nx = ty, ny = -tx;
      if (this.height(p.x + nx * 25, p.y + ny * 25) > this.height(p.x - nx * 25, p.y - ny * 25)) { nx = -nx; ny = -ny; }
      Object.assign(p, { tx, ty, nx, ny });
    });
    this.shore = shore;
    this.roadIn = (s) => 32 + 14 * smooth(40, 90, s);               // dietro la Marini Marmi la strada si allontana
    // spiana la striscia sulla griglia fine
    const g = this.inner, n = g.n, half = g.half;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + 2 * half * i / (n - 1), y = -half + 2 * half * j / (n - 1);
      if (Math.abs(x) > 1100 || Math.abs(y) > 1100) continue;
      const h = g.h[j * n + i] / 10;
      const q = this.shorePos(x, y);
      if (!q || q.inland > 130) continue;
      // acqua vera solo oltre la riva di OpenStreetMap: le celle da 10 m la sbordavano a terra
      if (h <= 0 && q.inland < 1.5) continue;
      const w = smooth(560, 380, Math.abs(q.s));
      if (w <= 0) continue;
      const road = this.roadIn(q.s);
      let target;
      if (q.inland < road - 4) target = 1.2 + q.inland * 0.035;
      else if (q.inland < road + 4.5) target = 3.6;
      else target = 3.8 + (Math.max(h, 3.8) - 3.8) * smooth(road + 4.5, road + 45, q.inland);
      g.h[j * n + i] = Math.round((h + (target - h) * w) * 10);
    }
    this.layoutBase();
  }

  /** Posizione rispetto alla riva della base: s lungo la riva (nord +), inland = distanza da riva. */
  shorePos(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.shore) {
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    const dx = x - best.x, dy = y - best.y;
    return { s: best.s + dx * best.tx + dy * best.ty, inland: -(dx * best.nx + dy * best.ny), p: best };
  }
  /** Punto a distanza s lungo la riva e d verso il largo (d negativo = a terra). */
  basePoint(s, d) {
    const i = clamp(Math.round((s + 700) / 5), 0, this.shore.length - 1), p = this.shore[i];
    const k = s - p.s;
    return { x: p.x + p.tx * k + p.nx * d, y: p.y + p.ty * k + p.ny * d, tx: p.tx, ty: p.ty, nx: p.nx, ny: p.ny };
  }
  /** Centro di una barca all'ormeggio: sottovento alla sua boa, di mezza lunghezza piu' la cima. */
  mooredCenter(m, windDir) {
    const d = dirVec(windDir + 180);
    return { x: m.x + d.x * (m.len / 2 + 2.5), y: m.y + d.y * (m.len / 2 + 2.5) };
  }

  /** Dove si parte: 45 m oltre i 3 m di fondo davanti alla base e 10 m a nord (a sinistra uscendo), con la prua
   *  verso il largo. Davanti c'e' il corridoio lasciato libero dalle barche all'ormeggio. */
  startPoint() {
    const out = dirVec(this.shoreOut);
    let d = 0;
    while (d < 400 && this.depth(mul(out, d)) < 3) d += 2;
    return add(mul(out, d + 45), mul(dirVec(this.shoreOut - 90), 10));
  }

  /** Vero se il punto e' sulla striscia spianata (niente alberi). */
  inBaseStrip(x, y) {
    if (Math.hypot(x, y) > 800) return false;
    const q = this.shorePos(x, y);
    return q !== null && Math.abs(q.s) < 520 && q.inland > -5 && q.inland < this.roadIn(q.s) + 12;
  }

  layoutBase() {
    const rng = new Rng(2025);
    const B = { umbrellas: [], buildings: [], moorings: [], flags: [] };
    // ombrelloni sul prato, a sud della base
    for (const d of [-8, -14, -20]) for (let s = -112; s <= -36; s += 5.5) B.umbrellas.push(this.basePoint(s + (d === -14 ? 2.7 : 0), d));
    // edifici della base (pianta allineata alla riva): punto ristoro, magazzino, ufficio
    B.buildings.push({ ...this.basePoint(-72, -10), w: 7, l: 10, h: 3.6, roof: 'tile', wall: 0xeadfc8, sign: false });
    B.buildings.push({ ...this.basePoint(-14, -23), w: 6, l: 13, h: 3.2, roof: 'flat', wall: 0xd9d9d4, sign: true });
    B.buildings.push({ ...this.basePoint(4, -25), w: 6, l: 8, h: 3.0, roof: 'flat', wall: 0x9aa3a8, sign: false });
    // Marini Marmi: capannone lungo sulla riva a nord, in tre tronconi che seguono la curva
    for (const [s, l] of [[110, 80], [190, 80], [262, 64]]) {
      B.buildings.push({ ...this.basePoint(s, -22), w: 30, l, h: 11, roof: 'factory', wall: 0x8a8378, sign: false });
    }
    B.flags = [this.basePoint(-30, -3), this.basePoint(-4, -3)];
    B.pier = { from: this.basePoint(-22, -2), to: this.basePoint(-22, 14) };
    B.sock = this.basePoint(-6, -6);
    // barche all'ormeggio nella baia, lasciando libero il corridoio d'uscita lungo la rotta di partenza: la boa a
    // piu' di 24 m dalla rotta, cosi' anche la barca girata col vento (fino a 10 m dalla boa) resta a 14 m
    const start = this.startPoint(), out = dirVec(this.shoreOut), left = dirVec(this.shoreOut - 90);
    let tries = 0;
    while (B.moorings.length < 22 && tries++ < 600) {
      const s = rng.range(-170, 280), d = rng.range(28, 165);
      const p = this.basePoint(s, d), rx = p.x - start.x, ry = p.y - start.y;
      if (rx * out.x + ry * out.y > -60 && rx * out.x + ry * out.y < 260 && Math.abs(rx * left.x + ry * left.y) < 24) continue;
      if (this.depth(p) < 4) continue;
      if (B.moorings.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 22)) continue;
      const motor = rng.unit() < 0.3;
      B.moorings.push({ x: p.x, y: p.y, motor, len: motor ? rng.range(5, 7) : rng.range(6.5, 9), turn: rng.range(-14, 14) });
    }
    this.base = B;
  }

  /** Quota del terreno (m sul lago); sott'acqua e' negativa (profondita'). */
  height(x, y) {
    const ih = this.inner.half, oh = this.outer.half;
    if (Math.abs(x) <= ih && Math.abs(y) <= ih) return this.inner.value(x, y);
    if (Math.abs(x) >= oh || Math.abs(y) >= oh) return 30;
    return this.outer.value(x, y);
  }
  depth(p) { return -this.height(p.x, p.y); }

  /** Alberi: {x, y, h, size, conifer, variant}. */
  *trees() {
    const d = this.treesData, n = d.getInt32(4, true);
    for (let i = 0, o = 8; i < n; i++, o += 8) {
      const k = d.getUint8(o + 7);
      yield { x: d.getInt16(o, true) / 4, y: d.getInt16(o + 2, true) / 4, h: d.getInt16(o + 4, true) / 10,
              size: d.getUint8(o + 6) / 10, conifer: (k & 128) !== 0, variant: (k & 127) / 127 };
    }
  }

  /** Case: {ring: [{x, y}], wall, roof, bottom, top, roofH}. */
  *houses() {
    const d = this.housesData, n = d.getInt32(4, true);
    let o = 8;
    for (let i = 0; i < n; i++) {
      const nv = d.getUint8(o), color = d.getUint8(o + 1);
      const bottom = d.getInt16(o + 2, true) / 10, top = d.getInt16(o + 4, true) / 10, roofH = d.getUint8(o + 6) / 20;
      o += 7;
      const ring = [];
      for (let k = 0; k < nv; k++) { ring.push({ x: d.getInt16(o, true) / 4, y: d.getInt16(o + 2, true) / 4 }); o += 4; }
      yield { ring, wall: color & 15, roof: color >> 4, bottom, top, roofH };
    }
  }
}
