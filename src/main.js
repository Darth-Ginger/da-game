import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { VHSPass } from './vhs.js';
import { AudioScape } from './audio.js';
import { TouchControls } from './touch.js';
import { Terminal } from './terminal.js';
import { LiveScreens } from './screens.js';
import { Haunt } from './haunt.js';
import { Prologue } from './prologue.js';
import * as MZ from './maze.js';

const app = document.getElementById('app');
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // the VHS target defines the real resolution
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010201);
scene.fog = new THREE.FogExp2(0x010201, 0.055);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 120);

// barely-there ambient so unlit areas stay readable as shapes
scene.add(new THREE.HemisphereLight(0x3d4a41, 0x171814, 1.9));

// camcorder light: a weak cold lamp riding on the camera
// flat decay: keeps near surfaces from blowing out while still reaching down the aisle
const CAM_LIGHT = 11;
const camLight = new THREE.PointLight(0xc8e0d2, CAM_LIGHT, 15, 0.9);
scene.add(camLight);
let camLightOn = true;

const world = new World(scene);
const player = new Player(camera, renderer.domElement);
const vhs = new VHSPass(renderer);
const audio = new AudioScape();
const touch = new TouchControls(renderer.domElement);
player.touch = touch;
const liveScreens = new LiveScreens(scene, audio);
const haunt = new Haunt({ world, audio, screens: liveScreens, player, camera, vhs });

// the shift starts in the NOC, so the tape does too: spawn in the nearest
// operations room (skipping cells whose workstation would pin the player)
(function spawnInNoc() {
  for (let r = 0; r < 300; r++) {
    for (let y = -r; y <= r; y += Math.max(1, 2 * r)) {
      for (let x = -r; x <= r; x++) {
        if (MZ.zoneAt(x, y) === MZ.ZONES.NOC && !MZ.workstationAt(x, y)) {
          player.pos.set((x + 0.5) * MZ.CELL, 0, (y + 0.5) * MZ.CELL);
          return;
        }
      }
    }
    for (let x = -r; x <= r; x += Math.max(1, 2 * r)) {
      for (let y = -r + 1; y < r; y++) {
        if (MZ.zoneAt(x, y) === MZ.ZONES.NOC && !MZ.workstationAt(x, y)) {
          player.pos.set((x + 0.5) * MZ.CELL, 0, (y + 0.5) * MZ.CELL);
          return;
        }
      }
    }
  }
})();

player.onFootstep = (running, speedFrac) => audio.footstep(running, speedFrac);

function toggleLight() {
  camLightOn = !camLightOn;
  audio.footstep(false, 0.2); // little mechanical clunk
}
touch.onLight = toggleLight;

// ---- workstation terminals ----
const terminal = new Terminal(audio);
const interactPrompt = document.getElementById('interactPrompt');
let interactTarget = null;

terminal.onClose = () => {
  player.enabled = true;
  if (!touch.active) lockPointer();
};

function openTerminal() {
  if (!interactTarget || terminal.open) return;
  player.enabled = false;
  interactPrompt.classList.add('hidden');
  if (!touch.active && document.pointerLockElement) document.exitPointerLock();
  vhs.kick(0.35); // leaning into the CRT upsets the tape a little
  terminal.openFor(interactTarget);
}
interactPrompt.addEventListener('click', openTerminal);

if (touch.active) {
  document.getElementById('playPrompt').innerHTML = '&#9654; TAP TO INSERT TAPE';
  document.getElementById('controlsHint').innerHTML =
    'LEFT THUMB &mdash; MOVE&emsp;&emsp;RIGHT THUMB &mdash; LOOK<br />' +
    'PUSH STICK TO THE RIM &mdash; RUN&emsp;&emsp;&#9788; &mdash; CAMERA LIGHT<br />' +
    'HEADPHONES RECOMMENDED';
  interactPrompt.textContent = 'INSPECT TERMINAL';
}

let started = false;
let mode = 'title'; // title -> prologue -> game

function lockPointer() {
  const p = renderer.domElement.requestPointerLock?.();
  // some browsers return a promise that rejects if the user mashes Esc
  if (p && p.catch) p.catch(() => {});
}

const prologue = new Prologue(renderer, audio, touch, lockPointer);

function beginPrologue() {
  if (mode !== 'title') return;
  mode = 'prologue';
  startScreen.classList.add('hidden');
  audio.start();
  if (touch.active) {
    // best effort: immersive landscape on phones (unsupported APIs just no-op)
    const fs = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (fs && fs.catch) fs.catch(() => {});
    const ol = screen.orientation?.lock?.('landscape');
    if (ol && ol.catch) ol.catch(() => {});
  } else {
    lockPointer();
  }
  prologue.start();
}

function startGame() {
  mode = 'game';
  started = true;
  player.enabled = true;
  vhs.resetTape();
  if (touch.active) document.body.classList.add('touch-playing');
  else lockPointer();
}
prologue.onFinish = startGame;

function resumeGame() {
  pauseScreen.classList.add('hidden');
  player.enabled = true;
  lockPointer();
}

startScreen.addEventListener('click', beginPrologue);
pauseScreen.addEventListener('click', resumeGame);

document.addEventListener('pointerlockchange', () => {
  if (touch.active || terminal.open) return; // terminal manages its own unlock
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && started) {
    player.enabled = false;
    pauseScreen.classList.remove('hidden');
  } else if (locked) {
    player.enabled = true;
    pauseScreen.classList.add('hidden');
  }
});

document.addEventListener('keydown', e => {
  if (!started || terminal.open) return;
  if (e.code === 'KeyF') toggleLight();
  if (e.code === 'KeyE' && interactTarget) {
    e.preventDefault(); // keep the "e" out of the terminal input
    openTerminal();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  prologue.camera.aspect = camera.aspect;
  prologue.camera.updateProjectionMatrix();
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const _fwd = new THREE.Vector3();

// Prime the world before the first frame so there is no naked pop-in
world.update(player.pos, 0);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (mode === 'prologue') {
    prologue.update(dt);
    world.update(player.pos, dt); // stream the floor in behind the black
    renderer.render(prologue.scene, prologue.camera);
    requestAnimationFrame(animate);
    return;
  }

  player.update(dt, world);
  world.update(player.pos, dt);
  audio.update(dt, camera, world, player.pos);
  terminal.update(dt);
  if (started) {
    liveScreens.update(dt, world, player.pos);
    haunt.update(dt);
  }

  if (started && !terminal.open) {
    interactTarget = world.interactableAt(camera.position, camera.getWorldDirection(_fwd));
    interactPrompt.classList.toggle('hidden', !interactTarget);
  } else {
    interactTarget = interactTarget && terminal.open ? interactTarget : null;
  }

  camLight.position.copy(camera.position);
  camLight.intensity += ((camLightOn ? CAM_LIGHT : 0) - camLight.intensity) * Math.min(1, dt * 14);

  vhs.render(scene, camera, dt, player.enabled || terminal.open);
  requestAnimationFrame(animate);
}
animate();

// headless / automation hook
window.__game = { begin: beginPrologue, startGame, prologue, player, world, maze: MZ, terminal, haunt, liveScreens, audio, vhs };
