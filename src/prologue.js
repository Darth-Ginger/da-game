// The cold open. Before the tape, there is a shift: a bright, beige,
// climate-controlled NOC at 2:41 AM. Email is quiet. Streamflix is paused.
// Minesweeper is going okay. The player can look around but not leave the
// chair — there is nowhere to go. Then Nagios goes red, three sections of
// the facility map start pulsing, and a mail from the Site Director opens
// over the game. Everything here renders CLEAN, full resolution, no VHS —
// the tape is what happens next.

import * as THREE from 'three';

const SEAT = new THREE.Vector3(0, 1.24, 1.5);

// ------------------------------------------------------------- canvases ----

function makeScreen(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx, tex };
}

const NAGIOS_ROWS = [
  ['anesidora-n03', 'shard consolidation', 'ok', 'pass 18/18 (99.2%)'],
  ['anesidora-n17', 'shard consolidation', 'ok', 'pass 18/18 (99.4%)'],
  ['sl3-hvac-01', 'supply air temp', 'ok', '18.2 C'],
  ['sl3-env-b2', 'aisle temp delta', 'b2', 'TEMP +7.4 C (raw sensor)'],
  ['sl3-door-c1', 'door contact', 'c1', 'OPEN for 00:09:41'],
  ['sl3-pdu-c4', 'branch load', 'c4', 'LOAD 97% (was 41%)'],
  ['sl3-ups-a1', 'battery string', 'ok', 'float 54.1 V'],
  ['sl3-core-sw1', 'airgap policy', 'ok', 'all uplinks admin-down'],
  ['sl3-tape-lib', 'changer status', 'ok', 'idle'],
  ['sl3-badge-01', 'door controller', 'ok', 'last event 18:04']
];

function drawNagios(s, state, pulse) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#e9e9e4';
  ctx.fillRect(0, 0, W, H);
  // header
  ctx.fillStyle = '#232f3a';
  ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = '#f5c33b';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Nagios', 18, 36);
  ctx.fillStyle = '#dfe5ea';
  ctx.font = '20px Arial';
  ctx.fillText('Core  ·  sublevel3-mon01  ·  Service Status', 110, 36);
  // summary tiles
  const crit = state === 2 ? 3 : 0;
  const tiles = [
    ['Hosts Up', '96', '#4b9b4f'],
    ['Services OK', String(214 - crit), '#4b9b4f'],
    ['Warning', state === 1 ? '3' : '0', state === 1 ? '#d8a placeholder' : '#8d949b'],
    ['Critical', String(crit), crit ? '#c0392b' : '#8d949b']
  ];
  tiles[2][2] = state === 1 ? '#d89d2a' : '#8d949b';
  let tx = 18;
  for (const [label, val, color] of tiles) {
    ctx.fillStyle = color;
    ctx.fillRect(tx, 66, 150, 56);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(val, tx + 12, 104);
    ctx.font = '15px Arial';
    ctx.fillText(label, tx + 52, 100);
    tx += 162;
  }
  // critical banner
  if (state === 2) {
    ctx.fillStyle = pulse ? '#c0392b' : '#7e2419';
    ctx.fillRect(W - 330, 66, 312, 56);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px Arial';
    ctx.fillText('3 CRITICAL — UNHANDLED', W - 312, 100);
  }
  // table
  const top = 142, rowH = 40;
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#5a6068';
  ctx.fillText('Host', 18, top - 8);
  ctx.fillText('Service', 250, top - 8);
  ctx.fillText('Status', 520, top - 8);
  ctx.fillText('Information', 650, top - 8);
  ctx.font = '16px Arial';
  NAGIOS_ROWS.forEach((row, i) => {
    const y = top + i * rowH;
    ctx.fillStyle = i % 2 ? '#f6f6f2' : '#ffffff';
    ctx.fillRect(10, y, W - 20, rowH - 2);
    const alerted = row[2] !== 'ok' && state >= 1;
    const critical = alerted && state === 2;
    ctx.fillStyle = !alerted ? '#4b9b4f' : critical ? (pulse ? '#c0392b' : '#8e2c1f') : '#d89d2a';
    ctx.fillRect(520, y + 6, 110, rowH - 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(!alerted ? 'OK' : critical ? 'CRITICAL' : 'WARNING', 532, y + 26);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#333';
    ctx.fillText(row[0], 18, y + 26);
    ctx.fillText(row[1], 250, y + 26);
    ctx.fillStyle = critical ? '#8e2c1f' : '#555';
    ctx.fillText(alerted ? row[3] : 'within thresholds', 650, y + 26);
  });
  s.tex.needsUpdate = true;
}

