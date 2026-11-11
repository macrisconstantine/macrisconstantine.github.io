/* =========================================================================
   world.js — the six districts plus the locked room.

   Rooms are declared compactly: size, floor style, plazas, paths, objects.
   The tilemap is generated at load from a seeded PRNG, so the scatter of
   grass tufts and floor grime looks random but is identical for everyone.
   ========================================================================= */

export const TILE = 16;

/* Tile ids */
export const T = { FLOOR: 0, FLOOR_B: 1, SPECK: 2, WALL: 3, WALL_TOP: 4, PATH: 5, PLAZA: 6 };

/* Deterministic PRNG so every visitor sees the same world. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Floor palettes. base and alt sit a couple of percent apart so the ground
   has texture without turning into a patchwork quilt. */
export const FLOORS = {
  grass: { base:'#2d6342', alt:'#2b5f3f', speck:'#2f6744', detail:'#49885e', rim:'#6b8f5f',
           path:'#5c4a33', pathAlt:'#5a4832', plaza:'#4a5560', plazaAlt:'#495460',
           wall:'#1b3f2c', wallTop:'#27573c', sky:'#132a1c' },
  neon:  { base:'#1a1430', alt:'#18122c', speck:'#1b1532', detail:'#3b2c68', rim:'#6b4aa8',
           path:'#2a1f4a', pathAlt:'#291e48', plaza:'#2d2050', plazaAlt:'#2c1f4e',
           wall:'#2a1947', wallTop:'#452a72', sky:'#0c0718' },
  metal: { base:'#37302a', alt:'#352e28', speck:'#38312b', detail:'#5a4c3e', rim:'#7a6650',
           path:'#443a30', pathAlt:'#43392f', plaza:'#4a4034', plazaAlt:'#493f33',
           wall:'#28221d', wallTop:'#50443a', sky:'#181411' },
  void:  { base:'#141028', alt:'#120e25', speck:'#15112a', detail:'#322760', rim:'#5a49a0',
           path:'#221b40', pathAlt:'#211a3e', plaza:'#241c44', plazaAlt:'#231b42',
           wall:'#211942', wallTop:'#372a66', sky:'#08050e' },
  grid:  { base:'#0f1d14', alt:'#0e1b13', speck:'#101e15', detail:'#255c37', rim:'#2f7a46',
           path:'#152e1d', pathAlt:'#142c1c', plaza:'#17331f', plazaAlt:'#16321e',
           wall:'#112618', wallTop:'#1d4429', sky:'#050b07' },
  wood:  { base:'#473324', alt:'#453122', speck:'#483425', detail:'#6b4d31', rim:'#8a6038',
           path:'#5a4130', pathAlt:'#59402f', plaza:'#5e452f', plazaAlt:'#5d442e',
           wall:'#2c1f15', wallTop:'#5c412b', sky:'#1b1210' },
  carpet:{ base:'#38223e', alt:'#36203c', speck:'#39233f', detail:'#5e3868', rim:'#8a4f94',
           path:'#4a2b50', pathAlt:'#492a4f', plaza:'#4e2d55', plazaAlt:'#4d2c54',
           wall:'#26172a', wallTop:'#4c2e4b', sky:'#140c17' },
};

/* -------------------------------------------------------------------------
   Rooms.

   Walls are one tile on the sides and bottom, two across the top, so there
   is a visible back wall. Exits therefore sit ON the wall line: x = 0,
   x = w-1, y = 1 or y = h-1.
   ------------------------------------------------------------------------- */

