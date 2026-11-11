/* =========================================================================
   taxi.js — a playable homage to Taxi Cat, his published Android game.

   The real one is on the Google Play Store. This is a small tribute that
   runs inside the cabinet so the mechanic is in your hands immediately.
   ========================================================================= */

import { sprite } from './sprites.js';
import { save } from './save.js';

const W = 180, H = 280;
const LANES = [30, 65, 100, 135];

export class TaxiGame {
  constructor(game) { this.game = game; this.raf = null; }

  open() {
    const html = `
      <header class="card-head">
        <div><h2>Taxi Cat</h2><p class="sub">dodge the traffic · ← → or A D · the real one is on Google Play</p></div>
        <button class="x" data-close aria-label="Close">×</button>
      </header>
      <div class="arcadebox">
        <canvas id="taxi" width="${W}" height="${H}" aria-label="Taxi Cat minigame"></canvas>
        <div class="arcade-side">
          <div class="score-block"><span class="sl">score</span><span class="sv" id="taxi-score">0</span></div>
          <div class="score-block"><span class="sl">best</span><span class="sv" id="taxi-best">${save.taxiBest}</span></div>
          <p class="arcade-help">Press <kbd>←</kbd> <kbd>→</kbd> to change lane.<br>Tap the left or right half on a phone.</p>
          <a class="btn store" href="https://play.google.com/store/apps/details?id=edu.acg.taxidodger" target="_blank" rel="noopener noreferrer">Get the real one ↗</a>
          <a class="btn repo" href="https://github.com/macrisconstantine/taxi-cat-android-game" target="_blank" rel="noopener noreferrer">Source ↗</a>
        </div>
      </div>
      <p class="screen-note">A published game, live and free on Google Play since 2023 — Java, Android Studio, character customisation, persistent leaderboard, and the whole signing-and-store-review gauntlet behind it.</p>`;

    const body = this.game.ui.openModal(html, 'arcade');
    this.canvas = body.querySelector('#taxi');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.scoreEl = body.querySelector('#taxi-score');
    this.bestEl = body.querySelector('#taxi-best');
    this.catArt = sprite('cat_0', '#ff9a3c');
    this.catArt2 = sprite('cat_1', '#ff9a3c');

    this.keys = new Set();
    this._kd = (e) => {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) { this.move(-1); e.preventDefault(); }
      if (['ArrowRight', 'KeyD'].includes(e.code)) { this.move(1); e.preventDefault(); }
      if (e.code === 'Space' || e.code === 'Enter') { if (this.dead) this.reset(); e.preventDefault(); }
    };
    window.addEventListener('keydown', this._kd);

