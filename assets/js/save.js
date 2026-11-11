/* =========================================================================
   save.js — progress, XP and achievements.

   Everything lives in this browser's localStorage. Nothing is uploaded;
   there is no server and no analytics on this site.
   ========================================================================= */

import { FRAGMENT_IDS, ACHIEVEMENTS, ENTRIES } from './data.js';

const KEY = 'cem.overworld.v1';
const XP_PER_FRAGMENT = 25;

const BLANK = { found: [], achievements: [], xp: 0, taxiBest: 0, seen: false, music: false };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...BLANK };
    const p = JSON.parse(raw);
    return { ...BLANK, ...p, found: p.found || [], achievements: p.achievements || [] };
  } catch { return { ...BLANK }; }
}

export const save = {
  state: read(),

  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode */ }
  },

  reset() { this.state = { ...BLANK, found: [], achievements: [] }; this.flush(); },

  /* ------------------------------ fragments ----------------------------- */

  has(id) { return this.state.found.includes(id); },

  find(id) {
    if (this.has(id)) return false;
    this.state.found.push(id);
    this.state.xp += XP_PER_FRAGMENT;
    this.flush();
    return true;
  },

  get total() { return FRAGMENT_IDS.length; },
  get count() { return this.state.found.filter((f) => FRAGMENT_IDS.includes(f)).length; },
  get percent() { return Math.round((this.count / this.total) * 100); },
  get complete() { return this.count >= this.total; },

  /** How much of one district has been collected. */
  district(id) {
    const ids = FRAGMENT_IDS.filter((k) => ENTRIES[k].district === id);
    const got = ids.filter((k) => this.has(k)).length;
    return { got, total: ids.length, done: ids.length > 0 && got === ids.length };
  },

  /* ------------------------------- levels ------------------------------- */

  get xp() { return this.state.xp; },
  addXp(n) { this.state.xp += n; this.flush(); },

  /** Levels get gently longer: 100, 250, 450, 700 … */
  get level() {
    let lvl = 1, need = 100, acc = 0;
    while (this.state.xp >= acc + need) { acc += need; need += 50; lvl++; }
    return lvl;
  },
  get levelProgress() {
    let need = 100, acc = 0;
    while (this.state.xp >= acc + need) { acc += need; need += 50; }
    return { into: this.state.xp - acc, need };
  },

  /* ---------------------------- achievements ---------------------------- */

  award(id) {
    if (this.state.achievements.includes(id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    this.state.achievements.push(id);
    this.state.xp += 40;
    this.flush();
    return a;
  },
  earned(id) { return this.state.achievements.includes(id); },
  get achievementCount() { return this.state.achievements.length; },

  /* ------------------------------- misc --------------------------------- */

  setTaxiBest(n) {
    if (n > this.state.taxiBest) { this.state.taxiBest = n; this.flush(); return true; }
    return false;
  },
  get taxiBest() { return this.state.taxiBest; },

  markSeen() { this.state.seen = true; this.flush(); },
  get seen() { return this.state.seen; },
};