export const ROOMS = {

  hub: {
    name: 'The Crossroads', district: 'hub', floor: 'grass', w: 30, h: 20,
    accent: '#7fd4a8', seed: 101, music: 'hub',
    spawn: { x: 15, y: 16 },
    plazas: [{ x: 10, y: 5, w: 10, h: 10 }],
    paths: [
      { x: 1,  y: 5,  w: 10, h: 3 },    // west → the Arcade
      { x: 1,  y: 13, w: 10, h: 3 },    // west → the Observatory
      { x: 19, y: 5,  w: 10, h: 3 },    // east → the Foundry
      { x: 19, y: 13, w: 10, h: 3 },    // east → the Terminal
      { x: 14, y: 1,  w: 3,  h: 5 },    // north → the Workshop
      { x: 14, y: 14, w: 3,  h: 5 },    // south → the Archive
    ],
    objects: [
      { x: 14, y: 7,  icon: 'statue', entry: 'monument',    accent: '#7fd4a8' },
      { x: 11, y: 11, icon: 'cat',    entry: 'guide',       accent: '#ff9a3c' },
      { x: 17, y: 11, icon: 'sign',   entry: 'noticeboard', accent: '#ffd45e' },
    ],
    decor: [
      { x: 4, y: 3, art: 'tree' }, { x: 25, y: 3, art: 'tree' },
      { x: 4, y: 17, art: 'tree' }, { x: 25, y: 17, art: 'tree' },
      { x: 7, y: 17, art: 'rock' }, { x: 22, y: 17, art: 'rock' },
      { x: 7, y: 3, art: 'rock' },  { x: 22, y: 3, art: 'rock' },
      { x: 6, y: 10, art: 'plant', pass: true }, { x: 23, y: 10, art: 'plant', pass: true },
      { x: 11, y: 17, art: 'plant', pass: true }, { x: 18, y: 17, art: 'plant', pass: true },
      { x: 12, y: 3, art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 18, y: 3, art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 12, y: 14, art: 'plant', pass: true }, { x: 17, y: 14, art: 'plant', pass: true },
    ],
    exits: [
      { x: 0,  y: 6,  to: 'arcade',      tx: 31, ty: 10, label: 'The Arcade',      color: '#ff6ec7' },
      { x: 29, y: 6,  to: 'foundry',     tx: 2,  ty: 10, label: 'The Foundry',     color: '#ff9a3c' },
      { x: 0,  y: 14, to: 'observatory', tx: 29, ty: 10, label: 'The Observatory', color: '#9d8cff' },
      { x: 29, y: 14, to: 'vault',       tx: 2,  ty: 10, label: 'The Terminal',    color: '#52e07a' },
      { x: 15, y: 19, to: 'archive',     tx: 15, ty: 3,  label: 'The Archive',     color: '#e0c060' },
      { x: 15, y: 1,  to: 'workshop',    tx: 11, ty: 12, label: 'The Workshop',    color: '#ff4d6d', locked: true },
    ],
  },

  arcade: {
    name: 'The Arcade', district: 'arcade', floor: 'neon', w: 34, h: 20,
    accent: '#ff6ec7', seed: 202, music: 'arcade',
    spawn: { x: 31, y: 10 },
    plazas: [{ x: 3, y: 8, w: 28, h: 5 }],
    paths: [],
    objects: [
      { x: 4,  y: 5,  icon: 'sword',   entry: 'pottimea',    accent: '#ffd45e' },
      { x: 8,  y: 5,  icon: 'cabinet', entry: 'taxicat',     accent: '#ff9a3c' },
      { x: 12, y: 5,  icon: 'cabinet', entry: 'debunking',   accent: '#5fe0e8' },
      { x: 16, y: 5,  icon: 'cabinet', entry: 'falling',     accent: '#ffd45e' },
      { x: 20, y: 5,  icon: 'cabinet', entry: 'chess',       accent: '#e8e4d8' },
      { x: 24, y: 5,  icon: 'cabinet', entry: 'donut',       accent: '#ff6ec7' },
      { x: 10, y: 16, icon: 'cabinet', entry: 'multiplayer', accent: '#4fd98a' },
      { x: 16, y: 16, icon: 'cabinet', entry: 'panopticon',  accent: '#a893ff' },
    ],
    decor: [
      { x: 2,  y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 31, y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 2,  y: 16, art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 28, y: 5,  art: 'crate', accent: '#ff6ec7' },
      { x: 29, y: 16, art: 'crate', accent: '#5fe0e8' },
      { x: 27, y: 17, art: 'crate', accent: '#ffd45e' },
      { x: 5,  y: 16, art: 'crate', accent: '#ffd45e' },
      { x: 6,  y: 17, art: 'crate', accent: '#ff6ec7' },
      { x: 22, y: 16, art: 'plant', pass: true },
      { x: 13, y: 17, art: 'plant', pass: true },
    ],
    exits: [{ x: 33, y: 10, to: 'hub', tx: 2, ty: 6, label: 'The Crossroads', color: '#7fd4a8' }],
  },

  foundry: {
    name: 'The Foundry', district: 'foundry', floor: 'metal', w: 32, h: 20,
    accent: '#ff9a3c', seed: 303, music: 'foundry',
    spawn: { x: 2, y: 10 },
    plazas: [{ x: 3, y: 8, w: 26, h: 5 }],
    paths: [],
    objects: [
      { x: 6,  y: 5,  icon: 'badge',   entry: 'role',      accent: '#ff9a3c' },
      { x: 12, y: 5,  icon: 'machine', entry: 'sku',       accent: '#5fe0e8' },
      { x: 18, y: 5,  icon: 'chart',   entry: 'estimator', accent: '#4fd98a' },
      { x: 24, y: 5,  icon: 'gauge',   entry: 'perf',      accent: '#ffd45e' },
      { x: 15, y: 16, icon: 'toolbox', entry: 'craft',     accent: '#ef5367' },
    ],
    decor: [
      { x: 4,  y: 16, art: 'crate', accent: '#ff9a3c' },
      { x: 5,  y: 17, art: 'crate', accent: '#9aa6b5' },
      { x: 27, y: 16, art: 'crate', accent: '#9aa6b5' },
      { x: 26, y: 17, art: 'crate', accent: '#ff9a3c' },
      { x: 9,  y: 16, art: 'anvil' }, { x: 22, y: 16, art: 'anvil' },
      { x: 2,  y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 29, y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 2,  y: 16, art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 29, y: 16, art: 'torch', anim: ['torch', 'torch_1'] },
    ],
    exits: [{ x: 0, y: 10, to: 'hub', tx: 27, ty: 6, label: 'The Crossroads', color: '#7fd4a8' }],
  },

  observatory: {
    name: 'The Observatory', district: 'observatory', floor: 'void', w: 32, h: 20,
    accent: '#9d8cff', seed: 404, music: 'observatory', stars: true,
    spawn: { x: 29, y: 10 },
    plazas: [{ x: 4, y: 8, w: 24, h: 5 }],
    paths: [],
    objects: [
      { x: 6,  y: 5,  icon: 'telescope', entry: 'thesis',        accent: '#9d8cff' },
      { x: 13, y: 5,  icon: 'orb',       entry: 'companion',     accent: '#5fe0e8' },
      { x: 20, y: 5,  icon: 'scroll',    entry: 'omscs',         accent: '#ffd45e' },
      { x: 9,  y: 16, icon: 'brain',     entry: 'consciousness', accent: '#ff6ec7' },
      { x: 18, y: 16, icon: 'doors',     entry: 'monty',         accent: '#4fd98a' },
    ],
    decor: [
      { x: 25, y: 16, art: 'rock' }, { x: 27, y: 17, art: 'rock' },
      { x: 3,  y: 17, art: 'rock' }, { x: 26, y: 4, art: 'rock' },
      { x: 2,  y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 29, y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 2,  y: 16, art: 'torch', anim: ['torch', 'torch_1'] },
    ],
    exits: [{ x: 31, y: 10, to: 'hub', tx: 2, ty: 14, label: 'The Crossroads', color: '#7fd4a8' }],
  },

  vault: {
    name: 'The Terminal', district: 'vault', floor: 'grid', w: 32, h: 20,
    accent: '#52e07a', seed: 505, music: 'vault', scan: true,
    spawn: { x: 2, y: 10 },
    plazas: [{ x: 4, y: 8, w: 24, h: 5 }],
    paths: [],
    objects: [
      { x: 15, y: 5,  icon: 'terminal', entry: 'terminal', accent: '#52e07a' },
      { x: 7,  y: 5,  icon: 'database', entry: 'fccdb',    accent: '#5fe0e8' },
      { x: 23, y: 5,  icon: 'globe',    entry: 'fccweb',   accent: '#ffd45e' },
      { x: 10, y: 16, icon: 'server',   entry: 'gamecave', accent: '#a893ff' },
      { x: 20, y: 16, icon: 'crate',    entry: 'scripts',  accent: '#ff9a3c' },
    ],
    decor: [
      { x: 4,  y: 16, art: 'crate', accent: '#52e07a' },
      { x: 27, y: 16, art: 'crate', accent: '#52e07a' },
      { x: 28, y: 5,  art: 'server', accent: '#2a8a56' },
      { x: 3,  y: 5,  art: 'server', accent: '#2a8a56' },
      { x: 2,  y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 29, y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
    ],
    exits: [{ x: 0, y: 10, to: 'hub', tx: 27, ty: 14, label: 'The Crossroads', color: '#7fd4a8' }],
  },

  archive: {
    name: 'The Archive', district: 'archive', floor: 'wood', w: 30, h: 18,
    accent: '#e0c060', seed: 606, music: 'archive',
    spawn: { x: 15, y: 3 },
    plazas: [{ x: 4, y: 9, w: 22, h: 5 }],
    paths: [],
    objects: [
      { x: 8,  y: 7,  icon: 'shelf', entry: 'shelf',    accent: '#e0c060' },
      { x: 15, y: 7,  icon: 'book',  entry: 'timeline', accent: '#5fe0e8' },
      { x: 22, y: 7,  icon: 'chest', entry: 'early',    accent: '#ff9a3c' },
    ],
    decor: [
      { x: 3,  y: 6,  art: 'shelf', accent: '#8a6a3a' },
      { x: 27, y: 6,  art: 'shelf', accent: '#8a6a3a' },
      { x: 5,  y: 14, art: 'crate', accent: '#a8703f' },
      { x: 25, y: 14, art: 'crate', accent: '#a8703f' },
      { x: 11, y: 14, art: 'plant', pass: true }, { x: 19, y: 14, art: 'plant', pass: true },
      { x: 2,  y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 27, y: 3,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 2,  y: 14, art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 27, y: 14, art: 'torch', anim: ['torch', 'torch_1'] },
    ],
    exits: [{ x: 15, y: 1, to: 'hub', tx: 15, ty: 17, label: 'The Crossroads', color: '#7fd4a8' }],
  },

  workshop: {
    name: 'The Workshop', district: 'workshop', floor: 'carpet', w: 24, h: 16,
    accent: '#ff4d6d', seed: 707, music: 'workshop',
    spawn: { x: 11, y: 12 },
    plazas: [{ x: 5, y: 5, w: 14, h: 7 }],
    paths: [],
    objects: [
      { x: 8,  y: 7,  icon: 'mail',  entry: 'contact',  accent: '#ff4d6d' },
      { x: 14, y: 7,  icon: 'anvil', entry: 'colophon', accent: '#5fe0e8' },
    ],
    decor: [
      { x: 3,  y: 4,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 20, y: 4,  art: 'torch', anim: ['torch', 'torch_1'] },
      { x: 3,  y: 12, art: 'crate', accent: '#ff4d6d' },
      { x: 20, y: 12, art: 'crate', accent: '#5fe0e8' },
      { x: 6,  y: 12, art: 'plant', pass: true },
      { x: 17, y: 12, art: 'plant', pass: true },
    ],
    exits: [{ x: 11, y: 15, to: 'hub', tx: 15, ty: 3, label: 'The Crossroads', color: '#7fd4a8' }],
  },
};

/* -------------------------------------------------------------------------
   Build a room: generate the tile grid, mark solids, index interactables.
   ------------------------------------------------------------------------- */

function fillRect(tiles, w, h, r, id, rnd, altId) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 1 || y < 2 || x > w - 2 || y > h - 2) continue;
      tiles[y * w + x] = (altId !== undefined && rnd() < 0.22) ? altId : id;
    }
  }
}

