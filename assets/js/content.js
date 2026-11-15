/* =========================================================================
   content.js — the page's own HTML is the content.

   Every `[data-entry]` element in index.html is one entry. The portfolio
   page shows them in place; the game looks them up here by id and clones
   them into its panels. There is no second copy of the text anywhere, so the
   page and the world cannot drift apart.
   ========================================================================= */

import { REPOS } from './repos.js';

export const DISTRICTS = [
  { id: 'hub',         name: 'The Crossroads',  sub: 'Start here',            color: '#7fd4a8' },
  { id: 'arcade',      name: 'The Arcade',      sub: 'Games',                 color: '#ff7ac8' },
  { id: 'foundry',     name: 'The Foundry',     sub: 'Day job',               color: '#ffb454' },
  { id: 'observatory', name: 'The Observatory', sub: 'Machine learning',      color: '#a99bff' },
  { id: 'vault',       name: 'The Terminal',    sub: 'Web, data and tools',   color: '#6ee7a0' },
  { id: 'archive',     name: 'The Archive',     sub: 'Background',            color: '#e6c56a' },
  { id: 'workshop',    name: 'The Workshop',    sub: 'How this was made',     color: '#ff6b81' },
];

export const district = (id) => DISTRICTS.find((d) => d.id === id);

/* Repository groupings shown as link lists. */
export const LISTS = {
  fccdb: ['boilerplate-from-bash', 'five-bash-scripts', 'celestial-bodies-database', 'mario-database',
          'student-database', 'worldcup-database', 'kitty-ipsum-translator', 'bike-rental-bash',
          'salon-appointment-scheduler', 'nano-castle', 'sql-reference', 'periodic-table-database',
          'number-guessing-game'],
  fccweb: ['survey-form', 'tribute-page', 'technical-documentation-page', 'product-landing-page',
           'personal-portfolio-webpage', 'palindrome-checker', 'roman-numeral-converter',
           'phone-number-validator', 'cash-register', 'rpg-creature-search'],
  scripts: ['checking-history-analyzer', 'text-cleaner-kjv', 'instagram-reddit-bot', 'sudoku-solver'],
  early: ['assorted-java-exercises', 'snake-game', 'c-hash-function-coursework',
          'c-python-first-coursework', 'in-class-exercise-collection', 'sql-database-project',
          'RDBMS-midterm-Project', 'bootstrap-group-coursework', 'portfolio-website', 'hello'],
};

export const ACHIEVEMENTS = [
  { id: 'first',       name: 'First fragment',      desc: 'Collect your first fragment.' },
  { id: 'arcade',      name: 'Arcade cleared',      desc: 'Collect every fragment in The Arcade.' },
  { id: 'foundry',     name: 'Foundry cleared',     desc: 'Collect every fragment in The Foundry.' },
  { id: 'observatory', name: 'Observatory cleared', desc: 'Collect every fragment in The Observatory.' },
  { id: 'vault',       name: 'Terminal cleared',    desc: 'Collect every fragment in The Terminal.' },
  { id: 'archive',     name: 'Archive cleared',     desc: 'Collect every fragment in The Archive.' },
  { id: 'played',      name: 'Hands on',            desc: 'Start one of the playable builds.' },
  { id: 'shell',       name: 'Shell access',        desc: 'Run a command in the terminal.' },
  { id: 'crate',       name: 'Through, not around', desc: 'Roll through a crate.' },
  { id: 'pet',         name: 'Good company',        desc: 'Pet the cat.' },
  { id: 'taxi',        name: 'Street smart',        desc: 'Score 300 in Taxi Cat.' },
  { id: 'all',         name: 'Everything',          desc: 'Collect every fragment. The Workshop opens.' },
];

const repoByName = Object.fromEntries(REPOS.map((r) => [r.name, r]));
export const repo = (name) => repoByName[name];
export const repoList = (key) => (LISTS[key] || []).map(repo).filter(Boolean);

let cache = null;

/** All entries, in page order. */
export function entries() {
  if (cache) return cache;
  cache = [...document.querySelectorAll('[data-entry]')].map((el) => {
    const t = el.querySelector('.e-title');
    const m = el.querySelector('.e-meta');
    return {
      id: el.id,
      el,
      title: t ? t.textContent.trim() : el.id,
      meta: m ? m.textContent.trim() : '',
      district: el.dataset.district || '',
      kind: el.dataset.kind || 'project',
      embed: el.dataset.embed || '',
      list: el.dataset.list || '',
    };
  });
  return cache;
}

export const entry = (id) => entries().find((e) => e.id === id) || null;

/** Entries that count toward completion: everything outside the reward room. */
export const countable = () => entries().filter((e) => e.district && e.district !== 'workshop');

export const inDistrict = (id) => entries().filter((e) => e.district === id);
