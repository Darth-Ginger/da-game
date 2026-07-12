// Streams the infinite data centre in around the player as square chunks of
// maze cells. Each chunk bakes everything it contains into a handful of
// instanced meshes (walls, racks, LEDs, fixtures, furniture...) so draw call
// count stays flat no matter how far you walk.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MZ from './maze.js';
import { makeMaterials } from './textures.js';

const CHUNK = 8;                     // cells per chunk side
const CHUNK_M = CHUNK * MZ.CELL;     // metres per chunk side
const LOAD_R = 2;                    // chunk radius kept loaded (5x5)
const UNLOAD_R = 3;
const LIGHT_POOL = 6;                // real PointLights, assigned to nearest fixtures

const { CELL, WALL_H, WALL_T } = MZ;

// ------------------------------------------------------------ LED shader ----

function ledMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSurge: { value: 0 } }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aColor;
      attribute vec2 aBlink; // x: blink rate (0 = steady), y: phase
      varying vec3 vColor;
      varying vec2 vBlink;
      void main() {
        vColor = aColor;
        vBlink = aBlink;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform float uSurge;
      varying vec3 vColor;
      varying vec2 vBlink;
      void main() {
        float on = 1.0;
        if (vBlink.x > 0.0) {
          // activity surges make every blinking LED chatter faster
          float t = uTime * vBlink.x * (1.0 + uSurge * 2.5) + vBlink.y;
          on = step(0.4, fract(sin(floor(t) * 91.17) * 43758.5453));
        }
        vec3 col = vColor * (0.12 + (1.25 + 0.35 * uSurge) * on);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  });
}

