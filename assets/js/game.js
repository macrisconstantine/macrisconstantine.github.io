/* =========================================================================
   game.js — the world: movement, lighting, rendering, interaction.

   It runs in two modes. In "attract" it plays itself inside the page's hero,
   strolling from room to room. In "play" it fills the window and the visitor
   has the controls.
   ========================================================================= */

import { Screen, Input, Camera, Particles, Sound, VIEW } from './engine.js';
import { TILE, ROOMS, THEMES, buildRoom, isSolid } from './world.js';
import { sprite, spriteFlipped, ICONS, drawText, textWidth } from './sprites.js';
import { entry } from './content.js';
import { ui } from './ui.js';
import { save } from './save.js';

/* Movement feel. The character accelerates and slides to a stop rather than
   snapping between stopped and full speed. */
const WALK     = 98;       // px/s top speed
const RUN      = 172;      // px/s while sprinting
const ACCEL    = 900;      // px/s² toward the stick direction
const FRICTION = 1150;     // px/s² when nothing is held
/* The roll has to be worth doing. Tuned so that chaining rolls averages
   about 1.4x sprinting: a long burst, a short cooldown, and you keep your
   momentum coming out of it. */
const DASH_V    = 400;     // px/s at the start of the burst
const DASH_T    = 0.22;    // seconds of burst
const DASH_TAIL = 0.65;    // speed still carried at the end of the burst
const DASH_CD   = 0.16;    // seconds before you can roll again
const REACH     = 30;      // interaction radius, px

