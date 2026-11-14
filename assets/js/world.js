/* =========================================================================
   world.js — the rooms.

   Each room is a small text map plus a legend. At load the map becomes a
   collision grid, a list of things to draw, a list of lights, and one
   pre-painted image of the floor and walls. Decoration is scattered with a
   seeded generator, so it looks random but is the same for every visitor.
   ========================================================================= */

export const TILE = 16;

/* Tile kinds */
export const K = { FLOOR: 0, RUG: 1, PATH: 2, WALL: 3 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------
   Themes: colours for each surface, how dark the room is, what drifts
   through its air.
   ------------------------------------------------------------------------- */

export const THEMES = {
  garden: {
    a: '#2f6a47', b: '#2c6443', d: '#3f8459', d2: '#255539',
    rugA: '#59606d', rugB: '#515865', rugLine: '#434955', trim: '#8b93a3',
    pathA: '#7a6646', pathB: '#735f41', pathD: '#8e7854',
    wall: '#3c4a44', wallHi: '#56675f', wallLo: '#27322e', cap: '#1e2824', out: '#141b18',
    shade: 'rgba(8,10,26,0.50)', air: 'fireflies',
  },
  neon: {
    a: '#1c1533', b: '#191230', d: '#2c2150', d2: '#120d24',
    rugA: '#5a1f55', rugB: '#6b2766', rugLine: '#421640', trim: '#e0a34a',
    pathA: '#241a40', pathB: '#21183b', pathD: '#30245a',
    wall: '#33215a', wallHi: '#5a3a94', wallLo: '#20143a', cap: '#150d28', out: '#0c0817',
    shade: 'rgba(8,4,22,0.62)', air: 'sparks',
  },
  metal: {
    a: '#3d3833', b: '#39342f', d: '#57504a', d2: '#2a2622',
    rugA: '#2e2b29', rugB: '#343130', rugLine: '#201e1c', trim: '#e0a030',
    pathA: '#3a3531', pathB: '#36312d', pathD: '#4a443f',
    wall: '#4a3c33', wallHi: '#74604f', wallLo: '#2d241f', cap: '#1c1613', out: '#110d0b',
    shade: 'rgba(14,6,4,0.62)', air: 'embers',
  },
  void: {
    a: '#161232', b: '#14102d', d: '#3a3170', d2: '#0e0b22',
    rugA: '#211a4a', rugB: '#251e52', rugLine: '#171238', trim: '#a99bff',
    pathA: '#1b1640', pathB: '#19143a', pathD: '#2a2260',
    wall: '#2a2158', wallHi: '#4a3c94', wallLo: '#1a1438', cap: '#100c26', out: '#080614',
    shade: 'rgba(4,3,18,0.60)', air: 'stars',
  },
  grid: {
    a: '#0f1f16', b: '#0e1c14', d: '#1e5a36', d2: '#0a1610',
    rugA: '#143021', rugB: '#163626', rugLine: '#0d2217', trim: '#3ee08a',
    pathA: '#122a1c', pathB: '#11261a', pathD: '#1c4a2e',
    wall: '#16382a', wallHi: '#2a6a4a', wallLo: '#0e241a', cap: '#081610', out: '#050d09',
    shade: 'rgba(2,10,6,0.64)', air: 'code',
  },
  wood: {
    a: '#6b4a30', b: '#644529', d: '#7c583a', d2: '#4d3420',
    rugA: '#7a2630', rugB: '#882c37', rugLine: '#5c1b24', trim: '#e6c56a',
    pathA: '#5e4129', pathB: '#583c25', pathD: '#6e4e33',
    wall: '#4a3222', wallHi: '#7a5638', wallLo: '#2e1f15', cap: '#1e140d', out: '#120c08',
    shade: 'rgba(16,8,4,0.56)', air: 'dust',
  },
  velvet: {
    a: '#3a2440', b: '#36213c', d: '#553660', d2: '#28182c',
    rugA: '#6a2a44', rugB: '#76304c', rugLine: '#4c1c30', trim: '#ff9aa8',
    pathA: '#40284a', pathB: '#3c2545', pathD: '#55366a',
    wall: '#3c2848', wallHi: '#66447a', wallLo: '#261a2e', cap: '#170f1c', out: '#0e0912',
    shade: 'rgba(12,4,14,0.58)', air: 'dust',
  },
};

/* -------------------------------------------------------------------------
   Rooms.

   Map characters:   #  wall      .  floor      :  rug / paving      =  path
   Anything else is looked up in the room's legend (falling back to COMMON).
   A legend entry is one of
     { entry, icon, accent }        something to read — solid unless solid:false
     { art, ... }                   scenery; pass:true to walk through,
                                    wall:true to hang it on the wall behind
     { to, tx, ty, label, color }   a door
   and may add  on:'rug'|'path'  for the floor beneath it, and  light:{r,color}.
   ------------------------------------------------------------------------- */

const FIRE = { r: 54, color: '#ffb060', flicker: 1 };

const COMMON = {
  s: { art: 'sconce', anim: ['sconce', 'sconce_1'], wall: true, light: FIRE },
  c: { art: 'crate', smash: true },
  p: { art: 'plant', pass: true },
  r: { art: 'rock' },
  a: { art: 'anvil' },
};

export const ROOMS = {

  hub: {
    name: 'The Crossroads', district: 'hub', theme: 'garden', seed: 101, music: 'hub',
    spawn: [13, 8],
    tour: [[7, 8], [7, 7], [19, 7], [19, 9], [7, 9]],
    map: [
      '###########################',
      '#############0#############',
      '#T..r......l===l......r..T#',
      '#........f..===..f........#',
      '#...........===...........#',
      '1=====:::::::::::::::=====2',
      '#=====:::::::S:::::::=====#',
      '#.p...:::::::::::::::...p.#',
      '#.....:::C:::::::M:::.....#',
      '#=====:::::::::::::::=====#',
      '3=====:::::::::::::::=====4',
      '#...........===...........#',
      '#........f..===..f........#',
      '#T..r......l===l......r..T#',
      '#############5#############',
    ],
    legend: {
      T: { art: 'tree' },
      f: { art: 'flowers', pass: true },
      l: { art: 'lamp', light: { r: 58, color: '#ffd28a', flicker: 0.4 } },
      S: { entry: 'about-me', icon: 'statue', accent: '#7fd4a8', on: 'rug' },
      C: { entry: 'guide', icon: 'cat', accent: '#ff9a3c', on: 'rug', solid: false },
      M: { entry: 'contact-me', icon: 'mail', accent: '#6ee7a0', on: 'rug' },
      0: { to: 'workshop', tx: 9, ty: 6, label: 'The Workshop', color: '#ff6b81', locked: true },
      1: { to: 'arcade', tx: 23, ty: 6, label: 'The Arcade', color: '#ff7ac8' },
      2: { to: 'foundry', tx: 2, ty: 6, label: 'The Foundry', color: '#ffb454' },
      3: { to: 'observatory', tx: 21, ty: 6, label: 'The Observatory', color: '#a99bff' },
      4: { to: 'vault', tx: 2, ty: 6, label: 'The Terminal', color: '#6ee7a0' },
      5: { to: 'archive', tx: 12, ty: 3, label: 'The Archive', color: '#e6c56a' },
    },
  },

  arcade: {
    name: 'The Arcade', district: 'arcade', theme: 'neon', seed: 202, music: 'arcade',
    spawn: [23, 6],
    tour: [[22, 6], [3, 6], [3, 4], [22, 4]],
    map: [
      '##########################',
      '###s######s####s######s###',
      '#.A..B..C..D..E..F..G..H.#',
      '#........................#',
      '#.::::::::::::::::::::::.#',
      '#.::::::::::::::::::::::.#',
      '#.:::::::::::::::::::::::9',
      '#.::::::::::::::::::::::.#',
      '#........................#',
      '#.c..p....c.c....p....c..#',
      '#........................#',
      '##########################',
    ],
    legend: {
      s: { art: 'sconce', anim: ['sconce', 'sconce_1'], wall: true, light: { r: 50, color: '#ff7ac8', flicker: 0.5 } },
      A: { entry: 'pottimea', icon: 'cabinet', accent: '#ffd45e' },
      B: { entry: 'taxicat', icon: 'cabinet', accent: '#ff9a3c' },
      C: { entry: 'debunking', icon: 'cabinet', accent: '#c58cff' },
      D: { entry: 'chess', icon: 'cabinet', accent: '#e8e4d8' },
      E: { entry: 'falling-sand', icon: 'cabinet', accent: '#ffb454' },
      F: { entry: 'donut', icon: 'cabinet', accent: '#ff7ac8' },
      G: { entry: 'multiplayer', icon: 'cabinet', accent: '#6ee7a0' },
      H: { entry: 'panopticon', icon: 'cabinet', accent: '#6fdcec' },
      9: { to: 'hub', tx: 2, ty: 5, label: 'The Crossroads', color: '#7fd4a8', on: 'rug' },
    },
  },

  foundry: {
    name: 'The Foundry', district: 'foundry', theme: 'metal', seed: 303, music: 'foundry',
    spawn: [2, 6],
    tour: [[2, 6], [21, 5], [21, 7], [2, 7]],
    map: [
      '########################',
      '#####s#####s####s####s##',
      '#..R....Q.....E....P...#',
      '#......................#',
      '#.::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '8:::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '#......................#',
      '#.c.a.....b....a.....c.#',
      '#......................#',
      '########################',
    ],
    legend: {
      b: { art: 'brazier', anim: ['brazier', 'brazier_1'], light: { r: 66, color: '#ff8a3c', flicker: 1 } },
      R: { entry: 'gecko', icon: 'machine', accent: '#ffb454' },
      Q: { entry: 'quotes', icon: 'machine', accent: '#6fdcec' },
      E: { entry: 'estimator', icon: 'gauge', accent: '#6ee7a0' },
      P: { entry: 'performance', icon: 'gauge', accent: '#ffd45e' },
      8: { to: 'hub', tx: 24, ty: 5, label: 'The Crossroads', color: '#7fd4a8', on: 'rug' },
    },
  },

  observatory: {
    name: 'The Observatory', district: 'observatory', theme: 'void', seed: 404, music: 'observatory',
    spawn: [21, 6],
    tour: [[21, 6], [2, 5], [2, 7], [21, 7]],
    map: [
      '########################',
      '#####s#####s####s####s##',
      '#..T....O.....G....C...#',
      '#......................#',
      '#.::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '#.:::::::::::::::::::::9',
      '#.::::::::::::::::::::.#',
      '#......................#',
      '#.r........M.........r.#',
      '#......................#',
      '########################',
    ],
    legend: {
      s: { art: 'sconce', anim: ['sconce', 'sconce_1'], wall: true, light: { r: 50, color: '#a99bff', flicker: 0.4 } },
      T: { entry: 'thesis', icon: 'telescope', accent: '#a99bff' },
      O: { entry: 'companion', icon: 'orb', accent: '#6fdcec' },
      G: { entry: 'gatech', icon: 'book', accent: '#ffd45e' },
      C: { entry: 'consciousness', icon: 'orb', accent: '#ff7ac8' },
      M: { entry: 'monty-hall', icon: 'doors', accent: '#6ee7a0' },
      9: { to: 'hub', tx: 2, ty: 10, label: 'The Crossroads', color: '#7fd4a8', on: 'rug' },
    },
  },

  vault: {
    name: 'The Terminal', district: 'vault', theme: 'grid', seed: 505, music: 'vault',
    spawn: [2, 6],
    tour: [[2, 6], [21, 5], [21, 7], [2, 7]],
    map: [
      '########################',
      '#####s#####s####s####s##',
      '#..D....T.....W....G...#',
      '#......................#',
      '#.::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '8:::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '#......................#',
      '#.c....S.........H...c.#',
      '#......................#',
      '########################',
    ],
    legend: {
      s: { art: 'sconce', anim: ['sconce', 'sconce_1'], wall: true, light: { r: 48, color: '#6ee7a0', flicker: 0.3 } },
      D: { entry: 'fcc-db', icon: 'server', accent: '#6fdcec' },
      T: { entry: 'terminal', icon: 'terminal', accent: '#6ee7a0' },
      W: { entry: 'fcc-web', icon: 'terminal', accent: '#ffd45e' },
      G: { entry: 'game-cave', icon: 'server', accent: '#a99bff' },
      S: { entry: 'scripts', icon: 'crate', accent: '#ffb454' },
      H: { entry: 'warehouse', icon: 'machine', accent: '#ff7ac8' },
      8: { to: 'hub', tx: 24, ty: 10, label: 'The Crossroads', color: '#7fd4a8', on: 'rug' },
    },
  },

  archive: {
    name: 'The Archive', district: 'archive', theme: 'wood', seed: 606, music: 'archive',
    spawn: [12, 3],
    tour: [[12, 3], [12, 6], [3, 6], [3, 7], [20, 7], [20, 6]],
    map: [
      '########################',
      '###s########7#######s###',
      '#k.........===........k#',
      '#..........===.........#',
      '#.::::::::::::::::::::.#',
      '#.::R::::E::::D::::W::.#',
      '#.::::::::::::::::::::.#',
      '#.::::::::::::::::::::.#',
      '#......................#',
      '#.c..p............p..c.#',
      '#......................#',
      '########################',
    ],
    legend: {
      k: { art: 'shelf', accent: '#a8703f' },
      R: { entry: 'repos', icon: 'shelf', accent: '#e6c56a', on: 'rug' },
      E: { entry: 'earlier', icon: 'book', accent: '#6fdcec', on: 'rug' },
      D: { entry: 'deree', icon: 'book', accent: '#ffb454', on: 'rug' },
      W: { entry: 'coursework', icon: 'chest', accent: '#ff7ac8', on: 'rug' },
      7: { to: 'hub', tx: 13, ty: 12, label: 'The Crossroads', color: '#7fd4a8' },
    },
  },

  workshop: {
    name: 'The Workshop', district: 'workshop', theme: 'velvet', seed: 707, music: 'workshop',
    spawn: [9, 6],
    tour: [[9, 6]],
    map: [
      '####################',
      '###s############s###',
      '#..................#',
      '#..::::::::::::::..#',
      '#..::::::K:::::::..#',
      '#..::::::::::::::..#',
      '#..::::::::::::::..#',
      '#.c..............c.#',
      '#########6##########',
    ],
    legend: {
      K: { entry: 'colophon', icon: 'anvil', accent: '#ff6b81', on: 'rug' },
      6: { to: 'hub', tx: 13, ty: 3, label: 'The Crossroads', color: '#7fd4a8' },
    },
  },
};

/* -------------------------------------------------------------------------
   Build a room from its map.
   ------------------------------------------------------------------------- */

export function buildRoom(id) {
  const spec = ROOMS[id];
  const h = spec.map.length, w = spec.map[0].length;
  const kind = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h);
  const objects = [], decor = [], exits = [], lights = [];

  for (let y = 0; y < h; y++) {
    const row = spec.map[y];
    if (row.length !== w) throw new Error(`${id}: row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x], i = y * w + x;
      if (ch === '#') { kind[i] = K.WALL; solid[i] = 1; continue; }
      if (ch === '.') { kind[i] = K.FLOOR; continue; }
      if (ch === ':') { kind[i] = K.RUG; continue; }
      if (ch === '=') { kind[i] = K.PATH; continue; }

      const def = (spec.legend && spec.legend[ch]) || COMMON[ch];
      if (!def) throw new Error(`${id}: no legend entry for "${ch}" at ${x},${y}`);
      const under = def.on === 'rug' ? K.RUG : def.on === 'path' ? K.PATH : K.FLOOR;

      if (def.to) {
        kind[i] = under === K.FLOOR ? K.PATH : under;
        exits.push({ ...def, x, y });
      } else if (def.entry) {
        kind[i] = under;
        if (def.solid !== false) solid[i] = 1;
        objects.push({ ...def, x, y });
      } else {
        kind[i] = def.wall ? K.WALL : under;
        if (def.wall || !def.pass) solid[i] = 1;
        decor.push({ ...def, x, y });
      }
      if (def.light) {
        lights.push({
          x: x * TILE + TILE / 2,
          y: y * TILE + (def.wall ? 8 : 2),
          phase: (x * 7 + y * 13) % 10,
          ...def.light,
        });
      }
    }
  }

  const room = { id, spec, w, h, kind, solid, objects, decor, exits, lights, theme: spec.theme };
  room.floor = paintRoom(room);
  return room;
}

export function isSolid(room, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return true;
  return room.solid[ty * room.w + tx] === 1;
}

/* -------------------------------------------------------------------------
   Painting. Floors and walls are drawn once into an off-screen canvas.
   ------------------------------------------------------------------------- */

function paintRoom(room) {
  const { w, h } = room;
  const cv = document.createElement('canvas');
  cv.width = w * TILE; cv.height = h * TILE;
  const c = cv.getContext('2d');
  const th = THEMES[room.theme];
  const rnd = mulberry32(room.spec.seed);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? K.WALL : room.kind[y * w + x];
  const paint = FLOORS[room.theme] || FLOORS.garden;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = at(x, y), px = x * TILE, py = y * TILE;
      if (k === K.WALL) continue;
      if (k === K.RUG) paint.rug(c, th, px, py, x, y, rnd);
      else if (k === K.PATH) paint.path(c, th, px, py, x, y, rnd);
      else paint.floor(c, th, px, py, x, y, rnd);
    }
  }

  // Trim round the paved and carpeted areas, so they read as laid, not painted.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== K.RUG) continue;
      const px = x * TILE, py = y * TILE;
      const edge = (dx, dy) => { const n = at(x + dx, y + dy); return n !== K.RUG && n !== K.WALL; };
      c.fillStyle = th.rugLine;
      if (edge(0, -1)) c.fillRect(px, py, TILE, 1);
      if (edge(0, 1)) c.fillRect(px, py + TILE - 1, TILE, 1);
      if (edge(-1, 0)) c.fillRect(px, py, 1, TILE);
      if (edge(1, 0)) c.fillRect(px + TILE - 1, py, 1, TILE);
      c.fillStyle = th.trim;
      c.globalAlpha = 0.85;
      for (let i = 1; i < TILE; i += 3) {
        if (edge(0, -1)) c.fillRect(px + i, py + 2, 1, 1);
        if (edge(0, 1)) c.fillRect(px + i, py + TILE - 3, 1, 1);
        if (edge(-1, 0)) c.fillRect(px + 2, py + i, 1, 1);
        if (edge(1, 0)) c.fillRect(px + TILE - 3, py + i, 1, 1);
      }
      c.globalAlpha = 1;
    }
  }

  // Walls. A wall with open floor to its south shows its face; the rest of
  // the wall is seen from above.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== K.WALL) continue;
      const px = x * TILE, py = y * TILE;
      const facing = y + 1 < h && at(x, y + 1) !== K.WALL;
      if (facing) {
        c.fillStyle = th.wall; c.fillRect(px, py, TILE, TILE);
        c.fillStyle = th.wallLo;
        c.fillRect(px, py + 5, TILE, 1); c.fillRect(px, py + 10, TILE, 1);
        const off = (x % 2) * 4;
        c.fillRect(px + 3 + off, py, 1, 5); c.fillRect(px + 11 - off, py + 6, 1, 4);
        c.fillRect(px + 3 + off, py + 11, 1, 5);
        c.fillStyle = th.wallHi; c.fillRect(px, py, TILE, 2);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(px, py + TILE - 2, TILE, 2);
      } else {
        c.fillStyle = th.cap; c.fillRect(px, py, TILE, TILE);
        if (rnd() < 0.5) { c.fillStyle = th.wallLo; c.fillRect(px + 2 + ((rnd() * 9) | 0), py + 3 + ((rnd() * 9) | 0), 3, 1); }
        c.fillStyle = th.wallHi;
        c.globalAlpha = 0.55;
        if (at(x, y - 1) !== K.WALL) c.fillRect(px, py, TILE, 2);
        if (at(x - 1, y) !== K.WALL) c.fillRect(px, py, 2, TILE);
        if (at(x + 1, y) !== K.WALL) c.fillRect(px + TILE - 2, py, 2, TILE);
        c.globalAlpha = 1;
      }
    }
  }

  // The wall's shadow falls on the first row of floor in front of it.
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) === K.WALL || at(x, y - 1) !== K.WALL) continue;
      const px = x * TILE, py = y * TILE;
      for (let i = 0; i < 6; i++) {
        c.fillStyle = `rgba(0,0,0,${0.34 - i * 0.055})`;
        c.fillRect(px, py + i, TILE, 1);
      }
    }
  }
  return cv;
}

const dot = (c, x, y, col, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

const FLOORS = {
  garden: {
    floor(c, th, px, py, x, y, r) {
      dot(c, px, py, r() < 0.5 ? th.a : th.b, TILE, TILE);
      for (let i = 0; i < 3; i++) dot(c, px + ((r() * 16) | 0), py + ((r() * 16) | 0), th.d2);
      const v = r();
      if (v < 0.2) {            // a tuft
        const tx = px + 3 + ((r() * 9) | 0), ty = py + 5 + ((r() * 7) | 0);
        dot(c, tx, ty, th.d, 1, 3); dot(c, tx + 1, ty - 1, th.d, 1, 4); dot(c, tx + 2, ty + 1, th.d, 1, 2);
      } else if (v < 0.25) {    // a small flower
        const fx = px + 4 + ((r() * 8) | 0), fy = py + 4 + ((r() * 8) | 0);
        dot(c, fx, fy + 1, th.d, 1, 2);
        dot(c, fx, fy, ['#f4e9c8', '#ffd45e', '#ff9ac8'][(r() * 3) | 0]);
      }
    },
    rug(c, th, px, py, x, y, r) {   // stone paving
      dot(c, px, py, th.rugA, TILE, TILE);
      const o = (y % 2) * 4;
      for (let i = 0; i < 2; i++) {
        if (r() < 0.45) dot(c, px + ((i * 8 + o) % 16), py, th.rugB, 8, 8);
        if (r() < 0.45) dot(c, px + ((i * 8 + o + 4) % 16), py + 8, th.rugB, 8, 8);
      }
      c.fillStyle = th.rugLine;
      c.fillRect(px, py + 7, TILE, 1); c.fillRect(px, py + 15, TILE, 1);
      c.fillRect(px + ((7 + o) % 16), py, 1, 7); c.fillRect(px + ((15 + o) % 16), py, 1, 7);
      c.fillRect(px + ((3 + o) % 16), py + 8, 1, 7); c.fillRect(px + ((11 + o) % 16), py + 8, 1, 7);
    },
    path(c, th, px, py, x, y, r) {  // packed earth
      dot(c, px, py, r() < 0.5 ? th.pathA : th.pathB, TILE, TILE);
      for (let i = 0; i < 4; i++) dot(c, px + ((r() * 15) | 0), py + ((r() * 15) | 0), th.pathD, r() < 0.3 ? 2 : 1, 1);
    },
  },

  neon: {
    floor(c, th, px, py, x, y, r) {
      dot(c, px, py, (x + y) % 2 ? th.a : th.b, TILE, TILE);
      dot(c, px, py + 15, th.d2, TILE, 1); dot(c, px + 15, py, th.d2, 1, TILE);
      dot(c, px, py, th.d, 1, 1);
      if (r() < 0.1) dot(c, px + 4 + ((r() * 8) | 0), py + 4 + ((r() * 8) | 0), th.d, 2, 1);
    },
    rug(c, th, px, py) {            // a diamond-patterned carpet
      dot(c, px, py, th.rugA, TILE, TILE);
      c.fillStyle = th.rugB;
      for (let i = 0; i < 8; i++) {
        c.fillRect(px + 7 - i, py + i, 2 + i * 2, 1);
        c.fillRect(px + 7 - i, py + 15 - i, 2 + i * 2, 1);
      }
      dot(c, px + 7, py + 7, th.rugLine, 2, 2);
    },
    path(c, th, px, py, x, y) {
      dot(c, px, py, (x + y) % 2 ? th.pathA : th.pathB, TILE, TILE);
    },
  },

  metal: {
    floor(c, th, px, py, x, y, r) {  // riveted plate
      dot(c, px, py, (x + y) % 2 ? th.a : th.b, TILE, TILE);
      dot(c, px, py, th.d, TILE, 1); dot(c, px, py, th.d, 1, TILE);
      dot(c, px, py + 15, th.d2, TILE, 1); dot(c, px + 15, py, th.d2, 1, TILE);
      for (const [dx, dy] of [[2, 2], [13, 2], [2, 13], [13, 13]]) dot(c, px + dx, py + dy, th.d);
      if (r() < 0.25) dot(c, px + 4 + ((r() * 6) | 0), py + 5 + ((r() * 6) | 0), th.d2, 4, 1);
    },
    rug(c, th, px, py, x, y) {       // grated walkway
      dot(c, px, py, th.rugA, TILE, TILE);
      c.fillStyle = th.rugB;
      for (let i = 1; i < 16; i += 4) c.fillRect(px + i, py + 1, 2, 14);
      dot(c, px, py + 15, th.rugLine, TILE, 1);
      void x; void y;
    },
    path(c, th, px, py, x, y) { dot(c, px, py, (x + y) % 2 ? th.pathA : th.pathB, TILE, TILE); },
  },

  void: {
    floor(c, th, px, py, x, y, r) {  // dark glass with stars under it
      dot(c, px, py, (x + y) % 2 ? th.a : th.b, TILE, TILE);
      dot(c, px, py + 15, th.d2, TILE, 1); dot(c, px + 15, py, th.d2, 1, TILE);
      const n = r() < 0.5 ? 1 : r() < 0.5 ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const sx = px + 2 + ((r() * 12) | 0), sy = py + 2 + ((r() * 12) | 0);
        dot(c, sx, sy, r() < 0.3 ? '#e8e2ff' : th.d);
        if (r() < 0.12) { dot(c, sx - 1, sy, th.d); dot(c, sx + 1, sy, th.d); dot(c, sx, sy - 1, th.d); dot(c, sx, sy + 1, th.d); }
      }
    },
    rug(c, th, px, py, x, y) {
      dot(c, px, py, (x + y) % 2 ? th.rugA : th.rugB, TILE, TILE);
      dot(c, px + 7, py + 7, th.d, 2, 2);
    },
    path(c, th, px, py, x, y) { dot(c, px, py, (x + y) % 2 ? th.pathA : th.pathB, TILE, TILE); },
  },

  grid: {
    floor(c, th, px, py, x, y, r) {  // circuit board
      dot(c, px, py, (x + y) % 2 ? th.a : th.b, TILE, TILE);
      dot(c, px, py + 15, th.d2, TILE, 1); dot(c, px + 15, py, th.d2, 1, TILE);
      if (r() < 0.34) {
        const ax = px + 3 + ((r() * 8) | 0), ay = py + 3 + ((r() * 8) | 0);
        const len = 3 + ((r() * 6) | 0);
        c.fillStyle = th.d;
        if (r() < 0.5) { c.fillRect(ax, ay, len, 1); c.fillRect(ax + len - 1, ay, 1, 4); }
        else { c.fillRect(ax, ay, 1, len); c.fillRect(ax, ay + len - 1, 4, 1); }
        dot(c, ax - 1, ay - 1, th.trim, 2, 2);
      }
    },
    rug(c, th, px, py, x, y) {       // raised floor panels
      dot(c, px, py, (x + y) % 2 ? th.rugA : th.rugB, TILE, TILE);
      dot(c, px, py, th.d, TILE, 1); dot(c, px, py, th.d, 1, TILE);
      dot(c, px + 2, py + 2, th.rugLine, 2, 2); dot(c, px + 12, py + 12, th.rugLine, 2, 2);
    },
    path(c, th, px, py, x, y) { dot(c, px, py, (x + y) % 2 ? th.pathA : th.pathB, TILE, TILE); },
  },

  wood: {
    floor(c, th, px, py, x, y, r) {  // floorboards
      for (let b = 0; b < 2; b++) {
        const by = py + b * 8, row = y * 2 + b;
        dot(c, px, by, row % 2 ? th.a : th.b, TILE, 8);
        dot(c, px, by + 7, th.d2, TILE, 1);
        const seam = (row * 7 + 3) % 32;
        const local = seam - ((x * 16) % 32);
        if (local >= 0 && local < 16) dot(c, px + local, by, th.d2, 1, 7);
        if (r() < 0.5) dot(c, px + ((r() * 11) | 0), by + 2 + ((r() * 3) | 0), th.d, 3 + ((r() * 4) | 0), 1);
      }
    },
    rug(c, th, px, py, x, y) {       // patterned carpet
      dot(c, px, py, th.rugA, TILE, TILE);
      c.fillStyle = th.rugB;
      c.fillRect(px + 6, py + 2, 4, 12); c.fillRect(px + 2, py + 6, 12, 4);
      dot(c, px + 7, py + 7, th.trim, 2, 2);
      void x; void y;
    },
    path(c, th, px, py, x, y) {      // a runner
      dot(c, px, py, th.rugLine, TILE, TILE);
      dot(c, px + 1, py, th.rugA, 14, TILE);
      void x; void y;
    },
  },

  velvet: {
    floor(c, th, px, py, x, y, r) {
      dot(c, px, py, (x + y) % 2 ? th.a : th.b, TILE, TILE);
      if (r() < 0.3) dot(c, px + 3 + ((r() * 9) | 0), py + 3 + ((r() * 9) | 0), th.d, 2, 1);
    },
    rug(c, th, px, py) {
      dot(c, px, py, th.rugA, TILE, TILE);
      c.fillStyle = th.rugB;
      for (let i = 0; i < 8; i++) {
        c.fillRect(px + 7 - i, py + i, 2 + i * 2, 1);
        c.fillRect(px + 7 - i, py + 15 - i, 2 + i * 2, 1);
      }
    },
    path(c, th, px, py, x, y) { dot(c, px, py, (x + y) % 2 ? th.pathA : th.pathB, TILE, TILE); },
  },
};
