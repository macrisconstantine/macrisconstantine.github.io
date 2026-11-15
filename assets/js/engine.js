/* =========================================================================
   engine.js — screen, input, camera, particles and audio.
   Nothing here knows about the portfolio; it is just the machine.
   ========================================================================= */

/* How much of the world is on screen, in world pixels. It changes with the
   window: one world pixel is always a whole number of device pixels, so the
   art stays crisp, and the view simply shows more or less of the room. */
export const VIEW = { w: 320, h: 200 };

const VIEW_H_TARGET = 190;   // aim to show about this much of the world, top to bottom
const VIEW_W_MIN = 240;      // ...but not less than this across, if it can be helped
const VIEW_W_FLOOR = 150;    // ...and never less than this

/* ----------------------------------- screen -----------------------------
   The canvas is as large as the screen area it covers, in device pixels, and
   everything is drawn through a whole-number scale. Sprites therefore stay
   sharp, but can sit — and move — a single screen pixel at a time. Drawing
   to a small canvas and stretching it would be cheaper, but then nothing
   could move by less than one whole world pixel, which is five or six
   screen pixels on a desktop, and that reads as judder.

   `fine` can be switched off to get exactly that cheaper canvas; the game
   does so by itself on a machine that cannot keep up.
   ------------------------------------------------------------------------ */

export class Screen {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;            // CSS pixels per world pixel
    this.px = 1;               // canvas pixels per world pixel
    this.fine = true;
    this.onReshape = null;
    this._box = null;          // the holder's exact size in device pixels, when the browser says
    this._observer = typeof ResizeObserver === 'function' ? new ResizeObserver((list) => {
      const e = list[list.length - 1];
      const b = e && e.devicePixelContentBoxSize && e.devicePixelContentBoxSize[0];
      this._box = b ? { el: e.target, w: b.inlineSize, h: b.blockSize } : null;
      this.resize();
    }) : null;
    this.watch();
    window.addEventListener('resize', () => this.resize());
  }

  /** (Re)attach to whatever element currently holds the canvas. */
  watch() {
    this._box = null;
    const host = this.canvas.parentElement;
    if (this._observer) {
      this._observer.disconnect();
      if (host) {
        try { this._observer.observe(host, { box: 'device-pixel-content-box' }); }
        catch { this._observer.observe(host); }
      }
    }
    this.resize();
  }

  resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 4);
    let dw = Math.round(cw * dpr), dh = Math.round(ch * dpr);
    // Prefer the browser's own count of device pixels: at 125% or 150%
    // scaling the rounded figure can be one out, which would blur the lot.
    const b = this._box;
    if (b && b.el === host && Math.abs(b.w - dw) <= dpr + 1 && Math.abs(b.h - dh) <= dpr + 1) { dw = b.w; dh = b.h; }

    // Whole device pixels per world pixel: whichever count lands closest to
    // the target height, held back if that would make the view too narrow.
    // A narrow, low-density window (a browser snapped to a sliver) would end
    // up at 1, with everything tiny; there, showing less of the room at 2 is
    // the better trade.
    const fit = Math.max(Math.floor(dw / VIEW_W_MIN), dw >= VIEW_W_FLOOR * 2 ? 2 : 1);
    const k = Math.max(1, Math.min(Math.round(dh / VIEW_H_TARGET), fit));
    const px = this.fine ? k : 1;
    const w = this.fine ? dw : Math.ceil(dw / k), h = this.fine ? dh : Math.ceil(dh / k);
    const changed = this.canvas.width !== w || this.canvas.height !== h || this.px !== px;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.px = px;
    VIEW.w = w / px; VIEW.h = h / px;
    this.scale = k / dpr;
    this.canvas.style.width = (w * k) / (px * dpr) + 'px';
    this.canvas.style.height = (h * k) / (px * dpr) + 'px';
    if (changed && this.onReshape) this.onReshape();
  }
}

