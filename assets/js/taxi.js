/* =========================================================================
   taxi.js — a browser version of Taxi Cat, drawn with the game's own art.

   The sprites are the originals from the Android project: the cat's run
   cycle in each skin, the taxis, and the explosion. The real game is on
   Google Play; this is the same idea in a cabinet.
   ========================================================================= */

import { drawText } from './sprites.js';
import { save } from './save.js';

const W = 360, H = 600;
const LANES = [54, 138, 222, 306];
const SHEET = 'assets/media/taxicat-sprites.png';
const SKINS = ['Orange', 'Gold', 'Pink', 'White', 'Neon'];
const CAT = { w: 33, h: 66 }, TAXI = { w: 56, h: 96, y: 330, n: 8 }, BOOM = { s: 128, y: 426, n: 6 };
const SCALE = 0.86;

let sheet = null;
function loadSheet() {
  if (!sheet) { sheet = new Image(); sheet.src = SHEET; }
  return sheet;
}

class TaxiCat {
  constructor(ui, body) {
    this.ui = ui;
    this.canvas = body.querySelector('#taxi');
    this.ctx = this.canvas.getContext('2d');
    this.scoreEl = body.querySelector('#taxi-score');
    this.bestEl = body.querySelector('#taxi-best');
    this.img = loadSheet();
    this.skin = Math.min(save.get('taxiSkin') || 0, SKINS.length - 1);
    this.reset();

    this.onKey = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.move(-1); e.preventDefault(); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.move(1); e.preventDefault(); }
      else if ((e.code === 'Space' || e.code === 'Enter') && this.dead && !e.target.closest('button, a')) { this.reset(); e.preventDefault(); }
    };
    window.addEventListener('keydown', this.onKey);

    const tap = (e) => {
      e.preventDefault();
      if (this.dead) { if (this.deadFor > 0.5) this.reset(); return; }
      const r = this.canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      this.move(x < r.width / 2 ? -1 : 1);
    };
    this.canvas.addEventListener('touchstart', tap, { passive: false });
    this.canvas.addEventListener('mousedown', tap);

    body.querySelectorAll('.skin').forEach((b, i) => {
      b.addEventListener('click', () => {
        this.skin = i; save.set('taxiSkin', i);
        body.querySelectorAll('.skin').forEach((o, j) => o.classList.toggle('is-on', j === i));
      });
    });

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
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
  }

  reset() {
    this.lane = 1; this.x = LANES[1];
    this.cars = []; this.score = 0; this.spawn = 0.4;
    this.dead = false; this.deadFor = 0; this.t = 0; this.road = 0;
    if (this.scoreEl) this.scoreEl.textContent = '0';
  }

  move(d) {
    if (this.dead) return;
    const n = Math.max(0, Math.min(LANES.length - 1, this.lane + d));
    if (n !== this.lane) { this.lane = n; this.blip(420, 0.04); }
  }

  blip(f, d) { const g = this.ui.game; if (g) g.sound.blip(f, d, 'square', 0.06); }

  tick(dt) {
    this.t += dt;
    if (this.dead) { this.deadFor += dt; return; }
    const speed = 210 + Math.min(330, this.score * 0.42);
    this.x += (LANES[this.lane] - this.x) * Math.min(1, dt * 16);
    this.road = (this.road + speed * dt) % 64;

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.42, 1.0 - this.score * 0.0012);
      // Never fill every lane: always leave a way through.
      const blocked = new Set();
      const n = 1 + (Math.random() < 0.4 ? 1 : 0) + (this.score > 400 && Math.random() < 0.3 ? 1 : 0);
      while (blocked.size < Math.min(n, LANES.length - 1)) blocked.add((Math.random() * LANES.length) | 0);
      for (const l of blocked) this.cars.push({ lane: l, y: -100, passed: false, kind: Math.random() < 0.6 ? 0 : 1 + ((Math.random() * (TAXI.n - 1)) | 0) });
    }

    const catY = H - 96;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.y += speed * dt;
      if (!c.passed && c.y > catY + 56) {
        c.passed = true;
        this.score += 10;
        this.scoreEl.textContent = this.score;
        if (this.score % 50 === 0) this.blip(880, 0.05);
        if (this.score >= 300) this.ui.award('taxi');
      }
      if (c.y > H + 100) { this.cars.splice(i, 1); continue; }
      if (Math.abs(LANES[c.lane] - this.x) < 30 && c.y + 70 > catY + 8 && c.y < catY + 46) this.die();
    }
  }

  die() {
    this.dead = true; this.deadFor = 0;
    const g = this.ui.game; if (g) g.sound.bad();
    if (save.setTaxiBest(this.score)) this.bestEl.textContent = this.score;
  }

  draw() {
    const c = this.ctx, ready = this.img.complete && this.img.naturalWidth;
    c.fillStyle = '#17171d'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f0f14'; c.fillRect(0, 0, 10, H); c.fillRect(W - 10, 0, 10, H);
    c.fillStyle = '#34343f';
    for (let i = 1; i < LANES.length; i++) {
      const x = (LANES[i - 1] + LANES[i]) / 2 - 2;
      for (let y = -64 + this.road; y < H; y += 64) c.fillRect(x, y, 4, 30);
    }
    if (!ready) return;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    const tw = TAXI.w * SCALE, th = TAXI.h * SCALE;
    for (const car of this.cars) {
      c.drawImage(this.img, car.kind * TAXI.w, TAXI.y, TAXI.w, TAXI.h, LANES[car.lane] - tw / 2, car.y, tw, th);
    }

    const cw = CAT.w * SCALE, ch = CAT.h * SCALE, catY = H - 96;
    if (!this.dead) {
      const f = Math.floor(this.t * 12) % 8;
      c.drawImage(this.img, f * CAT.w, this.skin * CAT.h, CAT.w, CAT.h, this.x - cw / 2, catY, cw, ch);
    } else {
      const f = Math.min(BOOM.n - 1, Math.floor(this.deadFor * 14));
      if (this.deadFor < 0.5) c.drawImage(this.img, f * BOOM.s, BOOM.y, BOOM.s, BOOM.s, this.x - 64, catY - 36, 128, 128);
      c.fillStyle = `rgba(14,13,20,${Math.min(0.86, this.deadFor * 2)})`;
      c.fillRect(0, 0, W, H);
      c.imageSmoothingEnabled = false;
      if (this.deadFor > 0.35) {
        drawText(c, 'GAME', W / 2, H / 2 - 96, '#ff8a4c', 'center', true, 7);
        drawText(c, 'OVER', W / 2, H / 2 - 40, '#ff8a4c', 'center', true, 7);
        drawText(c, 'SCORE ' + this.score, W / 2, H / 2 + 36, '#ffffff', 'center', true, 3);
        if (Math.floor(this.t * 2) % 2) drawText(c, 'SPACE OR TAP TO PLAY AGAIN', W / 2, H / 2 + 86, '#a99bff', 'center', true, 2);
      }
    }
  }
}

