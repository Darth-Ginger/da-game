// Live in-world CRT screens. A small pool of canvas-textured planes binds
// to the workstation monitors nearest the player, replacing their flat glow
// with an actual console: prompt, blinking cursor, and — when the haunt
// director asks — ghost typing (with positional key clicks) or scrolling
// bursts of maintenance-log junk you catch out of the corner of your eye.

import * as THREE from 'three';
import { junkLine, rng } from './terminal.js';

const POOL = 3;
const BIND_RANGE = 13;

const CW = 224, CH = 168;      // canvas pixels
const COLS = 30, ROWS = 11;    // character grid
const LINE_H = 14, PAD = 8;

// Things "someone" types. Lowercase, hesitant, wrong.
const PHRASES = [
  'is anyone on shift tonight',
  'hello?',
  'who else is logged in',
  'the vents are breathing again',
  'i counted 41 racks in aisle 9. yesterday there were 40',
  'do not turn off console 0',
  'it gets colder when the fans stop',
  'can you hear that',
  'stop walking around',
  'im still here',
  'why is the tape still recording',
  'they said sublevel 3 has no third shift',
  'the lights come on before i touch the switch',
  'run 18 of 18. then i go home',
  'day off. of course it was my day off',
  'the airgap is not for keeping something out',
  'it finished early last month and nobody asked why',
  'i did not schedule that fan test',
  'anesidora is a pretty name for it',
  'halvorsen said watch the drives. watch them do what'
];

class ScreenUnit {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    // slightly larger than the baked glow quad so it fully covers it
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.315, 0.25),
      new THREE.MeshBasicMaterial({ map: this.tex })
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.ws = null;
    this.rand = rng(1);
    this.event = null;
    this.blinkT = 0;
    this.cursorOn = true;
    this.lines = [];
    this.input = '';
    this.prompt = '>';
  }

  bind(ws) {
    if (this.ws === ws) return;
    this.ws = ws;
    this.rand = rng(ws.seed * 2654435761 + 1);
    this.prompt = `NODE-${ws.seed.toString(16).toUpperCase().padStart(4, '0')}:~$`;
    this.lines = [];
    this.input = '';
    this.event = null;
    // sit 7 mm in front of the baked glow quad
    this.mesh.position.set(ws.x + ws.fx * 0.152, 0.95, ws.z + ws.fz * 0.152);
    this.mesh.rotation.y = Math.atan2(ws.fx, ws.fz);
    this.mesh.visible = true;
    this.draw();
  }

  unbind() {
    this.ws = null;
    this.event = null;
    this.mesh.visible = false;
  }

  print(line) {
    this.lines.push(line);
    if (this.lines.length > ROWS - 1) this.lines.splice(0, this.lines.length - (ROWS - 1));
  }

  /** type a phrase character by character, sometimes erasing it after */
  startTyping(audio) {
    if (!this.ws || this.event) return false;
    const text = PHRASES[Math.floor(this.rand() * PHRASES.length)];
    this.event = {
      kind: 'typing', text, i: 0, wait: 0.6,
      erase: this.rand() < 0.35, done: false,
      panner: audio ? audio.posPanner(this.ws.x, 1.0, this.ws.z) : null
    };
    return true;
  }

  /** scroll a burst of junk log lines */
  startLogs(audio) {
    if (!this.ws || this.event) return false;
    this.event = {
      kind: 'logs', remaining: 10 + Math.floor(this.rand() * 28),
      rate: 7 + this.rand() * 12, wait: 0.3,
      panner: audio ? audio.posPanner(this.ws.x, 1.0, this.ws.z) : null
    };
    return true;
  }

  endEvent() {
    if (this.event && this.event.panner) this.event.panner.disconnect();
    this.event = null;
  }

  update(dt, audio) {
    if (!this.ws) return;
    let dirty = false;

    this.blinkT += dt;
    if (this.blinkT > 0.53) {
      this.blinkT = 0;
      this.cursorOn = !this.cursorOn;
      dirty = true;
    }

    const ev = this.event;
    if (ev) {
      ev.wait -= dt;
      if (ev.wait <= 0) {
        if (ev.kind === 'typing') {
          if (!ev.done && ev.i < ev.text.length) {
            this.input += ev.text[ev.i++];
            ev.wait = 0.07 + this.rand() * 0.24;
            if (audio && ev.panner) audio.clickInto(ev.panner, 0.09 + this.rand() * 0.08);
            if (ev.i >= ev.text.length) { ev.done = true; ev.wait = 0.9 + this.rand() * 1.6; }
          } else if (ev.done && ev.erase && this.input.length > 0) {
            this.input = this.input.slice(0, -1);
            ev.wait = 0.05 + this.rand() * 0.07;
            if (audio && ev.panner) audio.clickInto(ev.panner, 0.06);
          } else if (ev.done) {
            if (!ev.erase) { this.print(this.prompt + ' ' + this.input); this.input = ''; }
            this.endEvent();
          }
          dirty = true;
        } else { // logs
          this.print(junkLine(this.rand));
          ev.remaining--;
          ev.wait = 1 / ev.rate;
          if (audio && ev.panner && this.rand() < 0.2) audio.clickInto(ev.panner, 0.05, 3200);
          if (ev.remaining <= 0) { this.print(''); this.endEvent(); }
          dirty = true;
        }
      }
    }

    if (dirty) this.draw();
  }

  draw() {
    const ctx = this.ctx;
    // match the brightness of the baked glow quads so binding is seamless
    const g = ctx.createRadialGradient(CW / 2, CH / 2, 10, CW / 2, CH / 2, CW * 0.72);
    g.addColorStop(0, '#2f8a48');
    g.addColorStop(1, '#12401f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#eaffef';
    ctx.shadowColor = 'rgba(200,255,220,0.9)';
    ctx.shadowBlur = 3;

    const rows = [...this.lines, this.prompt + ' ' + this.input];
    let y = PAD;
    for (const line of rows.slice(-ROWS)) {
      ctx.fillText(line.slice(-COLS), PAD, y);
      y += LINE_H;
    }
    if (this.cursorOn) {
      const lastLen = Math.min(COLS, (this.prompt + ' ' + this.input).length);
      ctx.fillRect(PAD + lastLen * 6.6 + 2, y - LINE_H, 7, 11);
    }

    // faint scanlines
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let sy = 0; sy < CH; sy += 3) ctx.fillRect(0, sy, CW, 1);

    this.tex.needsUpdate = true;
  }
}

export class LiveScreens {
  constructor(scene, audio) {
    this.audio = audio;
    this.units = [];
    for (let i = 0; i < POOL; i++) this.units.push(new ScreenUnit(scene));
    this.assignT = 0;
  }

  update(dt, world, playerPos) {
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 0.8;
      const near = world.workstationsNear(playerPos, BIND_RANGE).slice(0, POOL);
      // keep units that are mid-event or still near; rebind the rest
      const taken = new Set();
      for (const u of this.units) {
        if (u.ws && (u.event || near.includes(u.ws))) taken.add(u.ws);
        else u.unbind();
      }
      const free = this.units.filter(u => !u.ws);
      for (const ws of near) {
        if (taken.has(ws) || !free.length) continue;
        free.pop().bind(ws);
      }
    }
    for (const u of this.units) u.update(dt, this.audio);
  }

  /** a bound, idle unit the haunt director can play an event on */
  pickIdle(playerPos, minDist = 2.5) {
    const options = this.units.filter(u => {
      if (!u.ws || u.event) return false;
      const d = Math.hypot(u.ws.x - playerPos.x, u.ws.z - playerPos.z);
      return d >= minDist;
    });
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }
}
