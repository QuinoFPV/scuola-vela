// La scena 3D: cielo, lago con riflessi, montagne con la foto satellitare, alberi, case,
// base Sportaction, boe, gommone dell'istruttore, scia e telecamere.
import * as THREE from './vendor/three.module.min.js';
import { BoatModel, foamMaterial, rod } from './boat.js';
import { buildBase } from './base.js';
import { WindTriangle, DirtyAir, RoundingArrows } from './overlays.js';
import { skyTexture, skyDir, markTexture } from './textures.js';
import { rad, clamp, dirVec, norm180, norm360, len, sub, bearing, twaOf } from './physics.js';
import { Waves } from './sim.js';

export const CAMERAS = ["GOMMONE DELL'ISTRUTTORE", 'TIMONIERE', 'LATERALE', "DALL'ALTO"];

const WATER_VERT = /* glsl */`
uniform float simTime, waveAmp, waveDir;
uniform vec2 origin;
varying vec3 vWorld;
const float LAM[5] = float[5](34.0, 21.0, 13.0, 8.0, 5.0);
const float AMK[5] = float[5](0.36, 0.26, 0.18, 0.12, 0.08);
const float OFF[5] = float[5](0.0, 0.45, -0.5, 0.9, -1.1);
const float PHS[5] = float[5](0.0, 1.7, 4.1, 2.3, 5.5);
void main() {
  vec2 p = position.xz + origin;
  float dist = length(position.xz);
  float h = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = waveDir + OFF[i];
    vec2 d = vec2(sin(a), -cos(a));
    float k = 6.2831853 / LAM[i];
    float fade = clamp(2.0 - dist / (6.0 * LAM[i]), 0.0, 1.0);
    h += waveAmp * AMK[i] * fade * sin(k * dot(d, p) - sqrt(9.81 * k) * simTime + PHS[i]);
  }
  vec4 w = modelMatrix * vec4(position.x, position.y + h, position.z, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */`