/* ----------------------------------- input ------------------------------ */

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  // Space is its own action: it is the roll, and never opens anything.
  // E and Enter are purely "interact".
  KeyE: 'act', Enter: 'act', Space: 'space',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyZ: 'dash', KeyX: 'dash', ControlLeft: 'dash',
  Escape: 'back', KeyJ: 'journal', KeyM: 'journal', Comma: 'mute',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.axis = { x: 0, y: 0 };
    this.active = false;     // false while the page, not the game, owns the keyboard
    this.enabled = true;     // false while a panel is open
    this.onKey = null;

    window.addEventListener('keydown', (e) => {
      if (!this.active || e.metaKey || e.altKey) return;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) {
        if (e.code === 'Escape' && this.onKey) this.onKey('back', e);
        return;
      }
      const a = KEYMAP[e.code];
      if (!a) return;
      // Space and Enter on a focused button or link belong to that control.
      const onControl = t && t.closest && t.closest('button, a[href], summary, [role="button"]');
      if (onControl && (e.code === 'Space' || e.code === 'Enter')) return;
      if (e.ctrlKey && a !== 'dash') return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.held.has(a)) this.pressed.add(a);
      this.held.add(a);
      if (a === 'sprint') this._kbSprint = true;
      if (this.onKey) this.onKey(a, e);
    });

    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.held.delete(a);
      if (a === 'sprint') this._kbSprint = false;
    });

    window.addEventListener('blur', () => this.release());
  }

  release() { this.held.clear(); this.pressed.clear(); this._kbSprint = false; this.axis.x = this.axis.y = 0; }

  /** Virtual stick + buttons for touch devices. */
  bindTouch(stickEl, knobEl, actEl, dashEl) {
    let id = null, cx = 0, cy = 0;
    const R = 38;
    const start = (e) => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stickEl.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      stickEl.classList.add('active');
      move(e);
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy) || 1;
        const cl = Math.min(d, R);
        dx = (dx / d) * cl; dy = (dy / d) * cl;
        knobEl.style.transform = `translate(${dx}px,${dy}px)`;
        this.axis.x = Math.abs(dx) > 8 ? dx / R : 0;
        this.axis.y = Math.abs(dy) > 8 ? dy / R : 0;
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        knobEl.style.transform = '';
        stickEl.classList.remove('active');
        this.axis.x = this.axis.y = 0;
      }
    };
    stickEl.addEventListener('touchstart', start, { passive: false });
    stickEl.addEventListener('touchmove', move, { passive: false });
    stickEl.addEventListener('touchend', end);
    stickEl.addEventListener('touchcancel', end);

    const press = (name) => (e) => {
      e.preventDefault();
      this.pressed.add(name);
      if (this.onKey) this.onKey(name, e);
    };
    actEl.addEventListener('touchstart', press('act'), { passive: false });
    actEl.addEventListener('mousedown', press('act'));
    dashEl.addEventListener('touchstart', press('dash'), { passive: false });
    dashEl.addEventListener('mousedown', press('dash'));
  }

  dir() {
    if (!this.active || !this.enabled) return { x: 0, y: 0 };
    let x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let y = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    if (!x && Math.abs(this.axis.x) > 0.2) x = this.axis.x;
    if (!y && Math.abs(this.axis.y) > 0.2) y = this.axis.y;
    // Pushing the thumb stick to its edge is the touch equivalent of Shift.
    if (Math.hypot(this.axis.x, this.axis.y) > 0.86) this.held.add('sprint');
    else if (!this._kbSprint) this.held.delete('sprint');
    return { x, y };
  }

  consume(a) { const had = this.pressed.has(a); this.pressed.delete(a); return had && this.active && this.enabled; }

  /** Drop a press that has already been handled on the keydown path. */
  swallow(a) { this.pressed.delete(a); }

  endFrame() { this.pressed.clear(); }
}

