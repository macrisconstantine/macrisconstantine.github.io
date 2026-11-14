/* =========================================================================
   terminal.js — a small working shell over the site's content.

   The filesystem is built from the page itself: every file is the text of an
   entry in index.html, so the terminal can never say something the page
   does not.
   ========================================================================= */

import { entries, entry, repoList } from './content.js';
import { REPOS } from './repos.js';
import { esc } from './ui.js';

const PLACE = {
  'about-me': 'about/me.txt', 'contact-me': 'about/contact.txt', colophon: 'about/this-site.txt',
  gecko: 'work/gecko-software.txt', quotes: 'work/quote-system.txt', estimator: 'work/price-estimator.txt',
  performance: 'work/performance.txt', earlier: 'work/earlier-roles.txt',
  gatech: 'education/georgia-tech.txt', deree: 'education/deree.txt',
};

/** An entry as plain text. */
function textOf(e) {
  const el = e.el, out = [];
  const line = (sel) => { const n = el.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
  out.push(e.title);
  if (e.meta) out.push(e.meta);
  out.push('');
  const sum = line('.e-summary');
  if (sum) out.push(sum, '');
  el.querySelectorAll('.stat').forEach((s) => {
    const b = s.querySelector('b'), old = b.querySelector('s');
    const now = [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    out.push(`  ${old ? old.textContent.trim() + ' -> ' : ''}${now}  ${s.querySelector('span').textContent.trim()}`);
  });
  el.querySelectorAll('.e-more > p, .e-more li').forEach((n) => {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    out.push(n.tagName === 'LI' ? '- ' + t : t);
  });
  if (e.list) { out.push(''); for (const r of repoList(e.list)) out.push('  ' + r.name); }
  const links = [...el.querySelectorAll('.e-links a[href^="http"], .e-links a[href^="mailto"]')];
  if (links.length) { out.push(''); for (const a of links) out.push(`${a.textContent.trim()}: ${a.getAttribute('href').replace('mailto:', '')}`); }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildFS() {
  const fs = { about: {}, work: {}, projects: {}, education: {}, more: {} };
  for (const e of entries()) {
    if (e.kind === 'terminal' || e.kind === 'repos') continue;
    const path = PLACE[e.id] || (e.kind === 'list' ? `more/${e.id}.txt` : `projects/${e.id}.txt`);
    const [dir, file] = path.split('/');
    fs[dir][file] = textOf(e);
  }
  const skills = [...document.querySelectorAll('#skills > div')].map((d) =>
    `${d.querySelector('dt').textContent.trim()}\n  ${d.querySelector('dd').textContent.replace(/\s+/g, ' ').trim()}`).join('\n\n');
  fs['skills.txt'] = skills;
  const lede = document.querySelector('.lede');
  fs['README.txt'] = `Constantine Macris\n${document.querySelector('.eyebrow').textContent.trim()}\n\n` +
    `${lede.textContent.replace(/\s+/g, ' ').trim()}\n\nTry: ls, cat about/me.txt, tree, projects, repos unity, open pottimea`;
  return fs;
}

const HELP = [
  ['ls [path]', 'list a directory'],
  ['cd <path>', 'change directory (.. goes up)'],
  ['cat <file>', 'print a file'],
  ['tree', 'the whole filesystem'],
  ['projects', 'list the projects'],
  ['open <project>', 'open a project in the page'],
  ['repos [term]', 'search every public repository'],
  ['stats', 'repository statistics'],
  ['whoami', 'who I am, briefly'],
  ['contact', 'how to reach me'],
  ['clear', 'clear the screen'],
  ['exit', 'close the terminal'],
];

class Shell {
  constructor(ui, body) {
    this.ui = ui;
    this.fs = buildFS();
    this.cwd = [];
    this.history = [];
    this.hIndex = -1;
    this.out = body.querySelector('#term-out');
    this.input = body.querySelector('#term-cmd');
    this.ps1 = body.querySelector('#term-ps1');

    body.querySelector('#term-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.input.value;
      this.input.value = '';
      this.run(v);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.hIndex < this.history.length - 1) this.hIndex++;
        this.input.value = this.history[this.history.length - 1 - this.hIndex] || '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.hIndex = Math.max(-1, this.hIndex - 1);
        this.input.value = this.hIndex < 0 ? '' : this.history[this.history.length - 1 - this.hIndex];
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
      }
    });
    body.querySelector('.term').addEventListener('click', () => {
      if (!String(window.getSelection())) this.input.focus();
    });

    this.print('Type <b>help</b> for commands. Tab completes; the up arrow recalls.', 'dim');
    this.print('');
    setTimeout(() => this.input.focus(), 60);
  }

  node(path) {
    let n = this.fs;
    for (const p of path) { if (!n || typeof n !== 'object' || !(p in n)) return null; n = n[p]; }
    return n;
  }

  resolve(arg) {
    const parts = arg.startsWith('/') || arg.startsWith('~') ? [] : [...this.cwd];
    for (const seg of arg.replace(/^~\/?/, '').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop(); else parts.push(seg);
    }
    return parts;
  }

  print(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'term-line ' + cls;
    d.innerHTML = html;
    this.out.appendChild(d);
    this.out.scrollTop = this.out.scrollHeight;
  }

  prompt() { return (this.cwd.length ? '~/' + this.cwd.join('/') : '~') + ' $'; }

  complete() {
    const v = this.input.value;
    const m = v.match(/^(\s*\S+\s+)(\S*)$/);
    if (!m) {
      const hit = Object.keys(COMMANDS).filter((c) => c.startsWith(v.trim()));
      if (hit.length === 1) this.input.value = hit[0] + ' ';
      else if (hit.length > 1) this.print(hit.join('   '), 'dim');
      return;
    }
    const slash = m[2].lastIndexOf('/');
    const base = slash >= 0 ? m[2].slice(0, slash + 1) : '';
    const stem = m[2].slice(slash + 1);
    const pool = m[1].trim() === 'open'
      ? entries().filter((e) => e.kind !== 'terminal').map((e) => e.id)
      : Object.keys(this.node(this.resolve(base || '.')) || {});
    const hit = pool.filter((k) => k.startsWith(stem));
    if (hit.length === 1) {
      const dir = m[1].trim() !== 'open' && typeof this.node(this.resolve(base + hit[0])) === 'object';
      this.input.value = m[1] + base + hit[0] + (dir ? '/' : '');
    } else if (hit.length > 1) this.print(hit.join('   '), 'dim');
  }

  run(raw) {
    const line = raw.trim();
    this.print(`<span class="term-ps1">${esc(this.prompt())}</span> ${esc(raw)}`, 'echo');
    if (!line) return;
    this.history.push(line);
    this.hIndex = -1;
    this.ui.award('shell');
    const [cmd, ...args] = line.split(/\s+/);
    const fn = COMMANDS[cmd];
    if (fn) fn.call(this, args);
    else {
      this.print(`${esc(cmd)}: command not found`, 'err');
      const near = Object.keys(COMMANDS).find((c) => c[0] === cmd[0]);
      if (near) this.print(`Did you mean <b>${esc(near)}</b>?`, 'dim');
    }
    this.ps1.textContent = this.prompt();
    this.out.scrollTop = this.out.scrollHeight;
  }
}

