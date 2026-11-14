/* =========================================================================
   site.js — behaviour for the portfolio page itself.
   Everything here is enhancement: the page reads fine without it.
   ========================================================================= */

import { ui, mountRepoBrowser, esc } from './ui.js';
import { entries, repoList } from './content.js';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initSite() {
  /* Cards open a detail panel. The title becomes the link, stretched over
     the whole card; real links inside the card stay real links. */
  for (const e of entries()) {
    const card = e.el;
    if (!card.classList.contains('card')) continue;
    const title = card.querySelector('.e-title');
    title.innerHTML = `<a class="e-open" href="#project/${esc(e.id)}">${title.innerHTML}</a>`;
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.e-links a, .e-links button')) return;
      ev.preventDefault();
      ui.openEntry(e.id);
    });
  }

  /* "Play in browser" links start the build in place instead of leaving. */
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#sheet')) return;         // the sheet handles its own
    const emb = ev.target.closest('[data-embed-open]');
    if (emb) {
      const card = emb.closest('[data-entry]');
      if (card && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) { ev.preventDefault(); ui.openEntry(card.id, { play: true }); }
      return;
    }
    if (ev.target.closest('[data-minigame]')) { ev.preventDefault(); ui.openArcade(); }
  });

  /* Gameplay captures stay still until asked: on hover for most cards, and
     when scrolled into view for the featured one. */
  const play = (img) => { if (!reducedMotion() && img.dataset.anim) img.src = img.dataset.anim; };
  const still = (img) => { if (img.dataset.poster) img.src = img.dataset.poster; };
  for (const img of document.querySelectorAll('main img[data-anim]')) {
    img.dataset.poster = img.getAttribute('src');
    const card = img.closest('.card');
    if (!card) continue;
    if (card.classList.contains('card-wide') && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => (en.isIntersecting ? play(img) : still(img)), { threshold: 0.35 }).observe(card);
    } else {
      card.addEventListener('pointerenter', () => play(img));
      card.addEventListener('pointerleave', () => still(img));
    }
  }

  /* Filter chips. */
  const filters = document.querySelector('.filters');
  if (filters) {
    filters.hidden = false;
    filters.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (!chip) return;
      const f = chip.dataset.filter;
      for (const c of filters.querySelectorAll('.chip')) {
        const on = c === chip;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', String(on));
      }
      for (const card of document.querySelectorAll('.cards .card')) {
        card.hidden = !(f === 'all' || (card.dataset.tags || '').split(' ').includes(f));
      }
    });
  }

  /* Repository link lists and the full searchable list. */
  for (const ul of document.querySelectorAll('ul.repo-links[data-list]')) {
    ul.innerHTML = repoList(ul.dataset.list).map((r) =>
      `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></li>`).join('');
  }
  const browser = document.querySelector('main [data-repos]');
  if (browser) mountRepoBrowser(browser);
}