    const tap = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      if (this.dead) { this.reset(); return; }
      this.move(x < r.width / 2 ? -1 : 1);
      e.preventDefault();
    };
    this.canvas.addEventListener('touchstart', tap, { passive: false });
    this.canvas.addEventListener('mousedown', tap);

    this.reset();
    this.last = performance.now();
    const loop = (t) => {
      const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
      this.last = t;
      this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('keydown', this._kd);
  }

  reset() {
    this.lane = 1;
    this.x = LANES[1];
    this.cars = [];
    this.score = 0;
    this.speed = 90;
    this.spawn = 0;
    this.dead = false;
    this.t = 0;
    this.road = 0;
  }

  move(d) {
    if (this.dead) return;
    const n = Math.max(0, Math.min(LANES.length - 1, this.lane + d));
    if (n !== this.lane) { this.lane = n; this.game.sound.blip(420, 0.04, 'square', 0.07); }
  }

  tick(dt) {
    this.t += dt;
    if (this.dead) return;

    this.x += (LANES[this.lane] - this.x) * Math.min(1, dt * 14);
    this.road = (this.road + this.speed * dt) % 32;
    this.speed = 90 + Math.min(170, this.score * 3.2);

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.38, 0.95 - this.score * 0.012);
      // Never fill every lane: always leave a way through.
      const blocked = new Set();
      const n = 1 + (Math.random() < 0.45 ? 1 : 0) + (this.score > 24 && Math.random() < 0.3 ? 1 : 0);
      while (blocked.size < Math.min(n, LANES.length - 1)) blocked.add(Math.floor(Math.random() * LANES.length));
      for (const l of blocked) this.cars.push({ lane: l, y: -40, scored: false, hue: Math.random() < 0.8 ? 'y' : 'w' });
    }

    const catY = H - 46;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.y += this.speed * dt;
      if (!c.scored && c.y > catY + 20) {
        c.scored = true; this.score++;
        this.scoreEl.textContent = this.score;
        this.game.sound.blip(700 + Math.min(500, this.score * 8), 0.03, 'square', 0.05);
        if (this.score === 20 && this.game.achievement) this.game.achievement('taxi');
        if (this.score === 60 && this.game.achievement) this.game.achievement('taxipro');
      }
      if (c.y > H + 50) this.cars.splice(i, 1);
      // Collision: same lane and overlapping vertically.
      if (c.lane === this.lane && Math.abs(c.y - catY) < 26 && Math.abs(LANES[c.lane] - this.x) < 14) {
        this.die();
      }
    }
  }

  die() {
    this.dead = true;
    this.game.sound.bad();
    if (save.setTaxiBest(this.score)) this.bestEl.textContent = this.score;
  }

  draw() {
    const c = this.ctx;
    c.fillStyle = '#1b1b24'; c.fillRect(0, 0, W, H);

    // kerbs
    c.fillStyle = '#2c2c3a'; c.fillRect(0, 0, 14, H); c.fillRect(W - 14, 0, 14, H);
    c.fillStyle = '#44445a'; c.fillRect(12, 0, 2, H); c.fillRect(W - 14, 0, 2, H);

    // lane markings
    c.fillStyle = '#3e3e52';
    for (let i = 1; i < LANES.length; i++) {
      const x = (LANES[i - 1] + LANES[i]) / 2 + 8;
      for (let y = -32 + this.road; y < H; y += 32) c.fillRect(x, y, 2, 16);
    }

    for (const car of this.cars) this.car(LANES[car.lane], car.y, car.hue);

    // the cat
    const art = (Math.floor(Math.abs(this.t) * 8) % 2 && !this.dead) ? this.catArt2 : this.catArt;
    c.save();
    if (this.dead) { c.globalAlpha = 0.5; }
    c.drawImage(art.canvas, Math.round(this.x) - 2, H - 58, 24, 24);
    c.restore();

    if (this.dead) {
      c.fillStyle = 'rgba(12,10,20,0.82)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ff6ec7'; c.font = 'bold 15px "Courier New", monospace'; c.textAlign = 'center';
      c.fillText('FLATTENED', W / 2, H / 2 - 18);
      c.fillStyle = '#e8e4d8'; c.font = '12px "Courier New", monospace';
      c.fillText('score ' + this.score, W / 2, H / 2 + 4);
      c.fillStyle = '#8a86a0'; c.font = '10px "Courier New", monospace';
      c.fillText('space / tap to retry', W / 2, H / 2 + 26);
      c.textAlign = 'left';
    }
  }

  /* A taxi, drawn top-down in pixels. */
  car(x, y, hue) {
    const c = this.ctx;
    const body = hue === 'y' ? '#ffd45e' : '#e8e4d8';
    const dark = hue === 'y' ? '#c99a25' : '#9aa6b5';
    c.fillStyle = '#141020'; c.fillRect(x - 1, y - 1, 22, 38);
    c.fillStyle = body;      c.fillRect(x, y, 20, 36);
    c.fillStyle = dark;      c.fillRect(x, y + 6, 20, 3); c.fillRect(x, y + 27, 20, 3);
    c.fillStyle = '#2a2a3a'; c.fillRect(x + 3, y + 9, 14, 8); c.fillRect(x + 3, y + 22, 14, 6);
    c.fillStyle = '#141020'; c.fillRect(x - 2, y + 7, 3, 7); c.fillRect(x + 19, y + 7, 3, 7);
    c.fillRect(x - 2, y + 24, 3, 7); c.fillRect(x + 19, y + 24, 3, 7);
    c.fillStyle = '#ffeaa0'; c.fillRect(x + 2, y + 33, 4, 3); c.fillRect(x + 14, y + 33, 4, 3);
    c.fillStyle = hue === 'y' ? '#141020' : '#ffd45e'; c.fillRect(x + 6, y + 2, 8, 3);
  }
}
