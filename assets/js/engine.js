/* =========================================================================
   engine.js — screen, input, camera, particles and audio.
   Nothing here knows anything about the portfolio; it is just the machine.
   ========================================================================= */

/* The render target, in world pixels. It is not fixed: a tall phone gets a
   tall window onto the world instead of a thin 16:9 letterbox stranded in
   the middle of the screen. Everything reads VIEW.w / VIEW.h at call time. */
export const VIEW = { w: 480, h: 270 };

const SHAPES = [
  { w: 480, h: 270 },   // 1.78 — desktop and landscape
  { w: 448, h: 300 },   // 1.49 — short landscape windows
  { w: 400, h: 340 },   // 1.18 — tablets and squarish windows
  { w: 320, h: 400 },   // 0.80 — portrait
  { w: 288, h: 460 },   // 0.63 — tall phones
];

/* ----------------------------------- screen ----------------------------- */

export class Screen {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.onReshape = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
  }

  resize() {
    // Measure the viewport container, not the canvas's own wrapper — the
    // wrapper is sized *by* the canvas, so asking it would pin scale at 1.
    const host = this.canvas.closest('.world') || document.documentElement;
    const narrow = window.innerWidth < 860;
    const thumbs = document.body.classList.contains('touch-device');
    const padX = narrow ? 0 : 36;
    const padY = narrow ? (thumbs ? 170 : 24) : 36;   // room for the thumb controls
    const aw = Math.max(240, host.clientWidth - padX);
    const ah = Math.max(180, host.clientHeight - padY);

    // Pick the window shape closest to the space we actually have.
    const want = aw / ah;
    let best = SHAPES[0], bestErr = Infinity;
    for (const s of SHAPES) {
      const err = Math.abs(Math.log(s.w / s.h) - Math.log(want));
      if (err < bestErr) { bestErr = err; best = s; }
    }

    const changed = best.w !== VIEW.w || best.h !== VIEW.h;
    if (changed || this.canvas.width !== VIEW.w) {
      VIEW.w = best.w; VIEW.h = best.h;
      this.canvas.width = VIEW.w;
      this.canvas.height = VIEW.h;
      this.ctx.imageSmoothingEnabled = false;
    }

    const s = Math.min(aw / VIEW.w, ah / VIEW.h);
    this.scale = s;
    this.canvas.style.width = Math.round(VIEW.w * s) + 'px';
    this.canvas.style.height = Math.round(VIEW.h * s) + 'px';
    if (changed && this.onReshape) this.onReshape();
  }
}

/* ----------------------------------- input ------------------------------ */

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyE: 'act', Space: 'act', Enter: 'act',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyZ: 'dash', KeyX: 'dash', ControlLeft: 'dash',
  Escape: 'back', KeyR: 'resume', KeyM: 'map', Comma: 'mute',
};

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.axis = { x: 0, y: 0 };
    this.enabled = true;
    this._konami = [];
    this.onKonami = null;
    this.onKey = null;

    window.addEventListener('keydown', (e) => {
      // Never swallow typing in form fields (the in-world terminal uses one).
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.code === 'Escape' && this.onKey) this.onKey('back');
        return;
      }
      this._konami.push(e.code);
      if (this._konami.length > KONAMI.length) this._konami.shift();
      if (this._konami.length === KONAMI.length && this._konami.every((c, i) => c === KONAMI[i])) {
        this._konami.length = 0;
        if (this.onKonami) this.onKonami();
      }
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.held.has(a)) this.pressed.add(a);
      this.held.add(a);
      if (a === 'sprint') this._kbSprint = true;
      if (this.onKey) this.onKey(a);
    });

    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.held.delete(a);
      if (a === 'sprint') this._kbSprint = false;
    });

    window.addEventListener('blur', () => { this.held.clear(); this._kbSprint = false; });
  }

  /** Virtual stick + buttons for touch devices. */
  bindTouch(stickEl, knobEl, actEl, dashEl) {
    let id = null, cx = 0, cy = 0;
    const R = 34;
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
      if (this.onKey) this.onKey(name);
    };
    actEl.addEventListener('touchstart', press('act'), { passive: false });
    actEl.addEventListener('click', press('act'));
    if (dashEl) {
      dashEl.addEventListener('touchstart', press('dash'), { passive: false });
      dashEl.addEventListener('click', press('dash'));
    }
  }

  dir() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let y = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    if (!x && Math.abs(this.axis.x) > 0.2) x = this.axis.x;
    if (!y && Math.abs(this.axis.y) > 0.2) y = this.axis.y;
    // Pushing the thumb stick to its edge is the touch equivalent of Shift.
    if (Math.hypot(this.axis.x, this.axis.y) > 0.86) this.held.add('sprint');
    else if (!this._kbSprint) this.held.delete('sprint');
    return { x, y };
  }

  consume(a) { const had = this.pressed.has(a); this.pressed.delete(a); return had && this.enabled; }
  endFrame() { this.pressed.clear(); }
}

