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

    return { panner, gain, clickHP, active: false, nextClick: 0, target: null };
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

    // hard-drive click bursts on active rack emitters
    for (const em of this.rackEmitters) {
      if (!em.active) continue;
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