export function buildRoom(id) {
  const spec = ROOMS[id];
  const rnd = mulberry32(spec.seed);
  const { w, h } = spec;

  const tiles = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const isWall = x === 0 || x === w - 1 || y === 0 || y === 1 || y === h - 1;
      if (isWall) {
        tiles[i] = (y === 1 || y === h - 1) ? T.WALL_TOP : T.WALL;
        solid[i] = 1;
      } else {
        const r = rnd();
        tiles[i] = r < 0.09 ? T.SPECK : (r < 0.5 ? T.FLOOR : T.FLOOR_B);
      }
    }
  }

  for (const p of spec.paths || []) fillRect(tiles, w, h, p, T.PATH, rnd);
  for (const p of spec.plazas || []) fillRect(tiles, w, h, p, T.PLAZA, rnd);

  const objects = (spec.objects || []).map((o) => ({ ...o, kind: 'object' }));
  const decor = (spec.decor || []).map((d) => ({ ...d, kind: 'decor' }));
  const exits = (spec.exits || []).map((e) => ({ ...e, kind: 'exit' }));

  for (const o of objects) solid[o.y * w + o.x] = 1;
  for (const d of decor) if (!d.pass) solid[d.y * w + d.x] = 1;
  for (const e of exits) { solid[e.y * w + e.x] = 0; tiles[e.y * w + e.x] = T.PATH; }

  return { id, spec, w, h, tiles, solid, objects, decor, exits };
}

export function isSolid(room, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return true;
  return room.solid[ty * room.w + tx] === 1;
}
