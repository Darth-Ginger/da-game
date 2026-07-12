// Deterministic infinite maze. Every query is a pure function of integer cell
// coordinates and a global seed, so any region of the world can be generated
// locally without knowing anything about its neighbours.
//
// Connectivity is guaranteed by a "binary tree" carve: every cell knocks down
// either its north wall or its west wall. On top of that we braid (randomly
// remove extra walls, creating loops), carve open rooms, and stamp large-scale
// zones that drive props, lighting and audio.

export const CELL = 4;        // metres per maze cell
export const WALL_H = 3.1;    // ceiling height
export const WALL_T = 0.35;   // wall thickness

const SEED = 19870412;

// Salts for the various independent random channels
const S_CARVE = 1;
const S_BRAID_E = 2;
const S_BRAID_S = 3;
const S_ROOM = 4;
const S_ZONE = 9;
const S_FIX = 7;
const S_FIX_STATE = 12;
const S_RACK = 13;
const S_PROP = 15;

export function hash(x, y, salt) {
  let h = (SEED ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- zones ----

const ZONE_SIZE = 14; // cells per zone super-cell

export const ZONES = { SERVER: 'server', OFFICE: 'office', DARK: 'dark', HALL: 'hall' };

export function zoneAt(x, y) {
  const zx = Math.floor(x / ZONE_SIZE);
  const zy = Math.floor(y / ZONE_SIZE);
  const z = hash(zx, zy, S_ZONE);
  if (z < 0.42) return ZONES.SERVER;
  if (z < 0.68) return ZONES.OFFICE;
  if (z < 0.87) return ZONES.DARK;
  return ZONES.HALL;
}

// Server zones lay their racks in coherent aisles: 'x' aisles run east-west.
export function aisleAxis(x, y) {
  const zx = Math.floor(x / ZONE_SIZE);
  const zy = Math.floor(y / ZONE_SIZE);
  return hash(zx, zy, 14) < 0.5 ? 'x' : 'y';
}

// ---------------------------------------------------------------- rooms ----

const ROOM_GRID = 12; // rooms are confined to super-cells of this size

function roomRect(rx, ry) {
  if (hash(rx, ry, S_ROOM) > 0.52) return null;
  const w = 3 + Math.floor(hash(rx, ry, S_ROOM + 1) * 4); // 3..6
  const h = 3 + Math.floor(hash(rx, ry, S_ROOM + 2) * 3); // 3..5
  const x0 = rx * ROOM_GRID + 1 + Math.floor(hash(rx, ry, S_ROOM + 3) * (ROOM_GRID - w - 2));
  const y0 = ry * ROOM_GRID + 1 + Math.floor(hash(rx, ry, S_ROOM + 4) * (ROOM_GRID - h - 2));
  return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}

export function inRoom(x, y) {
  const r = roomRect(Math.floor(x / ROOM_GRID), Math.floor(y / ROOM_GRID));
  return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

// ---------------------------------------------------------------- walls ----

// Binary-tree carve: cell (x, y) opens its NORTH wall (towards y-1) when the
// carve hash is < 0.5, otherwise its WEST wall (towards x-1).
function carvesNorth(x, y) {
  return hash(x, y, S_CARVE) < 0.5;
}

function braidChance(x, y) {
  const zone = zoneAt(x, y);
  if (zone === ZONES.HALL) return 0.55; // halls are wide open
  if (zone === ZONES.SERVER) return 0.26; // long aisles need loops
  return 0.16;
}

/** Wall on the EAST edge of cell (x, y) — between (x, y) and (x + 1, y). */
export function wallE(x, y) {
  if (!carvesNorth(x + 1, y)) return false; // neighbour carved west
  if (hash(x, y, S_BRAID_E) < braidChance(x, y)) return false;
  if (inRoom(x, y) && inRoom(x + 1, y)) return false;
  return true;
}

/** Wall on the SOUTH edge of cell (x, y) — between (x, y) and (x, y + 1). */
export function wallS(x, y) {
  if (carvesNorth(x, y + 1)) return false; // neighbour carved north
  if (hash(x, y, S_BRAID_S) < braidChance(x, y)) return false;
  if (inRoom(x, y) && inRoom(x, y + 1)) return false;
  return true;
}

export function wallN(x, y) { return wallS(x, y - 1); }
export function wallW(x, y) { return wallE(x - 1, y); }

// ------------------------------------------------------------- fixtures ----

export const FIX = { ON: 'on', FLICKER: 'flicker', DYING: 'dying', DEAD: 'dead' };

/**
 * Ceiling fluorescent fixture for a cell, or null.
 * state: on (steady), flicker (mostly on, drops out), dying (mostly off,
 * strobes), dead (dark housing only).
 */
export function fixtureAt(x, y) {
  if (hash(x, y, S_FIX) > 0.4) return null;
  const zone = zoneAt(x, y);
  const s = hash(x, y, S_FIX_STATE);
  let state;
  if (zone === ZONES.HALL) {
    state = s < 0.6 ? FIX.ON : s < 0.75 ? FIX.FLICKER : s < 0.82 ? FIX.DYING : FIX.DEAD;
  } else if (zone === ZONES.SERVER) {
    state = s < 0.22 ? FIX.ON : s < 0.34 ? FIX.FLICKER : s < 0.42 ? FIX.DYING : FIX.DEAD;
  } else if (zone === ZONES.OFFICE) {
    state = s < 0.28 ? FIX.ON : s < 0.42 ? FIX.FLICKER : s < 0.5 ? FIX.DYING : FIX.DEAD;
  } else { // dark
    state = s < 0.05 ? FIX.DYING : FIX.DEAD;
  }
  return { state, seed: Math.floor(hash(x, y, 21) * 4096) };
}

// ---------------------------------------------------------------- racks ----

/**
 * Which sides of cell (x, y) carry a row of server racks.
 * Racks hug existing walls, only in server zones (rare strays elsewhere),
 * never inside rooms, and follow the zone's aisle direction so rows read as
 * long coherent server aisles.
 */
export function rackSides(x, y) {
  if (inRoom(x, y)) return null;
  const zone = zoneAt(x, y);
  const base = zone === ZONES.SERVER ? 0.78 : zone === ZONES.DARK ? 0.08 : 0.0;
  if (base === 0) return null;
  const axis = aisleAxis(x, y);
  const sides = [];
  if (axis === 'y') { // aisles run north-south -> racks on east/west walls
    if (wallE(x, y) && hash(x, y, S_RACK) < base) sides.push('E');
    if (wallW(x, y) && hash(x, y, S_RACK + 1) < base) sides.push('W');
  } else {
    if (wallS(x, y) && hash(x, y, S_RACK) < base) sides.push('S');
    if (wallN(x, y) && hash(x, y, S_RACK + 1) < base) sides.push('N');
  }
  return sides.length ? sides : null;
}

// ------------------------------------------------------------ furniture ----

/**
 * Abandoned office props for a cell: desks, chairs, cabinets, paper litter.
 * Mostly in office zones and rooms; the odd stray chair in dark corridors.
 */
export function propsAt(x, y) {
  const zone = zoneAt(x, y);
  const room = inRoom(x, y);
  const r = hash(x, y, S_PROP);
  const out = { desk: false, chair: false, cabinet: false, papers: 0 };
  if (zone === ZONES.OFFICE || room) {
    if (r < 0.14) { out.desk = true; out.chair = hash(x, y, S_PROP + 1) < 0.7; }
    else if (r < 0.22) out.cabinet = true;
    else if (r < 0.27) out.chair = true;
    if (hash(x, y, S_PROP + 2) < 0.2) out.papers = 1 + Math.floor(hash(x, y, S_PROP + 3) * 3);
  } else if (zone === ZONES.DARK && r < 0.025) {
    out.chair = true; // a single chair, facing the wrong way
  }
  if (!out.desk && !out.chair && !out.cabinet && !out.papers) return null;
  return out;
}

/** Structural pillar at the north-west corner of a hall cell. */
export function pillarAt(x, y) {
  return zoneAt(x, y) === ZONES.HALL && hash(x, y, 17) < 0.12;
}

/** Overhead cable tray direction for a corridor cell ('x' | 'y' | null). */
export function trayAt(x, y) {
  const zone = zoneAt(x, y);
  if (zone !== ZONES.SERVER && zone !== ZONES.DARK) return null;
  if (hash(x, y, 18) > 0.85) return null;
  if (!wallN(x, y) && !wallS(x, y)) return 'y';
  if (!wallE(x, y) && !wallW(x, y)) return 'x';
  return null;
}

/** A cable hanging loose from the ceiling. */
export function hangingCableAt(x, y) {
  const zone = zoneAt(x, y);
  if (zone !== ZONES.SERVER && zone !== ZONES.DARK) return null;
  const r = hash(x, y, 19);
  if (r > 0.09) return null;
  return {
    ox: (hash(x, y, 19 + 1) - 0.5) * (CELL - 1.2),
    oz: (hash(x, y, 19 + 2) - 0.5) * (CELL - 1.2),
    len: 0.7 + hash(x, y, 19 + 3) * 1.3,
    tilt: (hash(x, y, 19 + 4) - 0.5) * 0.35
  };
}