uniform float simTime, waveAmp, waveDir, windDir, ripple, whitecap;
uniform vec4 puffs[6];
uniform samplerCube envMap;
uniform vec3 sunDir, sunColor, fogColor;
uniform float fogNear, fogFar;
varying vec3 vWorld;
const float LAM[5] = float[5](34.0, 21.0, 13.0, 8.0, 5.0);
const float AMK[5] = float[5](0.36, 0.26, 0.18, 0.12, 0.08);
const float OFF[5] = float[5](0.0, 0.45, -0.5, 0.9, -1.1);
const float PHS[5] = float[5](0.0, 1.7, 4.1, 2.3, 5.5);
const float RL[6] = float[6](2.7, 1.9, 1.3, 0.9, 0.62, 0.43);
const float RO[6] = float[6](0.0, 0.5, -0.45, 0.8, -0.7, 0.25);
void main() {
  vec2 p = vWorld.xz;
  float vd = length(cameraPosition - vWorld);
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    float a = waveDir + OFF[i];
    vec2 d = vec2(sin(a), -cos(a));
    float k = 6.2831853 / LAM[i];
    float A = waveAmp * AMK[i];
    float th = k * dot(d, p) - sqrt(9.81 * k) * simTime + PHS[i];
    h += A * sin(th);
    g += A * k * cos(th) * d * clamp(1.0 - vd / (60.0 * LAM[i]), 0.0, 1.0);
  }
  // raffiche (piu' increspato, piu' scuro) e buchi di vento (liscio, chiaro)
  float gust = 0.0;
  for (int i = 0; i < 6; i++) {
    vec2 q = p - puffs[i].xy;
    gust += puffs[i].w * exp(-dot(q, q) / (puffs[i].z * puffs[i].z * 0.6));
  }
  gust = clamp(gust, -0.9, 1.5);
  float rip = max(0.0, ripple * (1.0 + gust));
  for (int i = 0; i < 6; i++) {
    float a = windDir + RO[i];
    vec2 d = vec2(sin(a), -cos(a));
    float k = 6.2831853 / RL[i];
    float A = RL[i] * 0.016 * rip * clamp(1.0 - vd / (35.0 * RL[i]), 0.0, 1.0);
    g += A * k * cos(k * dot(d, p) - sqrt(9.81 * k) * simTime + float(i) * 1.3) * d;
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = textureCube(envMap, r).rgb;
  float crest = clamp(h / max(waveAmp, 0.05) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.010, 0.055, 0.075), vec3(0.020, 0.130, 0.140), crest * 0.7) * (1.0 - 0.28 * gust);
  // luce diffusa del cielo dentro l'acqua
  body += vec3(0.02, 0.06, 0.07) * max(dot(n, sunDir), 0.0);
  vec3 col = mix(body, refl, fres);
  // luccichio del sole
  vec3 hv = normalize(sunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 380.0) * 6.0 + pow(max(dot(n, hv), 0.0), 60.0) * 0.12;
  col += sunColor * spec * (1.0 - clamp(rip * 0.25, 0.0, 0.5));
  // creste bianche con vento forte
  float wn = sin(p.x * 0.9 + simTime * 0.7) * sin(p.y * 1.1 - simTime * 0.5) * sin(p.x * 0.37 - p.y * 0.29 + simTime * 0.3);
  float foam = whitecap * (0.6 + 0.4 * clamp(gust, 0.0, 1.0)) * smoothstep(0.62, 0.92, crest) * smoothstep(0.25, 0.75, wn) * clamp(1.0 - vd / 400.0, 0.0, 1.0);
  col = mix(col, vec3(0.80, 0.86, 0.88), foam * 0.8);
  float fog = smoothstep(fogNear, fogFar, vd);
  col = mix(col, fogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Specchio d'acqua: griglia fitta vicino alla barca, larga fino a 15 km. */
function waterGeometry(n = 300) {
  const s = (t) => 120 * t + 14880 * Math.pow(Math.abs(t), 7) * Math.sign(t);
  const pos = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(s(i / n * 2 - 1), 0, s(j / n * 2 - 1));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Scia: un nastro di schiuma che segue la poppa e si allarga. */
class Wake {
  constructor() {
    this.points = [];
    this.life = 28;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), foamMaterial());
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
  }
  reset() { this.points = []; }
  update(p, side, speed, time, waves) {
    const P = this.points;
    if (P.length < 2 || Math.hypot(P[P.length - 2].p.x - p.x, P[P.length - 2].p.y - p.y) >= 0.8) P.push({ p, side, t: time, speed });
    else P[P.length - 1] = { p, side, t: time, speed };
    while (P.length && time - P[0].t > this.life) P.shift();
    if (P.length < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const pos = [], uv = [], idx = [];
    P.forEach((q, i) => {
      const age = time - q.t, w = 0.55 + age * 0.09 + q.speed * 0.08;
      const alpha = clamp(q.speed / 3, 0, 1) * Math.pow(1 - age / this.life, 1.5) * 0.6;
      for (const s of [-1, 1]) {
        const x = q.p.x + q.side.x * w * s, z = q.p.y + q.side.y * w * s;
        pos.push(x, waves.sample(x, z).h + 0.04, z);
        uv.push(s < 0 ? 0 : 1, alpha);
      }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

const std = (color, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export class World {
  /** light: telefoni e tablet, con ombre, riflessi, acqua e alberi piu' leggeri. */
  constructor(renderer, lake, { light = false } = {}) {
    this.renderer = renderer;
    this.lake = lake;
    this.light = light;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb3c9db, 900, 22000);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 30000);
    this.mode = 0;
    this.orbitYaw = 0; this.orbitPitch = 0; this.zoom = 1;
    this.camYaw = 90;
    this.waves = new Waves();

    this.sun = new THREE.DirectionalLight(0xfff7e6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(light ? 1024 : 2048, light ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 140 });
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xc6dcf0, 0x2a3a30, 0.6));

    // acqua
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        simTime: { value: 0 }, waveAmp: { value: 0.2 }, waveDir: { value: Math.PI }, origin: { value: new THREE.Vector2() },
        windDir: { value: Math.PI }, ripple: { value: 1 }, whitecap: { value: 0 },
        puffs: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0)) },
        envMap: { value: null }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        fogColor: { value: new THREE.Color(0xb3c9db) }, fogNear: { value: 900 }, fogFar: { value: 22000 },
      },
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    });
    this.water = new THREE.Mesh(waterGeometry(light ? 200 : 300), this.waterMat);
    this.water.frustumCulled = false;
    this.scene.add(this.water);

    this.terrain = this.buildTerrain();
    this.trees = this.buildTrees();
    this.houses = this.buildHouses();
    this.scene.add(this.terrain, this.trees, this.houses);
    this.base = buildBase(this.lake);
    this.scene.add(this.base.root);

    this.boat = new BoatModel();
    this.scene.add(this.boat.root, this.boat.sprayPoints);
    this.helmMount = new THREE.Object3D();
    this.boat.tilt.add(this.helmMount);
    this.wake = new Wake();
    this.scene.add(this.wake.mesh);
    this.buoys = [0, 1, 2].map(() => { const b = this.buildBuoy(); this.scene.add(b); return b; });
    this.rib = this.buildRib();
    this.ribWake = new Wake();
    this.scene.add(this.rib, this.ribWake.mesh);
    this.rib.userData = { pos: { x: 0, y: 0 }, heading: 0, ready: false };
    this.triangle = new WindTriangle();
    this.dirtyAir = new DirtyAir();
    this.rounding = new RoundingArrows(3);
    this.scene.add(this.triangle.root, this.dirtyAir.root, this.rounding.root);

    this.cubeTarget = new THREE.WebGLCubeRenderTarget(light ? 256 : 512, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(1, 30000, this.cubeTarget);
    this.scene.add(this.cubeCam);
    this.morning = null;
    this.setSun(false);
  }

  /** Sole del pomeriggio (Ora) o della mattina (Sover): cielo, luce, riflessi. */
  setSun(morning) {
    if (this.morning === morning) return;
    this.morning = morning;
    this.sunAz = morning ? 115 : 235;
    this.sunEl = morning ? 28 : 36;
    const sky = skyTexture(this.sunAz, this.sunEl);
    this.scene.background?.dispose?.();
    this.scene.background = sky;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromEquirectangular(sky).texture;
    pm.dispose();
    this.sunDir = skyDir(this.sunAz, this.sunEl);
    this.waterMat.uniforms.sunDir.value.copy(this.sunDir);
    this.captureEnvironment();
  }

  /** Fotografa il lago a 360° dal centro del campo, senza barca e senz'acqua: l'acqua lo riflette. */
  captureEnvironment() {
    const c = this.lake.center;
    this.cubeCam.position.set(c.x, 3, -c.y);
    const hide = [this.water, this.boat.root, this.wake.mesh, this.rib, this.ribWake.mesh, this.boat.sprayPoints, ...this.buoys,
                  this.triangle.root, this.dirtyAir.root, this.rounding.root];
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    this.cubeCam.update(this.renderer, this.scene);
    hide.forEach((o, i) => { o.visible = vis[i]; });
    this.waterMat.uniforms.envMap.value = this.cubeTarget.texture;
  }

  /** Terreno con la foto satellitare: un quadrato fine (±2 km) dentro uno largo (±10 km). */
  buildTerrain() {
    const root = new THREE.Group();
    const loader = new THREE.TextureLoader();
    const inner = this.lake.inner, outer = this.lake.outer;
    const make = (grid, hole, image, step = 1) => {
      const n = (grid.n - 1) / step + 1, half = grid.half, pos = [], uv = [], idx = [];
      for (let j = 0; j < n; j++) {
        const y = -half + 2 * half * j / (n - 1);
        for (let i = 0; i < n; i++) {
          const x = -half + 2 * half * i / (n - 1);
          const onHole = hole !== null && Math.abs(x) <= hole + 0.1 && Math.abs(y) <= hole + 0.1;
          pos.push(x, onHole ? inner.value(x, y) : grid.value(x, y), -y);
          uv.push((x + half) / (2 * half), (y + half) / (2 * half));
        }
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        if (hole !== null) {
          const x0 = -half + 2 * half * i / (n - 1), x1 = -half + 2 * half * (i + 1) / (n - 1);
          const y0 = -half + 2 * half * j / (n - 1), y1 = -half + 2 * half * (j + 1) / (n - 1);
          if (x0 >= -hole - 0.1 && x1 <= hole + 0.1 && y0 >= -hole - 0.1 && y1 <= hole + 0.1) continue;
        }
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const map = loader.load('data/' + image);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = this.light ? 4 : 8;
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
      // la foto e' un po' scura; sui pendii ripidi, stirata, la si sostituisce con bosco e roccia
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 photo = pow(diffuseColor.rgb, vec3(0.85)) * vec3(1.35, 1.32, 1.18);
            float n1 = sin(vW.x * 0.13 + sin(vW.z * 0.07) * 2.0) * sin(vW.z * 0.11 + vW.y * 0.05);
            float n2 = sin(vW.x * 0.031 - vW.z * 0.027 + vW.y * 0.02);
            vec3 forest = mix(vec3(0.10, 0.17, 0.08), vec3(0.18, 0.24, 0.12), 0.5 + 0.5 * n1);
            vec3 rock = vec3(0.42, 0.40, 0.36) * (0.85 + 0.15 * n1);
            float ny = normalize(vN).y;
            vec3 steep = mix(forest, rock, smoothstep(0.2, 0.7, 0.5 + 0.5 * n2) * smoothstep(0.55, 0.3, ny));
            diffuseColor.rgb = mix(photo, mix(photo, steep, 0.75), smoothstep(0.82, 0.5, ny));`);
      };
      const meshT = new THREE.Mesh(g, m);
      meshT.receiveShadow = true;
      return meshT;
    };
    root.add(make(outer, inner.half, 'sat_outer.jpg', 2), make(inner, null, 'sat_inner.jpg'));
    return root;
  }

  /** Alberi (istanze): chiome tonde a due anelli per le latifoglie, coni per le conifere. */
  buildTrees() {
    const root = new THREE.Group();
    const crown = (() => {
      const pos = [], idx = [];
      const ring = (y, r, rot) => { for (let j = 0; j < 5; j++) { const a = rot + j * 2 * Math.PI / 5; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); } };
      ring(0.45, 0.38, 0); ring(0.8, 0.27, 0.6);
      pos.push(0, 1, 0, 0, 0.28, 0);
      for (let j = 0; j < 5; j++) {
        const a0 = j, a1 = (j + 1) % 5, b0 = 5 + j, b1 = 5 + (j + 1) % 5;
        idx.push(a0, b0, a1, a1, b0, b1, b0, 10, b1, a0, a1, 11);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    })();
    const cone = new THREE.ConeGeometry(0.24, 0.88, 5, 1, true).translate(0, 0.56, 0);
    // lontano basta una chioma a un solo anello
    const simple = (() => {
      const pos = [], idx = [];
      for (let j = 0; j < 5; j++) { const a = j * 2 * Math.PI / 5; pos.push(Math.cos(a) * 0.36, 0.55, Math.sin(a) * 0.36); }
      pos.push(0, 1, 0, 0, 0.2, 0);
      for (let j = 0; j < 5; j++) idx.push(j, 5, (j + 1) % 5, j, (j + 1) % 5, 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    })();
    const greens = [[0.20, 0.30, 0.12], [0.25, 0.34, 0.14], [0.17, 0.27, 0.11], [0.29, 0.36, 0.16], [0.22, 0.29, 0.15]];
    const all = [...this.lake.trees()].filter((t) => !this.lake.inBaseStrip(t.x, t.y));
    const nearR = this.light ? 800 : 1500, near = (t) => t.x * t.x + t.y * t.y < nearR * nearR;
    const make = (geo, list) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0xffffff }), list.length);
      const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.variant * 7);
        mat.compose(new THREE.Vector3(t.x, t.h, -t.y), q, new THREE.Vector3(t.size, t.size, t.size));
        m.setMatrixAt(i, mat);
        const gc = greens[Math.floor(t.variant * 5) % 5], k = t.conifer ? 0.8 : 1;
        col.setRGB(gc[0] * k, gc[1] * k, gc[2] * k, THREE.SRGBColorSpace);
        m.setColorAt(i, col);
      });
      m.receiveShadow = false;
      return m;
    };
    root.add(make(crown, all.filter((t) => !t.conifer && near(t))), make(simple, all.filter((t) => !t.conifer && !near(t))),
             make(cone, all.filter((t) => t.conifer)));
    return root;
  }

  /** Case ridotte (entro 4 km): muri e tetti a padiglione in coppi, capannoni grigi. */
  buildHouses() {
    const walls = [[0.86, 0.80, 0.68], [0.90, 0.86, 0.76], [0.82, 0.70, 0.55], [0.93, 0.91, 0.86], [0.85, 0.74, 0.62], [0.78, 0.66, 0.52], [0.88, 0.78, 0.70], [0.66, 0.66, 0.64], [0.88, 0.84, 0.76]];
    const roofs = [[0.62, 0.30, 0.20], [0.55, 0.27, 0.19], [0.68, 0.36, 0.24], [0.50, 0.26, 0.19]];
    const pos = [], col = [];
    const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...k); };
    for (const hs0 of this.lake.houses()) {
      const hs = { ...hs0 };
      const n0 = hs.ring.length;
      const mx = hs.ring.reduce((t, p) => t + p.x, 0) / n0, my = hs.ring.reduce((t, p) => t + p.y, 0) / n0;
      if (this.lake.inBaseStrip(mx, my)) {
        // il terreno qui e' stato spianato: la casa poggia sul nuovo piano
        const g = this.lake.height(mx, my), hgt = clamp(hs.top - hs.bottom - 2, 5, 9);
        hs.bottom = g - 1; hs.top = g + hgt;
      }
      const wc = walls[hs.wall % walls.length];
      const rc = hs.wall === 7 ? [0.52, 0.52, 0.54] : hs.wall === 8 ? [0.47, 0.44, 0.42] : roofs[hs.roof % 4];
      const dark = wc.map((v) => v * 0.72);
      const n = hs.ring.length;
      let cx = 0, cy = 0;
      for (const p of hs.ring) { cx += p.x / n; cy += p.y / n; }
      for (let k = 0; k < n; k++) {
        const p0 = hs.ring[k], p1 = hs.ring[(k + 1) % n];
        const a = [p0.x, hs.bottom, -p0.y], b = [p1.x, hs.bottom, -p1.y], c = [p1.x, hs.top, -p1.y], d = [p0.x, hs.top, -p0.y];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        col.push(...dark, ...dark, ...wc, ...dark, ...wc, ...wc);
        tri([p0.x, hs.top, -p0.y], [p1.x, hs.top, -p1.y], [cx, hs.top + hs.roofH, -cy], rc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    // finestre: sulle pareti verticali, una fila per piano (3 m) e una ogni 2,6 m
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vNw;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vNw = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vNw;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 nw = normalize(vNw);
          if (abs(nw.y) < 0.3) {
            float along = abs(nw.x) > abs(nw.z) ? vW.z : vW.x;
            float fy = fract(vW.y / 3.0), fx = fract(along / 2.6);
            float win = step(0.38, fy) * step(fy, 0.78) * step(0.3, fx) * step(fx, 0.7);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.14, 0.17), win * 0.85);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.1;');
    };
    return new THREE.Mesh(g, m);
  }

  /** Boa gonfiabile da regata: cilindro giallo di 2 m di diametro, alto 2,2 m piu' la cupola, con la fascia SPORTACTION. */
  buildBuoy() {
    const n = new THREE.Group();
    this.markMap ??= markTexture();
    const side = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.06, 2.2, 48, 1, true),
      new THREE.MeshStandardMaterial({ map: this.markMap, roughness: 0.5 }));
    side.position.y = 0.85;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffd23a, 0.5));
    dome.scale.y = 0.32; dome.position.y = 1.95;
    for (const m of [side, dome]) { m.castShadow = true; n.add(m); }
    return n;
  }

  /** Il gommone dell'istruttore. */
  buildRib() {
    const root = new THREE.Group(), tube = std(0x5c6166, 0.55), orange = std(0xf2730f, 0.6);
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 4.06, 6, 14), tube); t.rotation.x = Math.PI / 2; t.position.set(s * 0.82, 0.32, 0.35); root.add(t);
      const bnd = new THREE.Mesh(new THREE.CapsuleGeometry(0.275, 0.65, 6, 14), orange); bnd.rotation.x = Math.PI / 2; bnd.position.set(s * 0.82, 0.32, -0.9); root.add(bnd);
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.27, 10, 24, Math.PI), tube);
    bow.rotation.x = Math.PI / 2; bow.rotation.z = Math.PI; bow.position.set(0, 0.32, -1.95); root.add(bow);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 4.6), std(0xebebeb, 0.35)); hull.position.set(0, 0.12, 0.2); root.add(hull);
    const consoleM = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.55), std(0xf2f2f2, 0.3)); consoleM.position.set(0, 0.7, 0.1); root.add(consoleM);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.5), std(0x141414, 0.35)); engine.position.set(0, 0.7, 2.75); root.add(engine);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 6, 12), orange); body.position.set(0, 1.25, 0.65); root.add(body);
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.59, 6, 12), std(0x1a1f33, 0.8)); legs.position.set(0, 0.72, 0.68); root.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), std(0xd9a680, 0.6)); head.position.set(0, 1.78, 0.65); root.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 14), std(0x1a3380, 0.7)); cap.position.set(0, 1.87, 0.65); root.add(cap);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return root;
  }

  /** Aggiorna tutto per lo stato da mostrare. */
  update(sim, dt, time) {
    const s = sim.shown, waves = sim.waves;
    this.setSun(sim.settings.windFrom === 1);
    this.boat.wheel = sim.settings.steering === 2;
    this.boat.crewHidden = this.mode === 1;
    this.boat.update(s, waves, s.time, dt);
    const x = s.pos.x, z = -s.pos.y;
    // acqua
    const u = this.waterMat.uniforms;
    this.water.position.set(x, 0, z);
    u.origin.value.set(x, z);
    u.simTime.value = waves.time; u.waveAmp.value = waves.amp; u.waveDir.value = waves.dirRad;
    u.windDir.value = rad(sim.wind.direction + 180);
    u.ripple.value = 0.35 + sim.wind.baseSpeed / 14;
    u.whitecap.value = clamp((sim.wind.baseSpeed - 13) / 9, 0, 1);
    const puffs = [...sim.wind.puffs].sort((a, b) => len(sub(a.pos, s.pos)) - len(sub(b.pos, s.pos)));
    for (let i = 0; i < 6; i++) {
      const p = puffs[i];
      u.puffs.value[i].set(p ? p.pos.x : 0, p ? -p.pos.y : 0, p ? p.radius : 1, p ? p.dSpeed / Math.max(3, sim.wind.baseSpeed) * 2.2 : 0);
    }
    // scia
    const fwd = dirVec(s.heading), stb = dirVec(s.heading + 90);
    if (sim.replay === null) this.wake.update({ x: x - fwd.x * 3.7, y: z + fwd.y * 3.7 }, { x: stb.x, y: -stb.y }, Math.max(0, s.u), s.time, waves);
    // boe
    this.buoys.forEach((b, i) => {
      const p = sim.marks[i], smp = waves.sample(p.x, -p.y);
      b.position.set(p.x, smp.h - 0.15, -p.y);
      b.rotation.set(-smp.gz * 0.6, 0, smp.gx * 0.6);
    });
    this.rounding.update(sim, waves);
    // gommone: segue la barca da dietro e sopravento (nella vista dal gommone e' la telecamera)
    const r = this.rib.userData, windSide = twaOf(s) >= 0 ? 1 : -1;
    const tf = dirVec(s.heading), ts = dirVec(s.heading + 90 * windSide);
    const target = { x: s.pos.x - tf.x * 22 + ts.x * 9, y: s.pos.y - tf.y * 22 + ts.y * 9 };
    if (!r.ready || len(sub(target, r.pos)) > 200) { r.pos = { ...target }; r.heading = s.heading; r.ready = true; }
    const toT = sub(target, r.pos), ribSpeed = clamp(len(toT) * 0.5, 0, 9);
    if (len(toT) > 1) r.heading = norm360(r.heading + clamp(norm180(bearing(toT) - r.heading), -40 * dt, 40 * dt));
    if (len(toT) < 4) r.heading = norm360(r.heading + clamp(norm180(s.heading - r.heading), -30 * dt, 30 * dt));
    const rf = dirVec(r.heading), k = Math.abs(norm180(bearing(toT) - r.heading)) < 90 ? 1 : 0.2;
    r.pos = { x: r.pos.x + rf.x * ribSpeed * dt * k, y: r.pos.y + rf.y * ribSpeed * dt * k };
    const rs = waves.sample(r.pos.x, -r.pos.y);
    this.rib.position.set(r.pos.x, rs.h, -r.pos.y);
    this.rib.rotation.set(-rs.gz * 0.5 + Math.min(0.08, ribSpeed * 0.012), -rad(r.heading), rs.gx * 0.5);
    this.rib.visible = this.ribWake.mesh.visible = this.mode !== 0;
    if (sim.replay === null) {
      const rsd = dirVec(r.heading + 90);
      this.ribWake.update({ x: r.pos.x - rf.x * 2.6, y: -r.pos.y + rf.y * 2.6 }, { x: rsd.x, y: -rsd.y }, ribSpeed * 0.6, s.time, waves);
    }
    // aiuti sull'acqua, se accesi nel menu
    this.triangle.update(s, sim.settings.triangle, waves, this.camera);
    // dall'alto, col triangolo acceso, si guarda un po' sopravento per vedere tutte le frecce (spostamento morbido)
    const want = sim.settings.triangle ? this.triangle.focus(s) : { x: 0, z: 0 };
    this.topFocus ??= { x: 0, z: 0 };
    const kf = Math.min(1, dt * 2);
    this.topFocus.x += (want.x - this.topFocus.x) * kf; this.topFocus.z += (want.z - this.topFocus.z) * kf;
    this.dirtyAir.update(s, sim.settings.dirtyAir, waves);
    // base: barche all'ormeggio che si girano col vento, manica a vento
    const wb = sim.wind.at({ x: 0, y: 0 });
    this.base.update(wb.dir, wb.speed, waves, s.time);
    // sole che segue la barca (ombre nitide) e luce che attraversa le vele
    this.sun.position.set(x + this.sunDir.x * 60, this.sunDir.y * 60, z + this.sunDir.z * 60);
    this.sun.target.position.set(x, 2, z);
    this.placeCamera(s, waves, dt);
    this.camera.updateMatrixWorld();
    this.boat.sunDirView.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse);
  }

  placeCamera(s, waves, dt) {
    const x = s.pos.x, z = -s.pos.y, cam = this.camera;
    this.camYaw = norm360(this.camYaw + norm180(s.heading - this.camYaw) * Math.min(1, dt * 0.9));
    cam.fov = this.mode === 1 ? 68 : 52;
    cam.updateProjectionMatrix();
    if (this.mode === 0) {
      const dist = 16 * this.zoom, elev = rad(clamp(13 + this.orbitPitch, -5, 80)), yaw = this.camYaw + this.orbitYaw;
      const back = dirVec(yaw);
      const px = x - back.x * dist * Math.cos(elev), pz = z + back.y * dist * Math.cos(elev);
      const py = Math.max(2.5 + dist * Math.sin(elev), waves.sample(px, pz).h + 0.8);
      cam.position.set(px, py, pz);
      cam.up.set(0, 1, 0);
      cam.lookAt(x + back.x * 3, 1.2, z - back.y * 3);
    } else if (this.mode === 1) {
      const m = this.helmMount;
      if (this.boat.wheel) m.position.set(s.crew * 0.12, 1.95, 3.45); else m.position.set(s.crew * 1.0, 1.55, 2.45);
      m.rotation.set((this.boat.wheel ? -0.34 : -0.07) + rad(this.orbitPitch) * 0.5, rad(-this.orbitYaw), rad(s.heel) * 0.55, 'YXZ');
      m.updateMatrixWorld(true);
      m.matrixWorld.decompose(cam.position, cam.quaternion, new THREE.Vector3());
    } else if (this.mode === 2) {
      const windward = twaOf(s) >= 0 ? 1 : -1;
      const side = dirVec(s.heading + 90 * windward + this.orbitYaw), fwd = dirVec(s.heading), dist = 17 * this.zoom;
      cam.position.set(x + side.x * dist + fwd.x * 2, 3 + dist * Math.sin(rad(clamp(8 + this.orbitPitch, -3, 80))), z - side.y * dist - fwd.y * 2);
      cam.up.set(0, 1, 0);
      cam.lookAt(x, 3.8, z);
    } else {
      const fx = x + this.topFocus.x, fz = z + this.topFocus.z;
      cam.position.set(fx, 34 * this.zoom, fz + 0.01);       // abbastanza vicino da vedere bene barca e frecce
      cam.up.set(0, 0, -1);
      cam.lookAt(fx, 0, fz);
    }
  }
}