const MAP_BLOCKS = [];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 4; c++) {
    MAP_BLOCKS.push('ABCD'[r] + (c + 1));
  }
}
const ALERT_BLOCKS = ['B2', 'C1', 'C4'];
const NOC_BLOCK = 'B3';

function drawMap(s, alert, pulse) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0c1a28';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7fb2d9';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('EPI-SYS  ·  SUBLEVEL 3  ·  FLOOR STATUS', 20, 38);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#4a708c';
  ctx.fillText('ENV / DOOR / POWER OVERLAY — LIVE', 20, 60);

  const gx = 40, gy = 84, bw = (W - 100) / 4, bh = (H - 130) / 4, gap = 12;
  MAP_BLOCKS.forEach((name, i) => {
    const r = Math.floor(i / 4), c = i % 4;
    const x = gx + c * (bw + gap) * 0.98, y = gy + r * (bh + gap) * 0.96;
    const isAlert = alert && ALERT_BLOCKS.includes(name);
    const isNoc = name === NOC_BLOCK;
    ctx.fillStyle = isAlert ? (pulse ? '#b03024' : '#571812') : isNoc ? '#144d55' : '#142f44';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = isAlert ? '#ff6b57' : '#33607e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = isAlert ? '#ffd9d2' : '#9fc3da';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(name, x + 10, y + 28);
    ctx.font = '13px Arial';
    if (isNoc) {
      ctx.fillStyle = '#8fe3d8';
      ctx.fillText('NOC — YOU ARE HERE', x + 10, y + bh - 12);
    } else if (isAlert) {
      ctx.fillText('!! SENSOR EVENT', x + 10, y + bh - 12);
    } else {
      ctx.fillStyle = '#54788f';
      ctx.fillText(['stacks', 'aisles', 'battery', 'storage'][(i * 7) % 4], x + 10, y + bh - 12);
    }
  });
  s.tex.needsUpdate = true;
}

function drawEmailClient(s, hasNew) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#d4d0c8';
  ctx.fillRect(0, 0, W, H);
  // title bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#0a246a');
  grad.addColorStop(1, '#a6caf0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Tahoma, Arial';
  ctx.fillText(`Epi-Mail — Inbox${hasNew ? ' (1)' : ''}`, 8, 18);
  // toolbar
  ctx.fillStyle = '#ece9d8';
  ctx.fillRect(0, 26, W, 30);
  ctx.fillStyle = '#444';
  ctx.font = '13px Tahoma, Arial';
  ctx.fillText('New   Reply   Forward   Delete        Search…', 10, 46);
  // folders
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 56, 110, H - 78);
  ctx.fillStyle = '#333';
  ['Inbox', 'Sent', 'Drafts', 'Junk', 'facilities', 'oncall'].forEach((f, i) => {
    ctx.font = i === 0 && hasNew ? 'bold 13px Tahoma' : '13px Tahoma';
    ctx.fillText(f + (i === 0 && hasNew ? ' (1)' : ''), 12, 80 + i * 24);
  });
  // message list
  const msgs = [
    hasNew ? ['halvorsen.r', '[ACTION REQUIRED] Env anomalies — B2 / C1 / C4', '2:44 AM', true] : null,
    ['it-all', 'Scheduled certificate rotation — no action needed', 'Fri', false],
    ['facilities', 'RE: RE: fridge cleanout FRIDAY (final warning)', 'Thu', false],
    ['halvorsen.r', 'Floor watch rotation — April', 'Mon', false],
    ['no-reply', 'Your timesheet was approved', 'Mon', false]
  ].filter(Boolean);
  let y = 66;
  for (const [from, subj, when, unread] of msgs) {
    if (unread) {
      ctx.fillStyle = '#fff3c2';
      ctx.fillRect(112, y - 12, W - 114, 40);
    }
    ctx.font = unread ? 'bold 13px Tahoma' : '13px Tahoma';
    ctx.fillStyle = '#222';
    ctx.fillText(from, 120, y + 2);
    ctx.fillText(subj.slice(0, 46), 120, y + 18);
    ctx.fillStyle = '#666';
    ctx.fillText(when, W - 52, y + 2);
    y += 46;
  }
  // taskbar clock
  ctx.fillStyle = '#c3bfb6';
  ctx.fillRect(0, H - 22, W, 22);
  ctx.fillStyle = '#333';
  ctx.font = '12px Tahoma';
  ctx.fillText(hasNew ? '2:44 AM' : '2:41 AM', W - 54, H - 7);
  s.tex.needsUpdate = true;
}

