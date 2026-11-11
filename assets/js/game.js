/* =========================================================================
   game.js — the loop: movement, rendering, interaction, travel.
   ========================================================================= */

import { Screen, Input, Camera, Particles, Sound, VIEW } from './engine.js';
import { TILE, T, ROOMS, FLOORS, buildRoom, isSolid, mulberry32 } from './world.js';
import { sprite, spriteFlipped, ICONS } from './sprites.js';
import { ENTRIES, DISTRICTS, ACHIEVEMENTS } from './data.js';
import { UI } from './ui.js';
import { Terminal } from './terminal.js';
import { TaxiGame } from './taxi.js';
import { save } from './save.js';

/* Movement feel. The character accelerates and slides to a stop rather than
   snapping between stopped and full speed, which is most of why walking
   around feels like anything at all. */
const WALK    = 98;        // px/s top speed
const RUN     = 172;        // px/s while sprinting
const ACCEL   = 900;       // px/s² toward the stick direction
const FRICTION= 1150;      // px/s² when nothing is held
const DASH_V  = 330;       // px/s burst
const DASH_T  = 0.19;      // seconds of burst
const DASH_CD = 0.34;      // seconds before you can roll again
const REACH   = 30;        // interaction radius, px

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.screen = new Screen(canvas);
    this.ctx = this.screen.ctx;
    this.input = new Input();
    this.cam = new Camera();
    this.fx = new Particles();
    this.sound = new Sound();
    this.ui = new UI(this);
    this.terminal = new Terminal(this);
    this.taxi = new TaxiGame(this);

    this.rooms = {};
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      dir: 'down', moving: false, anim: 0, flip: false,
      dash: 0, dashCd: 0, dashX: 0, dashY: 0, sprint: false, dust: 0,
    };
    this.ghosts = [];          // afterimages left by a roll
    this.companion = { x: 0, y: 0, active: false, trail: [], flip: false, hop: 0, pet: true, accent: '#ff9a3c' };
    this.near = null;
    this.t = 0;
    this.transition = 0;
    this.running = false;
    this.starField = null;

    this.input.onKonami = () => this.konami();
    this.input.onKey = (a) => this.onKey(a);
    // The window shape can change (rotate a phone); re-centre when it does.
    this.screen.onReshape = () => {
      if (this.room) this.cam.snap(this.player.x, this.player.y, this.room.w * TILE, this.room.h * TILE);
    };
  }

  /* ------------------------------- lifecycle ---------------------------- */

  start() {
    this.enterRoom('hub', ROOMS.hub.spawn.x, ROOMS.hub.spawn.y, true);
    this.ui.refreshHUD();
    this.running = true;
    this.last = performance.now();
    // The first rAF timestamp can predate the performance.now() above, so
    // clamp: a negative dt would run the clock backwards.
    const loop = (t) => {
      const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
      this.last = t;
      if (this.running) { this.update(dt); this.render(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  enterRoom(id, tx, ty, instant) {
    if (!this.rooms[id]) this.rooms[id] = buildRoom(id);
    this.room = this.rooms[id];
    this.player.x = tx * TILE + TILE / 2;
    this.player.y = ty * TILE + TILE / 2;
    // Snap, otherwise the first frame of a new room starts off the map.
    this.cam.snap(this.player.x, this.player.y, this.room.w * TILE, this.room.h * TILE);
    this.transition = instant ? 0 : 0.45;
    const d = DISTRICTS.find((x) => x.id === this.room.spec.district);
    this.ui.setZone(this.room.spec.name, d ? d.color : '#fff');
    this.sound.setTheme(this.room.spec.music || 'hub');
    if (this.room.spec.stars && !this.starField) this.makeStars();
    this.checkDistrictDone(this.room.spec.district);
  }

  makeStars() {
    const r = mulberry32(99);
    this.starField = Array.from({ length: 90 }, () => ({
      x: r() * 1200, y: r() * 700, s: r() < 0.2 ? 2 : 1, a: 0.25 + r() * 0.7, tw: r() * 6,
    }));
  }

  /* --------------------------------- input ------------------------------ */

  onKey(a) {
    if (a === 'resume' && !this.ui.busy) { this.showResume(); return; }
    if (a === 'mute') { const on = this.sound.toggleMusic(); this.syncSound(on); return; }
    if (a === 'back') {
      if (this.ui.mapOpen()) return this.ui.closeMap();
      if (this.ui.stack.length) { this.closeOverlay(); return; }
      if (this.ui.el.dialogue.classList.contains('show')) return this.ui.dismissDialogue();
    }
    if (a === 'map' && !this.ui.stack.length) { this.ui.toggleMap(); return; }
  }

  closeOverlay() {
    this.taxi.stop();
    this.ui.closeModal();
  }

  syncSound(on) {
    const b = document.getElementById('btn-sound');
    if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Music on' : 'Music off'; }
  }

  konami() {
    if (this.ui.busy) return;
    this.achievement('konami');
    this.cam.shake = 7;
    this.fx.burst(this.player.x, this.player.y - 8, '#ffd45e', 40, 90, 1.1);
    this.sound.levelUp();
    this.ui.say('???', [
      'Up up down down left right left right B A.',
      'Thirty-nine C# scripts, one published app, fifty-eight repositories, and you still tried the code first.',
      'Respect. Have forty experience points.',
    ]);
    save.addXp(40);
    this.ui.refreshHUD();
  }

  /* -------------------------------- update ------------------------------ */

  update(dt) {
    this.t += dt;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - dt);
    this.fx.tick(dt);
    this.cam.tick();

    const blocked = this.ui.busy || this.ui.mapOpen();

    if (!blocked) {
      this.movePlayer(dt);
      this.checkExit();
      this.findNear();
    } else {
      this.player.moving = false;
      this.player.vx = this.player.vy = 0;
    }

    this.moveCompanion(dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) this.ghosts.splice(i, 1);
    }

    if (this.input.consume('act')) this.act();
    this.input.endFrame();

    this.cam.follow(this.player.x, this.player.y, this.room.w * TILE, this.room.h * TILE);
  }

  movePlayer(dt) {
    const p = this.player;
    const d = this.input.dir();
    const mag = Math.hypot(d.x, d.y);
    const dx = mag ? d.x / mag : 0, dy = mag ? d.y / mag : 0;

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.sprint = this.input.held.has('sprint') && this.input.enabled;

    // --- roll ------------------------------------------------------------
    if (this.input.consume('dash') && p.dash <= 0 && p.dashCd <= 0) this.startDash(dx, dy);

    if (p.dash > 0) {
      p.dash -= dt;
      const ease = Math.max(0.25, p.dash / DASH_T);     // fast, then settle
      p.vx = p.dashX * DASH_V * ease;
      p.vy = p.dashY * DASH_V * ease;
      if (p.dash <= 0) { p.dashCd = DASH_CD; p.vx *= 0.35; p.vy *= 0.35; }
      // afterimages
      this._ghostT = (this._ghostT || 0) + dt;
      if (this._ghostT > 0.028) {
        this._ghostT = 0;
        this.ghosts.push({ x: p.x, y: p.y, dir: p.dir, flip: p.flip, frame: Math.floor(Math.abs(p.anim)) % 2, life: 0.22, max: 0.22 });
      }
    } else {
      // --- walk / sprint --------------------------------------------------
      const top = p.sprint && mag ? RUN : WALK;
      if (mag) {
        if (!save.earned('firststep')) this.achievement('firststep');
        p.vx += dx * ACCEL * dt;
        p.vy += dy * ACCEL * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > top) { p.vx = (p.vx / sp) * top; p.vy = (p.vy / sp) * top; }
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
      if (step % 2 === 0) this.sound.step1();
    }
    if (p.sprint && p.moving && p.dash <= 0) {
      p.dust -= dt;
      if (p.dust <= 0) {
        p.dust = 0.075;
        this.fx.list.push({
          x: p.x + (Math.random() - 0.5) * 6, y: p.y + 5,
          vx: -p.vx * 0.12, vy: -6 - Math.random() * 6,
          life: 0.34, max: 0.34, color: '#cfc3e6', size: 1,
        });
      }
    }
  }

  /** Roll into a crate and it does not survive the experience. */
  smashAt(tx, ty) {
    const d = this.room.decor.find((o) => o.art === 'crate' && !o.broken && o.x === tx && o.y === ty);
    if (!d) return false;
    d.broken = true;
    this.room.solid[ty * this.room.w + tx] = 0;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    this.fx.burst(cx, cy - 2, d.accent || '#a8703f', 18, 70, 0.7);
    this.fx.burst(cx, cy, '#6b4426', 10, 45, 0.9);
    this.cam.shake = 4;
    this.sound.blip(150, 0.1, 'sawtooth', 0.09);
    this.sound.blip(420, 0.05, 'square', 0.06);
    this.achievement('smash');
    save.addXp(5);
    this.ui.refreshHUD();
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
    this.cam.shake = 2.2;
    this.sound.blip(300, 0.07, 'triangle', 0.08);
    this.fx.burst(p.x, p.y + 4, '#cfc3e6', 7, 34, 0.3);
    if (!save.earned('roll')) this.achievement('roll');
  }

  /** Pot trails a little behind you once you have met it. */
  moveCompanion(dt) {
    const c = this.companion;
    c.active = save.has('guide');
    if (!c.active) return;
    const p = this.player;
    // Changed room, or got left behind by a roll: catch up rather than
    // chasing a breadcrumb trail that is no longer connected to anything.
    if (!c.spawned || c.room !== this.room.id || Math.hypot(p.x - c.x, p.y - c.y) > 76) {
      c.spawned = true; c.room = this.room.id;
      c.x = p.x - 14; c.y = p.y + 4; c.trail.length = 0;
    }
    c.trail.push({ x: p.x, y: p.y });
    if (c.trail.length > 11) c.trail.shift();
    const want = c.trail[0];
    const dx = want.x - c.x, dy = want.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 11) {
      const k = Math.min(1, dt * 10);
      c.x += dx * k; c.y += dy * k;
      if (Math.abs(dx) > 1) c.flip = dx < 0;
      c.hop += dt * Math.min(16, 4 + dist * 0.55);
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

  checkExit() {
    const tx = Math.floor(this.player.x / TILE), ty = Math.floor(this.player.y / TILE);
    for (const e of this.room.exits) {
      if (e.x !== tx || e.y !== ty) continue;
      if (e.locked && !save.complete) {
        if (!this._lockedBark) {
          this._lockedBark = true;
          this.sound.bad();
          this.ui.say('A sealed door', [
            `Locked. ${save.total - save.count} fragment${save.total - save.count === 1 ? '' : 's'} still out there.`,
            'Press M to see which districts you have not finished.',
          ], () => { this._lockedBark = false; });
          this.player.y += 12;
        }
        return;
      }
      this.sound.door();
      this.enterRoom(e.to, e.tx, e.ty);
      return;
    }
  }

  findNear() {
    let best = null, bestD = REACH;
    for (const o of this.room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;
      const ox = o.x * TILE + TILE / 2, oy = o.y * TILE + TILE / 2;
      const d = Math.hypot(ox - this.player.x, oy - this.player.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (this.companion.active) {
      const d = Math.hypot(this.companion.x - this.player.x, this.companion.y - this.player.y);
      if (d < bestD) { bestD = d; this.companion.entry = 'guide'; best = this.companion; }
    }
    if (best !== this.near) {
      this.near = best;
      if (best) {
        const e = ENTRIES[best.entry];
        this.ui.showPrompt(`E  ·  ${e.title}`);
      } else this.ui.hidePrompt();
    }
  }

  /* ------------------------------ interaction --------------------------- */

  act() {
    if (this.ui.mapOpen()) return this.ui.closeMap();
    if (this.ui.stack.length) return;
    if (this.ui.advance()) return;
    if (!this.near) return;
    this.interact(this.near);
  }

  interact(obj) {
    const entry = ENTRIES[obj.entry];
    if (!entry) return;
    const first = !save.has(obj.entry);

    if (first) {
      save.find(obj.entry);
      // The companion carries pixel coordinates; world objects carry tiles.
      const fxX = obj.pet ? obj.x : obj.x * TILE + 8;
      const fxY = obj.pet ? obj.y - 6 : obj.y * TILE + 4;
      this.fx.burst(fxX, fxY, obj.accent || '#ffd45e', 16, 55, 0.8);
      this.sound.collect();
      this.ui.refreshHUD();
      if (!save.earned('firstfrag')) this.achievement('firstfrag');
      this.checkDistrictDone(entry.district);
      this.checkComplete();
    } else {
      this.sound.select();
    }

    const barks = entry.barks || [];
    const open = () => this.openEntry(entry);
    if (first && barks.length) this.ui.say(entry.title, barks, open);
    else open();
  }

  openEntry(entry) {
    switch (entry.kind) {
      case 'play':
        this.ui.openEmbed(entry);
        if (!save.earned('played')) this.achievement('played');
        break;
      case 'list':      this.ui.openList(entry); break;
      case 'terminal':  this.terminal.open(); break;
      case 'minigame':  this.taxi.open(); break;
      default:          this.ui.openCard(entry);
    }
  }

  checkDistrictDone(id) {
    const st = save.district(id);
    if (st.done && ACHIEVEMENTS.some((a) => a.id === id) && !save.earned(id)) this.achievement(id);
  }

  checkComplete() {
    if (!save.complete || save.earned('complete')) return;
    this.achievement('complete');
    this.cam.shake = 8;
    this.sound.levelUp();
    setTimeout(() => {
      this.ui.say('The Crossroads', [
        'Something heavy moves at the north end of the Crossroads.',
        'The sealed door is open. He wanted to say something to whoever actually finished.',
      ]);
    }, 900);
  }

  achievement(id) {
    const a = save.award(id);
    if (!a) return;
    this.ui.toast(a.name, a.desc);
    this.sound.levelUp();
    this.ui.refreshHUD();
    this.fx.rise(this.player.x, this.player.y - 10, '#ffd45e', 8);
  }

  showResume() {
    if (!save.earned('resume')) this.achievement('resume');
    document.body.classList.add('resume-mode');
    document.getElementById('resume').setAttribute('aria-hidden', 'false');
    document.getElementById('world').setAttribute('aria-hidden', 'true');
    this.running = false;
    this.sound.stopMusic();
    this.syncSound(false);
    window.scrollTo(0, 0);
  }

  showWorld() {
    document.body.classList.remove('resume-mode');
    document.getElementById('resume').setAttribute('aria-hidden', 'true');
    document.getElementById('world').setAttribute('aria-hidden', 'false');
    this.running = true;
    this.last = performance.now();
    this.screen.resize();
    this.canvas.focus();
  }

  /* -------------------------------- render ------------------------------ */

  render() {
    const c = this.ctx;
    const room = this.room;
    const f = FLOORS[room.spec.floor];
    const ox = this.cam.ox, oy = this.cam.oy;

    c.fillStyle = f.sky;
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    if (room.spec.stars && this.starField) {
      for (const s of this.starField) {
        const x = (s.x - ox * 0.35) % (VIEW.w + 40) - 20;
        const y = (s.y - oy * 0.35) % (VIEW.h + 40) - 20;
        c.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(this.t * 2 + s.tw));
        c.fillStyle = '#cfc3e6';
        c.fillRect(Math.round(x), Math.round(y), s.s, s.s);
      }
      c.globalAlpha = 1;
    }

    this.drawTiles(c, room, f, ox, oy);

    // Roll afterimages sit under everything else.
    this.drawGhosts(c, ox, oy);

    // Entities, painted back to front so the player can stand behind things.
    const ents = [];
    for (const d of room.decor) { if (!d.broken) ents.push({ ...d, isDecor: true }); }
    for (const o of room.objects) {
      if (o.entry === 'guide' && this.companion.active) continue;  // Pot is with you
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

    this.fx.draw(c, ox, oy);
    this.drawOverlays(c, room, ox, oy);
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
    const near = this.near === k;
    const frame = Math.floor(Math.abs(k.hop)) % 2;
    const base = frame ? 'cat_1' : 'cat_0';
    const art = k.flip ? spriteFlipped(base, '#ff9a3c') : sprite(base, '#ff9a3c');
    const bob = Math.abs(Math.sin(k.hop * 0.9)) * 1.6;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(Math.round(k.x - ox), Math.round(k.y - oy + 5), 6, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.drawImage(art.canvas, Math.round(k.x - ox - art.w / 2), Math.round(k.y - oy - art.h + 6 - bob));
    if (near) {
      const frag = sprite('fragment', '#ff9a3c');
      c.drawImage(frag.canvas, Math.round(k.x - ox - 4), Math.round(k.y - oy - art.h - 2 + Math.sin(this.t * 5) * 1.5));
    }
  }

  drawTiles(c, room, f, ox, oy) {
    // Draw past the edges of the map too: on a window taller than the room,
    // the overspill reads as more wall instead of as empty background.
    const x0 = Math.floor(ox / TILE) - 1, y0 = Math.floor(oy / TILE) - 1;
    const x1 = Math.ceil((ox + VIEW.w) / TILE) + 1;
    const y1 = Math.ceil((oy + VIEW.h) / TILE) + 1;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = x * TILE - ox, py = y * TILE - oy;
        if (x < 0 || y < 0 || x >= room.w || y >= room.h) {
          c.fillStyle = f.wall;
          c.fillRect(px, py, TILE, TILE);
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(px, py, TILE, TILE);
          c.fillStyle = 'rgba(0,0,0,0.14)';
          c.fillRect(px, py + TILE - 1, TILE, 1);
          c.fillRect(px + ((x % 2) ? 4 : 11), py, 1, TILE);
          continue;
        }
        const t = room.tiles[y * room.w + x];

        if (t === T.WALL || t === T.WALL_TOP) {
          c.fillStyle = f.wall;
          c.fillRect(px, py, TILE, TILE);
          if (t === T.WALL_TOP) {
            c.fillStyle = f.wallTop;
            c.fillRect(px, py, TILE, 5);
            c.fillStyle = 'rgba(0,0,0,0.22)';
            c.fillRect(px, py + 5, TILE, 2);
          }
          // brick seams
          c.fillStyle = 'rgba(0,0,0,0.16)';
          c.fillRect(px, py + TILE - 1, TILE, 1);
          c.fillRect(px + ((x % 2) ? 4 : 11), py + 8, 1, TILE - 9);
          continue;
        }

        if (t === T.PATH)       c.fillStyle = (x + y) % 2 ? f.path : f.pathAlt;
        else if (t === T.PLAZA) c.fillStyle = (x + y) % 2 ? f.plaza : f.plazaAlt;
        else                    c.fillStyle = t === T.FLOOR ? f.base : t === T.FLOOR_B ? f.alt : f.speck;
        c.fillRect(px, py, TILE, TILE);

        if (t === T.SPECK) {
          // Small detail marks, not a whole lighter tile. The mark suits
          // the surface: grass gets tufts, metal gets bolts, and so on.
          c.fillStyle = f.detail;
          const kind = room.spec.floor;
          if (kind === 'grass') {
            c.fillRect(px + 4, py + 6, 1, 3); c.fillRect(px + 5, py + 5, 1, 4);
            c.fillRect(px + 6, py + 6, 1, 3); c.fillRect(px + 11, py + 11, 1, 2);
          } else if (kind === 'wood') {
            c.fillRect(px + 3, py + 6, 8, 1); c.fillRect(px + 6, py + 11, 6, 1);
          } else if (kind === 'metal' || kind === 'grid') {
            c.fillRect(px + 4, py + 4, 2, 2); c.fillRect(px + 11, py + 11, 2, 2);
          } else {
            c.fillRect(px + 7, py + 6, 1, 1); c.fillRect(px + 6, py + 7, 3, 1);
            c.fillRect(px + 7, py + 8, 1, 1);
          }
        } else if (t === T.PLAZA) {
          c.fillStyle = 'rgba(0,0,0,0.12)';
          c.fillRect(px, py + TILE - 1, TILE, 1);
          c.fillRect(px + TILE - 1, py, 1, TILE);
        }

        // Edge the paved areas so they read as laid rather than painted on.
        if (t === T.PLAZA || t === T.PATH) this.edge(c, room, x, y, t, px, py, f);
      }
    }

    this.drawExits(c, room, ox, oy);
  }

  /** Light rim on the sides where a paved tile meets something that isn't. */
  edge(c, room, x, y, t, px, py, f) {
    const at = (ax, ay) => (ax < 0 || ay < 0 || ax >= room.w || ay >= room.h)
      ? -1 : room.tiles[ay * room.w + ax];
    const paved = (v) => v === T.PLAZA || v === T.PATH;
    const same = (v) => (t === T.PLAZA ? v === T.PLAZA : paved(v));
    c.fillStyle = f.rim;
    c.globalAlpha = 0.3;
    if (!same(at(x, y - 1))) c.fillRect(px, py, TILE, 1);
    if (!same(at(x, y + 1))) c.fillRect(px, py + TILE - 1, TILE, 1);
    if (!same(at(x - 1, y))) c.fillRect(px, py, 1, TILE);
    if (!same(at(x + 1, y))) c.fillRect(px + TILE - 1, py, 1, TILE);
    c.globalAlpha = 1;
  }

  drawExits(c, room, ox, oy) {
    c.font = '7px "Courier New", monospace';
    c.textAlign = 'center';
    for (const e of room.exits) {
      const px = e.x * TILE - ox, py = e.y * TILE - oy;
      // Off screen: skip entirely, so a clamped label never floats with no door.
      if (px < -TILE || px >= VIEW.w || py < -TILE || py >= VIEW.h) continue;
      const locked = e.locked && !save.complete;
      const col = locked ? '#6b6b7a' : (e.color || '#fff');

      // a lit doorway rather than a flat coloured square
      c.fillStyle = '#0b0914';
      c.fillRect(px, py, TILE, TILE);
      c.globalAlpha = locked ? 0.45 : 0.55 + 0.25 * Math.sin(this.t * 2.6);
      c.fillStyle = col;
      c.fillRect(px + 1, py + 1, TILE - 2, 2);
      c.fillRect(px + 1, py + TILE - 3, TILE - 2, 2);
      c.fillRect(px + 1, py + 3, 2, TILE - 6);
      c.fillRect(px + TILE - 3, py + 3, 2, TILE - 6);
      c.globalAlpha = 1;
      c.fillStyle = col;
      c.fillText(locked ? '✕' : '◆', px + TILE / 2, py + TILE / 2 + 3);

      if (locked) continue;
      // Label, kept inside the viewport so it never clips off the edge.
      const w = Math.ceil(c.measureText(e.label).width) + 10;
      const lx = Math.max(w / 2 + 3, Math.min(VIEW.w - w / 2 - 3, px + TILE / 2));
      const ly = py < 24 ? py + TILE + 12 : py - 10;
      c.fillStyle = 'rgba(8,6,14,0.82)';
      c.fillRect(Math.round(lx - w / 2), ly - 8, w, 11);
      c.fillStyle = col;
      c.fillText(e.label, Math.round(lx), ly);
    }
    c.textAlign = 'left';
  }

  /** Frame index that stays in range whatever the clock does. */
  frameOf(list, speed) {
    return list[Math.floor(Math.abs(this.t) * speed) % list.length];
  }

  drawEntity(c, e, ox, oy) {
    const icon = ICONS[e.icon];
    const name = e.isDecor
      ? (e.anim ? this.frameOf(e.anim, 6) : e.art)
      : (icon?.anim ? this.frameOf(icon.anim, 2.5) : (icon?.art || 'crate'));

    const art = sprite(name, e.accent);
    const px = e.x * TILE - ox + TILE / 2 - art.w / 2;
    const py = (e.y + 1) * TILE - oy - art.h + art.pad;

    // ground shadow
    const gx = e.x * TILE - ox + TILE / 2, gy = (e.y + 1) * TILE - oy - 2;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(gx, gy, 7, 3, 0, 0, Math.PI * 2);
    c.fill();

    if (!e.isDecor) {
      const got = save.has(e.entry);
      const isNear = this.near === e;
      if (got) {
        // A ring on the floor marks what you have already read, without
        // sticking a badge on the artwork.
        c.strokeStyle = e.accent || '#7fd4a8';
        c.globalAlpha = 0.55;
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(gx, gy + 1, 7.5, 3.5, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
      if (!got) {
        // Uncollected things breathe a halo so you know where to go.
        const g = 0.25 + 0.18 * Math.sin(this.t * 2.6 + e.x);
        c.save();
        c.globalAlpha = g;
        c.shadowColor = e.accent || '#fff';
        c.shadowBlur = 10;
        c.drawImage(art.canvas, Math.round(px), Math.round(py));
        c.restore();
      }
      if (isNear) {
        const bob = Math.sin(this.t * 5) * 1.5;
        const frag = sprite('fragment', e.accent);
        c.globalAlpha = got ? 0.5 : 1;
        c.drawImage(frag.canvas, Math.round(e.x * TILE - ox + 4), Math.round(py - 12 + bob));
        c.globalAlpha = 1;
      }
      if (got) {
        c.globalAlpha = 0.82;
        c.drawImage(art.canvas, Math.round(px), Math.round(py));
        c.globalAlpha = 1;
        return;
      }
    }

    c.drawImage(art.canvas, Math.round(px), Math.round(py));
  }

  drawPlayer(c, ox, oy) {
    const p = this.player;
    const frame = p.moving ? (Math.floor(Math.abs(p.anim)) % 2) : 0;
    const base = `player_${p.dir}_${frame}`;
    const art = (p.dir === 'side' && p.flip) ? spriteFlipped(base) : sprite(base);
    const px = Math.round(p.x - art.w / 2);
    const py = Math.round(p.y - art.h + 6);

    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.beginPath();
    c.ellipse(Math.round(p.x), Math.round(p.y + 6), 6, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.drawImage(art.canvas, px, py);
  }

  drawOverlays(c, room, ox, oy) {
    void ox; void oy;
    if (room.spec.scan) {
      c.globalAlpha = 0.07;
      c.fillStyle = '#52e07a';
      for (let y = 0; y < VIEW.h; y += 3) c.fillRect(0, y, VIEW.w, 1);
      c.globalAlpha = 1;
    }
    // vignette
    const g = c.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.35, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW.w, VIEW.h);

    if (this.transition > 0) {
      c.fillStyle = `rgba(6,5,12,${this.transition / 0.45})`;
      c.fillRect(0, 0, VIEW.w, VIEW.h);
    }
  }
}