/* ---------------------------------- camera ------------------------------ */

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.shake = 0; this.sx = 0; this.sy = 0;
    this.grid = 1;             // canvas pixels per world pixel; offsets snap to it
  }

  /** Where the camera would settle for this target, already clamped. */
  target(tx, ty, roomW, roomH) {
    const x = roomW < VIEW.w ? (roomW - VIEW.w) / 2
      : Math.max(0, Math.min(tx - VIEW.w / 2, roomW - VIEW.w));
    const y = roomH < VIEW.h ? (roomH - VIEW.h) / 2
      : Math.max(0, Math.min(ty - VIEW.h / 2, roomH - VIEW.h));
    return { x, y };
  }

  /** dt-scaled so the camera feels the same on a 60Hz and a 144Hz screen. */
  follow(tx, ty, roomW, roomH, dt = 1 / 60) {
    const w = this.target(tx, ty, roomW, roomH);
    const k = 1 - Math.pow(1 - 0.16, Math.min(4, dt * 60));
    this.x += (w.x - this.x) * k;
    this.y += (w.y - this.y) * k;
    // Arrive, rather than creeping the last fraction of a pixel for seconds.
    if (Math.abs(w.x - this.x) < 0.02) this.x = w.x;
    if (Math.abs(w.y - this.y) < 0.02) this.y = w.y;
  }

  /** Jump straight there — used when entering a room. */
  snap(tx, ty, roomW, roomH) {
    const w = this.target(tx, ty, roomW, roomH);
    this.x = w.x; this.y = w.y;
  }

  /** The offset to draw with: on the canvas's pixel grid, shake included. */
  get ox() { return Math.round((this.x + this.sx) * this.grid) / this.grid; }
  get oy() { return Math.round((this.y + this.sy) * this.grid) / this.grid; }

  /** Once a frame: decay the shake and roll this frame's jolt. */
  tick(dt = 1 / 60) {
    if (this.shake > 0) this.shake *= Math.pow(0.86, dt * 60);
    if (this.shake < 0.1) this.shake = 0;
    this.sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
  }
}

/* --------------------------------- particles ---------------------------- */

export class Particles {
  constructor() { this.list = []; }

  add(p) {
    if (this.list.length > 400) return;
    this.list.push({ vx: 0, vy: 0, g: 50, size: 1, max: p.life, ...p });
  }

