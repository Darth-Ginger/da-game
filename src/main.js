import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { VHSPass } from './vhs.js';
import { AudioScape } from './audio.js';
import * as MZ from './maze.js';

const app = document.getElementById('app');
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // the VHS target defines the real resolution
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010201);
scene.fog = new THREE.FogExp2(0x010201, 0.055);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 120);

// barely-there ambient so unlit areas stay readable as shapes
scene.add(new THREE.HemisphereLight(0x3a473e, 0x141511, 1.5));

// camcorder light: a weak cold lamp riding on the camera
const CAM_LIGHT = 24;
const camLight = new THREE.PointLight(0xc8e0d2, CAM_LIGHT, 15, 1.5);
scene.add(camLight);
let camLightOn = true;

const world = new World(scene);
const player = new Player(camera, renderer.domElement);
const vhs = new VHSPass(renderer);
const audio = new AudioScape();

player.onFootstep = (running, speedFrac) => audio.footstep(running, speedFrac);

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
  lockPointer();
}

startScreen.addEventListener('click', begin);
pauseScreen.addEventListener('click', begin);

document.addEventListener('pointerlockchange', () => {
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
  if (e.code === 'KeyF' && started) {
    camLightOn = !camLightOn;
    audio.footstep(false, 0.2); // little mechanical clunk
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  vhs.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

// Prime the world before the first frame so there is no naked pop-in
world.update(player.pos, 0);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt, world);
  world.update(player.pos, dt);
  audio.update(dt, camera, world, player.pos);

  camLight.position.copy(camera.position);
  camLight.intensity += ((camLightOn ? CAM_LIGHT : 0) - camLight.intensity) * Math.min(1, dt * 14);

  vhs.render(scene, camera, dt, player.enabled);
  requestAnimationFrame(animate);
}
animate();

// headless / automation hook
window.__game = { begin, player, world, maze: MZ };