const COMMANDS = {
  help() {
    for (const [c, d] of HELP) this.print(`  <span class="t-cmd">${esc(c.padEnd(17))}</span><span class="dim">${esc(d)}</span>`);
  },
  ls(args) {
    const n = this.node(args[0] ? this.resolve(args[0]) : this.cwd);
    if (n === null) return this.print(`ls: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'string') return this.print(esc(args[0]));
    this.print(Object.keys(n).map((k) => typeof n[k] === 'object'
      ? `<span class="t-dir">${esc(k)}/</span>` : esc(k)).join('   '));
  },
  cd(args) {
    if (!args[0] || args[0] === '~' || args[0] === '/') { this.cwd = []; return; }
    const target = this.resolve(args[0]), n = this.node(target);
    if (n === null) return this.print(`cd: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'string') return this.print(`cd: ${esc(args[0])}: not a directory`, 'err');
    this.cwd = target;
  },
  cat(args) {
    if (!args[0]) return this.print('cat: which file?', 'err');
    const n = this.node(this.resolve(args[0]));
    if (n === null) return this.print(`cat: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'object') return this.print(`cat: ${esc(args[0])}: is a directory`, 'err');
    this.print(`<pre>${esc(n)}</pre>`);
  },
  pwd() { this.print('/' + this.cwd.join('/')); },
  tree() {
    const walk = (n, prefix) => {
      const keys = Object.keys(n);
      keys.forEach((k, i) => {
        const last = i === keys.length - 1, dir = typeof n[k] === 'object';
        this.print(`${esc(prefix)}${last ? '└── ' : '├── '}${dir ? `<span class="t-dir">${esc(k)}/</span>` : esc(k)}`);
        if (dir) walk(n[k], prefix + (last ? '    ' : '│   '));
      });
    };
    this.print('<span class="t-dir">~</span>');
    walk(this.fs, '');
  },
  whoami() { this.print(`<pre>${esc(this.fs['README.txt'].split('\n\nTry:')[0])}</pre>`); },
  projects() {
    for (const e of entries()) {
      if (e.kind !== 'project' && e.kind !== 'minigame') continue;
      if (!this.fs.projects[e.id + '.txt']) continue;
      this.print(`  <span class="t-cmd">${esc(e.id.padEnd(16))}</span>${esc(e.title)}`);
    }
    this.print('');
    this.print('cat projects/&lt;name&gt;.txt to read one, or open &lt;name&gt; to see it in the page.', 'dim');
  },
  open(args) {
    const e = entry(args[0]);
    if (!e || e.kind === 'terminal') return this.print(`open: ${esc(args[0] || '')}: no such project. Try <b>projects</b>.`, 'err');
    this.ui.openEntry(e.id);
  },
  repos(args) {
    const term = args.join(' ').toLowerCase();
    const hits = REPOS.filter((r) => !term || r.name.toLowerCase().includes(term) ||
      (r.desc || '').toLowerCase().includes(term) || (r.lang || '').toLowerCase() === term);
    if (!hits.length) return this.print(`No repository matches "${esc(term)}".`, 'err');
    this.print(`${hits.length} of ${REPOS.length} repositories${term ? ` matching "${esc(term)}"` : ''}`, 'dim');
    for (const r of hits.slice(0, 60)) {
      this.print(`  <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name.padEnd(32))}</a><span class="dim">${esc(r.lang || '')}</span>`);
    }
  },
  stats() {
    const langs = {};
    for (const r of REPOS) if (r.lang) langs[r.lang] = (langs[r.lang] || 0) + 1;
    const top = Object.entries(langs).sort((a, b) => b[1] - a[1]);
    this.print(`<b>public repositories</b>  ${REPOS.length}`);
    this.print(`<b>first repository</b>     ${REPOS.map((r) => r.created).sort()[0]}`);
    this.print('');
    for (const [l, n] of top) {
      this.print(`  ${esc(l.padEnd(12))}<span class="t-bar">${'█'.repeat(Math.max(1, Math.round((n / top[0][1]) * 24)))}</span> <span class="dim">${n}</span>`);
    }
  },
  contact() { this.print(`<pre>${esc(this.fs.about['contact.txt'])}</pre>`); },
  clear() { this.out.innerHTML = ''; },
  exit() { this.ui.close(); },
  echo(args) { this.print(esc(args.join(' '))); },
  date() { this.print(esc(new Date().toString())); },
  history() { this.history.forEach((h, i) => this.print(`  ${String(i + 1).padStart(3)}  ${esc(h)}`)); },
  sudo() { this.print('Permission denied. This shell is read-only.', 'err'); },
};

export function openTerminal(ui) {
  const body = ui.show('terminal', `
    <div class="sheet-head">
      <h2 id="sheet-title">Terminal</h2>
      <p>A small shell over this site's content. Start with <code>help</code>.</p>
    </div>
    <div class="sheet-body">
      <div class="term">
        <div class="term-out" id="term-out" aria-live="polite"></div>
        <form class="term-in" id="term-form" autocomplete="off">
          <span class="term-ps1" id="term-ps1">~ $</span>
          <input type="text" id="term-cmd" spellcheck="false" autocapitalize="off" autocorrect="off" aria-label="Command">
        </form>
      </div>
    </div>`);
  return new Shell(ui, body);
}
