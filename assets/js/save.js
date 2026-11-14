/* =========================================================================
   save.js — which entries have been read, and a few small flags.
   Lives in this browser's localStorage. Nothing is sent anywhere.
   ========================================================================= */

import { countable, inDistrict, ACHIEVEMENTS } from './content.js';

const KEY = 'cm.portfolio.v2';
const BLANK = { read: [], awards: [], taxiBest: 0, metCat: false, hinted: false };

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!p) return { ...BLANK, read: [], awards: [] };
    return { ...BLANK, ...p, read: [...(p.read || [])], awards: [...(p.awards || [])] };
  } catch { return { ...BLANK, read: [], awards: [] }; }
}

export const save = {
  state: load(),

  flush() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode */ } },
  reset() { this.state = { ...BLANK, read: [], awards: [] }; this.flush(); },

  has(id) { return this.state.read.includes(id); },

  /** Mark an entry read. Returns true the first time. */
  mark(id) {
    if (this.has(id)) return false;
    this.state.read.push(id);
    this.flush();
    return true;
  },

  get total() { return countable().length; },
  get count() { return countable().filter((e) => this.has(e.id)).length; },
  get complete() { return this.total > 0 && this.count >= this.total; },

  district(id) {
    const all = inDistrict(id);
    const got = all.filter((e) => this.has(e.id)).length;
    return { got, total: all.length, done: all.length > 0 && got === all.length };
  },

  /** Returns the achievement the first time it is earned, else null. */
  award(id) {
    if (this.state.awards.includes(id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    this.state.awards.push(id);
    this.flush();
    return a;
  },
  earned(id) { return this.state.awards.includes(id); },

  set(key, value) { this.state[key] = value; this.flush(); },
  get(key) { return this.state[key]; },

  setTaxiBest(n) {
    if (n <= this.state.taxiBest) return false;
    this.state.taxiBest = n; this.flush();
    return true;
  },
};
