import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { VHSPass } from './vhs.js';
import { AudioScape } from './audio.js';
import { TouchControls } from './touch.js';
import { Terminal } from './terminal.js';
import { LiveScreens } from './screens.js';
import { Haunt } from './haunt.js';
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
const CAM_LIGHT = 24;
const camLight = new THREE.PointLight(0xc8e0d2, CAM_LIGHT, 15, 1.5);
scene.add(camLight);
let camLightOn = true;

const world = new World(scene);
const player = new Player(camera, renderer.domElement);
const vhs = new VHSPass(renderer);
const audio = new AudioScape();
const touch = new TouchControls(renderer.domElement);
player.touch = touch;
const liveScreens = new LiveScreens(scene, audio);
const haunt = new Haunt({ world, audio, screens: liveScreens, player, camera });

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

function lockPointer() {
  const p = renderer.domElement.requestPointerLock?.();
  // some browsers return a promise that rejects if the user mashes Esc
  if (p && p.catch) p.catch(() => {});
}

function begin() {
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  started = true;
  player.enabled = true;
  audio.start();
  if (touch.active) {
    document.body.classList.add('touch-playing');
    // best effort: immersive landscape on phones (unsupported APIs just no-op)
    const fs = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (fs && fs.catch) fs.catch(() => {});
    const ol = screen.orientation?.lock?.('landscape');
    if (ol && ol.catch) ol.catch(() => {});
  } else {
    lockPointer();
  }
}

startScreen.addEventListener('click', begin);
pauseScreen.addEventListener('click', begin);

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
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const _fwd = new THREE.Vector3();

// Prime the world before the first frame so there is no naked pop-in
world.update(player.pos, 0);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

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
window.__game = { begin, player, world, maze: MZ, terminal, haunt, liveScreens, audio };
