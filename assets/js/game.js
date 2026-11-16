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
const DASH_BUFFER = 0.26;  // a roll asked for this early still happens
const REACH     = 30;      // interaction radius, px
const NUDGE     = 5;       // how far round a corner you get steered, px

const TOUR = ['hub', 'arcade', 'foundry', 'observatory', 'vault', 'archive'];
const TOUR_LIMIT = 18;     // seconds before the tour gives up on a room

/* Canvas pixels per world pixel, refreshed at the top of every frame.
   Positions are snapped to this grid rather than to whole world pixels, so
   things move one screen pixel at a time instead of five or six. */
let S = 1;
const snap = (v) => Math.round(v * S) / S;

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
    this.light = document.createElement('canvas');   // the darkness, with pools cut out of it
    this.lctx = this.light.getContext('2d');
    this.glow = document.createElement('canvas');    // each light's colour, added on top
    this.gctx = this.glow.getContext('2d');

    this.rooms = {};
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0, dir: 'down', moving: false, anim: 0, flip: false,
      dash: 0, dashCd: 0, dashX: 0, dashY: 0, wantDash: 0, sprint: false, dust: 0,
    };
    this.ghosts = [];          // afterimages left by a roll
    this.companion = { x: 0, y: 0, vx: 0, vy: 0, active: false, flip: false, hop: 0, idle: 0, joy: 0, stuck: 0, accent: '#ff9a3c' };
    const [bx, by] = ROOMS.hub.ball;
    this.ball = { room: 'hub', x: bx * TILE + 8, y: by * TILE + 8, vx: 0, vy: 0, roll: 0 };
    this.pending = [];         // fragments earned while a panel was open, waiting to fly
    this.motes = [];           // fragments in flight
    this.floaters = [];        // hearts
    this.combo = 0;
    this.lastCollect = -99;
    this.near = null;          // interactable in reach
    this.hover = null;         // interactable under the mouse
    this.mode = 'attract';
    this.visible = true;       // attract mode pauses when scrolled out of view
    this.still = false;        // reduced motion: the hero stands and idles instead of touring
    this.calm = false;         // reduced motion: no camera shake, fades instead of the iris
    this.wipe = null;          // iris transition between rooms
    this.tour = { i: 0, t: 0, wait: 0, stall: 0 };
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
      const raw = (t - this.last) / 1000;
      const dt = Math.max(0, Math.min(0.05, raw));
      this.last = t;
      const idle = this.mode === 'attract' && (!this.visible || document.hidden);
      // `manual` is set by the test suite, which steps the simulation itself.
      if (!idle && !this.manual) { this.watchFrameRate(raw); this.update(dt); this.render(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Drawing at screen resolution is what makes movement smooth, but it is
      more work. On a machine that cannot hold the frame rate, a smooth game
      at a coarser resolution beats a sharp one that stutters. */
  watchFrameRate(raw) {
    if (!this.screen.fine) return;
    this._slow = Math.max(0, (this._slow || 0) + (raw > 0.03 && raw < 0.25 ? 1 : -0.25));
    if (this._slow > 45) { this.screen.fine = false; this.screen.resize(); }
  }

  /** Play a sound effect — but only while someone is actually playing. */
  sfx(name, ...args) { if (this.mode === 'play') this.sound[name](...args); }

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
      this.wipe = null;
      this.tour = { i: 0, t: 0, wait: 0, stall: 0 };
      // The tour is a set path from the hub's door; start it from there
      // rather than from wherever the visitor happened to leave off.
      this.enterRoom('hub', ROOMS.hub.spawn[0], ROOMS.hub.spawn[1]);
      ui.prompt();
    }
    this.input.active = mode === 'play';
    this.input.enabled = true;
    this.input.release();
    p.vx = p.vy = 0; p.dash = 0; p.wantDash = 0;
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
    this.motes.length = 0;                 // anything still in the air counts as caught
    this.floaters.length = 0;
    // Snap, otherwise the first frame of a new room starts off the map.
    this.cam.snap(p.x, p.y, this.room.w * TILE, this.room.h * TILE);
    this.sound.setTheme(this.room.spec.music || 'hub');
    if (this.mode === 'play') ui.setZone(this.room.spec.district);
  }

  /** Change room behind an iris wipe. */
  go(id, tx, ty) {
    if (this.wipe) return;
    this.wipe = { phase: 'out', t: 0, then: () => this.enterRoom(id, tx, ty) };
    this.sfx('door');
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
    this.player.wantDash = 0;              // a roll asked for before the panel does not fire after it
    this.near = this.hover = null;
    ui.prompt();
    this.sfx('open');
  }

  onSheetClosed() {
    this.input.enabled = true;
    this.input.release();
    if (this.mode === 'play') { this.sound.close(); this.canvas.focus({ preventScroll: true }); }
  }

  /* ------------------------------ fragments -----------------------------
     Everything worth reading holds a fragment. Reading it for the first
     time earns the fragment — but the panel is in the way at that moment, so
     it waits, and flies over to you once you are back in the room to see it.
     ---------------------------------------------------------------------- */

  /** Does this entry have a fragment? Everything outside the reward room. */
  counts(id) {
    const e = entry(id);
    return !!e && !!e.district && e.district !== 'workshop';
  }

  /** Something was read for the first time. */
  onRead(id) {
    if (this.mode !== 'play' || !this.counts(id)) return;
    this.pending.push(id);
  }

  /** Where an exhibit's fragment hovers: its centre, in world pixels. */
  fragAt(o) {
    const icon = ICONS[o.icon];
    const art = sprite((icon && icon.art) || 'crate', o.accent);
    return { x: o.x * TILE + TILE / 2, y: (o.y + 1) * TILE - art.h + art.pad - 8 };
  }

  releaseFragments() {
    let elsewhere = 0;
    this.pending.splice(0).forEach((id, i) => {
      const o = this.room.objects.find((x) => x.entry === id);
      if (!o) { elsewhere++; return; }       // read from the journal: it is in another room
      const at = this.fragAt(o);
      this.motes.push({ x: at.x, y: at.y, vx: (Math.random() - 0.5) * 80, vy: -100, t: -i * 0.12, trail: 0, color: o.accent || '#ffd45e' });
    });
    if (this.motes.length) this.sfx('pop');
    if (elsewhere) this.land(null);
  }

  tickMotes(dt) {
    const p = this.player;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.t += dt;
      if (m.t < 0) continue;                 // several at once leave one after another
      if (m.t < 0.3) {                       // it jumps up out of the exhibit...
        m.x += m.vx * dt; m.y += m.vy * dt;
        const drag = Math.pow(0.012, dt);
        m.vx *= drag; m.vy *= drag;
      } else {                               // ...then comes to you, faster and faster
        const dx = p.x - m.x, dy = p.y - 7 - m.y, d = Math.hypot(dx, dy) || 1;
        const move = Math.min(d, (70 + (m.t - 0.3) * 640) * dt);
        m.x += (dx / d) * move; m.y += (dy / d) * move;
        if (d - move < 4 || m.t > 2.5) { this.motes.splice(i, 1); this.land(m); continue; }
      }
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.028;
        this.fx.add({ x: m.x + (Math.random() - 0.5) * 3, y: m.y + (Math.random() - 0.5) * 3, g: 0, life: 0.36, color: m.color, glow: 1 });
      }
    }
  }

  /** A fragment arrives: count it, and make a small fuss. */
  land(m) {
    this.combo = this.t - this.lastCollect < 6 ? Math.min(7, this.combo + 1) : 0;
    this.lastCollect = this.t;
    this.sfx('collect', this.combo);
    ui.refresh();
    ui.bump();
    if (!m) return;
    const p = this.player;
    this.fx.burst(p.x, p.y - 7, m.color, 14, 62, 0.55, { glow: 1, g: 30 });
    this.fx.burst(p.x, p.y - 7, '#ffffff', 5, 34, 0.35, { glow: 1, g: 0 });
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
    this.cam.tick(dt);
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
      // Space only ever rolls. It is read before the move, so the roll starts
      // on the frame the key went down rather than the one after.
      if (this.input.consume('space') | this.input.consume('dash')) p.wantDash = DASH_BUFFER;
      this.movePlayer(dt, this.input.dir());
      // A hover goes stale as soon as you walk: the world has slid under a
      // cursor that has not moved. Moving the mouse re-establishes it.
      if (p.moving && this.hover) { this.hover = null; this.canvas.style.cursor = ''; }
      this.checkExit();
      this.findNear();
      if (this.input.consume('act') && this.near) this.interact(this.near);
      if (this.pending.length && !this.wipe && !ui.open) this.releaseFragments();
    } else {
      p.moving = false;
      p.vx = p.vy = 0;
    }

    this.moveBall(dt);
    this.moveCompanion(dt);
    this.rustle(dt);
    this.tickMotes(dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.y += f.vy * dt; f.life -= dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    this.input.endFrame();
    this.cam.follow(p.x, p.y, this.room.w * TILE, this.room.h * TILE, dt);
  }

  /** Attract mode: walk the room's tour, stopping to look at things, then
      move on to the next room. */
  autopilot(dt) {
    const none = { x: 0, y: 0 };
    if (this.still) return none;             // reduced motion: stand and watch the fireflies
    const A = this.tour, p = this.player;
    const path = this.room.spec.tour || [];
    A.t += dt;
    if ((A.i >= path.length || A.t > TOUR_LIMIT) && !this.wipe) {
      const next = TOUR[(TOUR.indexOf(this.room.id) + 1) % TOUR.length];
      this.tour = { i: 0, t: 0, wait: 0, stall: 0 };
      this.go(next, ROOMS[next].spawn[0], ROOMS[next].spawn[1]);
      return none;
    }
    if (A.wait > 0) { A.wait -= dt; p.dir = 'up'; return none; }
    // Walking into something it cannot get round: give up on that point.
    A.stall = p.moving ? 0 : A.stall + dt;
    if (A.stall > 1) { A.stall = 0; A.i++; }
    while (A.i < path.length) {
      const [tx, ty, pause = 0] = path[A.i];
      const dx = tx * TILE + 8 - p.x, dy = ty * TILE + 8 - p.y;
      const d = Math.hypot(dx, dy);
      if (d >= 3) return { x: dx / d, y: dy / d };
      A.i++; A.stall = 0;
      if (pause) { A.wait = pause; return none; }
    }
    return none;
  }

  movePlayer(dt, d) {
    const p = this.player;
    const mag = Math.hypot(d.x, d.y);
    const dx = mag ? d.x / mag : 0, dy = mag ? d.y / mag : 0;
    const play = this.mode === 'play';

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.sprint = play && this.input.held.has('sprint');

    // --- roll ------------------------------------------------------------
    // A press that lands a moment early is remembered, so rolls chain on
    // rhythm rather than on frame-perfect timing.
    if (p.wantDash > 0) {
      if (p.dash <= 0 && p.dashCd <= 0) { p.wantDash = 0; this.startDash(dx, dy); }
      else p.wantDash -= dt;
    }

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
        this.ghosts.push({ x: p.x, y: p.y, dir: p.dir, flip: p.flip, u: 1 - Math.max(0, p.dash) / DASH_T, life: 0.22, max: 0.22 });
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
      this.face(p);
    }

    // The "other axis" is what decides whether a corner should steer you:
    // if you are already pressing that way, you are steering yourself.
    const rolling = p.dash > 0;
    this.moveBy(p.vx * dt, 0, rolling ? p.dashY : dy);
    this.moveBy(0, p.vy * dt, rolling ? p.dashX : dx);
    // A roll that has been stopped on every side it was heading is over.
    // Without this you would hang against the wall until the timer ran out.
    if (p.dash > 0 && !p.dashX && !p.dashY) this.bonk();

    // Footsteps and sprint dust, both paced by how fast you are going. The
    // legs speed up with you, but not in proportion: at a sprint that would
    // be a blur.
    if (p.moving) p.anim += dt * (4.5 + speed * 0.028);
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

  /** Which way the sprite faces. The axis only changes when the other one
      clearly wins, so moving on a near-diagonal does not flicker between
      the side view and the front view. */
  face(p) {
    const ax = Math.abs(p.vx), ay = Math.abs(p.vy);
    let side = p.dir === 'side';
    if (side && ay > ax * 1.3) side = false;
    else if (!side && ax > ay * 1.3) side = true;
    if (side) { p.dir = 'side'; if (ax > 4) p.flip = p.vx < 0; }
    else if (ay > 4) p.dir = p.vy < 0 ? 'up' : 'down';
  }

  /** Is there room for the character's feet here? A small box, low down, so
      they can tuck in behind tall objects. */
  free(x, y) {
    const hw = 4, top = 2, bot = 7;
    const l = Math.floor((x - hw) / TILE), rt = Math.floor((x + hw) / TILE);
    const t = Math.floor((y + top) / TILE), b = Math.floor((y + bot) / TILE);
    return !this.blocked(l, t) && !this.blocked(rt, t) && !this.blocked(l, b) && !this.blocked(rt, b);
  }

  /** A wall, an object — or a door that will not open yet, which is as
      solid as a wall until it does. */
  blocked(tx, ty) { return isSolid(this.room, tx, ty) || this.lockedDoorAt(tx, ty); }

  lockedDoorAt(tx, ty) {
    for (const e of this.room.exits) if (e.x === tx && e.y === ty && this.doorLocked(e)) return true;
    return false;
  }

  /** Walking into a locked door: say why it will not open, but not on every frame. */
  knock() {
    if (this.t - (this._lockedAt ?? -9) < 3) return;
    this._lockedAt = this.t;
    this.sfx('bad');
    const left = save.total - save.count;
    ui.toast('The Workshop is locked', `It opens once you have every fragment. ${left} to go — the journal (J) shows where they are.`);
  }

  /** Move along one axis. `other` is how hard the player is pushing along
      the other one. */
  moveBy(dx, dy, other = 0) {
    if (!dx && !dy) return;
    const p = this.player;
    const rolling = p.dash > 0;
    const nx = p.x + dx, ny = p.y + dy;
    // Rolling takes the crate with you instead of stopping dead at it.
    if (rolling) {
      for (const ox of [-4, 4]) for (const oy of [2, 7]) this.smashAt(Math.floor((nx + ox) / TILE), Math.floor((ny + oy) / TILE));
    }
    if (this.free(nx, ny)) { p.x = nx; p.y = ny; return; }

    // Blocked. If the way is clear just a few pixels to one side — the edge
    // of a doorway, the corner of a cabinet — steer round it rather than
    // stopping. Momentum is kept, so you come out of the corner still moving.
    if (!other) {
      const step = Math.abs(dx || dy);
      for (let s = 1; s <= NUDGE; s++) {
        for (const sign of [-1, 1]) {
          const sx = dx ? 0 : sign * s, sy = dx ? sign * s : 0;
          if (!this.free(nx + sx, ny + sy)) continue;
          const m = Math.min(s, step);
          const tx = p.x + (dx ? 0 : sign * m), ty = p.y + (dx ? sign * m : 0);
          if (this.free(tx, ty)) { p.x = tx; p.y = ty; return; }
        }
      }
    }
    if (dx) { p.vx = 0; if (rolling) p.dashX = 0; }   // don't grind along a wall
    else { p.vy = 0; if (rolling) p.dashY = 0; }
    if (this.mode === 'play') {
      for (const ox of [-4, 4]) for (const oy of [2, 7]) {
        if (this.lockedDoorAt(Math.floor((nx + ox) / TILE), Math.floor((ny + oy) / TILE))) { this.knock(); return; }
      }
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
    this.sfx('smash');
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
    this.sfx('roll');
    this.fx.burst(p.x, p.y + 4, '#cfc3e6', 9, 44, 0.32);
    ui.hideHints();
  }

  /** A roll that ran into something solid. */
  bonk() {
    const p = this.player;
    p.dash = 0; p.dashCd = DASH_CD;
    p.vx = p.vy = 0;
    this.fx.burst(p.x, p.y + 4, '#cfc3e6', 6, 36, 0.28);
    this.cam.shake = Math.max(this.cam.shake, 2.2);
    this.sfx('bonk');
  }

  /* --------------------------------- the cat ---------------------------- */

  /** Room for the cat's feet. */
  catFree(x, y) {
    const r = this.room;
    const l = Math.floor((x - 3) / TILE), rt = Math.floor((x + 3) / TILE);
    const t = Math.floor((y + 1) / TILE), b = Math.floor((y + 5) / TILE);
    return !isSolid(r, l, t) && !isSolid(r, rt, t) && !isSolid(r, l, b) && !isSolid(r, rt, b);
  }

  /** The cat trails a little behind you once you have met it. */
  moveCompanion(dt) {
    const c = this.companion;
    c.active = this.mode === 'attract' || !!save.get('metCat');
    if (!c.active) return;
    const p = this.player;
    c.joy = Math.max(0, c.joy - dt);
    // Changed room, got left behind, or got stranded behind something:
    // reappear beside you rather than trudging across the map.
    const far = Math.hypot(p.x - c.x, p.y - c.y);
    if (c.room !== this.room.id || far > 150 || c.stuck > 0.9) {
      const sameRoom = c.room === this.room.id;
      c.room = this.room.id;
      const spot = [[-14, 4], [14, 4], [0, 10], [0, -8]].find(([ox, oy]) => this.catFree(p.x + ox, p.y + oy)) || [0, 0];
      c.x = p.x + spot[0]; c.y = p.y + spot[1];
      c.vx = c.vy = 0; c.stuck = 0; c.idle = 0;
      // Catching up within a room happens in plain sight, so give it a puff.
      if (sameRoom) this.fx.burst(c.x, c.y + 2, '#cfc3e6', 6, 34, 0.3);
      return;
    }
    // What it is after: the ball, if someone has just kicked it; otherwise you.
    const b = this.ball;
    const chasing = b.room === this.room.id && Math.hypot(b.vx, b.vy) > 14 && Math.hypot(b.x - c.x, b.y - c.y) < 130;
    const tx = chasing ? b.x : p.x, ty = chasing ? b.y - 3 : p.y;
    // Seek it, with a standoff so the cat settles instead of jittering on
    // top of you, and a speed that scales with how far behind it is.
    const STOP = chasing ? 3 : 17;
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = d > STOP ? Math.min(230, (d - STOP) * 7 + 26) : 0;
    const k = Math.min(1, dt * 9);
    c.vx += ((dx / d) * speed - c.vx) * k;
    c.vy += ((dy / d) * speed - c.vy) * k;
    // It goes round things, not through them.
    let blocked = false;
    const nx = c.x + c.vx * dt;
    if (this.catFree(nx, c.y)) c.x = nx; else { c.vx = 0; blocked = true; }
    const ny = c.y + c.vy * dt;
    if (this.catFree(c.x, ny)) c.y = ny; else { c.vy = 0; blocked = true; }
    c.stuck = blocked && !chasing && d > 40 ? c.stuck + dt : 0;

    // Caught the ball: bat it back towards you.
    if (chasing && d < 8 && this.t - (c.batAt || -9) > 0.7) {
      c.batAt = this.t; c.joy = 0.4;
      const bx = p.x - b.x, by = p.y - b.y, bd = Math.hypot(bx, by) || 1;
      b.vx = (bx / bd) * 120 + (Math.random() - 0.5) * 70;
      b.vy = (by / bd) * 120 + (Math.random() - 0.5) * 70;
      this.sfx('mew');
    }

    const sp = Math.hypot(c.vx, c.vy);
    // The cat is drawn head-left, so the flip is the opposite way round to
    // the player's side-view sprite: mirror it when running right.
    if (Math.abs(c.vx) > 14) c.flip = c.vx > 0;
    c.hop += dt * (sp > 8 ? 9 : 0);
    c.idle = sp > 8 ? 0 : c.idle + dt;
  }

  pet() {
    const c = this.companion;
    c.joy = 0.6;
    for (let i = 0; i < 3; i++) {
      this.floaters.push({ art: 'heart', x: c.x + (i - 1) * 7, y: c.y - 15, vy: -15 - i * 4, life: 1, max: 1, delay: i * 0.13 });
    }
    this.sfx('purr');
    ui.award('pet');
  }

  /* --------------------------------- the ball ---------------------------
     There is a ball in the Crossroads. Walk into it and it rolls; roll into
     it and it flies. The cat will go after it.
     ---------------------------------------------------------------------- */

  ballFree(x, y) {
    const r = this.room;
    for (const ox of [-3, 3]) for (const oy of [-3, 3]) {
      const tx = Math.floor((x + ox) / TILE), ty = Math.floor((y + oy) / TILE);
      if (isSolid(r, tx, ty) || r.exits.some((e) => e.x === tx && e.y === ty)) return false;
    }
    return true;
  }

  moveBall(dt) {
    const b = this.ball;
    if (b.room !== this.room.id) return;
    const p = this.player;
    const fx = p.x, fy = p.y + 4;                       // the player's feet
    const dx = b.x - fx, dy = b.y - fy, d = Math.hypot(dx, dy);
    const sp = Math.hypot(p.vx, p.vy);
    if (d < 8 && sp > 20) {
      // It leaves along the line from your feet through it, bent towards
      // the way you were going, with a little more speed than you had.
      const nx = d ? dx / d : p.vx / sp, ny = d ? dy / d : p.vy / sp;
      const out = Math.min(520, Math.max(150, sp * 1.6));
      b.vx = (nx * 0.55 + (p.vx / sp) * 0.45) * out;
      b.vy = (ny * 0.55 + (p.vy / sp) * 0.45) * out;
      if (this.ballFree(fx + nx * 8.5, fy + ny * 8.5)) { b.x = fx + nx * 8.5; b.y = fy + ny * 8.5; }
      if (this.t - (b.kickAt || -9) > 0.2) {
        this.sfx('kick');
        this.fx.burst(b.x, b.y + 2, '#cfc3e6', 4, 30, 0.25);
      }
      b.kickAt = this.t;
    }
    const v = Math.hypot(b.vx, b.vy);
    if (v < 4) { b.vx = b.vy = 0; return; }
    const drag = Math.exp(-1.4 * dt);
    b.vx *= drag; b.vy *= drag;
    const nx = b.x + b.vx * dt;
    if (this.ballFree(nx, b.y)) b.x = nx; else b.vx *= -0.72;
    const ny = b.y + b.vy * dt;
    if (this.ballFree(b.x, ny)) b.y = ny; else b.vy *= -0.72;
    b.roll += v * dt;
  }

  /** Plants and flower beds shiver when something pushes through them. */
  rustle(dt) {
    const p = this.player, c = this.companion, b = this.ball;
    const here = b.room === this.room.id;
    for (const d of this.room.decor) {
      if (!d.pass) continue;
      if (d.sway > 0) d.sway = Math.max(0, d.sway - dt * 2.4);
      const cx = d.x * TILE + 8, cy = d.y * TILE + 10;
      const hit = (x, y) => Math.abs(x - cx) < 9 && Math.abs(y - cy) < 7;
      const touched = (p.moving && hit(p.x, p.y + 4))
        || (c.active && Math.hypot(c.vx, c.vy) > 20 && hit(c.x, c.y + 3))
        || (here && Math.hypot(b.vx, b.vy) > 20 && hit(b.x, b.y));
      if (!touched || d.sway > 0.45) continue;
      d.sway = 1;
      this.sfx('rustle');
      const bits = d.art === 'flowers' ? ['#ff9ac8', '#ffd45e', '#ef5367'] : ['#4fd98a', '#2a8a56'];
      for (let i = 0; i < 4; i++) {
        this.fx.add({ x: cx + (Math.random() - 0.5) * 10, y: cy - 4, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 25, g: 90, life: 0.45 + Math.random() * 0.3, color: bits[(Math.random() * bits.length) | 0] });
      }
    }
  }

  /* ------------------------------- the world ---------------------------- */

  checkExit() {
    const p = this.player;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (const e of this.room.exits) {
      // A locked door cannot be stood in: it blocks like a wall (see `blocked`).
      if (e.x !== tx || e.y !== ty || this.doorLocked(e)) continue;
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
    const label = !target ? ''
      : target === this.companion ? 'Pet the cat'
      : target.entry === 'guide' ? 'How this works'
      : (entry(target.entry) || {}).title;
    const text = label ? (this.hover ? 'Click|' : 'E|') + label : '';
    if (text === this._prompt) return;
    this._prompt = text;
    if (text) ui.prompt(...text.split('|')); else ui.prompt();
  }

  /* ------------------------------ interaction --------------------------- */

  interact(obj) {
    ui.hideHints();
    if (obj === this.companion) return this.pet();
    if (obj.entry === 'guide') {              // the cat, before it starts following you
      save.set('metCat', true);
      this.sfx('mew');
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
    S = this.screen.px;
    this.cam.grid = S;
    c.setTransform(S, 0, 0, S, 0, 0);
    c.imageSmoothingEnabled = false;
    const ox = this.cam.ox, oy = this.cam.oy;

    c.fillStyle = th.out;
    c.fillRect(0, 0, VIEW.w, VIEW.h);
    c.drawImage(room.floor, -ox, -oy);
    this.drawDoors(c, room, ox, oy);
    this.drawGhosts(c, ox, oy);

    // Everything standing in the room, painted back to front so the player
    // can walk behind things. `z` is where its feet are, in tiles.
    const ents = [];
    for (const d of room.decor) if (!d.broken) ents.push({ z: d.pass ? d.y + 0.45 : d.y, e: d });
    for (const o of room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;   // the cat is with you
      ents.push({ z: o.y, e: o });
    }
    ents.push({ z: this.player.y / TILE - 0.01, player: true });
    if (this.companion.active) ents.push({ z: this.companion.y / TILE - 0.02, pet: true });
    if (this.ball.room === room.id) ents.push({ z: this.ball.y / TILE - 0.2, ball: true });
    ents.sort((a, b) => a.z - b.z);
    for (const it of ents) {
      if (it.player) this.drawPlayer(c, ox, oy);
      else if (it.pet) this.drawCompanion(c, ox, oy);
      else if (it.ball) this.drawBall(c, ox, oy);
      else this.drawEntity(c, it.e, ox, oy);
    }

    this.fx.draw(c, ox, oy, false, S);
    this.drawLight(c, room, th, ox, oy);
    this.fx.draw(c, ox, oy, true, S);        // glowing motes sit above the dark
    this.drawMarkers(c, room, ox, oy);
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
    // No rounding here: a whole number of world pixels less a camera offset
    // that is already on the canvas grid is on the grid too, and rounding
    // would knock the object out of step with the floor under it.
    const px = e.x * TILE - ox + TILE / 2 - art.w / 2;
    const py = (e.y + 1) * TILE - oy - art.h + art.pad;
    if (px > VIEW.w || py > VIEW.h || px + art.w < 0 || py + art.h < 0) return;

    const gx = e.x * TILE - ox + TILE / 2, gy = (e.y + 1) * TILE - oy - 2;
    if (!e.wall && !e.pass) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(gx, gy, 7, 3, 0, 0, Math.PI * 2); c.fill();
    }
    if (e.sway > 0) {
      // Lean the top of the sprite over while its base stays put.
      c.save();
      c.translate(px + art.w / 2, py + art.h - 2);
      c.transform(1, 0, Math.sin(this.t * 30) * 0.24 * e.sway, 1, 0, 0);
      c.drawImage(art.canvas, -art.w / 2, -art.h + 2);
      c.restore();
    } else c.drawImage(art.canvas, px, py);
    if (!isObject) return;

    if (e.icon === 'cabinet') this.drawScreen(c, e.entry, px + art.pad + 4, py + art.pad + 7);
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

  /** The character mid-roll: a cartwheel when going sideways, a somersault
      when going towards or away from the camera. `u` runs 0 to 1. */
  drawTumble(c, art, x, y, dir, flip, u) {
    c.save();
    c.translate(x, y + 6 - art.h / 2 - Math.sin(u * Math.PI) * 3);
    if (dir === 'side') c.rotate((flip ? -1 : 1) * u * Math.PI * 2);
    else {
      const k = Math.cos(u * Math.PI * 2);
      c.scale(1, (k < 0 ? -1 : 1) * Math.max(0.3, Math.abs(k)));
    }
    c.drawImage(art.canvas, -art.w / 2, -art.h / 2);
    c.restore();
  }

  playerArt(dir, flip, frame) {
    const base = `player_${dir}_${frame}`;
    return (dir === 'side' && flip) ? spriteFlipped(base) : sprite(base);
  }

  drawGhosts(c, ox, oy) {
    for (const g of this.ghosts) {
      c.globalAlpha = 0.3 * (g.life / g.max);
      this.drawTumble(c, this.playerArt(g.dir, g.flip, 0), snap(g.x - ox), snap(g.y - oy), g.dir, g.flip, g.u);
    }
    c.globalAlpha = 1;
  }

  drawCompanion(c, ox, oy) {
    const k = this.companion;
    const moving = Math.hypot(k.vx, k.vy) > 8;
    // Once it has stopped for a moment it sits down, and blinks now and then.
    const base = !moving && k.idle > 0.45
      ? ((this.t % 3.6) < 0.15 ? 'cat_sit_blink' : 'cat_sit')
      : (Math.floor(Math.abs(k.hop)) % 2 ? 'cat_1' : 'cat_0');
    const art = k.flip ? spriteFlipped(base, k.accent) : sprite(base, k.accent);
    const bob = moving ? Math.abs(Math.sin(k.hop * 0.9)) * 1.6 : 0;
    const joy = k.joy > 0 ? Math.abs(Math.sin(k.joy * 16)) * 3 : 0;   // a happy little bounce
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(snap(k.x - ox), snap(k.y - oy + 5), 6, 2.5, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(art.canvas, snap(k.x - ox - art.w / 2), snap(k.y - oy - art.h + 6 - bob - joy));
  }

  drawBall(c, ox, oy) {
    const b = this.ball;
    const art = sprite(Math.floor(b.roll / 5) % 2 ? 'ball_1' : 'ball_0');
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(snap(b.x - ox), snap(b.y - oy + 3), 3.5, 1.5, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(art.canvas, snap(b.x - ox - art.w / 2), snap(b.y - oy - art.h / 2 - 1));
  }

  drawPlayer(c, ox, oy) {
    const p = this.player;
    const frame = p.moving ? (Math.floor(Math.abs(p.anim)) % 2) : 0;
    const art = this.playerArt(p.dir, p.flip, frame);
    // Screen space, not world space: everything else subtracts the camera
    // offset, and the player must too or the sprite drifts off its own
    // collision box as the camera scrolls.
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.beginPath(); c.ellipse(snap(p.x - ox), snap(p.y - oy + 6), 6, 2.5, 0, 0, Math.PI * 2); c.fill();
    if (p.dash > 0) this.drawTumble(c, art, snap(p.x - ox), snap(p.y - oy), p.dir, p.flip, 1 - p.dash / DASH_T);
    else c.drawImage(art.canvas, snap(p.x - ox - art.w / 2), snap(p.y - oy - art.h + 6));
  }

  /** Things that have to stay readable in the dark, so are drawn after the
      lighting: fragments, the arrow over whatever E would use, hearts. */
  drawMarkers(c, room, ox, oy) {
    const t = this.t;
    const frag = (color, x, y) => {
      const f = sprite('fragment', color);
      c.drawImage(f.canvas, snap(x - ox - f.w / 2), snap(y - oy - f.h / 2));
    };
    for (const o of room.objects) {
      if (save.has(o.entry) || !this.counts(o.entry)) continue;
      const at = this.fragAt(o);
      if (at.x - ox < -8 || at.x - ox > VIEW.w + 8) continue;
      frag(o.accent, at.x, at.y + Math.sin(t * 2.4 + o.x) * 1.5);
    }
    for (const m of this.motes) if (m.t >= 0) frag(m.color, m.x, m.y);

    const target = this.mode === 'play' ? (this.hover || this.near) : null;
    if (target) {
      let x, y;
      if (target === this.companion) { x = target.x; y = target.y - 22; }
      else {
        const at = this.fragAt(target);
        const has = !save.has(target.entry) && this.counts(target.entry);
        x = at.x; y = at.y - (has ? 9 : 1);
      }
      const a = sprite('arrow');
      c.drawImage(a.canvas, snap(x - ox - a.w / 2), snap(y - oy - a.h / 2 - Math.abs(Math.sin(t * 5)) * 2));
    }

    for (const f of this.floaters) {
      if (f.delay > 0) continue;
      const h = sprite(f.art);
      c.globalAlpha = Math.min(1, f.life * 3);
      c.drawImage(h.canvas, snap(f.x - ox - h.w / 2 + Math.sin((f.max - f.life) * 7) * 1.5), snap(f.y - oy - h.h / 2));
    }
    c.globalAlpha = 1;
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
      // Which side of the door the sign hangs on depends on where the door
      // is in the room — under it for a door in the top wall, over it
      // otherwise — and never on where it happens to be on screen, or the
      // sign would hop from one side to the other as the camera scrolls.
      const ly = e.y <= 1 ? py + TILE + 5 : py - 14;
      // As a sign slides up under the top edge, where the HUD sits, it fades
      // out rather than piling up there.
      const a = Math.max(0, Math.min(1, (ly - 5) / 9));
      if (a <= 0) continue;
      c.globalAlpha = a;
      c.fillStyle = 'rgba(8,6,14,0.86)';
      c.fillRect(snap(lx - w / 2), ly - 2, w, 12);
      drawText(c, e.label, lx, ly + 1, e.color, 'center', false, 1, S);
      c.globalAlpha = 1;
    }
  }

  /** Darken the room, then cut a pool of light around everything that glows.
      Both layers are worked out at world resolution, where it is cheap, and
      laid over the scene with smoothing: soft light on sharp pixels. */
  drawLight(c, room, th, ox, oy) {
    const L = this.lctx, G = this.gctx;
    const W = Math.ceil(VIEW.w), H = Math.ceil(VIEW.h);
    if (this.light.width !== W || this.light.height !== H) {
      this.light.width = this.glow.width = W;
      this.light.height = this.glow.height = H;
    }
    const p = this.player, t = this.t;
    const lights = [];
    for (const l of room.lights) {
      const fl = (l.flicker || 0) * (0.05 * Math.sin(t * 9 + l.phase) + 0.035 * Math.sin(t * 23 + l.phase * 2));
      lights.push({ x: l.x, y: l.y, r: l.r * (1 + fl), color: l.color, a: 0.95, glow: 0.2 });
    }
    for (const o of room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;
      const unread = !save.has(o.entry);
      lights.push({ x: o.x * TILE + 8, y: o.y * TILE, r: unread ? 34 + 3 * Math.sin(t * 2.6 + o.x) : 26, color: o.accent, a: 0.8, glow: unread ? 0.26 : 0.12 });
    }
    for (const e of room.exits) {
      lights.push({ x: e.x * TILE + 8, y: e.y * TILE + 8, r: 28, color: this.doorLocked(e) ? null : e.color, a: 0.7, glow: 0.2 });
    }
    for (const m of this.motes) if (m.t >= 0) lights.push({ x: m.x, y: m.y, r: 20, color: m.color, a: 0.6, glow: 0.3 });
    lights.push({ x: p.x, y: p.y - 4, r: 46, a: 0.72 });

    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, W, H);
    L.fillStyle = th.shade;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const x = l.x - ox, y = l.y - oy;
      if (x < -l.r || y < -l.r || x > W + l.r || y > H + l.r) continue;
      const g = L.createRadialGradient(x, y, 0, x, y, l.r);
      g.addColorStop(0, `rgba(0,0,0,${l.a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${l.a * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2);
    }

    // A wash of each light's own colour.
    G.globalCompositeOperation = 'source-over';
    G.globalAlpha = 1;
    G.clearRect(0, 0, W, H);
    G.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.color) continue;
      const x = l.x - ox, y = l.y - oy, r = l.r * 0.9;
      if (x < -r || y < -r || x > W + r || y > H + r) continue;
      const g = G.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, l.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      G.globalAlpha = l.glow;
      G.fillStyle = g;
      G.fillRect(x - r, y - r, r * 2, r * 2);
    }

    c.imageSmoothingEnabled = true;
    c.drawImage(this.light, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(this.glow, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
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
    c.arc(snap(this.player.x - ox), snap(this.player.y - oy - 4), Math.max(0, r), 0, Math.PI * 2, true);
    c.fill('evenodd');
  }
}
