// VHS camcorder treatment. The scene renders into a 480-line target (real
// tape resolution) and a fullscreen pass adds: barrel distortion, chroma
// bleed / aberration, line jitter, tracking bands, head-switching noise at
// the bottom of the frame, scanlines, grain, dropout streaks, vignette, and
// a slightly lifted, desaturated grade. The camcorder OSD (REC dot, tape
// counter, timestamp, battery) is drawn to a canvas and composited before
// the scanline/grain stage so it degrades with the tape like a real OSD.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tOSD;
uniform float uTime;
uniform vec2 uRes;
uniform float uTrack; // 0..1 tracking-error event strength

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 barrel(vec2 uv) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return uv + c * r2 * 0.07;
}

vec3 fetch(vec2 uv) {
  return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  // --- tape-transport geometry errors (applied in tape space) ---
  // At rest the tape runs almost clean: grain, scanlines and a whisper of
  // jitter. The tearing lives behind uTrack, which the haunt director kicks
  // when something happens — the damage IS the event.
  float line = floor(uv.y * uRes.y);
  uv.x += (hash12(vec2(line, floor(t * 61.0))) - 0.5) * (${CONFIG.vhs.baseJitter.toFixed(5)} + uTrack * 0.005);

  // slow breathing wobble
  uv.x += sin(t * 0.7 + uv.y * 3.0) * 0.0004;

  // tracking band: a horizontal strip that tears sideways, drifting down.
  // Nearly invisible at rest, violent during events.
  float bandAmt = ${CONFIG.vhs.baseBand.toFixed(4)} + uTrack * 1.6;
  float bandPos = fract(t * 0.13);
  float band = smoothstep(0.055, 0.0, abs(uv.y - bandPos)) * bandAmt;
  float bandNoise = hash12(vec2(line, floor(t * 30.0)));
  uv.x += band * (bandNoise - 0.5) * 0.05;

  // strong tracking events also shear the whole field + vertical hop
  uv.x += uTrack * uTrack * (hash12(vec2(floor(uv.y * 24.0), floor(t * 18.0))) - 0.5) * 0.035;
  uv.y += uTrack * uTrack * (hash12(vec2(floor(t * 9.0), 7.0)) - 0.5) * 0.022;

  // head-switching noise at the very bottom of the frame
  float hs = smoothstep(0.985, 1.0, uv.y);
  uv.x += hs * (hash12(vec2(line, floor(t * 120.0))) - 0.5) * 0.25;

  vec2 buv = barrel(uv);

  // outside the tube: black
  if (buv.x < 0.0 || buv.x > 1.0 || buv.y < 0.0 || buv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // --- colour: separated luma/chroma like composite video ---
  float ca = 0.0013 + uTrack * 0.003 + band * 0.002;
  vec3 col;
  col.r = fetch(buv + vec2(ca, 0.0)).r;
  col.g = fetch(buv).g;
  col.b = fetch(buv - vec2(ca, 0.0)).b;

  // chroma bleed: blur colour horizontally, keep luma sharp
  vec3 blur = (fetch(buv + vec2(2.5 / uRes.x, 0.0)) + fetch(buv - vec2(2.5 / uRes.x, 0.0))) * 0.5;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 chroma = mix(col - luma, blur - dot(blur, vec3(0.299, 0.587, 0.114)), 0.65);
  col = luma + chroma;

  // --- OSD (recorded onto the tape, so it shares the distortions) ---
  vec4 osd = texture2D(tOSD, buv);
  col = mix(col, osd.rgb, osd.a);

  // --- grade: lifted blacks, mild desaturation, warm-green cast ---
  luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.8);
  col = col * 0.92 + 0.06;
  col *= vec3(0.97, 1.03, 0.99);

  // tracking band brightens and gets noisy
  col += band * (bandNoise - 0.4) * 0.4;
  col = mix(col, vec3(hash12(buv * uRes + floor(t * 90.0))), hs * 0.85);

  // --- scanlines ---
  float scan = 0.86 + 0.14 * sin(buv.y * uRes.y * 3.14159);
  col *= scan;

  // --- grain ---
  col += (hash12(buv * uRes + vec2(fract(t * 13.7) * 91.0)) - 0.5) * 0.085;

  // dropout streaks: rare bright horizontal slivers, more during events
  float drop = hash12(vec2(line, floor(t * 27.0)));
  if (drop > 0.9995 - uTrack * 0.003) {
    float streak = step(hash12(vec2(line, 3.0)), fract(buv.x * 2.0 + t));
    col += streak * 0.45;
  }

  // vignette
  vec2 vc = buv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.9;

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const TAPE_LINES = CONFIG.render.tapeLines;

export class VHSPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(854, TAPE_LINES, { depthBuffer: true });
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;

    // OSD canvas
    this.osdCanvas = document.createElement('canvas');
    this.osdCanvas.width = 960;
    this.osdCanvas.height = 540;
    this.osdCtx = this.osdCanvas.getContext('2d');
    this.osdTex = new THREE.CanvasTexture(this.osdCanvas);
    this.osdTex.minFilter = THREE.LinearFilter;
    this.osdTimer = 0;

    // the night of Anesidora's final consolidation run
    this.tapeEpoch = new Date(2026, 3, 5, 2, 47, 13).getTime();
    this.startedAt = performance.now();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        tOSD: { value: this.osdTex },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(854, TAPE_LINES) },
        uTrack: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);

    this.track = 0;
    this.nextTrackAt = CONFIG.vhs.wobbleMin + Math.random() * (CONFIG.vhs.wobbleMax - CONFIG.vhs.wobbleMin);
    this.time = 0;

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w, h) {
    const tw = Math.max(64, Math.round(TAPE_LINES * (w / h)));
    this.rt.setSize(tw, TAPE_LINES);
    this.material.uniforms.uRes.value.set(tw, TAPE_LINES);
    this.renderer.setSize(w, h);
  }

  drawOSD(recording) {
    const ctx = this.osdCtx;
    const W = this.osdCanvas.width, H = this.osdCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(230,255,230,0.8)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#e8ece6';

    const elapsed = (performance.now() - this.startedAt) / 1000;
    const blink = Math.floor(elapsed * 1.6) % 2 === 0;

    // REC + tape counter, top-left
    if (recording && blink) {
      ctx.fillStyle = '#ff3524';
      ctx.beginPath();
      ctx.arc(72, 76, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8ece6';
      ctx.fillText('REC', 94, 60);
    } else if (!recording) {
      ctx.fillText('‖ PAUSE', 58, 60);
    }
    const hh = Math.floor(elapsed / 3600);
    const mm = String(Math.floor(elapsed / 60) % 60).padStart(2, '0');
    const ss = String(Math.floor(elapsed) % 60).padStart(2, '0');
    ctx.fillText(`${hh}:${mm}:${ss}`, 58, 102);

    // mode + battery, top-right
    ctx.fillText('SP', W - 150, 60);
    ctx.strokeStyle = '#e8ece6';
    ctx.lineWidth = 3;
    ctx.strokeRect(W - 108, 62, 44, 22);
    ctx.fillRect(W - 64, 68, 5, 10);
    ctx.fillRect(W - 105, 65, 16, 16); // one bar left

    // timestamp, bottom-left
    const d = new Date(this.tapeEpoch + elapsed * 1000);
    const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let h12 = d.getHours() % 12; if (h12 === 0) h12 = 12;
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    ctx.fillText(`${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`, 58, H - 118);
    ctx.fillText(`${h12}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${ampm}`, 58, H - 78);

    this.osdTex.needsUpdate = true;
  }

  /** Zero the tape counter — REC starts the moment the cassette seats. */
  resetTape() {
    this.startedAt = performance.now();
  }

  /**
   * Spike the tape damage from outside (0..1). The haunt director fires
   * this as events land, so the glitch reads as cause-and-effect — and
   * masks whatever the world just changed underneath it.
   */
  kick(strength = 0.7) {
    this.track = Math.min(1.1, Math.max(this.track, strength));
  }

  render(scene, camera, dt, recording) {
    this.time += dt;

    // the tape's own rare, mild tracking wobble; real damage comes from kick()
    if (this.time > this.nextTrackAt) {
      this.track = Math.max(this.track, 0.3 + Math.random() * 0.25);
      this.nextTrackAt = this.time + CONFIG.vhs.wobbleMin + Math.random() * (CONFIG.vhs.wobbleMax - CONFIG.vhs.wobbleMin);
    }
    this.track *= Math.exp(-dt * CONFIG.vhs.kickDecay);

    this.osdTimer -= dt;
    if (this.osdTimer <= 0) {
      this.osdTimer = 0.25;
      this.drawOSD(recording);
    }

    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uTrack.value = this.track;

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