export function openArcade(ui) {
  const skin = Math.min(save.get('taxiSkin') || 0, SKINS.length - 1);
  const k = 28 / CAT.w;   // thumbnails show exactly one 33 x 66 frame in a 28 x 56 box
  const body = ui.show('arcade', `
    <div class="sheet-head">
      <h2 id="sheet-title">Taxi Cat</h2>
      <p>A browser version of my Android game, drawn with its original sprites. The real one is free on Google Play.</p>
    </div>
    <div class="sheet-body">
      <div class="arcade">
        <canvas id="taxi" width="${W}" height="${H}" aria-label="Taxi Cat: dodge the taxis"></canvas>
        <div class="arcade-side">
          <div class="score"><span>Score</span><b id="taxi-score">0</b></div>
          <div class="score"><span>Best</span><b id="taxi-best">${save.get('taxiBest') || 0}</b></div>
          <div>
            <p class="arcade-help" style="margin-bottom:8px">Cat</p>
            <div class="skins">
              ${SKINS.map((n, i) => `<button type="button" class="skin ${i === skin ? 'is-on' : ''}" title="${n}" aria-label="${n} cat"
                style="background-image:url(${SHEET});background-size:${768 * k}px ${554 * k}px;background-position:0 ${-i * CAT.h * k}px"></button>`).join('')}
            </div>
          </div>
          <p class="arcade-help"><kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> to change lane.<br>On a phone, tap the left or right half.</p>
          <p class="e-links" style="margin:0">
            <a href="https://play.google.com/store/apps/details?id=edu.acg.taxidodger" target="_blank" rel="noopener">Google Play</a>
            <a href="https://github.com/macrisconstantine/taxi-cat-android-game" target="_blank" rel="noopener">Source</a>
            <a href="#" data-open="taxicat">About the game</a>
          </p>
        </div>
      </div>
    </div>`);
  const game = new TaxiCat(ui, body);
  ui.cleanup = () => game.stop();
}
