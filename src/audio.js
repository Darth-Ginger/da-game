// Fully procedural ambient soundscape — no audio files. Layers:
//   global beds : ventilation rumble, mains hum, faint camcorder hiss
//   emitters    : server fan noise + coil whine + hard-drive click bursts,
//                 fluorescent ballast buzz tied to each fixture's flicker
//   events      : footsteps, distant structural groans through a cheap
//                 generated-impulse reverb
// Emitters are a small pool of HRTF panners re-assigned every ~0.7 s to the
// nearest sources the world reports, so sounds swell as you approach them.

export class AudioScape {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // shared noise loop
    this.noiseBuf = this.makeNoise(2);
    this.clickBuf = this.makeNoise(0.03);

    // cheap generated-impulse reverb for footsteps / events
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.9, 2.8);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.buildBeds();

    this.rackEmitters = [];
    for (let i = 0; i < 4; i++) this.rackEmitters.push(this.makeRackEmitter(i));
    this.lightEmitters = [];
    for (let i = 0; i < 3; i++) this.lightEmitters.push(this.makeLightEmitter(i));

    this.retargetTimer = 0;
    this.nextGroan = 20 + Math.random() * 30;
    this.time = 0;
  }

  // ------------------------------------------------------------- helpers ----

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  loopNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  makePanner() {
    return new PannerNode(this.ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1.6,
      maxDistance: 60,
      rolloffFactor: 1.4
    });
  }

  // ---------------------------------------------------------------- beds ----

  buildBeds() {
    const ctx = this.ctx;

    // ventilation: deep filtered rumble that slowly breathes
    const vent = this.loopNoise();
    const ventLP = ctx.createBiquadFilter();
    ventLP.type = 'lowpass';
    ventLP.frequency.value = 170;
    const ventGain = ctx.createGain();
    ventGain.gain.value = 0.16;
    vent.connect(ventLP); ventLP.connect(ventGain); ventGain.connect(this.master);
    this.ventGain = ventGain;
    this.ventBase = 0.16;
    this.ventRestoreAt = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.05;
    lfo.connect(lfoDepth); lfoDepth.connect(ventGain.gain);
    lfo.start();

    // mains hum: 60 Hz + harmonics
    const humGain = ctx.createGain();
    humGain.gain.value = 1;
    for (const [freq, g] of [[60, 0.014], [120, 0.009], [180, 0.0035]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og); og.connect(humGain);
      o.start();
    }
    humGain.connect(this.master);

    // camcorder self-noise: faint high hiss
    const hiss = this.loopNoise();
    const hissHP = ctx.createBiquadFilter();
    hissHP.type = 'highpass';
    hissHP.frequency.value = 5200;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.011;
    hiss.connect(hissHP); hissHP.connect(hissGain); hissGain.connect(this.master);
  }

  // ------------------------------------------------------------- emitters ----

  makeRackEmitter(i) {
    const ctx = this.ctx;
    const panner = this.makePanner();
    panner.connect(this.master);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner);

    // fan wash
    const fan = this.loopNoise();
    const fanBP = ctx.createBiquadFilter();
    fanBP.type = 'bandpass';
    fanBP.frequency.value = 480 + i * 110;
    fanBP.Q.value = 0.9;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.5;
    fan.connect(fanBP); fanBP.connect(fanGain); fanGain.connect(gain);

    // PSU coil whine
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 2210 + i * 178;
    const whineBP = ctx.createBiquadFilter();
    whineBP.type = 'bandpass';
    whineBP.frequency.value = whine.frequency.value;
    whineBP.Q.value = 14;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.02;
    whine.connect(whineBP); whineBP.connect(whineGain); whineGain.connect(gain);
    whine.start();

    // hard-drive seek clicks route through their own filter
    const clickHP = ctx.createBiquadFilter();
    clickHP.type = 'highpass';
    clickHP.frequency.value = 2800;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.6;
    clickHP.connect(clickGain); clickGain.connect(gain);

    return {
      panner, gain, clickHP, fanGain, fanBP, whineGain, whineOsc: whine, whineBP,
      fanBase: fanGain.gain.value, whineBase: whineGain.gain.value,
      fanFreq: fanBP.frequency.value, whineFreq: whine.frequency.value,
      active: false, isBattery: false, nextClick: 0, target: null
    };
  }

  makeLightEmitter(i) {
    const ctx = this.ctx;
    const panner = this.makePanner();
    panner.connect(this.master);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner);

    // ballast buzz: saw at 120 Hz squeezed through a mid bandpass
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 119.5 + i * 0.7;
    const buzzBP = ctx.createBiquadFilter();
    buzzBP.type = 'bandpass';
    buzzBP.frequency.value = 900 + i * 250;
    buzzBP.Q.value = 2.5;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.32;
    buzz.connect(buzzBP); buzzBP.connect(buzzGain); buzzGain.connect(gain);
    buzz.start();

    return { panner, gain, fixture: null };
  }

  playClick(emitter, when, loud) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(loud, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.025);
    src.connect(env); env.connect(emitter.clickHP);
    src.start(when);
  }

  // --------------------------------------------------------------- events ----

  footstep(running, speedFrac) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320 + Math.random() * 240 + (running ? 200 : 0);
    const env = ctx.createGain();
    const level = (running ? 0.34 : 0.2) * (0.6 + 0.4 * speedFrac);
    env.gain.setValueAtTime(level, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.09 + Math.random() * 0.05);
    src.connect(lp); lp.connect(env);
    env.connect(this.master);
    env.connect(this.reverb);
    src.start(now, Math.random() * 1.5, 0.2);
  }

  /** A positional emitter parked at a world location, feeding the master bus. */
  posPanner(x, y, z) {
    const p = this.makePanner();
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    p.connect(this.master);
    return p;
  }

  /** One keyboard clack into an arbitrary destination, optionally scheduled. */
  clickInto(dest, loud = 0.12, hpFreq = 1800, when = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hpFreq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(loud, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp); hp.connect(env); env.connect(dest);
    src.start(t);
  }

  /** Keyboard clack for terminal typing (non-positional). */
  uiClick() {
    this.clickInto(this.master, 0.12);
  }

  // ------------------------------------------------ presence / haunt fx ----

  /** Someone typing at a keyboard a row over. */
  keyChatter(x, z, n = 8) {
    if (!this.started) return;
    const p = this.posPanner(x, 0.9, z);
    const now = this.ctx.currentTime;
    let t = now;
    for (let i = 0; i < n; i++) {
      t += 0.09 + Math.random() * 0.22;
      this.clickInto(p, 0.15 + Math.random() * 0.1, 1800, t);
    }
    setTimeout(() => p.disconnect(), (t - now + 0.5) * 1000);
  }

  /** Footsteps behind the player that approach a little, then stop. */
  footstepsBehind(playerPos, camera) {
    if (!this.started) return;
    const ctx = this.ctx;
    const fwd = camera.getWorldDirection(_tmpVec);
    const jitter = (Math.random() - 0.5) * 2.5;
    const sx = playerPos.x - fwd.x * 7 + fwd.z * jitter;
    const sz = playerPos.z - fwd.z * 7 - fwd.x * jitter;
    const ex = playerPos.x - fwd.x * 3;
    const ez = playerPos.z - fwd.z * 3;
    const p = this.posPanner(sx, 0.2, sz);
    p.connect(this.reverb);
    const n = 4 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime + 0.1;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      if (p.positionX) {
        p.positionX.setValueAtTime(sx + (ex - sx) * f, t);
        p.positionZ.setValueAtTime(sz + (ez - sz) * f, t);
      }
      this.thud(p, t, 0.28 + Math.random() * 0.1, 300 + Math.random() * 200);
      t += 0.38 + Math.random() * 0.14;
    }
    setTimeout(() => p.disconnect(), (t - ctx.currentTime + 1) * 1000);
  }

  /** An office chair shifting under someone's weight. */
  chairCreak(x, z) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = this.posPanner(x, 0.5, z);
    p.connect(this.reverb);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.22;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.setValueAtTime(340, now);
    bp.frequency.exponentialRampToValueAtTime(170, now + 1.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.4, now + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    src.connect(bp); bp.connect(env); env.connect(p);
    src.start(now, Math.random());
    src.stop(now + 1.5);
    setTimeout(() => p.disconnect(), 2500);
  }

  /** A far-off metallic impact — a rack door, or something like one. */
  metalClank(x, z) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = this.posPanner(x, 1.5, z);
    p.connect(this.reverb);
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuf;
    src.playbackRate.value = 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 700;
    bp.Q.value = 9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    src.connect(bp); bp.connect(env); env.connect(p);
    src.start(now);
    const o = ctx.createOscillator();
    o.frequency.value = 140 + Math.random() * 80;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.15, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(og); og.connect(p);
    o.start(now); o.stop(now + 0.55);
    setTimeout(() => p.disconnect(), 2000);
  }

  // ------------------------------------------- environmental reactions ----

  /** All nearby server fans spin up for a while, then settle. */
  serverSurge(seconds = 10) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const em of this.rackEmitters) {
      em.fanGain.gain.setTargetAtTime(em.fanBase * 2.1, now, 1.4);
      em.fanBP.frequency.setTargetAtTime(em.fanFreq * 1.45, now, 1.4);
      em.whineGain.gain.setTargetAtTime(em.whineBase * 2.6, now, 1.4);
      em.fanGain.gain.setTargetAtTime(em.fanBase, now + seconds, 2.5);
      em.fanBP.frequency.setTargetAtTime(em.fanFreq, now + seconds, 2.5);
      em.whineGain.gain.setTargetAtTime(em.whineBase, now + seconds, 2.5);
    }
  }

  /** The air conditioning cuts out (level ~0) or roars up (level > base). */
  ventSet(level, seconds = 12) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.ventGain.gain.setTargetAtTime(level, now, 0.9);
    this.ventGain.gain.setTargetAtTime(this.ventBase, now + seconds, 2.0);
  }

  /** Low-level thud used for both player and ghost footsteps. */
  thud(dest, when, loud, lpFreq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpFreq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(loud, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.09 + Math.random() * 0.05);
    src.connect(lp); lp.connect(env); env.connect(dest);
    src.start(when, Math.random() * 1.5, 0.2);
  }

  /** CRT engage/disengage blip for opening or closing the terminal. */
  uiBlip(down = false) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(down ? 880 : 520, now);
    o.frequency.exponentialRampToValueAtTime(down ? 320 : 1240, now + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.045, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + 0.16);
  }

  distantGroan() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pan = new StereoPannerNode(ctx, { pan: Math.random() * 1.6 - 0.8 });
    pan.connect(this.master);
    pan.connect(this.reverb);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(52 + Math.random() * 18, now);
    o.frequency.exponentialRampToValueAtTime(30, now + 1.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.12, now + 0.35);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    o.connect(og); og.connect(pan);
    o.start(now); o.stop(now + 2.4);

    // metallic scrape on top, sometimes
    if (Math.random() < 0.5) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(700 + Math.random() * 600, now);
      bp.frequency.exponentialRampToValueAtTime(250, now + 1.2);
      bp.Q.value = 8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.05, now + 0.3);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      src.connect(bp); bp.connect(ng); ng.connect(pan);
      src.start(now, Math.random());
      src.stop(now + 1.6);
    }
  }

  // --------------------------------------------------------------- update ----

  setEmitterPos(node, x, y, z) {
    const t = this.ctx.currentTime;
    if (node.positionX) {
      node.positionX.setTargetAtTime(x, t, 0.1);
      node.positionY.setTargetAtTime(y, t, 0.1);
      node.positionZ.setTargetAtTime(z, t, 0.1);
    } else {
      node.setPosition(x, y, z);
    }
  }

  update(dt, camera, world, playerPos) {
    if (!this.started) return;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    this.time += dt;

    // listener follows the camera
    const l = ctx.listener;
    const fwd = camera.getWorldDirection(_tmpVec);
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(playerPos.x, t, 0.03);
      l.positionY.setTargetAtTime(1.6, t, 0.03);
      l.positionZ.setTargetAtTime(playerPos.z, t, 0.03);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.03);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.03);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      l.upX.setTargetAtTime(0, t, 0.03);
      l.upY.setTargetAtTime(1, t, 0.03);
      l.upZ.setTargetAtTime(0, t, 0.03);
    } else {
      l.setPosition(playerPos.x, 1.6, playerPos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }

    // re-assign emitter pool to nearest sources
    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0) {
      this.retargetTimer = 0.7;
      const { racks, lights } = world.audioTargets(playerPos);
      for (let i = 0; i < this.rackEmitters.length; i++) {
        const em = this.rackEmitters[i];
        const r = racks[i];
        if (r) {
          em.active = true;
          em.target = r;
          this.setEmitterPos(em.panner, r.x, r.y, r.z);
          em.gain.gain.setTargetAtTime(0.55, ctx.currentTime, 0.4);
          // battery cabinets drone at mains frequency instead of fan wash
          const bat = r.type === 'battery';
          if (bat !== em.isBattery) {
            em.isBattery = bat;
            const t = ctx.currentTime;
            em.fanBP.frequency.setTargetAtTime(bat ? 85 : em.fanFreq, t, 0.5);
            em.whineOsc.frequency.setTargetAtTime(bat ? 120 : em.whineFreq, t, 0.5);
            em.whineBP.frequency.setTargetAtTime(bat ? 120 : em.whineFreq, t, 0.5);
            em.whineGain.gain.setTargetAtTime(bat ? em.whineBase * 3.5 : em.whineBase, t, 0.5);
          }
        } else {
          em.active = false;
          em.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        }
      }
      for (let i = 0; i < this.lightEmitters.length; i++) {
        const em = this.lightEmitters[i];
        const f = lights[i];
        em.fixture = f || null;
        if (f) this.setEmitterPos(em.panner, f.x, 2.9, f.z);
      }
    }

    // hard-drive click bursts on active rack emitters (batteries don't seek)
    for (const em of this.rackEmitters) {
      if (!em.active || em.isBattery) continue;
      if (this.time >= em.nextClick) {
        const burst = 1 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burst; i++) {
          this.playClick(em, ctx.currentTime + i * 0.045 + Math.random() * 0.02, 0.25 + Math.random() * 0.4);
        }
        em.nextClick = this.time + 0.2 + Math.random() * 1.6;
      }
    }

    // fluorescent buzz follows the fixture's live flicker intensity
    for (const em of this.lightEmitters) {
      const target = em.fixture ? 0.10 + 0.5 * em.fixture.intensity : 0;
      em.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
    }

    // distant structural events
    if (this.time > this.nextGroan) {
      this.nextGroan = this.time + 25 + Math.random() * 45;
      this.distantGroan();
    }
  }
}

import * as THREE from 'three';
const _tmpVec = new THREE.Vector3();
