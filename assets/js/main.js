/* =========================================================================
   main.js — boot. Sets up the page, then loads the game behind it and
   switches between the two.
   ========================================================================= */

import { ui } from './ui.js';
import { initSite } from './site.js';
import { save } from './save.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#screen');
const home = $('#stage-home');
const shell = $('#play');
const stage = $('#stage-play');
const pageParts = [$('.site-nav'), $('main'), $('.contact')];
const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPlaying = () => document.body.classList.contains('playing');

ui.init();
initSite();
if (touch) {
  document.body.classList.add('touch-device');
  const hint = $('.stage-hint');
  if (hint) hint.innerHTML = '<kbd>Tap</kbd> to play';
}

/* --------------------------------- game --------------------------------- */

let game = null, booting = null;

/** Load and start the game. It begins in the hero, playing itself. */
function boot() {
  if (!booting) {
    booting = import('./game.js').then(({ Game }) => {
      game = new Game(canvas);
      // Anyone who has asked their system for less motion gets a quiet hero:
      // the character stands where it is, with only the lights and the
      // fireflies moving, instead of touring the rooms. A switch starts the
      // tour if they would like to see it. In play, the same setting swaps
      // camera shake and the iris wipe for nothing and a fade.
      game.still = game.calm = reducedMotion;
      game.start();
      if (reducedMotion) {
        const cap = $('.stage-caption');
        cap.insertAdjacentHTML('beforeend', ' <button type="button" class="linkish">Watch it play itself</button>');
        cap.querySelector('button').addEventListener('click', (e) => { game.still = false; e.target.remove(); });
      }
      window.__game = game;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => { game.visible = en.isIntersecting; }, { threshold: 0.05 }).observe(home);
      }
      if (touch) game.input.bindTouch($('#stick'), $('#knob'), $('#actbtn'), $('#dashbtn'));
      return game;
    });
  }
  return booting;
}

async function enterPlay() {
  const g = await boot();
  if (isPlaying()) return;
  if (ui.open) ui.close();
  document.body.classList.add('playing');
  shell.hidden = false;
  stage.appendChild(canvas);
  for (const el of pageParts) el.inert = true;
  canvas.tabIndex = 0;
  $('#hints').classList.remove('gone');
  g.setMode('play');
  canvas.focus({ preventScroll: true });
  if (location.hash !== '#play') history.pushState({ play: true }, '', '#play');
}

function exitPlay() {
  if (!isPlaying()) return;
  if (ui.open) ui.close();
  home.insertBefore(canvas, home.firstChild);
  canvas.removeAttribute('tabindex');
  document.body.classList.remove('playing');
  shell.hidden = true;
  for (const el of pageParts) el.inert = false;
  game.sound.stopMusic();
  $('#btn-sound').setAttribute('aria-pressed', 'false');
  game.setMode('attract');
  if (location.hash === '#play') history.replaceState(null, '', location.pathname + location.search);
  home.focus({ preventScroll: true });
}

/* -------------------------------- actions ------------------------------- */

const ACTIONS = {
  play: enterPlay,
  exit: exitPlay,
  journal: () => ui.openJournal(),
  terminal: () => ui.openTerminal(),
  sound: () => game && game.toggleMusic(),
  print: () => window.print(),
  reset: () => { save.reset(); ui.refresh(); ui.openJournal(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(); }
});

// The hero stage is a div acting as a button, so it needs the keys too.
home.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !isPlaying()) { e.preventDefault(); enterPlay(); }
});

/* -------------------------------- routing -------------------------------
   #play enters the game; #project/<id> opens that entry.
   ------------------------------------------------------------------------ */

function route() {
  const h = location.hash;
  if (h === '#play') { enterPlay(); return; }
  if (isPlaying()) { exitPlay(); return; }
  if (h.startsWith('#project/')) ui.openEntry(decodeURIComponent(h.slice(9)));
}
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);

/* ---------------------------------- boot -------------------------------- */

if (location.hash === '#play' || location.hash.startsWith('#project/')) route();
if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 700 });
else setTimeout(boot, 120);

// Development only: `?test` runs the regression suite against the live page.
if (new URLSearchParams(location.search).has('test')) import('../../tests/run.js');