  burst(x, y, color, n = 10, spread = 40, life = 0.6, extra = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life, color, size: Math.random() < 0.3 ? 2 : 1, ...extra });
    }
  }

  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.sway) p.x += Math.sin(p.life * p.sway) * 6 * dt;
    }
  }

  draw(ctx, ox, oy, glowOnly = false, grid = 1) {
    for (const p of this.list) {
      if (!!p.glow !== glowOnly) continue;
      const f = p.life / p.max;
      // fade in as well as out, so ambient motes do not pop into existence
      const a = p.soft ? Math.min(1, f * 4, (1 - f) * 4) : Math.max(0, f);
      ctx.globalAlpha = a * (p.alpha ?? 1) * (p.blink ? 0.55 + 0.45 * Math.sin(p.life * p.blink) : 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round((p.x - ox) * grid) / grid, Math.round((p.y - oy) * grid) / grid, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

/* ----------------------------------- audio ------------------------------
   Everything is synthesised. There are no audio files.
   Music is off until asked for.
   ------------------------------------------------------------------------ */

/* Each district loops a four-chord progression; the notes are scale degrees
   above the root, so everything stays consonant. */
const THEMES = {
  hub:         { root: 220.0, chords: [[0, 4, 7], [-3, 0, 4], [-7, 0, 5], [-5, 2, 7]], lead: 'triangle' },
  arcade:      { root: 196.0, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], lead: 'square' },
  foundry:     { root: 146.8, chords: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [-5, 2, 7]], lead: 'triangle' },
  observatory: { root: 174.6, chords: [[0, 4, 11], [-3, 4, 9], [-5, 2, 7], [-7, 0, 5]], lead: 'sine' },
  vault:       { root: 164.8, chords: [[0, 3, 7], [-2, 3, 7], [-4, 0, 3], [-5, -2, 2]], lead: 'square' },
  archive:     { root: 207.7, chords: [[0, 4, 7], [-5, 0, 4], [-3, 0, 5], [-5, -1, 2]], lead: 'triangle' },
  workshop:    { root: 233.1, chords: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], lead: 'triangle' },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.sfxOn = true;
    this.timer = null;
    this.step = 0;
    this.theme = 'hub';
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq, dur, type = 'square', vol = 0.1, attack = 0.01) {
    const ac = this.ensure(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ac.currentTime + dur + 0.03);
  }

  blip(freq = 440, dur = 0.07, type = 'square', vol = 0.1) { if (this.sfxOn) this.tone(freq, dur, type, vol); }

  step1()  { this.blip(170 + Math.random() * 40, 0.035, 'triangle', 0.04); }
  open()   { this.blip(520, 0.05); setTimeout(() => this.blip(780, 0.08), 55); }
  close()  { this.blip(420, 0.05); setTimeout(() => this.blip(300, 0.07), 50); }
  /** A fragment landing. `step` climbs a major scale, so a run of them rises. */
  collect(step = 0) {
    const k = Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][Math.min(7, Math.max(0, step))] / 12);
    [660, 880, 1320].forEach((f, i) => setTimeout(() => this.blip(f * k, i === 2 ? 0.14 : 0.06, 'square', 0.09), i * 60));
  }
  pop()    { this.blip(540, 0.05, 'triangle', 0.07); }
  purr()   { for (let i = 0; i < 5; i++) setTimeout(() => this.blip(88 + (i % 2) * 16, 0.1, 'sawtooth', 0.035), i * 90); }
  mew()    { this.blip(820, 0.06, 'triangle', 0.06); setTimeout(() => this.blip(640, 0.1, 'triangle', 0.05), 65); }
  rustle() { this.blip(1500 + Math.random() * 600, 0.03, 'triangle', 0.016); }
  kick()   { this.blip(210, 0.06, 'triangle', 0.09); }
  bonk()   { this.blip(118, 0.08, 'triangle', 0.08); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'square', 0.09), i * 85)); }
  bad()    { this.blip(160, 0.18, 'sawtooth', 0.08); }
  door()   { this.blip(300, 0.09, 'triangle', 0.09); setTimeout(() => this.blip(450, 0.1, 'triangle', 0.08), 80); }
  roll()   { this.blip(300, 0.07, 'triangle', 0.07); }
  smash()  { this.blip(150, 0.1, 'sawtooth', 0.08); this.blip(420, 0.05, 'square', 0.05); }

  setTheme(name) {
    if (this.theme === name) return;
    this.theme = name;
    if (this.musicOn) { this.stopMusic(); this.startMusic(); }
  }

  startMusic() {
    if (!this.ensure()) return;
    this.musicOn = true;
    this.step = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const th = THEMES[this.theme] || THEMES.hub;
      const s = this.step++;
      const chord = th.chords[(s >> 4) % th.chords.length];
      const hz = (n) => th.root * Math.pow(2, n / 12);
      const beat = s % 16;
      if (beat % 8 === 0) this.tone(hz(chord[0]) / 2, 1.5, 'sine', 0.07, 0.04);          // bass
      const arp = [0, 1, 2, 1, 0, 2, 1, 2][s % 8];
      this.tone(hz(chord[arp]), 0.32, th.lead, th.lead === 'square' ? 0.018 : 0.04, 0.02); // arpeggio
      if (beat === 6 || beat === 14) this.tone(hz(chord[2] + 12), 0.5, 'sine', 0.025, 0.05); // sparkle
      this.timer = setTimeout(tick, 230);
    };
    tick();
  }

  stopMusic() { this.musicOn = false; if (this.timer) clearTimeout(this.timer); }
  toggleMusic() { if (this.musicOn) this.stopMusic(); else this.startMusic(); return this.musicOn; }
}
