// The haunt director. Nothing in the facility is alive — but on a slow,
// irregular clock it acts like something is:
//
//   screen events   : a nearby CRT starts typing to itself or scrolling
//                     logs, in the player's peripheral vision
//   consequences    : some screen events "reach" the building — server fans
//                     spin up, a fluorescent snaps on/off/strobes, the
//                     air-conditioning cuts out or roars
//   presence events : keyboard chatter one row over, footsteps behind the
//                     player that approach and stop, a chair creak, a rack
//                     door clanking somewhere in the dark
//
// Everything is scheduled sparsely so no single walk hits the same trick
// twice in a row.

import { CONFIG } from './config.js';

const H = CONFIG.haunt;

export class Haunt {
  constructor({ world, audio, screens, player, camera, vhs }) {
    this.world = world;
    this.audio = audio;
    this.screens = screens;
    this.player = player;
    this.camera = camera;
    this.vhs = vhs;
    this.time = 0;
    // grace period: let the first few minutes feel merely empty
    this.nextScreen = H.graceScreen + Math.random() * 15;
    this.nextPresence = H.gracePresence + Math.random() * 45;
    this.pendingEnv = -1;
    this.lastPresence = -1;
  }

  update(dt) {
    this.time += dt;

    if (this.time >= this.nextScreen) {
      this.nextScreen = this.time + H.screenMin + Math.random() * (H.screenMax - H.screenMin);
      this.screenEvent();
    }

    if (this.pendingEnv >= 0 && this.time >= this.pendingEnv) {
      this.pendingEnv = -1;
      this.envEffect();
    }

    if (this.time >= this.nextPresence) {
      this.nextPresence = this.time + H.presenceMin + Math.random() * (H.presenceMax - H.presenceMin);
      this.presenceEvent();
    }
  }

  screenEvent() {
    const unit = this.screens.pickIdle(this.player.pos);
    if (!unit) return;
    const ok = Math.random() < 0.55
      ? unit.startTyping(this.audio)
      : unit.startLogs(this.audio);
    if (ok && this.vhs) this.vhs.kick(0.3 + Math.random() * 0.2);
    // sometimes the text reaches into the building shortly after
    if (ok && Math.random() < H.envChance) {
      this.pendingEnv = this.time + H.envDelayMin + Math.random() * (H.envDelayMax - H.envDelayMin);
    }
  }

  envEffect() {
    // the tape takes it worst when the building itself reacts
    if (this.vhs) this.vhs.kick(0.6 + Math.random() * 0.4);
    const r = Math.random();
    if (r < 0.3) {
      this.world.triggerSurge();
      this.audio.serverSurge(8 + Math.random() * 8);
    } else if (r < 0.6) {
      const hit = this.world.lightEvent(this.player.pos);
      if (hit && hit.mode !== 'off') this.audio.metalClank(hit.x, hit.z); // ballast thunk
    } else if (r < 0.8) {
      this.audio.ventSet(0.015, 8 + Math.random() * 10);  // AC dies; the quiet is worse
    } else {
      this.audio.ventSet(0.34, 8 + Math.random() * 10);   // AC roars on
    }
  }

  presenceEvent() {
    if (this.vhs) this.vhs.kick(0.25 + Math.random() * 0.15);
    const p = this.player.pos;
    // avoid repeating the previous trick
    let r;
    do { r = Math.floor(Math.random() * 4); } while (r === this.lastPresence);
    this.lastPresence = r;

    if (r === 0) {
      // keyboard clicking a row over: a real workstation if one is near,
      // otherwise a keyboard that should not be there
      const near = this.world.workstationsNear(p, 16).filter(w => w.d2 > 3 * 3);
      if (near.length) {
        const ws = near[Math.floor(Math.random() * near.length)];
        this.audio.keyChatter(ws.x, ws.z, 6 + Math.floor(Math.random() * 10));
      } else {
        const a = Math.random() * Math.PI * 2;
        this.audio.keyChatter(p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6, 5);
      }
    } else if (r === 1) {
      this.audio.footstepsBehind(p, this.camera);
    } else if (r === 2) {
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * 6;
      this.audio.chairCreak(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
    } else {
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 10;
      this.audio.metalClank(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
    }
  }
}
