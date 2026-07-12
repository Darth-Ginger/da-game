// First-person walker: pointer-lock mouse look, WASD with acceleration,
// circle-vs-world collision, head bob that drives footstep audio.

import * as THREE from 'three';
import { CELL } from './maze.js';

const EYE = 1.62;
const RADIUS = 0.34;
const WALK = 3.1;
const RUN = 5.3;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.pos = new THREE.Vector3(CELL * 0.5, 0, CELL * 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0;
    this.keys = new Set();
    this.bobPhase = 0;
    this.bob = 0;
    this.lastStepIndex = 0;
    this.onFootstep = null; // (running: bool) => void
    this.enabled = false;
    this.touch = null; // optional TouchControls

    camera.rotation.order = 'YXZ';

    document.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', e => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  get running() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  update(dt, world) {
    let fwd = 0, strafe = 0;
    let running = this.running;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;

      if (this.touch && this.touch.active) {
        const look = this.touch.consumeLook();
        this.yaw -= look.dx * 0.006;
        this.pitch -= look.dy * 0.006;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
        strafe += this.touch.move.x;
        fwd += this.touch.move.y;
        if (this.touch.magnitude > 0.92) running = true; // stick pushed to the rim
      }
    }

    const target = new THREE.Vector3();
    const len = Math.hypot(fwd, strafe);
    if (len > 0.02) {
      const mag = Math.min(1, len); // analog: partial stick = slower walk
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // camera forward on the ground plane
      const fx = -sin, fz = -cos;
      const rx = cos, rz = -sin;
      target.set(fx * fwd + rx * strafe, 0, fz * fwd + rz * strafe);
      target.normalize().multiplyScalar((running ? RUN : WALK) * mag);
    }
    // exponential approach: snappy but not instant
    this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 10);

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const resolved = world.resolveCollision(nx, nz, RADIUS);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;

    // head bob scaled by actual speed
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const speedFrac = Math.min(1, speed / RUN);
    if (speed > 0.4) {
      this.bobPhase += dt * (5.4 + speedFrac * 4.2);
      const stepIndex = Math.floor(this.bobPhase / Math.PI);
      if (stepIndex !== this.lastStepIndex) {
        this.lastStepIndex = stepIndex;
        if (this.onFootstep) this.onFootstep(running, speedFrac);
      }
    }
    this.bob += ((speed > 0.4 ? Math.sin(this.bobPhase) * 0.038 * (0.5 + speedFrac) : 0) - this.bob) * Math.min(1, dt * 12);

    this.camera.position.set(this.pos.x, EYE + this.bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.004 * speedFrac);
  }
}
