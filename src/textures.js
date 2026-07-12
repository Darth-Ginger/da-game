// Procedurally painted canvas textures — grimy concrete, stained ceiling
// tiles, panel walls, rack faces. Everything is generated at startup so the
// game ships with zero binary assets. Low resolution + nearest filtering
// keeps the deliberately cheap, low-poly look.

import * as THREE from 'three';

function makeCanvas(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cheap deterministic rng so textures are stable between runs
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, size, rand, n, alpha, lo, hi) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(lo + rand() * (hi - lo));
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
  }
}

function stains(ctx, size, rand, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = (0.25 + rand() * 0.75) * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function makeTextures() {
  // Concrete floor — one texture repeat == one 4 m cell
  const floor = makeCanvas(256, (ctx, s) => {
    const rand = rng(101);
    ctx.fillStyle = '#33362f';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 2600, 0.22, 24, 84);
    stains(ctx, s, rand, 7, 'rgba(12,14,10,0.5)', 90);
    stains(ctx, s, rand, 3, 'rgba(70,74,60,0.25)', 60);
    // saw-cut expansion joints on the cell boundary
    ctx.strokeStyle = 'rgba(10,12,9,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    // faded safety line fragment
    ctx.fillStyle = 'rgba(140,120,30,0.10)';
    ctx.fillRect(0, s * 0.46, s, 6);
  });
  floor.repeat.set(8, 8);

  // Drop-ceiling tiles, water stained
  const ceiling = makeCanvas(256, (ctx, s) => {
    const rand = rng(202);
    ctx.fillStyle = '#20231f';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 1500, 0.18, 18, 60);
    stains(ctx, s, rand, 6, 'rgba(40,34,18,0.35)', 70);
    ctx.strokeStyle = 'rgba(8,9,8,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * s;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
    }
  });
  ceiling.repeat.set(8, 8);

  // Institutional wall panels with grime creeping up from the floor
  const wall = makeCanvas(256, (ctx, s) => {
    const rand = rng(303);
    ctx.fillStyle = '#3b423c';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 1800, 0.16, 30, 90);
    // vertical panel seams
    ctx.strokeStyle = 'rgba(14,16,14,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      const p = (i / 2) * s;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    }
    // grime gradient at the bottom
    const g = ctx.createLinearGradient(0, s * 0.6, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,10,8,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    stains(ctx, s, rand, 5, 'rgba(15,18,14,0.4)', 60);
    // scuffed kick line
    ctx.fillStyle = 'rgba(6,7,6,0.5)';
    ctx.fillRect(0, s - 10, s, 10);
  });
  wall.repeat.set(1, 1);

  // Server rack front — dark steel with faint 1U slat lines
  const rack = makeCanvas(128, (ctx, s) => {
    const rand = rng(404);
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, 500, 0.15, 10, 45);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    for (let y = 6; y < s; y += 7) {
      ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(s - 4, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,80,95,0.35)';
    ctx.strokeRect(2, 2, s - 4, s - 4);
  });

  return { floor, ceiling, wall, rack };
}

export function makeMaterials() {
  const tex = makeTextures();
  return {
    floor: new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.94, metalness: 0.02 }),
    ceiling: new THREE.MeshStandardMaterial({ map: tex.ceiling, roughness: 1.0, metalness: 0.0 }),
    wall: new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.92, metalness: 0.0 }),
    rack: new THREE.MeshStandardMaterial({ map: tex.rack, roughness: 0.6, metalness: 0.45 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.4 }),
    furniture: new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.9, metalness: 0.05 }),
    furnitureMetal: new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.65, metalness: 0.5 }),
    paper: new THREE.MeshStandardMaterial({ color: 0x8d8c80, roughness: 1.0 }),
    fixtureHousing: new THREE.MeshStandardMaterial({ color: 0x2e3230, roughness: 0.8, metalness: 0.3 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.85 })
  };
}
