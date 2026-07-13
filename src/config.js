// Central tuning. Everything a designer might want to nudge lives here;
// modules read from CONFIG at startup. Values are the shipped defaults.
//
// Notes for tuning:
// - `zones` are relative weights (normalized at runtime); zoneSize is the
//   side of one biome patch in maze cells.
// - Changing `seed`, `cell`, `zones`, `braid` or rack coverages regenerates
//   a different (but equally valid) infinite facility.
// - Light/exposure values interact: raise `render.exposure` for a global
//   lift, `camLight` for the player's bubble, `lights.fixtureIntensity`
//   for the fluorescents.

export const CONFIG = {
  seed: 19870412,

  // ---- world geometry ----
  cell: 4,             // metres per maze cell
  wallHeight: 3.1,
  wallThickness: 0.35,
  zoneSize: 14,        // cells per biome patch
  chunk: { cells: 8, loadRadius: 2, unloadRadius: 3 },

  // ---- biome distribution (relative weights) ----
  zones: {
    server: 0.28,
    stacks: 0.18,
    office: 0.18,
    battery: 0.06,
    dark: 0.17,
    hall: 0.13
  },

  // ---- chance an extra maze wall is removed (loops / openness) ----
  braid: {
    hall: 0.55,
    stacks: 0.78, // almost no walls: the racks enclose
    server: 0.26,
    battery: 0.24,
    default: 0.16
  },

  // ---- equipment density ----
  racks: {
    serverCoverage: 0.78,   // rack rows along server-zone aisle walls
    stacksCoverage: 0.86,   // freestanding rows in the stacks (rest = gaps)
    batteryCoverage: 0.68,
    strayDark: 0.2,         // lone cabinets elsewhere
    strayOffice: 0.07,
    strayHall: 0.06
  },
  workstations: { office: 0.08, server: 0.025, stacks: 0.05, battery: 0.012, dark: 0.02, hall: 0.015 },

  // ---- wayfinding signage ----
  signs: {
    boundaryChance: 0.65, // hung where an open corridor crosses a section line
    aisleChance: 0.07     // stacks aisle plates: "B2 · AISLE 07"
  },

  // ---- rendering ----
  render: {
    fov: 72,
    fogDensity: 0.055,
    exposure: 1.6,
    hemi: { sky: 0x3d4a41, ground: 0x171814, intensity: 1.9 },
    camLight: { color: 0xc8e0d2, intensity: 11, distance: 15, decay: 0.9 },
    tapeLines: 480 // vertical resolution of the VHS render target
  },

  // ---- dynamic lights ----
  lights: {
    pool: 6,               // real PointLights assigned to nearest fixtures
    fixtureIntensity: 55,
    fixtureRange: 16
  },

  // ---- player ----
  player: {
    walk: 3.1,
    run: 5.3,
    eye: 1.62,
    radius: 0.34,
    mouseSens: 0.0021,
    touchLookSens: 0.006
  },

  // ---- VHS damage envelope ----
  vhs: {
    baseJitter: 0.0006,  // per-scanline wobble at rest
    baseBand: 0.06,      // tracking-band strength at rest (1.6 added at full kick)
    kickDecay: 2.4,      // higher = spikes settle faster
    wobbleMin: 25,       // spontaneous mild tracking wobble every min..max s
    wobbleMax: 60
  },

  // ---- live screens ----
  screens: { pool: 3, bindRange: 13 },

  // ---- haunt scheduling (seconds) ----
  haunt: {
    graceScreen: 20,    // quiet period after the tape starts
    gracePresence: 55,
    screenMin: 16, screenMax: 44,
    presenceMin: 40, presenceMax: 115,
    envChance: 0.45,    // odds a screen event reaches the building
    envDelayMin: 0.8, envDelayMax: 3.0
  },

  // ---- audio ----
  audio: { master: 0.9, ventBase: 0.16 }
};