function drawStream(s) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d81f26';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('STREAMFLIX', 16, 38);
  const row = (label, y, prog) => {
    ctx.fillStyle = '#e5e5e5';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(label, 16, y);
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 162;
      const g = ctx.createLinearGradient(x, y + 8, x + 150, y + 96);
      g.addColorStop(0, `hsl(${(i * 77 + y) % 360}, 42%, 30%)`);
      g.addColorStop(1, `hsl(${(i * 77 + y + 60) % 360}, 45%, 14%)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 8, 150, 88);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 13px Arial';
      const titles = ['Grave Shift', 'The Long Hall', 'Colder', 'Server Room', 'Third Watch', 'Static'];
      ctx.fillText(titles[(i + (y > 200 ? 3 : 0)) % 6], x + 8, y + 88);
      if (prog && i === 0) {
        ctx.fillStyle = '#555';
        ctx.fillRect(x, y + 98, 150, 5);
        ctx.fillStyle = '#d81f26';
        ctx.fillRect(x, y + 98, 96, 5);
      }
    }
  };
  row('Continue watching', 70, true);
  row('Because you watched Grave Shift', 220, false);
  ctx.fillStyle = '#777';
  ctx.font = '12px Arial';
  ctx.fillText('Paused — are you still watching?', 16, H - 14);
  s.tex.needsUpdate = true;
}

// deterministic little minesweeper mid-game
function drawMines(s, toast) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(0, 0, W, H);
  const bevel = (x, y, w, h, inset) => {
    ctx.fillStyle = inset ? '#808080' : '#ffffff';
    ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = inset ? '#ffffff' : '#808080';
    ctx.fillRect(x, y + h - 3, w, 3); ctx.fillRect(x + w - 3, y, 3, h);
  };
  bevel(4, 4, W - 8, H - 8, false);
  // header: counters + smiley
  ctx.fillStyle = '#c0c0c0';
  bevel(16, 16, W - 32, 52, true);
  ctx.fillStyle = '#000';
  ctx.fillRect(28, 24, 74, 36);
  ctx.fillRect(W - 102, 24, 74, 36);
  ctx.fillStyle = '#f00';
  ctx.font = 'bold 32px "Courier New", monospace';
  ctx.fillText('038', 34, 53);
  ctx.fillText('161', W - 96, 53);
  bevel(W / 2 - 22, 22, 44, 40, false);
  ctx.font = '24px Arial';
  ctx.fillText('🙂', W / 2 - 15, 52);
  // grid
  const cols = 16, rows = 11, cs = 28;
  const gx = (W - cols * cs) / 2, gy = 84;
  bevel(gx - 6, gy - 6, cols * cs + 12, rows * cs + 12, true);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const numColors = ['', '#0000ff', '#008000', '#ff0000', '#000080'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + c * cs, y = gy + r * cs;
      const revealed = c + r < 14 && rnd() < 0.8;
      if (revealed) {
        ctx.fillStyle = '#bdbdbd';
        ctx.fillRect(x, y, cs, cs);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cs, cs);
        const n = rnd() < 0.45 ? 1 + Math.floor(rnd() * 3) : 0;
        if (n) {
          ctx.fillStyle = numColors[n];
          ctx.font = 'bold 18px Arial';
          ctx.fillText(String(n), x + 9, y + 21);
        }
      } else {
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(x, y, cs, cs);
        bevel(x, y, cs, cs, false);
        if (rnd() < 0.05) {
          ctx.font = '15px Arial';
          ctx.fillText('🚩', x + 5, y + 20);
        }
      }
    }
  }
  if (toast) {
    ctx.fillStyle = 'rgba(20,24,30,0.94)';
    ctx.fillRect(W - 320, H - 84, 304, 66);
    ctx.strokeStyle = '#5a7ba8';
    ctx.strokeRect(W - 320, H - 84, 304, 66);
    ctx.fillStyle = '#dfe8f4';
    ctx.font = 'bold 15px Tahoma, Arial';
    ctx.fillText('New message — halvorsen.r', W - 306, H - 58);
    ctx.fillStyle = '#9db4d4';
    ctx.font = '13px Tahoma, Arial';
    ctx.fillText('[ACTION REQUIRED] Env anomalies…', W - 306, H - 36);
  }
  s.tex.needsUpdate = true;
}

// ------------------------------------------------------------- the room ----

export class Prologue {
  constructor(renderer, audio, touch, lockPointer) {
    this.renderer = renderer;
    this.audio = audio;
    this.touch = touch;
    this.lockPointer = lockPointer;
    this.active = false;
    this.onFinish = null;
    this.t = 0;
    this.phase = 'idle';
    this.pulseTimer = 0;
    this.pulse = false;
    this.emailOpen = false;
    this.finishing = false;
    this.yaw = 0;
    this.pitch = -0.06;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2c2a26);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(SEAT);

    this.buildRoom();

    this.emailPrompt = document.getElementById('emailPrompt');
    this.emailWindow = document.getElementById('emailWindow');
    this.skipHint = document.getElementById('skipHint');
    this.fade = document.getElementById('fadeOverlay');

    document.getElementById('emailAck').addEventListener('click', () => this.finish());
    this.emailPrompt.addEventListener('click', () => this.openEmail());
    this.skipHint.addEventListener('click', () => this.finish());

    document.addEventListener('mousemove', e => {
      if (!this.active || this.emailOpen || document.pointerLockElement !== renderer.domElement) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.clampLook();
    });
    document.addEventListener('keydown', e => {
      if (!this.active) return;
      if (e.code === 'Tab') { e.preventDefault(); this.finish(); }
      if (e.code === 'KeyE' && this.phase === 'email' && !this.emailOpen) {
        e.preventDefault();
        this.openEmail();
      }
    });
    // clicking back in (after Esc) re-locks during the seated section
    renderer.domElement.addEventListener('click', () => {
      if (this.active && !this.emailOpen && !this.touch.active) this.lockPointer();
    });
  }

  clampLook() {
    this.yaw = Math.max(-1.5, Math.min(1.5, this.yaw));
    this.pitch = Math.max(-0.7, Math.min(0.55, this.pitch));
  }

  buildRoom() {
    const s = this.scene;
    const mat = {
      carpet: new THREE.MeshStandardMaterial({ color: 0x4e5248, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xb3ac9c, roughness: 0.95 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 1 }),
      desk: new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.85 }),
      partition: new THREE.MeshStandardMaterial({ color: 0x8f978d, roughness: 1 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.6 }),
      chair: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
      bezel: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 }),
      mug: new THREE.MeshStandardMaterial({ color: 0xa03a2c, roughness: 0.7 })
    };
    const box = (m, w, h, d, x, y, z, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      s.add(mesh);
      return mesh;
    };

    // shell: 13 x 3.1 x 10
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), mat.carpet);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.3);
    s.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), mat.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.1, 0.3);
    s.add(ceil);
    box(mat.wall, 13, 3.1, 0.2, 0, 1.55, -4.6);
    box(mat.wall, 13, 3.1, 0.2, 0, 1.55, 5.2);
    box(mat.wall, 0.2, 3.1, 10, -6.5, 1.55, 0.3);
    box(mat.wall, 0.2, 3.1, 10, 6.5, 1.55, 0.3);

    // warm night-shift office light: bright enough to be boring, no more
    s.add(new THREE.HemisphereLight(0xe8e4d2, 0x3c3a32, 0.95));
    for (const [lx, lz] of [[-2.5, -1.5], [2.5, -1.5], [0, 2.5]]) {
      const p = new THREE.PointLight(0xf4f0da, 9, 18, 1.5);
      p.position.set(lx, 2.9, lz);
      s.add(p);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xd9d5bf })
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.set(lx, 3.08, lz);
      s.add(glow);
    }

    // front wall band: bezel + two dashboards
    box(mat.bezel, 7.4, 2.0, 0.1, 0, 2.15, -4.48);
    this.nagios = makeScreen(1024, 600);
    this.map = makeScreen(1024, 600);
    const addPanel = (screen, x) => {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(3.35, 1.82),
        new THREE.MeshBasicMaterial({ map: screen.tex })
      );
      p.position.set(x, 2.15, -4.42);
      s.add(p);
    };
    addPanel(this.nagios, -1.78);
    addPanel(this.map, 1.78);
    drawNagios(this.nagios, 0, false);
    drawMap(this.map, false, false);

    // player desk + three monitors
    box(mat.desk, 2.6, 0.06, 0.85, 0, 0.74, 0.75);
    box(mat.desk, 2.6, 0.55, 0.05, 0, 0.45, 0.42);
    box(mat.dark, 0.42, 0.03, 0.16, 0, 0.775, 1.05); // keyboard
    box(mat.dark, 0.07, 0.025, 0.11, 0.35, 0.775, 1.05); // mouse
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.11, 10), mat.mug);
    mug.position.set(-0.55, 0.83, 1.0);
    s.add(mug);

    this.email = makeScreen(640, 480);
    this.stream = makeScreen(640, 480);
    this.mines = makeScreen(640, 480);
    const monitor = (screen, x, ry) => {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.04), mat.bezel);
      frame.position.y = 1.18;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), mat.bezel);
      stand.position.y = 0.88;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.18), mat.bezel);
      foot.position.y = 0.78;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.375),
        new THREE.MeshBasicMaterial({ map: screen.tex })
      );
      face.position.set(0, 1.18, 0.025);
      g.add(frame, stand, foot, face);
      g.position.set(x, 0, 0.68);
      g.rotation.y = ry;
      s.add(g);
    };
    monitor(this.email, -0.66, 0.3);
    monitor(this.mines, 0, 0);
    monitor(this.stream, 0.66, -0.3);
    drawEmailClient(this.email, false);
    drawStream(this.stream);
    drawMines(this.mines, false);

    // the player's chair, and the shift's emptiness: neighbour cubicles
    box(mat.chair, 0.5, 0.08, 0.5, 0, 0.52, 1.65);
    box(mat.chair, 0.5, 0.6, 0.08, 0, 0.9, 1.92);
    for (const nx of [-3.4, 3.4]) {
      box(mat.partition, 2.4, 1.5, 0.06, nx, 0.75, -0.1);
      box(mat.desk, 2.2, 0.06, 0.8, nx, 0.74, 0.45);
      box(mat.dark, 0.52, 0.4, 0.05, nx - 0.35, 1.16, 0.25, 0.12); // dead monitors
      box(mat.dark, 0.52, 0.4, 0.05, nx + 0.35, 1.16, 0.25, -0.12);
      box(mat.chair, 0.5, 0.08, 0.5, nx + 0.3, 0.52, 1.15, 0.5);
      box(mat.chair, 0.5, 0.6, 0.08, nx + 0.5, 0.9, 1.3, 0.6);
    }
    // partition behind the player
    box(mat.partition, 5.2, 1.5, 0.06, 0, 0.75, 3.6);
    box(mat.partition, 0.06, 1.5, 2.6, -2.6, 0.75, 2.4);
    box(mat.partition, 0.06, 1.5, 2.6, 2.6, 0.75, 2.4);
  }

  start() {
    this.active = true;
    this.skipHint.classList.remove('hidden');
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    // timeline
    if (this.phase === 'idle' && this.t > 8) {
      this.phase = 'warn';
      drawNagios(this.nagios, 1, false);
      if (this.audio) this.audio.alertBeep(1);
    } else if (this.phase === 'warn' && this.t > 12.5) {
      this.phase = 'crit';
      if (this.audio) this.audio.alertBeep(2);
    } else if (this.phase === 'crit' && this.t > 16) {
      this.phase = 'email';
      drawEmailClient(this.email, true);
      drawMines(this.mines, true);
      if (this.audio) this.audio.emailDing();
      this.emailPrompt.textContent = this.touch.active ? 'OPEN EMAIL' : '[E] OPEN EMAIL';
      this.emailPrompt.classList.remove('hidden');
    }

    // alert pulsing at 2 Hz
    if (this.phase === 'crit' || this.phase === 'email') {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 0.5;
        this.pulse = !this.pulse;
        drawNagios(this.nagios, 2, this.pulse);
        drawMap(this.map, true, this.pulse);
      }
    }

    // seated look
    if (this.touch.active) {
      const look = this.touch.consumeLook();
      this.yaw -= look.dx * 0.006;
      this.pitch -= look.dy * 0.006;
      this.clampLook();
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    // faint idle sway, like sitting still
    this.camera.position.set(
      SEAT.x + Math.sin(this.t * 0.45) * 0.006,
      SEAT.y + Math.sin(this.t * 0.9) * 0.004,
      SEAT.z
    );
  }

  openEmail() {
    if (this.emailOpen || this.phase !== 'email') return;
    this.emailOpen = true;
    this.emailPrompt.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.emailWindow.classList.remove('hidden');
    if (this.audio) this.audio.uiClick();
  }

  /** fade to black, tape-loading foley, hand over to the game */
  finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.emailWindow.classList.add('hidden');
    this.emailPrompt.classList.add('hidden');
    this.skipHint.classList.add('hidden');
    this.fade.classList.add('visible');
    if (this.audio) this.audio.tapeInsert();
    setTimeout(() => {
      this.active = false;
      this.dispose();
      if (this.onFinish) this.onFinish();
      // reveal the tape already rolling
      setTimeout(() => this.fade.classList.remove('visible'), 350);
    }, 1900);
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
