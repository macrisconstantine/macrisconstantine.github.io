/* =========================================================================
   tests/run.js — regression suite, run against the real page.

       python tools/headless.py test "http://localhost:8099/?test"

   or open /?test in a browser and read the console. It drives the actual
   game with real key and mouse events, stepping the simulation by hand so
   the results do not depend on frame timing. Running it resets saved
   progress in that browser.
   ========================================================================= */

import { ui } from '../assets/js/ui.js';
import { save } from '../assets/js/save.js';
import { entries, countable, DISTRICTS } from '../assets/js/content.js';
import { ROOMS, TILE, buildRoom, isSolid } from '../assets/js/world.js';
import { VIEW } from '../assets/js/engine.js';

const results = [];
const DT = 1 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
}

async function waitFor(fn, ms = 6000) {
  const end = performance.now() + ms;
  while (performance.now() < end) { if (fn()) return true; await sleep(30); }
  return false;
}

const press = (code) => {
  const down = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  window.dispatchEvent(down);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  return down;
};

async function main() {
  await waitFor(() => window.__game);
  const g = window.__game;
  if (!g) { check('game boots', false, 'window.__game never appeared'); return; }
  check('game boots in attract mode', g.mode === 'attract');

  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(DT); };
  const place = (room, x, y) => {
    g.wipe = null;
    g.enterRoom(room, x, y);
    const p = g.player;
    p.vx = p.vy = 0; p.dash = 0; p.dashCd = 0;
    g.input.release();
    step(2);
  };
  const speedOf = () => Math.hypot(g.player.vx, g.player.vy);

  /* ------------------------------- content ------------------------------ */

  const all = entries();
  const ids = all.map((e) => e.id);
  check('every entry has a unique id', new Set(ids).size === ids.length && ids.every(Boolean), ids.join(','));
  check('every entry has a title', all.every((e) => e.title && e.title !== e.id), all.filter((e) => !e.title || e.title === e.id).map((e) => e.id));

  const rooms = {};
  let buildError = '';
  for (const id of Object.keys(ROOMS)) { try { rooms[id] = buildRoom(id); } catch (err) { buildError += `${id}: ${err.message}; `; } }
  check('every room builds from its map', !buildError, buildError);

  const placed = Object.values(rooms).flatMap((r) => r.objects.map((o) => o.entry)).filter((id) => id !== 'guide');
  const expected = all.filter((e) => e.district).map((e) => e.id);
  const missing = expected.filter((id) => !placed.includes(id));
  const unknown = placed.filter((id) => !ids.includes(id));
  check('every entry on the page is somewhere in the world', !missing.length, 'not placed: ' + missing);
  check('everything in the world exists on the page', !unknown.length, 'no such entry: ' + unknown);
  check('nothing is placed twice', new Set(placed).size === placed.length);

  const wrongRoom = [];
  for (const r of Object.values(rooms)) for (const o of r.objects) {
    const e = all.find((x) => x.id === o.entry);
    if (e && e.district !== r.spec.district) wrongRoom.push(`${o.entry} in ${r.id}`);
  }
  check('entries sit in the district they belong to', !wrongRoom.length, wrongRoom);

  const badTiles = [];
  for (const r of Object.values(rooms)) {
    const [sx, sy] = r.spec.spawn;
    if (isSolid(r, sx, sy)) badTiles.push(`${r.id} spawn`);
    for (const [x, y] of r.spec.tour || []) if (isSolid(r, x, y)) badTiles.push(`${r.id} tour ${x},${y}`);
    for (const e of r.exits) {
      const to = rooms[e.to];
      if (!to) { badTiles.push(`${r.id} exit to unknown ${e.to}`); continue; }
      if (isSolid(to, e.tx, e.ty)) badTiles.push(`${r.id} -> ${e.to} lands in a wall`);
      if (!to.exits.some((b) => b.to === r.id)) badTiles.push(`${e.to} has no way back to ${r.id}`);
    }
  }
  check('spawns, tour points and door arrivals are all walkable', !badTiles.length, badTiles);

  /* --------------------------- page before play ------------------------- */

  const pageSpace = press('Space');
  check('the page keeps its own keyboard: space is not swallowed outside play', !pageSpace.defaultPrevented);

  document.querySelector('#pottimea').click();
  check('clicking a card opens its detail panel', ui.open && ui.current === 'pottimea');
  check('the panel shows the full write-up', !!document.querySelector('#sheet .e-more li'));
  ui.close();
  check('the panel closes', !ui.open);

  const chip = document.querySelector('.chip[data-filter="ml"]');
  chip.click();
  const shown = [...document.querySelectorAll('.cards .card')].filter((c) => !c.hidden).map((c) => c.id);
  check('filter chips narrow the cards', shown.includes('thesis') && !shown.includes('chess'), shown);
  document.querySelector('.chip[data-filter="all"]').click();

  /* ------------------------------ enter play ---------------------------- */

  save.reset();
  document.querySelector('.btn-play').click();
  await waitFor(() => g.mode === 'play');
  check('Play enters the game', g.mode === 'play' && document.body.classList.contains('playing'));
  check('the canvas moves into the full-window stage', document.querySelector('#stage-play').contains(g.canvas));
  check('the view is a whole number of device pixels per world pixel',
    Number.isInteger(Math.round(g.screen.scale * devicePixelRatio * 1000) / 1000), g.screen.scale * devicePixelRatio);
  const playSpace = press('Space');
  check('in play, the game owns the keyboard', playSpace.defaultPrevented);
  g.manual = true;      // from here the suite steps the simulation itself
  await sleep(60);

  /* --------------------------- tuned: movement -------------------------- */

  const treadmill = (seconds, { sprint = false, roll = false } = {}) => {
    place('arcade', 3, 5);
    g.input.held.add('right');
    if (sprint) { g.input.held.add('sprint'); g.input._kbSprint = true; }
    let dist = 0;
    for (let i = 0; i < seconds / DT; i++) {
      if (roll && g.player.dash <= 0 && g.player.dashCd <= 0) g.input.pressed.add('dash');
      const x0 = g.player.x;
      g.update(DT);
      dist += g.player.x - x0;
      if (g.player.x > 300) g.player.x -= 220;     // wrap before the wall, keeping velocity
    }
    g.input.release();
    return dist / seconds;
  };
  const walk = treadmill(3), run = treadmill(3, { sprint: true }), rolls = treadmill(3, { sprint: true, roll: true });
  check('walking is about 98 px/s', Math.abs(walk - 98) < 6, walk.toFixed(1));
  check('running is about 172 px/s', Math.abs(run - 172) < 8, run.toFixed(1));
  check('chained rolls beat running by at least 1.35x', rolls / run >= 1.35, `${rolls.toFixed(0)} vs ${run.toFixed(0)} = ${(rolls / run).toFixed(2)}x`);

  place('arcade', 3, 5);
  g.input.held.add('right'); g.input.held.add('sprint'); g.input._kbSprint = true;
  step(30); g.input.pressed.add('dash'); step(1);
  check('a roll starts at burst speed', speedOf() > 300, speedOf().toFixed(0));
  step(14);
  check('a roll hands its momentum to the run instead of stalling', speedOf() >= 165, speedOf().toFixed(0));
  g.input.release();

  place('arcade', 2, 5);
  g.input.held.add('left'); step(8); g.input.pressed.add('dash'); step(30);
  check('rolling into a wall leaves you inside the room', g.player.x > TILE, g.player.x.toFixed(1));
  g.input.release();

  place('arcade', 3, 9);
  g.input.held.add('left'); step(10); g.input.pressed.add('dash'); step(16);
  check('rolling goes through a crate', g.room.decor.some((d) => d.smash && d.broken));
  g.input.release();

  /* ----------------------- tuned: who gets the keys --------------------- */

  place('arcade', 2, 3);                    // directly below the first cabinet
  g.findNear();
  check('standing by an exhibit puts it in reach', g.near && g.near.entry === 'pottimea', g.near && g.near.entry);
  press('Space'); step(1);
  check('space never opens anything', !ui.open);
  check('space rolls instead', g.player.dash > 0);
  step(40);

  place('arcade', 2, 3);
  press('KeyE'); step(1);
  check('E opens what is in reach', ui.open && ui.current === 'pottimea');
  press('KeyE'); step(1);
  check('E closes what it opened', !ui.open);
  press('KeyE'); step(1);
  press('Space'); step(1);
  check('space closes an open panel', !ui.open);
  press('KeyE'); step(1);
  press('Escape'); step(1);
  check('Escape closes an open panel', !ui.open);

  await ui.openTerminal();
  await sleep(120);
  document.activeElement.blur();
  press('Space'); press('KeyE'); step(1);
  check('the terminal keeps space and E for typing', ui.kind === 'terminal');
  const cmd = document.querySelector('#term-cmd');
  cmd.value = 'cat work/price-estimator.txt';
  document.querySelector('#term-form').requestSubmit();
  const out = document.querySelector('#term-out').textContent;
  check('terminal files are generated from the page', out.includes('229') && out.includes('97%'), out.slice(-200));
  press('Escape'); step(1);
  check('Escape closes the terminal', !ui.open);

  await ui.openArcade();
  await sleep(120);
  press('Space'); step(1);
  check('the arcade cabinet keeps space for itself', ui.kind === 'arcade');
  ui.close();

  /* ------------------------------ tuned: mouse -------------------------- */

  const at = (wx, wy) => {
    const r = g.canvas.getBoundingClientRect();
    return { clientX: r.left + ((wx - g.cam.ox) / VIEW.w) * r.width, clientY: r.top + ((wy - g.cam.oy) / VIEW.h) * r.height, bubbles: true };
  };
  place('arcade', 2, 3);
  const chessCab = g.room.objects.find((o) => o.entry === 'chess');
  const cx = chessCab.x * TILE + 8, cy = (chessCab.y + 1) * TILE - 10;
  g.cam.snap(g.player.x, g.player.y, g.room.w * TILE, g.room.h * TILE);
  g.canvas.dispatchEvent(new MouseEvent('mousemove', at(cx, cy)));
  g.findNear();
  check('pointing at something beats standing next to something else',
    g.hover && g.hover.entry === 'chess' && document.querySelector('#prompt').textContent.includes('Chess'),
    document.querySelector('#prompt').textContent);
  g.canvas.dispatchEvent(new MouseEvent('click', at(cx, cy)));
  check('clicking an exhibit opens it', ui.open && ui.current === 'chess', ui.current);
  ui.close();
  g.canvas.dispatchEvent(new MouseEvent('mousemove', at(cx, cy)));
  g.input.held.add('down'); step(12); g.input.release();
  check('a hover is dropped once you walk away', !g.hover);

  /* ------------------------------ tuned: the cat ------------------------ */

  place('hub', 10, 8);
  g.findNear();
  check('the cat waits at its spot until you meet it', g.near && g.near.entry === 'guide' && !g.companion.active);
  press('KeyE'); step(1);
  check('meeting the cat opens the guide', ui.kind === 'help');
  ui.close(); step(2);
  check('after that the cat follows you', g.companion.active);

  place('hub', 13, 7);                      // just below the statue, cat alongside
  step(40); g.findNear();
  check('the cat never takes priority over a real exhibit', g.near && g.near.entry === 'about-me', g.near && g.near.entry);

  place('hub', 8, 9); step(30);
  g.input.held.add('right'); step(45);
  const trailing = Math.hypot(g.companion.x - g.player.x, g.companion.y - g.player.y);
  check('the cat faces the way it is going', g.companion.flip === true);
  check('the cat keeps up without sitting on you', trailing > 12 && trailing < 80, trailing.toFixed(0));
  g.input.release(); step(120);
  check('the cat settles instead of jittering', Math.hypot(g.companion.vx, g.companion.vy) < 2);

  place('hub', 13, 9); step(40); g.findNear();
  check('with nothing else in reach, the cat can be talked to', g.near === g.companion);
  press('Space'); step(1);
  check('space rolls past the cat rather than talking to it', !ui.open && g.player.dash > 0);
  step(40);

  /* ----------------------- rendering: the old camera bug ---------------- */

  // Watch where the player's sprite is actually drawn, and compare that with
  // where the player is once the camera offset is taken off.
  const { sprite } = await import('../assets/js/sprites.js');
  const art = sprite('player_down_0');
  const drawnAt = () => {
    const seen = [], real = g.ctx.drawImage;
    g.ctx.drawImage = function (img, ...rest) { if (img === art.canvas) seen.push(rest); return real.call(this, img, ...rest); };
    g.player.dir = 'down'; g.player.moving = false;
    g.render();
    g.ctx.drawImage = real;
    return seen.length ? seen[seen.length - 1] : [NaN, NaN];
  };
  const offBy = () => {
    const [dx, dy] = drawnAt();
    return Math.max(Math.abs(dx - (g.player.x - g.cam.ox - art.w / 2)), Math.abs(dy - (g.player.y - g.cam.oy - art.h + 6)));
  };
  place('arcade', 4, 5);
  const errLeft = offBy(), camLeft = g.cam.ox;
  place('arcade', 21, 5);
  const errRight = offBy(), camRight = g.cam.ox;
  check('the camera really did scroll between the two probes', camRight > camLeft, `${camLeft} -> ${camRight}`);
  check('the player is drawn where the player is, wherever the camera has scrolled',
    errLeft <= 1 && errRight <= 1, `off by ${errLeft} at cam ${camLeft}, ${errRight} at cam ${camRight}`);

  /* ------------------------- travel and completion ---------------------- */

  place('hub', 13, 3);
  g.input.held.add('up'); step(40); g.input.release();
  check('the Workshop is locked at first', g.room.id === 'hub');

  ui.openJournal();
  check('the journal lists every district', document.querySelectorAll('#sheet .j-district').length === DISTRICTS.length);
  document.querySelector('#sheet [data-go="foundry"]').click();
  step(60);
  check('the journal can travel to a district', g.room.id === 'foundry' && !ui.open, g.room.id);

  ui.openJournal();
  document.querySelector('#sheet [data-open="contact-me"]').click();
  check('any entry can be opened straight from the journal', ui.current === 'contact-me');
  check('contact is never behind a locked door', !!document.querySelector('#sheet a[href^="mailto:"]'));
  ui.close();

  for (const e of countable()) ui.markRead(e.id);
  check('reading everything completes the journal', save.complete && save.count === save.total, `${save.count}/${save.total}`);
  check('completion is recorded', save.earned('all'));
  place('hub', 13, 3);
  g.input.held.add('up'); step(60); g.input.release(); step(60);
  check('the Workshop opens once everything has been read', g.room.id === 'workshop', g.room.id);

  /* ------------------------------ leave play ---------------------------- */

  g.manual = false;
  ui.close();
  document.querySelector('.hud-btn[data-action="exit"]').click();
  await sleep(80);
  check('Exit returns to the page', g.mode === 'attract' && !document.body.classList.contains('playing'));
  check('the canvas goes back into the hero', document.querySelector('#stage-home').contains(g.canvas));
  check('the page is interactive again', !document.querySelector('main').inert);
  save.reset();
}

main()
  .catch((err) => check('suite ran to completion', false, err && err.stack ? err.stack : err))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    window.__TEST_RESULTS__ = { passed: results.length - failed, failed, results };
    for (const r of results) console[r.ok ? 'log' : 'warn'](`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' -> ' + r.detail}`);
    console.log(`${results.length - failed} passed, ${failed} failed`);
  });
