/* =========================================================================
   main.js — boot. Wires the world to the page and enhances the résumé.
   ========================================================================= */

import { Game } from './game.js';
import { REPOS } from './repos.js';
import { save } from './save.js';
import { esc } from './ui.js';

document.documentElement.classList.remove('no-js');

const canvas = document.getElementById('screen');
const game = new Game(canvas);
window.__game = game;   // handy in the console; harmless

/* ------------------------------ top bar --------------------------------- */

const btnMode = document.getElementById('btn-mode');
const btnMap = document.getElementById('btn-map');
const btnSound = document.getElementById('btn-sound');

function inResume() { return document.body.classList.contains('resume-mode'); }

function syncMode() {
  const r = inResume();
  btnMode.textContent = r ? 'Explore' : 'Résumé';
  btnMode.title = r ? 'Back to the world (R)' : 'Plain résumé (R)';
  btnMap.hidden = r;
  btnSound.hidden = r;
}

btnMode.addEventListener('click', () => {
  if (inResume()) game.showWorld(); else game.showResume();
  syncMode();
});
btnMap.addEventListener('click', () => game.ui.toggleMap());
btnSound.addEventListener('click', () => { const on = game.sound.toggleMusic(); game.syncSound(on); });

// Keep the button label honest when R is pressed instead of clicked.
const obs = new MutationObserver(syncMode);
obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

document.getElementById('enter-world').addEventListener('click', (e) => {
  e.preventDefault();
  game.showWorld();
  syncMode();
});

/* --------------------------- touch controls ----------------------------- */

const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
if (isTouch) {
  document.getElementById('touch').removeAttribute('aria-hidden');
  document.body.classList.add('touch-device');
  game.screen.resize();   // the canvas now has to share the screen with the thumbs
  game.input.bindTouch(
    document.getElementById('stick'),
    document.getElementById('knob'),
    document.getElementById('actbtn'),
    document.getElementById('dashbtn'),
  );
}

/* ------------------------ résumé: the full repo list -------------------- */

(function renderRepos() {
  const host = document.getElementById('r-repolist');
  const count = document.getElementById('r-repo-count');
  if (!host) return;
  count.textContent = `(${REPOS.length})`;

  const langs = [...new Set(REPOS.map((r) => r.lang).filter(Boolean))].sort();
  host.innerHTML = `
    <div class="listctl">
      <input type="search" id="rr-q" placeholder="Search ${REPOS.length} repositories…" aria-label="Search repositories" autocomplete="off">
      <select id="rr-lang" aria-label="Filter by language">
        <option value="">All languages</option>
        ${langs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}
      </select>
    </div>
    <div class="repolist" id="rr-list"></div>
    <p class="r-ln"><a href="https://github.com/macrisconstantine?tab=repositories" target="_blank" rel="noopener noreferrer">Browse on GitHub ↗</a></p>`;

  const list = document.getElementById('rr-list');
  const q = document.getElementById('rr-q');
  const lang = document.getElementById('rr-lang');

  const row = (r) => {
    const live = r.home || (r.pages ? `https://macrisconstantine.github.io/${r.name}/` : '');
    return `
      <article class="repo">
        <div class="repo-main">
          <a class="repo-name" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>
          ${r.desc ? `<p class="repo-desc">${esc(r.desc)}</p>` : ''}
        </div>
        <div class="repo-meta">
          ${r.lang ? `<span class="lang">${esc(r.lang)}</span>` : ''}
          <span class="date">${esc(r.created.slice(0, 7))}</span>
          ${live ? `<a class="livedot" href="${esc(live)}" target="_blank" rel="noopener noreferrer">live ↗</a>` : ''}
        </div>
      </article>`;
  };

  const render = () => {
    const term = q.value.trim().toLowerCase();
    const L = lang.value;
    const out = REPOS.filter((r) =>
      (!L || r.lang === L) &&
      (!term || r.name.toLowerCase().includes(term) || (r.desc || '').toLowerCase().includes(term)));
    list.innerHTML = out.length ? out.map(row).join('') : '<p class="empty">Nothing matches that.</p>';
  };
  q.addEventListener('input', render);
  lang.addEventListener('change', render);
  render();
})();

/* --------------------------------- boot --------------------------------- */

game.start();
syncMode();

// First visit gets the title card; returning visitors go straight in.
if (!save.seen) {
  save.markSeen();
  setTimeout(() => game.ui.intro(), 260);
} else {
  setTimeout(() => {
    game.ui.toast('Welcome back', `${save.count}/${save.total} fragments · level ${save.level}`, 'info');
  }, 500);
}