// Fluorescent tubes: per-instance glow level, written every frame for
// flickering fixtures.
function tubeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute float aGlow;
      varying float vGlow;
      void main() {
        vGlow = aGlow;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      varying float vGlow;
      void main() {
        vec3 dark = vec3(0.06, 0.065, 0.06);
        vec3 lit = vec3(0.85, 1.0, 0.92) * 2.4;
        vec3 col = mix(dark, lit, clamp(vGlow, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  });
}

// -------------------------------------------------------- prop geometries ----

function boxAt(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function buildGeometries() {
  const geos = {};
  geos.wall = new THREE.BoxGeometry(WALL_T, WALL_H, CELL + WALL_T);
  geos.floor = new THREE.PlaneGeometry(CHUNK_M, CHUNK_M);
  geos.floor.rotateX(-Math.PI / 2);
  geos.ceiling = new THREE.PlaneGeometry(CHUNK_M, CHUNK_M);
  geos.ceiling.rotateX(Math.PI / 2);

  // 42U-ish server rack: cabinet + plinth + top cap
  geos.rack = mergeGeometries([
    boxAt(1.1, 2.1, 0.9, 0, 1.12, 0),
    boxAt(1.14, 0.14, 0.94, 0, 0.07, 0),
    boxAt(1.14, 0.06, 0.94, 0, 2.2, 0)
  ]);

  geos.led = new THREE.PlaneGeometry(0.055, 0.028);

  geos.tube = new THREE.BoxGeometry(1.15, 0.045, 0.13);
  geos.fixtureHousing = new THREE.BoxGeometry(1.3, 0.09, 0.32);

  geos.desk = mergeGeometries([
    boxAt(1.6, 0.06, 0.8, 0, 0.74, 0),
    boxAt(0.05, 0.72, 0.76, -0.75, 0.36, 0),
    boxAt(0.05, 0.72, 0.76, 0.75, 0.36, 0),
    boxAt(1.5, 0.4, 0.04, 0, 0.5, -0.36)
  ]);

  geos.chair = mergeGeometries([
    boxAt(0.45, 0.06, 0.45, 0, 0.46, 0),
    boxAt(0.45, 0.55, 0.06, 0, 0.78, -0.2),
    boxAt(0.06, 0.44, 0.06, 0, 0.22, 0),
    boxAt(0.5, 0.05, 0.5, 0, 0.03, 0)
  ]);

  geos.cabinet = boxAt(0.55, 1.35, 0.62, 0, 0.675, 0);

  // workstation: split into desk (wood) and hardware (plastic) so the two
  // instanced meshes can carry different materials while sharing matrices
  geos.wsDesk = mergeGeometries([
    boxAt(1.3, 0.05, 0.68, 0, 0.72, 0.05),
    boxAt(0.05, 0.7, 0.62, -0.6, 0.35, 0.05),
    boxAt(0.05, 0.7, 0.62, 0.6, 0.35, 0.05)
  ]);
  geos.wsHardware = mergeGeometries([
    boxAt(0.42, 0.38, 0.4, 0, 0.94, -0.06),    // CRT monitor
    boxAt(0.46, 0.04, 0.34, 0, 0.7, -0.06),    // monitor plinth
    boxAt(0.42, 0.025, 0.15, 0, 0.76, 0.25),   // keyboard
    boxAt(0.19, 0.48, 0.44, 0.42, 0.24, 0.05)  // tower under the desk
  ]);
  geos.screen = new THREE.PlaneGeometry(0.3, 0.24);

  // UPS battery cabinet: wide, heavy, vented top
  geos.battery = mergeGeometries([
    boxAt(1.7, 1.3, 0.75, 0, 0.65, 0),
    boxAt(1.5, 0.09, 0.6, 0, 1.35, 0),
    boxAt(1.74, 0.1, 0.79, 0, 0.05, 0)
  ]);

  // NOC status wall screen
  geos.wallScreen = new THREE.PlaneGeometry(1.5, 0.85);

  // disturbed raised floor: the dark opening, and the tile set down askew
  geos.hole = new THREE.PlaneGeometry(0.92, 0.92);
  geos.hole.rotateX(-Math.PI / 2);
  geos.holeGlow = new THREE.PlaneGeometry(0.6, 0.6);
  geos.holeGlow.rotateX(-Math.PI / 2);
  geos.tile = new THREE.BoxGeometry(0.95, 0.04, 0.95);
  geos.paper = new THREE.PlaneGeometry(0.21, 0.3);
  geos.paper.rotateX(-Math.PI / 2);
  geos.pillar = new THREE.BoxGeometry(0.5, WALL_H, 0.5);
  geos.tray = new THREE.BoxGeometry(0.5, 0.09, CELL + 0.2);
  geos.cable = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
  return geos;
}

// LED palette: mostly green, some red / blue / amber
const LED_COLORS = [
  [0.1, 1.0, 0.25], [0.1, 1.0, 0.25], [0.1, 1.0, 0.25], [0.1, 1.0, 0.25],
  [1.0, 0.12, 0.08], [1.0, 0.12, 0.08],
  [0.15, 0.4, 1.0], [0.15, 0.4, 1.0],
  [1.0, 0.6, 0.1]
];

// ------------------------------------------------------------------ world ----

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

function composed(x, y, z, ry = 0, s = 1) {
  _pos.set(x, y, z);
  _euler.set(0, ry, 0);
  _quat.setFromEuler(_euler);
  _scale.setScalar(s);
  return _m4.compose(_pos, _quat, _scale).clone();
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.mats = makeMaterials();
    this.geos = buildGeometries();
    this.ledMat = ledMaterial();
    this.tubeMat = tubeMaterial();
    this.chunks = new Map();
    this.buildQueue = [];
    this.time = 0;
    this.lightTimer = 0;
    this.firstLoad = true;
    this.surge = 0; // LED activity surge, decays on its own

    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xd4f0dd, 0, 16, 1.8);
      l.position.y = WALL_H - 0.3;
      scene.add(l);
      this.lights.push(l);
    }
    this.litFixturesNear = []; // fixtures currently driving the light pool
  }

  key(cx, cy) { return cx + ',' + cy; }

  update(playerPos, dt) {
    this.time += dt;
    this.ledMat.uniforms.uTime.value = this.time;
    this.surge *= Math.exp(-dt / 5);
    this.ledMat.uniforms.uSurge.value = this.surge;

    const pcx = Math.floor(playerPos.x / CHUNK_M);
    const pcy = Math.floor(playerPos.z / CHUNK_M);

    // queue missing chunks, closest first
    for (let cy = pcy - LOAD_R; cy <= pcy + LOAD_R; cy++) {
      for (let cx = pcx - LOAD_R; cx <= pcx + LOAD_R; cx++) {
        const k = this.key(cx, cy);
        if (!this.chunks.has(k) && !this.buildQueue.some(q => q.k === k)) {
          this.buildQueue.push({ k, cx, cy, d: Math.abs(cx - pcx) + Math.abs(cy - pcy) });
        }
      }
    }
    if (this.buildQueue.length) {
      this.buildQueue.sort((a, b) => a.d - b.d);
      const perFrame = this.firstLoad ? this.buildQueue.length : 2;
      for (let i = 0; i < perFrame && this.buildQueue.length; i++) {
        const { k, cx, cy } = this.buildQueue.shift();
        this.chunks.set(k, this.buildChunk(cx, cy));
      }
      this.firstLoad = false;
    }

    // drop far chunks
    for (const [k, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > UNLOAD_R || Math.abs(chunk.cy - pcy) > UNLOAD_R) {
        this.disposeChunk(chunk);
        this.chunks.delete(k);
      }
    }

    this.updateFixtures(playerPos, dt);
  }

  // ------------------------------------------------------------ lighting ----

  updateFixtures(playerPos, dt) {
    // advance flicker state on fixtures in nearby chunks
    for (const chunk of this.chunks.values()) {
      if (Math.abs(chunk.cx * CHUNK_M + CHUNK_M / 2 - playerPos.x) > CHUNK_M * 2.5) continue;
      if (Math.abs(chunk.cy * CHUNK_M + CHUNK_M / 2 - playerPos.z) > CHUNK_M * 2.5) continue;
      let dirty = false;
      for (const f of chunk.fixtures) {
        let v;
        if (f.override) {
          if (this.time >= f.override.until) {
            f.override = null;
          } else {
            const m = f.override.mode;
            v = m === 'off' ? 0.02
              : m === 'on' ? 1
              : flickerIntensity(this.time * 4, f.seed + 7, true); // strobe
          }
        }
        if (v === undefined) {
          if (f.state === MZ.FIX.ON) v = 1;
          else v = flickerIntensity(this.time, f.seed, f.state === MZ.FIX.DYING);
        }
        if (v !== f.intensity) {
          f.intensity = v;
          chunk.tubeGlow.setX(f.index, v);
          dirty = true;
        }
      }
      if (dirty) chunk.tubeGlow.needsUpdate = true;
    }

    // periodically re-pick the fixtures that own a real PointLight
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const near = [];
      for (const chunk of this.chunks.values()) {
        for (const f of chunk.fixtures) {
          const dx = f.x - playerPos.x, dz = f.z - playerPos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 26 * 26) near.push({ f, d2 });
        }
      }
      near.sort((a, b) => a.d2 - b.d2);
      this.litFixturesNear = near.slice(0, LIGHT_POOL).map(n => n.f);
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const f = this.litFixturesNear[i];
      if (f) {
        l.position.set(f.x, WALL_H - 0.35, f.z);
        l.intensity = 55 * f.intensity;
      } else {
        l.intensity = 0;
      }
    }
  }

  // -------------------------------------------------------------- queries ----

  /** Rack rows and live fixtures near a point, for the audio system. */
  audioTargets(playerPos) {
    const racks = [], lights = [];
    for (const chunk of this.chunks.values()) {
      for (const r of chunk.rackPoints) {
        const dx = r.x - playerPos.x, dz = r.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 26 * 26) racks.push({ ...r, d2 });
      }
      for (const f of chunk.fixtures) {
        const dx = f.x - playerPos.x, dz = f.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 20 * 20) lights.push({ f, d2 });
      }
    }
    racks.sort((a, b) => a.d2 - b.d2);
    lights.sort((a, b) => a.d2 - b.d2);
    return { racks: racks.slice(0, 4), lights: lights.slice(0, 3).map(l => l.f) };
  }

  /** All workstations within radius r of a point, nearest first. */
  workstationsNear(pos, r) {
    const out = [];
    const r2 = r * r;
    const ccx = Math.floor(pos.x / CHUNK_M), ccy = Math.floor(pos.z / CHUNK_M);
    for (let gy = ccy - 1; gy <= ccy + 1; gy++) {
      for (let gx = ccx - 1; gx <= ccx + 1; gx++) {
        const chunk = this.chunks.get(this.key(gx, gy));
        if (!chunk) continue;
        for (const ws of chunk.workstations) {
          const dx = ws.x - pos.x, dz = ws.z - pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < r2) { ws.d2 = d2; out.push(ws); }
        }
      }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out;
  }

  /**
   * Poltergeist a nearby fluorescent: lit fixtures die or strobe, dark ones
   * snap on. Returns the fixture's position (for sound coupling) or null.
   */
  lightEvent(playerPos) {
    const near = [];
    for (const chunk of this.chunks.values()) {
      for (const f of chunk.fixtures) {
        const dx = f.x - playerPos.x, dz = f.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 18 * 18 && !f.override) near.push(f);
      }
    }
    if (!near.length) return null;
    const f = near[Math.floor(Math.random() * near.length)];
    const lit = f.state === MZ.FIX.ON || f.state === MZ.FIX.FLICKER;
    const r = Math.random();
    const mode = r < 0.3 ? 'strobe' : lit ? 'off' : 'on';
    f.override = { mode, until: this.time + 6 + Math.random() * 12 };
    return { x: f.x, z: f.z, mode };
  }

  /** Kick the global LED activity surge (decays over ~5 s). */
  triggerSurge() {
    this.surge = 1;
  }

  /**
   * The workstation the player could interact with right now: within reach,
   * on the screen side of the desk, and roughly in the middle of the view.
   */
  interactableAt(camPos, camFwd) {
    let best = null, bestD2 = 2.4 * 2.4;
    const ccx = Math.floor(camPos.x / CHUNK_M), ccy = Math.floor(camPos.z / CHUNK_M);
    for (let gy = ccy - 1; gy <= ccy + 1; gy++) {
      for (let gx = ccx - 1; gx <= ccx + 1; gx++) {
        const chunk = this.chunks.get(this.key(gx, gy));
        if (!chunk) continue;
        for (const ws of chunk.workstations) {
          const dx = camPos.x - ws.x, dz = camPos.z - ws.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= bestD2) continue;
          if (dx * ws.fx + dz * ws.fz < 0.15) continue; // behind the monitor
          const d = Math.sqrt(d2) || 1e-6;
          if ((-dx * camFwd.x - dz * camFwd.z) / d < 0.45) continue; // not looking at it
          best = ws;
          bestD2 = d2;
        }
      }
    }
    return best;
  }

  /** Push a circle at (x, z) with radius r out of walls and prop colliders. */
  resolveCollision(x, z, r) {
    for (let pass = 0; pass < 3; pass++) {
      const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (MZ.wallE(gx, gy)) {
            const wx = (gx + 1) * CELL, wz = (gy + 0.5) * CELL;
            const p = pushCircle(x, z, r, wx - WALL_T / 2, wz - (CELL + WALL_T) / 2, wx + WALL_T / 2, wz + (CELL + WALL_T) / 2);
            x = p.x; z = p.z;
          }
          if (MZ.wallS(gx, gy)) {
            const wx = (gx + 0.5) * CELL, wz = (gy + 1) * CELL;
            const p = pushCircle(x, z, r, wx - (CELL + WALL_T) / 2, wz - WALL_T / 2, wx + (CELL + WALL_T) / 2, wz + WALL_T / 2);
            x = p.x; z = p.z;
          }
        }
      }
      const ccx = Math.floor(x / CHUNK_M), ccy = Math.floor(z / CHUNK_M);
      for (let gy = ccy - 1; gy <= ccy + 1; gy++) {
        for (let gx = ccx - 1; gx <= ccx + 1; gx++) {
          const chunk = this.chunks.get(this.key(gx, gy));
          if (!chunk) continue;
          for (const c of chunk.colliders) {
            if (x + r < c[0] || x - r > c[2] || z + r < c[1] || z - r > c[3]) continue;
            const p = pushCircle(x, z, r, c[0], c[1], c[2], c[3]);
            x = p.x; z = p.z;
          }
        }
      }
    }
    return { x, z };
  }

  // ---------------------------------------------------------- chunk build ----

  buildChunk(cx, cy) {
    const group = new THREE.Group();
    const walls = [], racks = [], housings = [], tubes = [], desks = [], chairs = [],
      cabinets = [], papers = [], pillars = [], trays = [], cables = [], wsMats = [],
      batteries = [], holes = [], tiles = [];
    const leds = { mats: [], colors: [], blinks: [] };
    const screens = { mats: [], colors: [], blinks: [] };
    const glows = { mats: [], colors: [], blinks: [] };     // under-floor red
    const wallScr = { mats: [], colors: [], blinks: [] };   // NOC status walls
    const tubeGlows = [];
    const fixtures = [];
    const rackPoints = [];
    const workstations = [];
    const colliders = []; // [minX, minZ, maxX, maxZ]
    const x0 = cx * CHUNK, y0 = cy * CHUNK;

    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;

        // walls: each cell owns its E and S edges (neighbours own the rest)
        if (MZ.wallE(x, y)) walls.push(composed((x + 1) * CELL, WALL_H / 2, wz));
        if (MZ.wallS(x, y)) walls.push(composed(wx, WALL_H / 2, (y + 1) * CELL, Math.PI / 2));

        // ceiling fixtures
        const fix = MZ.fixtureAt(x, y);
        if (fix) {
          const alongZ = !MZ.wallN(x, y) && !MZ.wallS(x, y);
          const ry = alongZ ? Math.PI / 2 : 0;
          housings.push(composed(wx, WALL_H - 0.05, wz, ry));
          const idx = tubes.length;
          tubes.push(composed(wx, WALL_H - 0.11, wz, ry));
          const glow0 = fix.state === MZ.FIX.ON ? 1 : fix.state === MZ.FIX.DEAD ? 0 : 0.5;
          tubeGlows.push(glow0);
          if (fix.state !== MZ.FIX.DEAD) {
            fixtures.push({ x: wx, z: wz, state: fix.state, seed: fix.seed, index: idx, intensity: glow0 });
          }
        }

        // spawn cell stays clear of props
        const isSpawn = x === 0 && y === 0;

        // server racks
        const sides = isSpawn ? null : MZ.rackSides(x, y);
        if (sides) {
          for (const s of sides) {
            this.placeRackRow(x, y, s.side, s.count, racks, leds, colliders);
          }
          rackPoints.push({ x: wx, y: 1.2, z: wz, seed: MZ.hash(x, y, 33) });
        }

        // battery-room UPS cabinet rows
        const bsides = isSpawn ? null : MZ.batterySides(x, y);
        if (bsides) {
          for (const side of bsides) {
            this.placeBatteryRow(x, y, side, batteries, leds, colliders);
          }
          rackPoints.push({ x: wx, y: 0.9, z: wz, seed: MZ.hash(x, y, 35), type: 'battery' });
        }

        // NOC status screens on walls
        const wsc = MZ.wallScreenAt(x, y);
        if (wsc) {
          const inset = WALL_T / 2 + 0.03;
          let sx = wx, sz = wz, ry = 0;
          if (wsc === 'N') { sz = y * CELL + inset; ry = 0; }
          else if (wsc === 'S') { sz = (y + 1) * CELL - inset; ry = Math.PI; }
          else if (wsc === 'W') { sx = x * CELL + inset; ry = Math.PI / 2; }
          else { sx = (x + 1) * CELL - inset; ry = -Math.PI / 2; }
          wallScr.mats.push(composed(sx, 1.8, sz, ry));
          const warm = MZ.hash(x, y, 36) < 0.3;
          wallScr.colors.push(...(warm ? [0.5, 0.28, 0.05] : [0.07, 0.3, 0.38]));
          const fl = MZ.hash(x, y, 37);
          wallScr.blinks.push(fl < 0.35 ? 0.4 + fl : 0, fl * 8);
        }

        // disturbed raised floor
        const dist = isSpawn ? null : MZ.floorDisturbAt(x, y);
        if (dist) {
          const hx = wx + dist.ox, hz = wz + dist.oz;
          holes.push(composed(hx, 0.015, hz, dist.ry));
          // the lifted tile, set down askew beside the opening
          const ta = MZ.hash(x, y, 57) * Math.PI * 2;
          tiles.push(composed(
            hx + Math.cos(ta) * 1.05, 0.045, hz + Math.sin(ta) * 1.05,
            dist.ry + (MZ.hash(x, y, 58) - 0.5) * 1.2
          ));
          if (dist.glow) {
            glows.mats.push(composed(hx, 0.03, hz, 0));
            glows.colors.push(0.55, 0.05, 0.02);
            const gf = MZ.hash(x, y, 59);
            glows.blinks.push(gf < 0.5 ? 0.3 + gf : 0, gf * 6);
          }
          if (dist.cables) {
            // cables snaking up out of the sub-floor
            for (let i = 0; i < 2; i++) {
              const m = new THREE.Matrix4();
              const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                0.5 + MZ.hash(x, y + i, 51) * 0.8, MZ.hash(x, y + i, 52) * Math.PI * 2, 0));
              m.compose(
                new THREE.Vector3(hx + (MZ.hash(x, y + i, 53) - 0.5) * 0.5, 0.18, hz + (MZ.hash(x, y + i, 54) - 0.5) * 0.5),
                q,
                new THREE.Vector3(1, 0.55, 1)
              );
              cables.push(m);
            }
          }
        }

        // computer workstations (interactable terminals)
        const ws = isSpawn ? null : MZ.workstationAt(x, y);
        if (ws) {
          this.placeWorkstation(x, y, ws, wsMats, screens, workstations, colliders);
        }

        // furniture (workstation cells keep their floor clear)
        const props = (isSpawn || ws) ? null : MZ.propsAt(x, y);
        if (props) {
          if (props.desk) {
            const ry = Math.floor(MZ.hash(x, y, 41) * 4) * Math.PI / 2;
            const dx = wx + (MZ.hash(x, y, 42) - 0.5) * 1.2;
            const dz = wz + (MZ.hash(x, y, 43) - 0.5) * 1.2;
            desks.push(composed(dx, 0, dz, ry));
            colliders.push([dx - 0.85, dz - 0.45, dx + 0.85, dz + 0.45]);
            if (props.chair) {
              chairs.push(composed(dx + 0.2, 0, dz + 0.8, ry + (MZ.hash(x, y, 44) - 0.5) * 2));
            }
          } else if (props.chair) {
            const ry = MZ.hash(x, y, 45) * Math.PI * 2;
            const chx = wx + (MZ.hash(x, y, 46) - 0.5) * 2;
            const chz = wz + (MZ.hash(x, y, 47) - 0.5) * 2;
            chairs.push(composed(chx, 0, chz, ry));
          }
          if (props.cabinet) {
            const cbx = wx + (MZ.hash(x, y, 48) - 0.5) * 2.4;
            const cbz = wz + (MZ.hash(x, y, 49) - 0.5) * 2.4;
            cabinets.push(composed(cbx, 0, cbz, MZ.hash(x, y, 50) * Math.PI));
            colliders.push([cbx - 0.35, cbz - 0.35, cbx + 0.35, cbz + 0.35]);
          }
          for (let i = 0; i < props.papers; i++) {
            papers.push(composed(
              wx + (MZ.hash(x, y, 60 + i) - 0.5) * 3,
              0.012 + i * 0.004,
              wz + (MZ.hash(x, y, 64 + i) - 0.5) * 3,
              MZ.hash(x, y, 68 + i) * Math.PI * 2
            ));
          }
        }

        // hall pillars
        if (!isSpawn && MZ.pillarAt(x, y)) {
          const px = x * CELL, pz = y * CELL;
          pillars.push(composed(px, WALL_H / 2, pz));
          colliders.push([px - 0.3, pz - 0.3, px + 0.3, pz + 0.3]);
        }

        // overhead cable trays + hanging cables
        const tray = MZ.trayAt(x, y);
        if (tray) trays.push(composed(wx, WALL_H - 0.25, wz, tray === 'x' ? Math.PI / 2 : 0));
        const hang = MZ.hangingCableAt(x, y);
        if (hang) {
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hang.tilt, 0, hang.tilt * 0.7));
          m.compose(
            new THREE.Vector3(wx + hang.ox, WALL_H - hang.len / 2, wz + hang.oz),
            q,
            new THREE.Vector3(1, hang.len, 1)
          );
          cables.push(m);
        }
      }
    }

    // ---- instantiate ----
    const addInst = (geo, mat, list, ownGeo = false) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.ownGeo = ownGeo;
      group.add(mesh);
      return mesh;
    };

    const g = this.geos, m = this.mats;
    addInst(g.wall, m.wall, walls);
    addInst(g.rack, m.rack, racks);
    addInst(g.fixtureHousing, m.fixtureHousing, housings);
    addInst(g.desk, m.furniture, desks);
    addInst(g.chair, m.furnitureMetal, chairs);
    addInst(g.cabinet, m.furnitureMetal, cabinets);
    addInst(g.paper, m.paper, papers);
    addInst(g.pillar, m.wall, pillars);
    addInst(g.tray, m.metalDark, trays);
    addInst(g.cable, m.cable, cables);
    addInst(g.wsDesk, m.furniture, wsMats);
    addInst(g.wsHardware, m.plastic, wsMats);
    addInst(g.battery, m.metalDark, batteries);
    addInst(g.hole, m.hole, holes);
    addInst(g.tile, m.ceiling, tiles);

    // fluorescent tubes carry a per-instance glow attribute
    let tubeGlow = null;
    if (tubes.length) {
      const tubeGeo = g.tube.clone();
      tubeGlow = new THREE.InstancedBufferAttribute(new Float32Array(tubeGlows), 1);
      tubeGlow.setUsage(THREE.DynamicDrawUsage);
      tubeGeo.setAttribute('aGlow', tubeGlow);
      addInst(tubeGeo, this.tubeMat, tubes, true);
    }

    // rack LEDs carry per-instance color + blink
    if (leds.mats.length) {
      const ledGeo = g.led.clone();
      ledGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(leds.colors), 3));
      ledGeo.setAttribute('aBlink', new THREE.InstancedBufferAttribute(new Float32Array(leds.blinks), 2));
      addInst(ledGeo, this.ledMat, leds.mats, true);
    }

    // emissive quads sharing the LED shader: CRTs, wall screens, floor glow
    const addEmissive = (baseGeo, set) => {
      if (!set.mats.length) return;
      const geo = baseGeo.clone();
      geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(set.colors), 3));
      geo.setAttribute('aBlink', new THREE.InstancedBufferAttribute(new Float32Array(set.blinks), 2));
      addInst(geo, this.ledMat, set.mats, true);
    };
    addEmissive(g.screen, screens);
    addEmissive(g.wallScreen, wallScr);
    addEmissive(g.holeGlow, glows);

    // floor + ceiling slabs
    const cxm = cx * CHUNK_M + CHUNK_M / 2, cym = cy * CHUNK_M + CHUNK_M / 2;
    const floor = new THREE.Mesh(g.floor, m.floor);
    floor.position.set(cxm, 0, cym);
    const ceil = new THREE.Mesh(g.ceiling, m.ceiling);
    ceil.position.set(cxm, WALL_H, cym);
    group.add(floor, ceil);

    this.scene.add(group);
    return { cx, cy, group, colliders, fixtures, rackPoints, workstations, tubeGlow };
  }

  placeWorkstation(x, y, ws, wsMats, screens, workstations, colliders) {
    const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;
    let px = wx, pz = wz, ry;
    if (MZ.zoneAt(x, y) === MZ.ZONES.NOC) {
      // console rows: every desk in the operations room faces the same way
      ry = MZ.nocFacing(x, y);
      px += (MZ.hash(x, y, 25) - 0.5) * 0.7;
      pz += (MZ.hash(x, y, 26) - 0.5) * 0.7;
    } else {
      // shove the desk against a wall when there is one; screen faces the room
      const has = { N: MZ.wallN(x, y), S: MZ.wallS(x, y), E: MZ.wallE(x, y), W: MZ.wallW(x, y) };
      const order = ['N', 'E', 'S', 'W'];
      const start = Math.floor(MZ.hash(x, y, 25) * 4);
      let side = null;
      for (let i = 0; i < 4; i++) {
        const s = order[(start + i) % 4];
        if (has[s]) { side = s; break; }
      }
      const BACK = WALL_T / 2 + 0.45;
      if (side === 'N') { pz = y * CELL + BACK; ry = 0; }              // faces +z
      else if (side === 'S') { pz = (y + 1) * CELL - BACK; ry = Math.PI; }
      else if (side === 'W') { px = x * CELL + BACK; ry = Math.PI / 2; } // faces +x
      else if (side === 'E') { px = (x + 1) * CELL - BACK; ry = -Math.PI / 2; }
      else { ry = Math.floor(MZ.hash(x, y, 26) * 4) * Math.PI / 2; }     // free-standing
    }

    wsMats.push(composed(px, 0, pz, ry));

    // glowing screen on the CRT face (local: y 0.95, z 0.145)
    const sin = Math.sin(ry), cos = Math.cos(ry);
    screens.mats.push(composed(px + 0.145 * sin, 0.95, pz + 0.145 * cos, ry));
    const flick = MZ.hash(x, y, 27);
    screens.colors.push(0.12, 0.5, 0.2);
    // most screens glow steady; a few pulse like a dying backlight
    if (flick < 0.2) screens.blinks.push(0.6 + flick * 2, flick * 7);
    else screens.blinks.push(0, 0);

    workstations.push({ x: px, z: pz, fx: sin, fz: cos, seed: ws.seed });
    colliders.push([px - 0.72, pz - 0.72, px + 0.72, pz + 0.72]);
  }

  placeBatteryRow(x, y, side, batteries, leds, colliders) {
    const D = 0.75, GAP = WALL_T / 2 + D / 2 + 0.05;
    const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;
    let px = wx, pz = wz, ry = 0, tx = 0, tz = 0;
    if (side === 'E') { px = (x + 1) * CELL - GAP; ry = -Math.PI / 2; tz = 1; }
    if (side === 'W') { px = x * CELL + GAP; ry = Math.PI / 2; tz = 1; }
    if (side === 'S') { pz = (y + 1) * CELL - GAP; ry = Math.PI; tx = 1; }
    if (side === 'N') { pz = y * CELL + GAP; ry = 0; tx = 1; }

    for (let i = -1; i <= 1; i += 2) {
      const off = i * 0.93;
      const bx = px + tx * off, bz = pz + tz * off;
      batteries.push(composed(bx, 0, bz, ry));

      // one or two charge-status LEDs, amber or red, low on the cabinet
      const sin = Math.sin(ry), cos = Math.cos(ry);
      const n = 1 + Math.floor(MZ.hash(x * 5 + i, y, 38) * 2);
      for (let j = 0; j < n; j++) {
        const lx = (MZ.hash(x, y * 7 + j, 39 + i) - 0.5) * 1.1;
        const lz = D / 2 + 0.015;
        leds.mats.push(composed(bx + lx * cos + lz * sin, 0.9 + j * 0.12, bz - lx * sin + lz * cos, ry));
        const red = MZ.hash(x * 3 + j, y - i, 40) < 0.3;
        leds.colors.push(...(red ? [1.0, 0.1, 0.05] : [1.0, 0.55, 0.08]));
        const b = MZ.hash(x * 11 + j, y + i, 75);
        leds.blinks.push(b < 0.5 ? 0 : 0.5 + b, b * 4);
      }
      colliders.push([
        Math.min(bx - 0.9 * Math.abs(cos), bx - 0.45 * Math.abs(sin)),
        Math.min(bz - 0.9 * Math.abs(sin), bz - 0.45 * Math.abs(cos)),
        Math.max(bx + 0.9 * Math.abs(cos), bx + 0.45 * Math.abs(sin)),
        Math.max(bz + 0.9 * Math.abs(sin), bz + 0.45 * Math.abs(cos))
      ]);
    }
  }

  placeRackRow(x, y, side, count, racks, leds, colliders) {
    const D = 0.9, GAP = WALL_T / 2 + D / 2 + 0.03;
    const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;
    let px = wx, pz = wz, ry = 0, tx = 0, tz = 0; // t: tangent along the wall
    if (side === 'E') { px = (x + 1) * CELL - GAP; ry = -Math.PI / 2; tz = 1; }
    if (side === 'W') { px = x * CELL + GAP; ry = Math.PI / 2; tz = 1; }
    if (side === 'S') { pz = (y + 1) * CELL - GAP; ry = Math.PI; tx = 1; }
    if (side === 'N') { pz = y * CELL + GAP; ry = 0; tx = 1; }

    const offs = count === 2 ? [-1, 1] : [MZ.hash(x, y, 34) < 0.5 ? -1 : 1];
    for (const i of offs) {
      const off = i * 0.62;
      const rx = px + tx * off, rz = pz + tz * off;
      racks.push(composed(rx, 0, rz, ry));

      // status LEDs on the front face
      const n = 5 + Math.floor(MZ.hash(x * 7 + i, y, 70) * 8);
      const sin = Math.sin(ry), cos = Math.cos(ry);
      for (let j = 0; j < n; j++) {
        const lx = (MZ.hash(x, y * 3 + j, 71 + i) - 0.5) * 0.8;
        const lyy = 0.4 + MZ.hash(x, y * 5 + j, 72 + i) * 1.6;
        const lz = D / 2 + 0.015;
        // rotate the local offset by ry
        const ox = lx * cos + lz * sin;
        const oz = -lx * sin + lz * cos;
        leds.mats.push(composed(rx + ox, lyy, rz + oz, ry));
        const c = LED_COLORS[Math.floor(MZ.hash(x * 13 + j, y + i, 73) * LED_COLORS.length)];
        leds.colors.push(c[0], c[1], c[2]);
        const blinkRoll = MZ.hash(x * 17 + j, y - i, 74);
        if (blinkRoll < 0.45) leds.blinks.push(0, 0); // steady
        else if (blinkRoll < 0.8) leds.blinks.push(6 + blinkRoll * 10, blinkRoll * 9); // data activity
        else leds.blinks.push(1 + blinkRoll, blinkRoll * 5); // slow status blink
      }
      colliders.push([rx - 0.62, rz - 0.62, rx + 0.62, rz + 0.62]);
    }
  }

  disposeChunk(chunk) {
    this.scene.remove(chunk.group);
    chunk.group.traverse(o => {
      if (o.isInstancedMesh) {
        o.dispose();
        if (o.userData.ownGeo) o.geometry.dispose();
      }
    });
  }
}

// Random-telegraph flicker. Quantised time + hash gives held states with
// abrupt transitions, like a failing tube starter.
function flickerIntensity(t, seed, dying) {
  const step = Math.floor(t * 9) + seed;
  const n = fract(Math.sin(step * 12.9898) * 43758.5453);
  const n2 = fract(Math.sin(step * 78.233) * 12543.851);
  if (dying) {
    return n < 0.82 ? 0.02 : 0.45 + 0.55 * n2; // mostly off, hard strobes
  }
  return n < 0.16 ? 0.15 + 0.45 * n2 : 1.0; // mostly on, drops out
}

function fract(v) { return v - Math.floor(v); }

function pushCircle(x, z, r, minX, minZ, maxX, maxZ) {
  const cx = Math.max(minX, Math.min(x, maxX));
  const cz = Math.max(minZ, Math.min(z, maxZ));
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { x, z };
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    return { x: x + dx * push, z: z + dz * push };
  }
  // centre inside the box: push out along the axis of least penetration
  const left = x - minX, right = maxX - x, top = z - minZ, bottom = maxZ - z;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: minX - r, z };
  if (min === right) return { x: maxX + r, z };
  if (min === top) return { x, z: minZ - r };
  return { x, z: maxZ + r };
}
