/* =========================================================================
   ui.js — the DOM layer that sits over the canvas.
   Dialogue, project cards, the searchable archive, the HUD, toasts, the map.
   ========================================================================= */

import { ENTRIES, LISTS, DISTRICTS, ACHIEVEMENTS, PROFILE } from './data.js';
import { REPOS } from './repos.js';
import { save } from './save.js';

const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Tiny inline markdown: **bold**, `code`, *em*. Input is escaped first. */
export function md(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const REPO_BY_NAME = Object.fromEntries(REPOS.map((r) => [r.name, r]));

/* ========================================================================= */

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      dialogue:  $('#dialogue'),
      dName:     $('#dialogue .d-name'),
      dText:     $('#dialogue .d-text'),
      dHint:     $('#dialogue .d-hint'),
      modal:     $('#modal'),
      modalBody: $('#modal .modal-body'),
      toasts:    $('#toasts'),
      hud:       $('#hud'),
      hudZone:   $('#hud-zone'),
      hudLevel:  $('#hud-level'),
      hudBar:    $('#hud-bar span'),
      hudFrag:   $('#hud-frag'),
      map:       $('#mapview'),
      prompt:    $('#prompt'),
    };
    this.stack = [];
    this.typing = null;
    this.dialogueQueue = [];
    this.onDialogueEnd = null;

    $('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) this.closeModal();
    });
  }

  get busy() { return this.stack.length > 0 || this.el.dialogue.classList.contains('show'); }

  /* ------------------------------ dialogue ------------------------------ */

  say(name, lines, onEnd) {
    this.dialogueQueue = Array.isArray(lines) ? [...lines] : [lines];
    this.onDialogueEnd = onEnd || null;
    this.el.dName.textContent = name;
    this.el.dialogue.classList.add('show');
    this.el.dialogue.setAttribute('aria-hidden', 'false');
    this._next();
  }

  _next() {
    if (this.typing) { clearInterval(this.typing); this.typing = null; }
    const line = this.dialogueQueue.shift();
    if (line === undefined) {
      this.el.dialogue.classList.remove('show');
      this.el.dialogue.setAttribute('aria-hidden', 'true');
      const cb = this.onDialogueEnd; this.onDialogueEnd = null;
      if (cb) cb();
      return;
    }
    const target = md(line);
    this.el.dText.innerHTML = '';
    this.el.dHint.textContent = this.dialogueQueue.length ? '▼ more' : '▼';
    // Type character by character, but skip over HTML tags in one go.
    let i = 0;
    this.typing = setInterval(() => {
      if (i >= target.length) { this._doneTyping(); return; }
      if (target[i] === '<') { const j = target.indexOf('>', i); i = j < 0 ? target.length : j + 1; }
      else i++;
      this.el.dText.innerHTML = target.slice(0, i);
      if (i % 3 === 0) this.game.sound.step1();
    }, 14);
    this._typeTarget = target;
  }

  _doneTyping() { clearInterval(this.typing); this.typing = null; this.el.dText.innerHTML = this._typeTarget; }

  /** Called when the player presses the action key while dialogue is open. */
  advance() {
    if (this.typing) { this._doneTyping(); return true; }
    if (this.el.dialogue.classList.contains('show')) { this._next(); return true; }
    return false;
  }

  dismissDialogue() {
    if (this.typing) { clearInterval(this.typing); this.typing = null; }
    this.dialogueQueue = [];
    this.el.dialogue.classList.remove('show');
    this.el.dialogue.setAttribute('aria-hidden', 'true');
    const cb = this.onDialogueEnd; this.onDialogueEnd = null;
    if (cb) cb();
  }

  /* ------------------------------- modals ------------------------------- */

  openModal(html, cls = '') {
    this.el.modalBody.innerHTML = html;
    this.el.modal.className = 'modal show ' + cls;
    this.el.modal.setAttribute('aria-hidden', 'false');
    this.stack.push(cls || 'modal');
    this.game.input.enabled = false;
    this.game.sound.open();
    const first = this.el.modalBody.querySelector('input, button, a');
    if (first) setTimeout(() => first.focus(), 60);
    return this.el.modalBody;
  }

  closeModal() {
    if (!this.stack.length) return false;
    this.stack.pop();
    this.el.modal.classList.remove('show');
    this.el.modal.setAttribute('aria-hidden', 'true');
    this.el.modalBody.innerHTML = '';
    this.game.input.enabled = true;
    this.game.sound.close();
    this.game.canvas.focus();
    return true;
  }

  /* ----------------------------- project card --------------------------- */

  cardHTML(entry) {
    const stats = entry.stats ? `
      <div class="statgrid">
        ${entry.stats.map((s) => `
          <div class="stat">
            <div class="stat-label">${esc(s.label)}</div>
            <div class="stat-row"><span class="from">${esc(s.from)}</span><span class="arrow">→</span><span class="to">${esc(s.to)}</span></div>
          </div>`).join('')}
      </div>` : '';

    const body = (entry.body || []).map((p) => `<p>${md(p)}</p>`).join('');

    const links = entry.links ? `
      <div class="links">
        ${entry.links.map((l) => `<a class="btn ${esc(l.kind)}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span class="ext">↗</span></a>`).join('')}
      </div>` : '';

    const tags = entry.tags ? `<div class="tags">${entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '';

    return `
      <header class="card-head">
        <div>
          <h2>${esc(entry.title)}</h2>
          <p class="sub">${esc(entry.sub || '')}</p>
        </div>
        <button class="x" data-close aria-label="Close">×</button>
      </header>
      ${stats}
      <div class="prose">${body}</div>
      ${links}
      ${tags}`;
  }

  openCard(entry) { this.openModal(this.cardHTML(entry), 'card'); }

  /* ------------------------- the searchable archive --------------------- */

  openList(entry) {
    const names = entry.listKey === 'all' ? REPOS.map((r) => r.name) : (LISTS[entry.listKey] || []);
    const items = names.map((n) => REPO_BY_NAME[n]).filter(Boolean);
    const langs = [...new Set(items.map((r) => r.lang).filter(Boolean))].sort();

    const html = `
      <header class="card-head">
        <div>
          <h2>${esc(entry.title)}</h2>
          <p class="sub">${esc(entry.sub || '')}</p>
        </div>
        <button class="x" data-close aria-label="Close">×</button>
      </header>
      <div class="prose">${(entry.body || []).map((p) => `<p>${md(p)}</p>`).join('')}</div>
      <div class="listctl">
        <input type="search" id="repo-q" placeholder="Search ${items.length} repositories…" aria-label="Search repositories" autocomplete="off">
        <select id="repo-lang" aria-label="Filter by language">
          <option value="">All languages</option>
          ${langs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}
        </select>
      </div>
      <div class="repolist" id="repo-list"></div>`;

    const body = this.openModal(html, 'list');
    const listEl = $('#repo-list', body);
    const q = $('#repo-q', body), lang = $('#repo-lang', body);

    const render = () => {
      const term = q.value.trim().toLowerCase();
      const L = lang.value;
      const out = items.filter((r) =>
        (!L || r.lang === L) &&
        (!term || r.name.toLowerCase().includes(term) || (r.desc || '').toLowerCase().includes(term)));
      listEl.innerHTML = out.length ? out.map((r) => this.repoRow(r)).join('')
        : '<p class="empty">Nothing matches that. Even the archive has limits.</p>';
      $('#repo-count', body) && ($('#repo-count', body).textContent = out.length);
    };
    q.addEventListener('input', render);
    lang.addEventListener('change', render);
    render();
  }

  repoRow(r) {
    const live = r.home || (r.pages ? `https://macrisconstantine.github.io/${r.name}/` : '');
    return `
      <article class="repo">
        <div class="repo-main">
          <a class="repo-name" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>
          ${r.desc ? `<p class="repo-desc">${esc(r.desc)}</p>` : ''}
        </div>
        <div class="repo-meta">
          ${r.lang ? `<span class="lang" data-lang="${esc(r.lang)}">${esc(r.lang)}</span>` : ''}
          <span class="date">${esc(r.created.slice(0, 7))}</span>
          ${live ? `<a class="livedot" href="${esc(live)}" target="_blank" rel="noopener noreferrer" title="Live">live ↗</a>` : ''}
        </div>
      </article>`;
  }

  /* --------------------------- playable embed --------------------------- */

  openEmbed(entry) {
    const html = `
      <header class="card-head">
        <div>
          <h2>${esc(entry.title)}</h2>
          <p class="sub">${esc(entry.sub || '')}</p>
        </div>
        <button class="x" data-close aria-label="Close">×</button>
      </header>
      <div class="screen">
        <div class="screen-load">loading the real build…</div>
        <iframe src="${esc(entry.embed)}" title="${esc(entry.title)}" allow="autoplay; fullscreen; gamepad"
                referrerpolicy="no-referrer" loading="eager"></iframe>
      </div>
      <p class="screen-note">This is the actual project running from its own GitHub Pages deployment — not a recording. Click inside first; some builds want the keyboard.</p>
      <div class="prose compact">${(entry.body || []).map((p) => `<p>${md(p)}</p>`).join('')}</div>
      ${entry.links ? `<div class="links">${entry.links.map((l) => `<a class="btn ${esc(l.kind)}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span class="ext">↗</span></a>`).join('')}</div>` : ''}
      ${entry.tags ? `<div class="tags">${entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}`;

    const body = this.openModal(html, 'embed');
    const fr = body.querySelector('iframe');
    fr.addEventListener('load', () => { const l = body.querySelector('.screen-load'); if (l) l.remove(); });
  }

  /* -------------------------------- toasts ------------------------------ */

  toast(title, desc, kind = 'ach') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<div class="t-title">${esc(title)}</div><div class="t-desc">${esc(desc)}</div>`;
    this.el.toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
  }

  /* --------------------------------- HUD -------------------------------- */

  setZone(name, color) {
    this.el.hudZone.textContent = name;
    this.el.hudZone.style.color = color;
    const b = document.getElementById('zone-banner');
    b.textContent = name;
    b.style.color = color;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  refreshHUD() {
    const p = save.levelProgress;
    this.el.hudLevel.textContent = 'LV ' + save.level;
    this.el.hudBar.style.width = Math.round((p.into / p.need) * 100) + '%';
    this.el.hudFrag.textContent = `${save.count}/${save.total}`;
    const pct = document.getElementById('hud-pct');
    if (pct) pct.textContent = save.percent + '%';
  }

  showPrompt(text) {
    this.el.prompt.textContent = text;
    this.el.prompt.classList.add('show');
  }
  hidePrompt() { this.el.prompt.classList.remove('show'); }

  /* --------------------------------- map -------------------------------- */

  toggleMap() {
    const m = this.el.map;
    if (m.classList.contains('show')) { m.classList.remove('show'); this.game.input.enabled = true; return; }
    const cur = this.game.room.id;
    m.innerHTML = `
      <div class="mapcard">
        <h2>The Overworld</h2>
        <p class="sub">${save.count} of ${save.total} fragments · ${save.percent}% complete</p>
        <div class="mapgrid">
          ${DISTRICTS.map((d) => {
            const st = save.district(d.id);
            const locked = d.id === 'workshop' && !save.complete;
            return `
              <div class="mapzone ${cur === d.id ? 'here' : ''} ${locked ? 'locked' : ''}" style="--c:${d.color}">
                <div class="mz-name">${esc(locked ? '???' : d.name)}</div>
                <div class="mz-sub">${esc(locked ? 'collect every fragment' : d.sub)}</div>
                ${st.total ? `<div class="mz-bar"><span style="width:${(st.got / st.total) * 100}%"></span></div>
                <div class="mz-count">${st.got}/${st.total}</div>` : ''}
                ${cur === d.id ? '<div class="mz-here">you are here</div>' : ''}
              </div>`;
          }).join('')}
        </div>
        <h3>Achievements <span class="muted">${save.achievementCount}/${ACHIEVEMENTS.length}</span></h3>
        <div class="achgrid">
          ${ACHIEVEMENTS.map((a) => `
            <div class="ach ${save.earned(a.id) ? 'got' : ''}">
              <div class="a-name">${esc(save.earned(a.id) ? a.name : '???')}</div>
              <div class="a-desc">${esc(a.desc)}</div>
            </div>`).join('')}
        </div>
        <p class="mapfoot">M or Esc to close · progress is saved in this browser only
          · <button class="linkish" id="wipe">reset progress</button></p>
      </div>`;
    m.classList.add('show');
    this.game.input.enabled = false;
    $('#wipe', m).addEventListener('click', () => {
      save.reset(); this.refreshHUD(); this.toggleMap();
      this.toast('Progress cleared', 'Back to the start.', 'info');
    });
  }

  mapOpen() { return this.el.map.classList.contains('show'); }
  closeMap() { this.el.map.classList.remove('show'); this.game.input.enabled = true; }

  /* ------------------------------- helpers ------------------------------ */

  intro() {
    const html = `
      <div class="intro">
        <p class="eyebrow">${esc(PROFILE.location)}</p>
        <h1>${esc(PROFILE.name)}</h1>
        <p class="role">${esc(PROFILE.title)}</p>
        <p class="lede">${esc(PROFILE.blurb)}</p>
        <div class="introgrid">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span>move</span></div>
          <div><kbd>Shift</kbd> <span>run</span></div>
          <div><kbd>Space</kbd> <span>roll</span></div>
          <div><kbd>E</kbd> <span>interact, or click</span></div>
          <div><kbd>M</kbd> <span>map</span></div>
          <div><kbd>R</kbd> <span>plain résumé</span></div>
        </div>
        <p class="note">Six districts, ${save.total} things he actually built. The arcade cabinets run the real games. The terminal takes real commands.</p>
        <div class="links">
          <button class="btn primary" data-close>Enter the world</button>
          <button class="btn" id="go-resume">Just show me the résumé</button>
        </div>
      </div>`;
    const body = this.openModal(html, 'intro');
    $('#go-resume', body).addEventListener('click', () => { this.closeModal(); this.game.showResume(); });
  }
}

export { ENTRIES, REPO_BY_NAME };