/* ---------------------------------- camera ------------------------------ */

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; }

  /** Where the camera would settle for this target, already clamped. */
  target(tx, ty, roomW, roomH) {
    const x = roomW < VIEW.w ? (roomW - VIEW.w) / 2
      : Math.max(0, Math.min(tx - VIEW.w / 2, roomW - VIEW.w));
    const y = roomH < VIEW.h ? (roomH - VIEW.h) / 2
      : Math.max(0, Math.min(ty - VIEW.h / 2, roomH - VIEW.h));
    return { x, y };
  }

  follow(tx, ty, roomW, roomH) {
    const w = this.target(tx, ty, roomW, roomH);
    this.x += (w.x - this.x) * 0.16;
    this.y += (w.y - this.y) * 0.16;
  }

  /** Jump straight there — used when entering a room. */
  snap(tx, ty, roomW, roomH) {
    const w = this.target(tx, ty, roomW, roomH);
    this.x = w.x; this.y = w.y;
  }
  get ox() { return Math.round(this.x + (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
  get oy() { return Math.round(this.y + (this.shake ? (Math.random() - 0.5) * this.shake : 0)); }
  tick() { if (this.shake > 0) this.shake *= 0.86; if (this.shake < 0.1) this.shake = 0; }
}

/* --------------------------------- particles ---------------------------- */

export class Particles {
  constructor() { this.list = []; }
  burst(x, y, color, n = 10, spread = 40, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life, max: life, color, size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }
  rise(x, y, color, n = 4) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: x + (Math.random() - 0.5) * 10, y,
        vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10,
        life: 0.9, max: 0.9, color, size: 1,
      });
    }
  }
  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 50 * dt;
    }
  }
  draw(ctx, ox, oy) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

/* ----------------------------------- audio ------------------------------
   Everything is synthesised. There are no audio files.
   Music is off by default — nobody wants a portfolio that starts singing.
   ------------------------------------------------------------------------ */

const SCALES = {
  hub:         [0, 2, 4, 7, 9, 12, 14, 16],
  arcade:      [0, 3, 5, 7, 10, 12, 15, 17],
  foundry:     [0, 2, 3, 7, 8, 12, 14, 15],
  observatory: [0, 2, 5, 7, 9, 12, 14, 17],
  vault:       [0, 3, 5, 6, 7, 10, 12, 15],
  archive:     [0, 2, 4, 5, 7, 9, 11, 12],
  workshop:    [0, 4, 7, 9, 11, 12, 16, 19],
};
const ROOTS = { hub: 220, arcade: 174.6, foundry: 146.8, observatory: 196, vault: 164.8, archive: 207.6, workshop: 261.6 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.sfxOn = true;
    this.track = null;
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

  blip(freq = 440, dur = 0.07, type = 'square', vol = 0.12) {
    if (!this.sfxOn) return;
    const ac = this.ensure(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ac.currentTime + dur + 0.02);
  }

  step1() { this.blip(180 + Math.random() * 40, 0.04, 'triangle', 0.05); }
  select() { this.blip(660, 0.06, 'square', 0.1); }
  open()  { this.blip(520, 0.05); setTimeout(() => this.blip(780, 0.08), 55); }
  close() { this.blip(420, 0.05); setTimeout(() => this.blip(300, 0.07), 50); }
  collect() {
    this.blip(660, 0.06, 'square', 0.11);
    setTimeout(() => this.blip(880, 0.06, 'square', 0.11), 60);
    setTimeout(() => this.blip(1320, 0.14, 'square', 0.1), 120);
  }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'square', 0.11), i * 85));
  }
  bad() { this.blip(160, 0.18, 'sawtooth', 0.1); }
  door() { this.blip(300, 0.09, 'triangle', 0.1); setTimeout(() => this.blip(450, 0.1, 'triangle', 0.09), 80); }

  setTheme(name) {
    if (this.theme === name) return;
    this.theme = name;
    if (this.musicOn) { this.stopMusic(); this.startMusic(); }
  }

  startMusic() {
    const ac = this.ensure(); if (!ac) return;
    this.musicOn = true;
    this.step = 0;
    const scale = SCALES[this.theme] || SCALES.hub;
    const root = ROOTS[this.theme] || 220;
    const tick = () => {
      if (!this.musicOn) return;
      const s = this.step++;
      const n = scale[(s * 3 + (s >> 3)) % scale.length];
      const f = root * Math.pow(2, n / 12);
      this._note(f, 0.26, 'triangle', 0.05);
      if (s % 4 === 0) this._note(root / 2, 0.4, 'sine', 0.07);
      if (s % 8 === 6) this._note(f * 2, 0.12, 'square', 0.025);
      this.timer = setTimeout(tick, 250);
    };
    tick();
  }

  _note(freq, dur, type, vol) {
    const ac = this.ctx; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ac.currentTime + dur + 0.05);
  }

  stopMusic() { this.musicOn = false; if (this.timer) clearTimeout(this.timer); }
  toggleMusic() { if (this.musicOn) this.stopMusic(); else this.startMusic(); return this.musicOn; }
}