const TOUR = ['hub', 'arcade', 'foundry', 'observatory', 'vault', 'archive'];
const TOUR_SECONDS = 10;

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.screen = new Screen(canvas);
    this.ctx = this.screen.ctx;
    this.input = new Input();
    this.cam = new Camera();
    this.fx = new Particles();
    this.sound = new Sound();
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');

    this.rooms = {};
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0, dir: 'down', moving: false, anim: 0, flip: false,
      dash: 0, dashCd: 0, dashX: 0, dashY: 0, sprint: false, dust: 0,
    };
    this.ghosts = [];          // afterimages left by a roll
    this.companion = { x: 0, y: 0, vx: 0, vy: 0, active: false, flip: false, hop: 0, pet: true, entry: 'guide', accent: '#ff9a3c' };
    this.near = null;          // interactable in reach
    this.hover = null;         // interactable under the mouse
    this.mode = 'attract';
    this.visible = true;       // attract mode pauses when scrolled out of view
    this.still = false;        // reduced motion: the hero shows one frame, not a tour
    this.calm = false;         // reduced motion: no camera shake, fades instead of the iris
    this.wipe = null;          // iris transition between rooms
    this.tour = { i: 0, t: 0 };
    this.resume = null;        // where the visitor was when they left play mode
    this.t = 0;

    this.input.onKey = (a, e) => this.onKey(a, e);
    this.screen.onReshape = () => {
      if (!this.room) return;
      this.cam.snap(this.player.x, this.player.y, this.room.w * TILE, this.room.h * TILE);
      this.render();
    };
    ui.game = this;
  }

  /* ------------------------------- lifecycle ---------------------------- */

  start() {
    this.bindPointer();
    const [sx, sy] = ROOMS.hub.spawn;
    this.enterRoom('hub', sx, sy);
    this.render();
    this.last = performance.now();
    // The first rAF timestamp can predate the performance.now() above, so
    // clamp: a negative dt would run the clock backwards.
    const loop = (t) => {
      const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
      this.last = t;
      const idle = this.mode === 'attract' && (!this.visible || this.still || document.hidden);
      // `manual` is set by the test suite, which steps the simulation itself.
      if (!idle && !this.manual) { this.update(dt); this.render(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const p = this.player;
    if (mode === 'play') {
      const at = this.resume || { room: 'hub', x: ROOMS.hub.spawn[0], y: ROOMS.hub.spawn[1] };
      this.mode = 'play';
      this.wipe = null;
      this.enterRoom(at.room, at.x, at.y);
      ui.refresh();
    } else {
      this.resume = { room: this.room.id, x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      this.mode = 'attract';
      this.tour = { i: 0, t: 0 };
      ui.prompt();
    }
    this.input.active = mode === 'play';
    this.input.enabled = true;
    this.input.release();
    p.vx = p.vy = 0; p.dash = 0;
    this.near = this.hover = null;
    this.canvas.style.cursor = '';
    this.screen.watch();
  }

  enterRoom(id, tx, ty) {
    if (!this.rooms[id]) this.rooms[id] = buildRoom(id);
    this.room = this.rooms[id];
    this.near = null; this.hover = null;   // stale references to the old room
    const p = this.player;
    p.x = tx * TILE + TILE / 2;
    p.y = ty * TILE + TILE / 2;
    p.vx = p.vy = 0;
    this.companion.room = null;            // it reappears beside you
    this.ghosts.length = 0;
    // Snap, otherwise the first frame of a new room starts off the map.
    this.cam.snap(p.x, p.y, this.room.w * TILE, this.room.h * TILE);
    this.sound.setTheme(this.room.spec.music || 'hub');
    if (this.mode === 'play') ui.setZone(this.room.spec.district);
  }

  /** Change room behind an iris wipe. */
  go(id, tx, ty) {
    if (this.wipe) return;
    this.wipe = { phase: 'out', t: 0, then: () => this.enterRoom(id, tx, ty) };
    if (this.mode === 'play') this.sound.door();
  }

  /** Fast travel from the journal. */
  travel(districtId) {
    const id = Object.keys(ROOMS).find((k) => ROOMS[k].district === districtId);
    if (!id || (id === 'workshop' && !save.complete)) return;
    const [x, y] = ROOMS[id].spawn;
    this.go(id, x, y);
  }

  /* ------------------------------ sheet hooks --------------------------- */

  onSheetOpened() {
    this.input.enabled = false;
    this.input.release();
    this.player.vx = this.player.vy = 0;
    this.near = this.hover = null;
    ui.prompt();
    if (this.mode === 'play') this.sound.open();
  }

  onSheetClosed() {
    this.input.enabled = true;
    this.input.release();
    if (this.mode === 'play') { this.sound.close(); this.canvas.focus({ preventScroll: true }); }
  }

  /** Something was read for the first time. */
  onRead(id) {
    if (this.mode !== 'play') return;
    const obj = this.room.objects.find((o) => o.entry === id);
    if (obj) this.fx.burst(obj.x * TILE + 8, obj.y * TILE + 2, obj.accent || '#ffd45e', 16, 55, 0.8);
    this.sound.collect();
  }

  /* --------------------------------- input ------------------------------ */

  onKey(a, e) {
    if (a === 'mute') { this.toggleMusic(); return; }

    if (a === 'back') {
      if (e) e.preventDefault();
      if (ui.open) ui.close(); else ui.openJournal();
      return;
    }
    if (a === 'journal') {
      if (ui.kind === 'journal') ui.close();
      else if (!ui.open) ui.openJournal();
      return;
    }
    // Closing a panel happens here rather than in the update loop: while one
    // is open the loop is not consuming input, so the key that opened it
    // could not close it.
    if ((a === 'act' || a === 'space') && ui.open) {
      // Space types in the terminal and restarts the cabinet, so those two
      // close on Escape or the × only.
      if (ui.kind !== 'terminal' && ui.kind !== 'arcade') ui.close();
      this.input.swallow(a);
    }
  }

  toggleMusic() {
    const on = this.sound.toggleMusic();
    const b = document.getElementById('btn-sound');
    if (b) b.setAttribute('aria-pressed', String(on));
    return on;
  }

  /* --------------------------------- mouse ------------------------------
     Walking up to things is the intended way round, but nobody should have
     to learn a control scheme first. Clicking an object does the same as
     pressing E on it.
     ---------------------------------------------------------------------- */

  bindPointer() {
    const toWorld = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - r.left) / r.width) * VIEW.w + this.cam.ox,
        y: ((ev.clientY - r.top) / r.height) * VIEW.h + this.cam.oy,
      };
    };
    const live = () => this.mode === 'play' && !ui.open && !this.wipe;

    this.canvas.addEventListener('mousemove', (ev) => {
      if (!live()) { this.hover = null; return; }
      const w = toWorld(ev);
      this.hover = this.pick(w.x, w.y);
      this.canvas.style.cursor = this.hover ? 'pointer' : '';
      this.syncPrompt();
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.canvas.style.cursor = '';
      if (this.mode === 'play') this.syncPrompt();
    });
    this.canvas.addEventListener('click', (ev) => {
      if (!live()) return;
      const w = toWorld(ev);
      const hit = this.pick(w.x, w.y);
      if (hit) this.interact(hit);
    });
  }

  /** Which interactable, if any, is under this world-space point. */
  pick(wx, wy) {
    let best = null, bestD = Infinity;
    for (const o of this.room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;
      // A generous box: sprites stand well above the tile they occupy.
      const left = o.x * TILE - 4, right = o.x * TILE + TILE + 4;
      const bottom = (o.y + 1) * TILE + 6, top = bottom - 36;
      if (wx < left || wx > right || wy < top || wy > bottom) continue;
      const d = Math.hypot(o.x * TILE + TILE / 2 - wx, bottom - 10 - wy);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best && this.companion.active) {
      const c = this.companion;
      if (Math.abs(wx - c.x) < 11 && wy > c.y - 22 && wy < c.y + 8) best = c;
    }
    return best;
  }

  /* -------------------------------- update ------------------------------ */

  update(dt) {
    this.t += dt;
    this.fx.tick(dt);
    if (this.calm) this.cam.shake = 0;
    this.cam.tick();
    this.ambient(dt);

    if (this.wipe) {
      const w = this.wipe;
      w.t += dt;
      if (w.phase === 'out' && w.t >= 0.24) { w.then(); w.phase = 'in'; w.t = 0; }
      else if (w.phase === 'in' && w.t >= 0.4) this.wipe = null;
    }
    const frozen = this.wipe && this.wipe.phase === 'out';
    const p = this.player;

    if (this.mode === 'attract') {
      if (!frozen) this.movePlayer(dt, this.autopilot(dt));
    } else if (!ui.open && !frozen) {
      this.movePlayer(dt, this.input.dir());
      // A hover goes stale as soon as you walk: the world has slid under a
      // cursor that has not moved. Moving the mouse re-establishes it.
      if (p.moving && this.hover) { this.hover = null; this.canvas.style.cursor = ''; }
      this.checkExit();
      this.findNear();
      if (this.input.consume('act')) this.act(false);
      if (this.input.consume('space')) this.act(true);
    } else {
      p.moving = false;
      p.vx = p.vy = 0;
    }

    this.moveCompanion(dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
    this.input.endFrame();
    this.cam.follow(p.x, p.y, this.room.w * TILE, this.room.h * TILE, dt);
  }

  /** Attract mode: walk the room's waypoints, then move on to the next room. */
  autopilot(dt) {
    const A = this.tour, p = this.player;
    const path = this.room.spec.tour || [this.room.spec.spawn];
    A.t += dt;
    if (A.t > TOUR_SECONDS && !this.wipe) {
      A.t = 0; A.i = 0;
      const next = TOUR[(TOUR.indexOf(this.room.id) + 1) % TOUR.length];
      const [x, y] = ROOMS[next].tour[0];
      this.go(next, x, y);
      return { x: 0, y: 0 };
    }
    const [tx, ty] = path[A.i % path.length];
    const dx = tx * TILE + 8 - p.x, dy = ty * TILE + 8 - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) { A.i++; return { x: 0, y: 0 }; }
    return { x: dx / d, y: dy / d };
  }

  movePlayer(dt, d) {
    const p = this.player;
    const mag = Math.hypot(d.x, d.y);
    const dx = mag ? d.x / mag : 0, dy = mag ? d.y / mag : 0;
    const play = this.mode === 'play';

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.sprint = play && this.input.held.has('sprint');

    // --- roll ------------------------------------------------------------
    if (play && this.input.consume('dash') && p.dash <= 0 && p.dashCd <= 0) this.startDash(dx, dy);

    if (p.dash > 0) {
      p.dash -= dt;
      const ease = Math.max(DASH_TAIL, p.dash / DASH_T);   // fast, then settle
      p.vx = p.dashX * DASH_V * ease;
      p.vy = p.dashY * DASH_V * ease;
      if (p.dash <= 0) {
        p.dashCd = DASH_CD;
        // Hand the momentum over to the run rather than stopping dead; the
        // excess above running speed bleeds off over the next few frames.
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const keep = Math.min(sp, RUN * 1.25);
        p.vx = (p.vx / sp) * keep;
        p.vy = (p.vy / sp) * keep;
      }
      this._ghostT = (this._ghostT || 0) + dt;
      if (this._ghostT > 0.028) {
        this._ghostT = 0;
        this.ghosts.push({ x: p.x, y: p.y, dir: p.dir, flip: p.flip, frame: Math.floor(Math.abs(p.anim)) % 2, life: 0.22, max: 0.22 });
      }
    } else {
      // --- walk / sprint --------------------------------------------------
      const top = p.sprint && mag ? RUN : (play ? WALK : WALK * 0.62);
      if (mag) {
        p.vx += dx * ACCEL * dt;
        p.vy += dy * ACCEL * dt;
        // Bleed anything above the current top speed instead of clipping it,
        // so a roll glides out into a run rather than hitting a wall.
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > top) {
          const f = (sp - Math.min(sp - top, FRICTION * 0.9 * dt)) / sp;
          p.vx *= f; p.vy *= f;
        }
      } else {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0) {
          const drop = Math.min(sp, FRICTION * dt);
          p.vx -= (p.vx / sp) * drop;
          p.vy -= (p.vy / sp) * drop;
        }
      }
    }

    const speed = Math.hypot(p.vx, p.vy);
    p.moving = speed > 6;
    if (p.moving) {
      if (play) ui.hideHints();
      if (Math.abs(p.vx) > Math.abs(p.vy)) { p.dir = 'side'; p.flip = p.vx < 0; }
      else p.dir = p.vy < 0 ? 'up' : 'down';
    }

    this.moveBy(p.vx * dt, 0);
    this.moveBy(0, p.vy * dt);

    // Footsteps and sprint dust, both paced by how fast you are going.
    p.anim += dt * (speed / 9);
    const step = Math.floor(Math.abs(p.anim));
    if (p.moving && step !== this._lastStep) {
      this._lastStep = step;
      if (play && step % 2 === 0) this.sound.step1();
    }
    if (p.sprint && p.moving && p.dash <= 0) {
      p.dust -= dt;
      if (p.dust <= 0) {
        p.dust = 0.075;
        this.fx.add({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + 5, vx: -p.vx * 0.12, vy: -6 - Math.random() * 6, life: 0.34, color: '#cfc3e6' });
      }
    }
  }

  moveBy(dx, dy) {
    const p = this.player;
    // A small feet-box so the character can tuck behind tall objects.
    const hw = 4, top = 2, bot = 7;
    const rolling = p.dash > 0;
    const clear = (pts) => {
      // Rolling takes the crate with you instead of stopping dead at it.
      if (rolling) for (const [x, y] of pts) this.smashAt(Math.floor(x / TILE), Math.floor(y / TILE));
      return pts.every(([x, y]) => !isSolid(this.room, Math.floor(x / TILE), Math.floor(y / TILE)));
    };
    if (dx) {
      const nx = p.x + dx;
      if (clear([[nx - hw, p.y + top], [nx + hw, p.y + top], [nx - hw, p.y + bot], [nx + hw, p.y + bot]])) p.x = nx;
      else { p.vx = 0; if (rolling) p.dashX = 0; }   // don't grind along a wall
    }
    if (dy) {
      const ny = p.y + dy;
      if (clear([[p.x - hw, ny + top], [p.x + hw, ny + top], [p.x - hw, ny + bot], [p.x + hw, ny + bot]])) p.y = ny;
      else { p.vy = 0; if (rolling) p.dashY = 0; }
    }
  }

  /** Roll into a crate and it does not survive the experience. */
  smashAt(tx, ty) {
    const d = this.room.decor.find((o) => o.smash && !o.broken && o.x === tx && o.y === ty);
    if (!d) return false;
    d.broken = true;
    this.room.solid[ty * this.room.w + tx] = 0;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    this.fx.burst(cx, cy - 2, '#a8703f', 18, 70, 0.7);
    this.fx.burst(cx, cy, '#6b4426', 10, 45, 0.9);
    this.cam.shake = 4;
    this.sound.smash();
    ui.award('crate');
    return true;
  }

  startDash(dx, dy) {
    const p = this.player;
    if (!dx && !dy) {
      // Standing still: roll the way you are facing.
      if (p.dir === 'up') dy = -1;
      else if (p.dir === 'down') dy = 1;
      else dx = p.flip ? -1 : 1;
    }
    p.dashX = dx; p.dashY = dy;
    p.dash = DASH_T;
    this.ghosts.length = 0;
    this.cam.shake = 2.6;
    this.sound.roll();
    this.fx.burst(p.x, p.y + 4, '#cfc3e6', 9, 44, 0.32);
    ui.hideHints();
  }

  /** Roll now if the cooldown allows, in whatever direction is held. */
  requestDash() {
    const p = this.player;
    if (p.dash > 0 || p.dashCd > 0) return;
    const d = this.input.dir();
    const mag = Math.hypot(d.x, d.y);
    this.startDash(mag ? d.x / mag : 0, mag ? d.y / mag : 0);
  }

  /** The cat trails a little behind you once you have met it. */
  moveCompanion(dt) {
    const c = this.companion;
    c.active = this.mode === 'attract' || !!save.get('metCat');
    if (!c.active) return;
    const p = this.player;
    // Changed room, or got left behind entirely: reappear rather than
    // trudging across the map.
    const far = Math.hypot(p.x - c.x, p.y - c.y);
    if (c.room !== this.room.id || far > 150) {
      c.room = this.room.id;
      c.x = p.x - 14; c.y = p.y + 4; c.vx = 0; c.vy = 0;
      return;
    }
    // Seek the player, with a standoff so it settles instead of jittering
    // on top of you, and a speed that scales with how far behind it is.
    const STOP = 17;
    const dx = p.x - c.x, dy = p.y - c.y;
    const d = far || 1;
    const speed = d > STOP ? Math.min(230, (d - STOP) * 7 + 26) : 0;
    const k = Math.min(1, dt * 9);
    c.vx += ((dx / d) * speed - c.vx) * k;
    c.vy += ((dy / d) * speed - c.vy) * k;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    // The cat is drawn head-left, so the flip is the opposite way round to
    // the player's side-view sprite: mirror it when running right.
    if (Math.abs(c.vx) > 14) c.flip = c.vx > 0;
    c.hop += dt * (Math.hypot(c.vx, c.vy) > 8 ? 9 : 0);
  }

  checkExit() {
    const p = this.player;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (const e of this.room.exits) {
      if (e.x !== tx || e.y !== ty) continue;
      if (e.locked && !save.complete) {
        p.y += 10; p.vx = p.vy = 0; p.dash = 0;
        if (this.t - (this._lockedAt || -9) > 3) {
          this._lockedAt = this.t;
          this.sound.bad();
          const left = save.total - save.count;
          ui.toast('The Workshop is locked', `It opens when you have read everything — ${left} to go. The journal (J) shows what is left.`);
        }
        return;
      }
      this.go(e.to, e.tx, e.ty);
      return;
    }
  }

  findNear() {
    let best = null, bestD = REACH;
    const p = this.player;
    for (const o of this.room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;
      const d = Math.hypot(o.x * TILE + TILE / 2 - p.x, o.y * TILE + TILE / 2 - p.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    // The cat is always the closest thing to you, so it only counts when
    // nothing else is in reach — otherwise it would hijack every E press.
    if (!best && this.companion.active) {
      const c = this.companion;
      if (Math.hypot(c.x - p.x, c.y - p.y) < REACH) best = c;
    }
    this.near = best;
    this.syncPrompt();
  }

  /** One hint line, whether you walked up to a thing or pointed at it.
      Pointing wins: it is a deliberate choice, standing near something is not. */
  syncPrompt() {
    const target = this.hover || this.near;
    const label = target ? (target.entry === 'guide' ? 'How this works' : (entry(target.entry) || {}).title) : '';
    const text = label ? (this.hover ? 'Click|' : 'E|') + label : '';
    if (text === this._prompt) return;
    this._prompt = text;
    if (text) ui.prompt(...text.split('|')); else ui.prompt();
  }

  /* ------------------------------ interaction --------------------------- */

  /** @param {boolean} canRoll — space is the roll; it never opens anything. */
  act(canRoll = false) {
    if (ui.open) return;                    // handled on the keydown path
    if (canRoll) return this.requestDash();
    if (this.near) this.interact(this.near);
  }

  interact(obj) {
    ui.hideHints();
    if (obj.entry === 'guide') {
      if (!save.get('metCat')) { save.set('metCat', true); this.sound.collect(); }
      ui.openHelp();
      return;
    }
    ui.openEntry(obj.entry, { play: (entry(obj.entry) || {}).kind === 'minigame' });
  }

  /* ----------------------------- ambient life --------------------------- */

  ambient(dt) {
    const th = THEMES[this.room.theme];
    this._air = (this._air || 0) + dt;
    const every = { fireflies: 0.22, sparks: 0.3, embers: 0.09, stars: 0.16, code: 0.11, dust: 0.3 }[th.air] || 1;
    while (this._air > every) {
      this._air -= every;
      const x = this.cam.x + Math.random() * VIEW.w, y = this.cam.y + Math.random() * VIEW.h;
      const R = Math.random;
      switch (th.air) {
        case 'fireflies':
          this.fx.add({ x, y, vx: (R() - 0.5) * 10, vy: (R() - 0.5) * 8, g: 0, life: 3 + R() * 3, color: '#e2ff9a', blink: 6 + R() * 4, soft: 1, glow: 1, sway: 2 });
          break;
        case 'sparks':
          this.fx.add({ x, y, vx: (R() - 0.5) * 4, vy: -5 - R() * 8, g: 0, life: 2.5 + R() * 2, color: R() < 0.5 ? '#ff7ac8' : '#6fdcec', soft: 1, glow: 1, alpha: 0.7 });
          break;
        case 'embers': {
          const l = this.room.lights[(R() * this.room.lights.length) | 0];
          if (l) this.fx.add({ x: l.x + (R() - 0.5) * 8, y: l.y - 2, vx: (R() - 0.5) * 12, vy: -14 - R() * 16, g: -8, life: 0.8 + R() * 0.9, color: R() < 0.6 ? '#ffb060' : '#ffe08a', glow: 1 });
          break;
        }
        case 'stars':
          if (R() < 0.04) this.fx.add({ x, y: this.cam.y + R() * VIEW.h * 0.5, vx: 150, vy: 60, g: 0, life: 0.5, color: '#ffffff', size: 2, glow: 1 });
          else this.fx.add({ x, y, g: 0, life: 1.2 + R() * 1.6, color: R() < 0.5 ? '#ffffff' : '#c9c0ff', soft: 1, glow: 1, alpha: 0.9 });
          break;
        case 'code':
          this.fx.add({ x: Math.round(x), y, vy: 22 + R() * 26, g: 0, life: 1.6 + R() * 1.6, color: '#3ee08a', soft: 1, glow: 1, alpha: 0.55, size: R() < 0.2 ? 2 : 1 });
          break;
        default:
          this.fx.add({ x, y, vx: (R() - 0.5) * 5, vy: -1 - R() * 3, g: 0, life: 4 + R() * 3, color: '#f1e3c8', soft: 1, alpha: 0.32, sway: 1.5 });
      }
    }
  }

  /* -------------------------------- render ------------------------------ */

  render() {
    const c = this.ctx, room = this.room;
    if (!room) return;
    const th = THEMES[room.theme];
    const ox = this.cam.ox, oy = this.cam.oy;

    c.fillStyle = th.out;
    c.fillRect(0, 0, VIEW.w, VIEW.h);
    c.drawImage(room.floor, -ox, -oy);
    this.drawDoors(c, room, ox, oy);
    this.drawGhosts(c, ox, oy);

    // Entities, painted back to front so the player can stand behind things.
    const ents = [];
    for (const d of room.decor) if (!d.broken) ents.push(d);
    for (const o of room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;   // the cat is with you
      ents.push(o);
    }
    ents.push({ player: true, y: this.player.y / TILE - 0.01 });
    if (this.companion.active) ents.push({ pet: true, y: this.companion.y / TILE - 0.02 });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.player) this.drawPlayer(c, ox, oy);
      else if (e.pet) this.drawCompanion(c, ox, oy);
      else this.drawEntity(c, e, ox, oy);
    }

    this.fx.draw(c, ox, oy, false);
    this.drawLight(c, room, th, ox, oy);
    this.fx.draw(c, ox, oy, true);          // glowing motes sit above the dark
    this.drawDoorLabels(c, room, ox, oy);
    this.drawWipe(c, ox, oy);
  }

  /** Frame index that stays in range whatever the clock does. */
  frameOf(list, speed) { return list[Math.floor(Math.abs(this.t) * speed) % list.length]; }

  drawEntity(c, e, ox, oy) {
    const isObject = !!e.entry;
    const icon = isObject ? ICONS[e.icon] : null;
    const name = isObject
      ? (icon && icon.anim ? this.frameOf(icon.anim, 2.5) : ((icon && icon.art) || 'crate'))
      : (e.anim ? this.frameOf(e.anim, 6) : e.art);
    const art = sprite(name, e.accent);
    const px = Math.round(e.x * TILE - ox + TILE / 2 - art.w / 2);
    const py = Math.round((e.y + 1) * TILE - oy - art.h + art.pad);
    if (px > VIEW.w || py > VIEW.h || px + art.w < 0 || py + art.h < 0) return;

    const gx = e.x * TILE - ox + TILE / 2, gy = (e.y + 1) * TILE - oy - 2;
    if (!e.wall && !e.pass) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(gx, gy, 7, 3, 0, 0, Math.PI * 2); c.fill();
    }
    c.drawImage(art.canvas, px, py);
    if (!isObject) return;

    if (e.icon === 'cabinet') this.drawScreen(c, e.entry, px + art.pad + 4, py + art.pad + 7);

    if (this.mode !== 'play') return;
    if (save.has(e.entry)) {
      // A ring on the floor marks what has been read.
      c.strokeStyle = e.accent || '#7fd4a8';
      c.globalAlpha = 0.6; c.lineWidth = 1;
      c.beginPath(); c.ellipse(gx, gy + 1, 7.5, 3.5, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    if (this.near === e || this.hover === e) {
      const frag = sprite('fragment', e.accent);
      c.drawImage(frag.canvas, Math.round(gx - 5), Math.round(py - 12 + Math.sin(this.t * 5) * 1.5));
    }
  }

  /** Each cabinet runs a tiny loop of the game inside it: an 8 x 7 screen. */
  drawScreen(c, id, x, y) {
    const t = this.t, f = (v) => Math.floor(v);
    const px = (dx, dy, col) => { c.fillStyle = col; c.fillRect(x + dx, y + dy, 1, 1); };
    c.fillStyle = '#0b0914'; c.fillRect(x, y, 8, 7);
    switch (id) {
      case 'pottimea': {            // a hero pacing a lit room
        c.fillStyle = '#3a1f3f'; c.fillRect(x, y + 5, 8, 2);
        const hx = 1 + f((Math.sin(t * 1.3) * 0.5 + 0.5) * 5);
        px(hx, 3, '#ffd45e'); px(hx, 4, '#4fd98a'); px(6, 1, '#ff9a3c'); px(1, 1, '#ef5367');
        break;
      }
      case 'taxicat': {             // taxis coming down, a cat at the bottom
        const s = f(t * 9);
        for (let i = 0; i < 2; i++) { const ty = (s + i * 4) % 8; if (ty < 6) { px(1 + i * 4, ty, '#ffd45e'); px(1 + i * 4, ty + 1, '#ffd45e'); } }
        px(3 + (f(t * 2) % 2), 6, '#ff9a3c');
        break;
      }
      case 'debunking': case 'multiplayer': {   // a ship in orbit
        px(4, 3, '#ffd45e');
        px(4 + Math.round(Math.cos(t * 2) * 3), 3 + Math.round(Math.sin(t * 2) * 2.4), id === 'debunking' ? '#c58cff' : '#6ee7a0');
        if (id === 'multiplayer') px(4 + Math.round(Math.cos(t * 2 + 3.14) * 3), 3 + Math.round(Math.sin(t * 2 + 3.14) * 2.4), '#6fdcec');
        break;
      }
      case 'chess':                 // a board
        for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if ((i + j) % 2) px(1 + i, j, '#7d6bb0');
        px(1 + (f(t) % 6), f(t / 6) % 6, '#ffffff');
        break;
      case 'falling-sand': {        // a pile, and grains landing on it
        const n = f(t * 6) % 24;
        for (let i = 0; i < 8; i++) { const hgt = Math.min(4, 1 + f(n / 6) - Math.abs(i - 4) + 2); for (let k = 0; k < hgt; k++) px(i, 6 - k, '#ffb454'); }
        px(3 + (f(t * 3) % 3), f(t * 9) % 4, '#ffd45e');
        break;
      }
      case 'donut': {               // a ring turning over
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * 6.283, w = 2.8 * Math.abs(Math.cos(t * 0.9)) + 0.6;
          px(Math.round(3.5 + Math.cos(ang) * w), Math.round(3 + Math.sin(ang) * 2.6), a % 2 ? '#ff7ac8' : '#ffc2e6');
        }
        break;
      }
      default: {                    // panopticon: a spotlight sweeping cells
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) px(i * 2, 1 + j * 2, '#2c2648');
        const sx = f((Math.sin(t * 1.6) * 0.5 + 0.5) * 3.99), sy = f((Math.sin(t * 1.1) * 0.5 + 0.5) * 2.99);
        px(sx * 2, 1 + sy * 2, '#6fdcec');
      }
    }
  }

  drawGhosts(c, ox, oy) {
    for (const g of this.ghosts) {
      const base = `player_${g.dir}_${g.frame}`;
      const art = (g.dir === 'side' && g.flip) ? spriteFlipped(base) : sprite(base);
      c.globalAlpha = 0.34 * (g.life / g.max);
      c.drawImage(art.canvas, Math.round(g.x - ox - art.w / 2), Math.round(g.y - oy - art.h + 6));
    }
    c.globalAlpha = 1;
  }

  drawCompanion(c, ox, oy) {
    const k = this.companion;
    const base = Math.floor(Math.abs(k.hop)) % 2 ? 'cat_1' : 'cat_0';
    const art = k.flip ? spriteFlipped(base, k.accent) : sprite(base, k.accent);
    const bob = Math.abs(Math.sin(k.hop * 0.9)) * 1.6;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(Math.round(k.x - ox), Math.round(k.y - oy + 5), 6, 2.5, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(art.canvas, Math.round(k.x - ox - art.w / 2), Math.round(k.y - oy - art.h + 6 - bob));
    if (this.mode === 'play' && (this.near === k || this.hover === k)) {
      const frag = sprite('fragment', k.accent);
      c.drawImage(frag.canvas, Math.round(k.x - ox - 5), Math.round(k.y - oy - art.h - 2 + Math.sin(this.t * 5) * 1.5));
    }
  }

  drawPlayer(c, ox, oy) {
    const p = this.player;
    const frame = p.moving ? (Math.floor(Math.abs(p.anim)) % 2) : 0;
    const base = `player_${p.dir}_${frame}`;
    const art = (p.dir === 'side' && p.flip) ? spriteFlipped(base) : sprite(base);
    // Screen space, not world space: everything else subtracts the camera
    // offset, and the player must too or the sprite drifts off its own
    // collision box as the camera scrolls.
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.beginPath(); c.ellipse(Math.round(p.x - ox), Math.round(p.y - oy + 6), 6, 2.5, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(art.canvas, Math.round(p.x - ox - art.w / 2), Math.round(p.y - oy - art.h + 6));
  }

  /* --------------------------- doors and light -------------------------- */

  doorLocked(e) { return e.locked && !save.complete; }

  drawDoors(c, room, ox, oy) {
    for (const e of room.exits) {
      const px = e.x * TILE - ox, py = e.y * TILE - oy;
      if (px < -TILE || px >= VIEW.w || py < -TILE || py >= VIEW.h) continue;
      const locked = this.doorLocked(e);
      const col = locked ? '#6b6b7a' : e.color;
      c.fillStyle = '#07060c'; c.fillRect(px, py, TILE, TILE);
      c.globalAlpha = locked ? 0.5 : 0.7 + 0.3 * Math.sin(this.t * 2.6);
      c.fillStyle = col;
      c.fillRect(px + 1, py + 1, TILE - 2, 2); c.fillRect(px + 1, py + TILE - 3, TILE - 2, 2);
      c.fillRect(px + 1, py + 3, 2, TILE - 6); c.fillRect(px + TILE - 3, py + 3, 2, TILE - 6);
      c.globalAlpha = 1;
      const mx = px + TILE / 2 - 2, my = py + TILE / 2 - 2;
      if (locked) {
        for (const [dx, dy] of [[0, 0], [4, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [0, 4], [4, 4]]) c.fillRect(mx + dx, my + dy, 1, 1);
      } else {
        c.fillRect(mx + 2, my, 1, 1); c.fillRect(mx + 1, my + 1, 3, 1); c.fillRect(mx, my + 2, 5, 1);
        c.fillRect(mx + 1, my + 3, 3, 1); c.fillRect(mx + 2, my + 4, 1, 1);
      }
    }
  }

  /** Door signs are drawn after the lighting so they stay readable. */
  drawDoorLabels(c, room, ox, oy) {
    for (const e of room.exits) {
      const px = e.x * TILE - ox, py = e.y * TILE - oy;
      // Off screen: skip entirely, so a clamped label never floats with no door.
      if (px < -TILE || px >= VIEW.w || py < -TILE || py >= VIEW.h || this.doorLocked(e)) continue;
      const w = textWidth(e.label) + 8;
      const lx = Math.max(w / 2 + 3, Math.min(VIEW.w - w / 2 - 3, px + TILE / 2));
      const ly = py < 26 ? py + TILE + 5 : py - 14;
      c.fillStyle = 'rgba(8,6,14,0.86)';
      c.fillRect(Math.round(lx - w / 2), ly - 2, w, 12);
      drawText(c, e.label, lx, ly + 1, e.color, 'center', false);
    }
  }

  /** Darken the room, then cut a pool of light around everything that glows. */
  drawLight(c, room, th, ox, oy) {
    const L = this.lctx;
    if (this.light.width !== VIEW.w || this.light.height !== VIEW.h) { this.light.width = VIEW.w; this.light.height = VIEW.h; }
    const p = this.player, t = this.t;
    const lights = [];
    for (const l of room.lights) {
      const fl = (l.flicker || 0) * (0.05 * Math.sin(t * 9 + l.phase) + 0.035 * Math.sin(t * 23 + l.phase * 2));
      lights.push({ x: l.x, y: l.y, r: l.r * (1 + fl), color: l.color, a: 0.95, glow: 0.2 });
    }
    for (const o of room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;
      const unread = this.mode === 'play' && !save.has(o.entry);
      lights.push({ x: o.x * TILE + 8, y: o.y * TILE, r: unread ? 34 + 3 * Math.sin(t * 2.6 + o.x) : 26, color: o.accent, a: 0.8, glow: unread ? 0.26 : 0.12 });
    }
    for (const e of room.exits) {
      lights.push({ x: e.x * TILE + 8, y: e.y * TILE + 8, r: 28, color: this.doorLocked(e) ? null : e.color, a: 0.7, glow: 0.2 });
    }
    lights.push({ x: p.x, y: p.y - 4, r: 46, a: 0.72 });

    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, VIEW.w, VIEW.h);
    L.fillStyle = th.shade;
    L.fillRect(0, 0, VIEW.w, VIEW.h);
    L.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const x = l.x - ox, y = l.y - oy;
      if (x < -l.r || y < -l.r || x > VIEW.w + l.r || y > VIEW.h + l.r) continue;
      const g = L.createRadialGradient(x, y, 0, x, y, l.r);
      g.addColorStop(0, `rgba(0,0,0,${l.a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${l.a * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2);
    }
    c.drawImage(this.light, 0, 0);

    // A wash of each light's own colour on top.
    c.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.color) continue;
      const x = l.x - ox, y = l.y - oy, r = l.r * 0.9;
      if (x < -r || y < -r || x > VIEW.w + r || y > VIEW.h + r) continue;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, l.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = l.glow;
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** The iris that closes on the way out of a room and opens on the way in. */
  drawWipe(c, ox, oy) {
    const w = this.wipe;
    if (!w) return;
    const full = Math.hypot(VIEW.w, VIEW.h) * 0.62;
    const k = w.phase === 'out' ? 1 - Math.min(1, w.t / 0.24) : Math.min(1, w.t / 0.4);
    if (this.calm) {             // a plain fade, for anyone who has asked for less motion
      c.fillStyle = `rgba(7,6,12,${1 - k})`;
      c.fillRect(0, 0, VIEW.w, VIEW.h);
      return;
    }
    const r = full * k * k;
    c.fillStyle = '#07060c';
    c.beginPath();
    c.rect(0, 0, VIEW.w, VIEW.h);
    c.arc(Math.round(this.player.x - ox), Math.round(this.player.y - oy - 4), Math.max(0, r), 0, Math.PI * 2, true);
    c.fill('evenodd');
  }
}
