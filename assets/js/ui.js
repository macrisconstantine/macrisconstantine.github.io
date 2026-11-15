/* =========================================================================
   ui.js — the panel ("sheet") that shows an entry, plus the game's HUD.

   The same sheet serves the page and the game: a project card clicked on the
   page and an arcade cabinet used in the world both end up in openEntry().
   Nothing in here needs the game to be running.
   ========================================================================= */

import { entry, entries, inDistrict, countable, DISTRICTS, district, ACHIEVEMENTS } from './content.js';
import { REPOS } from './repos.js';
import { save } from './save.js';

const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const playing = () => document.body.classList.contains('playing');

/** Swap a still for its footage. */
function playClip(img) {
  if (!img) return;
  if (img.dataset.anim) img.src = img.dataset.anim;
  // A portrait capture: the card shows a landscape still, the panel the footage.
  if (img.dataset.detail) {
    img.src = img.dataset.detail;
    img.removeAttribute('width'); img.removeAttribute('height');
    img.closest('.e-media').classList.add('e-portrait');
  }
}

export const ui = {
  game: null,        // set by the game when it boots
  kind: null,        // what the sheet is showing, or null when closed
  current: null,     // id of the entry on show, if any
  cleanup: null,     // called when the sheet closes (stops the minigame loop)

  get open() { return this.kind !== null; },

  init() {
    const d = $('#sheet');
    // The dialog's own close event arrives a task later, which is too late
    // for anything pressed in between — so close() tidies up at once, and
    // this only catches closes the browser starts itself.
    // By the time it arrives another panel may already be showing, so it
    // only counts if the dialog really is shut.
    d.addEventListener('close', () => { if (!d.open) this.closed(); });
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) { this.close(); return; }
      const open = e.target.closest('[data-open]');
      if (open) { e.preventDefault(); this.openEntry(open.dataset.open); return; }
      const go = e.target.closest('[data-go]');
      if (go && this.game) { e.preventDefault(); this.close(); this.game.travel(go.dataset.go); return; }
      if (e.target.closest('[data-play]')) { this.startEmbed(); return; }
      const clip = e.target.closest('[data-clip]');
      if (clip) { playClip(clip.parentElement.querySelector('img')); clip.remove(); return; }
      const emb = e.target.closest('[data-embed-open]');
      if (emb && this.current) { e.preventDefault(); this.startEmbed(); return; }
      const mg = e.target.closest('[data-minigame]');
      if (mg) { e.preventDefault(); this.openArcade(); }
    });
    d.addEventListener('cancel', () => { /* Esc: let the dialog close itself */ });
  },

  /** Put content in the sheet and show it. */
  show(kind, html) {
    const d = $('#sheet'), inner = $('#sheet-inner');
    if (this.cleanup) { this.cleanup(); this.cleanup = null; }
    inner.innerHTML = '<button class="sheet-x" type="button" data-close aria-label="Close">×</button>' + html;
    d.dataset.kind = kind;
    const wasOpen = this.open;
    this.kind = kind;
    if (!d.open) d.showModal();
    inner.scrollTop = 0;
    if (this.game && !wasOpen) this.game.onSheetOpened(kind);
    return inner;
  },

  close() {
    const d = $('#sheet');
    if (d.open) d.close();
    this.closed();
  },

  /** Tidy up after the sheet has gone. Safe to call twice. */
  closed() {
    if (this.kind === null) return;
    if (this.cleanup) { this.cleanup(); this.cleanup = null; }
    $('#sheet-inner').innerHTML = '';     // also unloads any embedded build
    const was = this.kind;
    this.kind = null; this.current = null;
    if (this.game) this.game.onSheetClosed(was);
    if (location.hash.startsWith('#project/')) history.replaceState(null, '', location.pathname + location.search);
  },

  /* ------------------------------- entries ------------------------------ */

  openEntry(id, opts = {}) {
    const e = entry(id);
    if (!e) return;
    this.markRead(id);
    if (e.kind === 'terminal') return this.openTerminal();
    if (e.kind === 'minigame' && opts.play) return this.openArcade();

    const node = e.el.cloneNode(true);
    node.removeAttribute('id');
    node.className = 'entry';
    node.querySelectorAll('[id]').forEach((n) => { if (n.tagName !== 'marker') n.removeAttribute('id'); });
    const title = node.querySelector('.e-title');
    if (title) { title.id = 'sheet-title'; title.classList.remove('visually-hidden'); }
    node.querySelectorAll('.e-open').forEach((a) => a.replaceWith(...a.childNodes));
    node.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      if (!img.dataset.anim && !img.dataset.detail) return;
      // Footage plays straight away, unless the visitor has asked for less
      // motion — then it waits behind a button.
      if (reducedMotion()) {
        img.closest('.e-media').insertAdjacentHTML('beforeend',
          '<button class="btn play-overlay" type="button" data-clip><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z"/></svg> Play clip</button>');
      } else playClip(img);
    });

    const media = node.querySelector('.e-media');
    if (e.embed) {
      const btn = '<button class="btn btn-primary play-overlay" type="button" data-play>' +
        '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z"/></svg> Play here</button>';
      if (media) media.insertAdjacentHTML('beforeend', btn);
    }
    if (e.kind === 'minigame') {
      const links = node.querySelector('.e-links');
      if (links && !links.querySelector('[data-minigame]')) {
        links.insertAdjacentHTML('beforeend', '<a href="#" data-minigame="taxi">Play a browser version</a>');
      }
    }

    const inner = this.show('entry', '');
    inner.appendChild(node);
    this.current = id;
    const browser = node.querySelector('[data-repos]');
    if (browser) mountRepoBrowser(browser);
    if (opts.play && e.embed) this.startEmbed();
    else { const b = inner.querySelector('[data-play]'); if (b) b.focus(); }
    if (!playing()) history.replaceState(null, '', '#project/' + id);
  },

  /** Swap the entry's picture for the live build. */
  startEmbed() {
    const e = entry(this.current);
    const inner = $('#sheet-inner');
    if (!e || !e.embed || inner.querySelector('.player')) return;
    const media = inner.querySelector('.e-media');
    const player = document.createElement('div');
    player.className = 'player';
    player.innerHTML = '<div class="player-load">Loading the live build…</div>' +
      `<iframe src="${esc(e.embed)}" title="${esc(e.title)}" allow="autoplay; fullscreen; gamepad" referrerpolicy="no-referrer"></iframe>`;
    const note = document.createElement('p');
    note.className = 'player-note';
    note.textContent = 'This is the real project, running from its own deployment. Click inside it first — it needs keyboard focus.';
    if (media) media.replaceWith(player, note); else inner.prepend(player, note);
    const frame = player.querySelector('iframe');
    frame.addEventListener('load', () => { const l = player.querySelector('.player-load'); if (l) l.remove(); });
    inner.scrollTop = 0;
    this.award('played');
  },

  async openTerminal() {
    this.markRead('terminal');
    const { openTerminal } = await import('./terminal.js');
    openTerminal(this);
  },

  async openArcade() {
    this.markRead('taxicat');
    const { openArcade } = await import('./taxi.js');
    openArcade(this);
  },

  /* ------------------------------- progress ----------------------------- */

  markRead(id) {
    const e = entry(id);
    if (!e || !save.mark(id)) return false;
    if (this.game) this.game.onRead(id);
    this.award('first');
    if (e.district && save.district(e.district).done) this.award(e.district);
    if (save.complete) this.award('all');
    this.refresh();
    return true;
  },

  award(id) {
    const a = save.award(id);
    if (!a) return;
    if (playing()) {
      this.toast(a.name, a.desc);
      if (this.game) this.game.sound.fanfare();
    }
  },

  /* -------------------------------- journal ----------------------------- */

  openJournal() {
    const here = this.game && playing() ? this.game.room.id : null;
    const blocks = DISTRICTS.map((d) => {
      const list = inDistrict(d.id);
      const st = save.district(d.id);
      const locked = d.id === 'workshop' && !save.complete;
      if (locked) {
        return `<section class="j-district j-locked" style="--c:${d.color}">
          <header><h3>${esc(d.name)}</h3><span>locked</span></header>
          <p class="j-sub">Opens once you have every fragment. ${save.total - save.count} to go.</p>
        </section>`;
      }
      const rows = list.map((e) => `
        <button type="button" class="j-entry ${save.has(e.id) ? 'is-read' : ''}" data-open="${esc(e.id)}"><i></i>${esc(e.title)}</button>`).join('');
      const go = playing()
        ? `<button type="button" class="j-go" data-go="${esc(d.id)}" ${here === d.id ? 'disabled' : ''}>${here === d.id ? 'You are here' : 'Travel here'}</button>`
        : '';
      return `<section class="j-district" style="--c:${d.color}">
        <header><h3>${esc(d.name)}</h3><span>${st.got}/${st.total}</span></header>
        <p class="j-sub">${esc(d.sub)}</p>
        <div class="j-entries">${rows}</div>${go}
      </section>`;
    }).join('');

    const ach = ACHIEVEMENTS.map((a) =>
      `<li class="${save.earned(a.id) ? 'got' : ''}" title="${esc(a.desc)}">${esc(a.name)}</li>`).join('');

    const pct = save.total ? Math.round((save.count / save.total) * 100) : 0;
    this.show('journal', `
      <div class="sheet-head">
        <h2 id="sheet-title">Journal</h2>
        <p>Everything in here, room by room. Open anything from this list, or travel straight to its room.</p>
        <div class="journal-progress"><span>${save.count} of ${save.total} fragments</span><div class="meter"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>
      </div>
      <div class="sheet-body">
        <div class="j-districts">${blocks}</div>
        <h3 class="label">Achievements</h3>
        <ul class="j-ach">${ach}</ul>
        <h3 class="label">Controls</h3>
        ${CONTROLS}
        <div class="j-foot">
          ${playing() ? '<button type="button" class="btn" data-action="sound">Toggle music</button>' : ''}
          <button type="button" class="btn" data-action="reset">Reset progress</button>
          <span class="spacer"></span>
          ${playing() ? '<button type="button" class="btn" data-action="exit">Back to the page</button>' : ''}
          <button type="button" class="btn btn-primary" data-close>${playing() ? 'Resume' : 'Close'}</button>
        </div>
      </div>`);
  },

  openHelp() {
    this.show('help', `
      <div class="sheet-head">
        <h2 id="sheet-title">How this works</h2>
        <p>Each room holds part of my work. Walk up to anything with a fragment floating over it and press <kbd>E</kbd>; reading it earns you the fragment.</p>
      </div>
      <div class="sheet-body">
        ${CONTROLS}
        <h3 class="label">Rooms</h3>
        <div class="j-help">
          ${DISTRICTS.filter((d) => d.id !== 'hub' && d.id !== 'workshop').map((d) =>
            `<span><b style="color:${d.color}">${esc(d.name)}</b> ${esc(d.sub.toLowerCase())}</span>`).join('')}
        </div>
        <div class="j-foot">
          <button type="button" class="btn" data-action="journal">Open the journal</button>
          <span class="spacer"></span>
          <button type="button" class="btn btn-primary" data-close>Got it</button>
        </div>
      </div>`);
  },

  /* ---------------------------------- HUD ------------------------------- */

  setZone(id) {
    const d = district(id);
    if (!d) return;
    const z = $('#hud-zone');
    z.textContent = d.name; z.style.color = d.color;
    const b = $('#zone-banner');
    b.querySelector('b').textContent = d.name;
    b.querySelector('b').style.color = d.color;
    b.querySelector('span').textContent = d.sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    this.zone = id;
    this.refresh();
  },

  /** The fragment counter. A fragment that is still on its way to the
      player is not counted until it lands, so the number ticks up as it
      arrives rather than behind the panel that earned it. */
  refresh() {
    const c = $('#hud-count');
    if (!c) return;
    const g = this.game;
    const inFlight = g ? g.pending.length + g.motes.length : 0;
    c.textContent = Math.max(0, save.count - inFlight);
    $('#hud-total').textContent = save.total;
  },

  /** Make the counter jump: something was just collected. */
  bump() {
    const f = $('#hud-frag');
    if (!f) return;
    f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump');
  },

  prompt(key, text) {
    const p = $('#prompt');
    if (!text) { p.classList.remove('show'); return; }
    p.innerHTML = `<kbd>${esc(key)}</kbd>${esc(text)}`;
    p.classList.add('show');
  },

  toast(title, desc = '') {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>${esc(title)}</b>${desc ? `<span>${esc(desc)}</span>` : ''}`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
  },

  hideHints() { const h = $('#hints'); if (h) h.classList.add('gone'); },
};

const CONTROLS = `
  <div class="j-help">
    <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
    <span><kbd>Shift</kbd> run</span>
    <span><kbd>Space</kbd> roll</span>
    <span><kbd>E</kbd> or click: interact</span>
    <span><kbd>J</kbd> or <kbd>Esc</kbd> journal</span>
    <span><kbd>Esc</kbd> closes any panel</span>
  </div>`;

/* -------------------------------------------------------------------------
   The searchable list of every repository. Used on the page and, cloned,
   inside the sheet — so it is mounted onto whichever copy needs it.
   ------------------------------------------------------------------------- */

export function mountRepoBrowser(host) {
  const langs = [...new Set(REPOS.map((r) => r.lang).filter(Boolean))].sort();
  host.innerHTML = `
    <div class="repo-tools">
      <input type="search" placeholder="Search ${REPOS.length} repositories" aria-label="Search repositories" autocomplete="off">
      <select aria-label="Filter by language">
        <option value="">All languages</option>
        ${langs.map((l) => `<option>${esc(l)}</option>`).join('')}
      </select>
    </div>
    <div class="repo-list"></div>`;
  const q = $('input', host), lang = $('select', host), list = $('.repo-list', host);
  const row = (r) => {
    const live = r.home && !r.home.includes('pythonanywhere') ? r.home
      : (r.pages ? `https://macrisconstantine.github.io/${r.name}/` : '');
    return `<div class="repo">
      <div><a class="repo-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
        ${r.desc ? `<p class="repo-desc">${esc(r.desc)}</p>` : ''}</div>
      <div class="repo-meta">${r.lang ? `<span class="lang">${esc(r.lang)}</span>` : ''}
        <span>${esc(r.created.slice(0, 4))}</span>
        ${live ? `<a href="${esc(live)}" target="_blank" rel="noopener">live</a>` : ''}</div>
    </div>`;
  };
  const render = () => {
    const term = q.value.trim().toLowerCase(), L = lang.value;
    const out = REPOS.filter((r) => (!L || r.lang === L) &&
      (!term || r.name.toLowerCase().includes(term) || (r.desc || '').toLowerCase().includes(term)));
    list.innerHTML = out.length ? out.map(row).join('') : '<p class="repo-empty">Nothing matches that.</p>';
  };
  q.addEventListener('input', render);
  lang.addEventListener('change', render);
  render();
}

export { entries, countable };
