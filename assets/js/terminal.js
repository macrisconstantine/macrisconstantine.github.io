/* =========================================================================
   terminal.js — a small but genuinely working shell.

   Virtual filesystem, command parsing, tab completion, history. Not a
   scripted fake: it will tell you when you get it wrong.
   ========================================================================= */

import { PROFILE, SKILLS, ENTRIES } from './data.js';
import { REPOS } from './repos.js';
import { save } from './save.js';
import { esc } from './ui.js';

const FS = {
  'README.md': `Constantine Macris — ${PROFILE.title}
${PROFILE.location}

${PROFILE.blurb}

Try: ls, cat about/bio.txt, skills, projects, contact, help`,

  about: {
    'bio.txt': `${PROFILE.longBlurb}

Born into three countries' worth of moving around: high school between
Masaka, Uganda and Chicago; a computer science degree in Athens; now
Chicago again, with a Georgia Tech master's running in the background.

English natively, Greek proficiently, and C# when nobody is listening.`,

    'now.txt': `Software Developer at Gecko Software LLC, Chicago — since Nov 2024.
Lead contributor on two production ASP.NET/VB.NET applications.
89 tracked tickets and 223 commits in the year to October 2026.

Also: M.S. Computer Science at Georgia Tech (OMSCS), ML specialisation.
CS 7646 done. CS 7641 in progress. Part-time, around the job.`,

    'interests.txt': `Software development · machine learning · game development
philosophy · chess · art · music · tennis · facts

The "facts" one is on the résumé. It stays on the résumé.`,
  },

  projects: {
    'pots-of-pottimea.md': `2D action RPG · Unity, C# · 2022
39 C# scripts. Movement and animation state machines, enemy AI, health
and damage, destructibles, projectiles, menus, and NPC navigation via the
A* Pathfinding Project. Built solo over one semester.
→ github.com/macrisconstantine/pots-of-pottimea`,

    'companion.md': `Capstone · a language model inside the RPG · 2024
Replaced the companion NPC's dialogue tree with OpenHermes-2.5-Mistral-7B,
quantised to Q4_K_M, served through llamafile and wired in with LLMUnity.
Live quest and inventory state fed into the prompt. Runs entirely on the
player's machine — no API key, no network call.
→ github.com/macrisconstantine/capstone-companion`,

    'taxi-cat.md': `Android arcade game · Java, Android SDK · 2023
Published to the Google Play Store and still live. Character
customisation, persistent high-score leaderboard. Signing, release
config, store listing, review — the whole way to shipped.
→ play.google.com/store/apps/details?id=edu.acg.taxidodger`,

    'depression-detection.md': `Honors thesis · Python, Keras, Django · 2023-24
Access to the restricted DAIC-WOZ clinical corpus. 189 interviews,
283k words. LSTM classifiers over GloVe embeddings predicting PHQ-8
severity, benchmarked against Mistral 7B Instruct and WizardLM 13B run
locally. Django front end for live comparison.
→ github.com/macrisconstantine/depression-detection-thesis`,

    'estimator.md': `Price estimator rewrite · production · 2026
Scored leave-one-out against 229 hand-priced historical quotes.
  coverage        63%  ->  97%
  median error   275%  ->  13%
  within 25%       2%  ->  71%
Found a local variable shadowing a same-named function that had been
returning blank estimates for the life of the app domain.`,
  },

  work: {
    'gecko-software.txt': `Software Developer · Chicago, IL · Nov 2024 - present

Lead contributor on two production ASP.NET/VB.NET applications on SQL
Server. 89 tickets, 223 commits in the year to Oct 2026 — about two
thirds of the team's output.

- Built a quote-to-approval system from nothing. ~10,500 lines, the
  largest single feature in the platform.
- Rebuilt the price estimator and scored it honestly. See
  projects/estimator.md.
- Slowest screen in daily use: 8.3s -> 1.6s.
- Home page: ~49 SQL round trips per load -> ~16.`,

    'before.txt': `2021-2024  Deree, The American College of Greece, Athens
           Computer labs assistant; student affairs liaison;
           orientation leader.

2020-2023  Hellenic Ministries, Athens (summers)
           Warehouse manager. Teams of 10-35 volunteers, 20-60 pallets
           of literature packets per 16-day push. Up to 170,000 packets.
           Not a software job. Best thing here for proving he can run a
           plan with other people in it.`,
  },

  education: {
    'gatech.txt': `M.S. Computer Science — Georgia Institute of Technology (OMSCS)
Jan 2026 - 2029 · Machine Learning specialisation · part-time

Completed:   CS 7646  Machine Learning for Trading
In progress: CS 7641  Machine Learning`,

    'deree.txt': `B.Sc. Information Technology, Software Development
Deree — The American College of Greece, Athens · May 2024
Validated by The Open University (UK)
GPA 3.95 / 4.00 · Honors programme

Honors thesis: detecting depression from clinical interview transcripts.`,
  },

  '.secret': {
    'note.txt': `You went looking. Good instinct.

The whole site is hand-written: no framework, no build step, no
dependencies, no image files. Every sprite you have walked past is pixel
art stored as text and painted to a canvas at load.

Try the konami code out in the world.`,
  },
};

const HELP = [
  ['help', 'this list'],
  ['ls [path]', 'list a directory'],
  ['cd <path>', 'change directory (.. goes up)'],
  ['cat <file>', 'print a file'],
  ['tree', 'the whole filesystem at once'],
  ['pwd', 'where you are'],
  ['whoami', 'who he is, briefly'],
  ['skills', 'the skills index'],
  ['projects', 'headline projects'],
  ['repos [term]', 'search all 58 public repositories'],
  ['stats', 'the numbers'],
  ['contact', 'how to reach him'],
  ['resume', 'switch to the plain résumé'],
  ['clear', 'clear the screen'],
  ['exit', 'leave the terminal'],
];

export class Terminal {
  constructor(game) {
    this.game = game;
    this.cwd = [];
    this.history = [];
    this.hIndex = -1;
  }

  node(path) {
    let n = FS;
    for (const p of path) {
      if (!n || typeof n !== 'object' || !(p in n)) return null;
      n = n[p];
    }
    return n;
  }

  resolve(arg) {
    const abs = arg.startsWith('/');
    let parts = abs ? [] : [...this.cwd];
    for (const seg of arg.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts;
  }

  open() {
    const html = `
      <header class="card-head">
        <div><h2>Terminal</h2><p class="sub">it parses what you type · <code>help</code> to start</p></div>
        <button class="x" data-close aria-label="Close">×</button>
      </header>
      <div class="term" id="term">
        <div class="term-out" id="term-out" aria-live="polite"></div>
        <form class="term-in" id="term-form" autocomplete="off">
          <span class="term-ps1" id="term-ps1">~$</span>
          <input type="text" id="term-cmd" spellcheck="false" autocapitalize="off"
                 autocorrect="off" aria-label="Terminal input">
        </form>
      </div>`;

    const body = this.game.ui.openModal(html, 'terminal');
    this.out = body.querySelector('#term-out');
    this.input = body.querySelector('#term-cmd');
    this.ps1 = body.querySelector('#term-ps1');
    const form = body.querySelector('#term-form');

    this.print(`macris-overworld 1.0 · ${new Date().getFullYear()}`, 'dim');
    this.print(`Type <b>help</b> for commands. Tab completes. ↑ recalls.`, 'dim');
    this.print('');

    form.addEventListener('submit', (e) => {
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
        if (this.hIndex > 0) this.hIndex--; else this.hIndex = -1;
        this.input.value = this.hIndex < 0 ? '' : this.history[this.history.length - 1 - this.hIndex];
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
      }
    });

    body.querySelector('.term').addEventListener('click', () => this.input.focus());
    setTimeout(() => this.input.focus(), 80);
  }

  print(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'term-line ' + cls;
    d.innerHTML = html;
    this.out.appendChild(d);
    this.out.scrollTop = this.out.scrollHeight;
  }

  prompt() { return (this.cwd.length ? '~/' + this.cwd.join('/') : '~') + '$'; }

  complete() {
    const v = this.input.value;
    const m = v.match(/^(\s*\w+\s+)(\S*)$/);
    if (!m) {
      const cmds = HELP.map((h) => h[0].split(' ')[0]);
      const hit = cmds.filter((c) => c.startsWith(v.trim()));
      if (hit.length === 1) this.input.value = hit[0] + ' ';
      return;
    }
    const dir = this.node(this.cwd);
    if (!dir || typeof dir !== 'object') return;
    const hit = Object.keys(dir).filter((k) => k.startsWith(m[2]));
    if (hit.length === 1) this.input.value = m[1] + hit[0];
    else if (hit.length > 1) this.print(hit.join('   '), 'dim');
  }

  run(raw) {
    const line = raw.trim();
    this.print(`<span class="term-ps1">${esc(this.prompt())}</span> ${esc(raw)}`, 'echo');
    if (line) { this.history.push(line); this.hIndex = -1; }
    if (!line) return;

    save.award('cli') && this.game.achievement('cli');

    const [cmd, ...args] = line.split(/\s+/);
    const arg = args.join(' ');
    const fn = this['cmd_' + cmd];

    if (fn) { fn.call(this, args, arg); }
    else if (cmd === 'sudo') { this.cmd_sudo(args, arg); }
    else {
      this.print(`${esc(cmd)}: command not found`, 'err');
      const near = HELP.map((h) => h[0].split(' ')[0]).find((c) => c.startsWith(cmd[0]));
      if (near) this.print(`did you mean <b>${esc(near)}</b>?`, 'dim');
    }
    this.ps1.textContent = this.prompt();
    this.out.scrollTop = this.out.scrollHeight;
  }

  /* ------------------------------- commands ----------------------------- */

  cmd_help() {
    this.print('<b>commands</b>');
    for (const [c, d] of HELP) this.print(`  <span class="term-cmd">${esc(c.padEnd(16))}</span><span class="dim">${esc(d)}</span>`);
    this.print('');
    this.print('there are a few things in here that are not on this list.', 'dim');
  }

  cmd_ls(args) {
    const target = args[0] ? this.resolve(args[0]) : this.cwd;
    const n = this.node(target);
    if (n === null) return this.print(`ls: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'string') return this.print(esc(args[0]));
    const keys = Object.keys(n);
    if (!keys.length) return;
    this.print(keys.map((k) => typeof n[k] === 'object'
      ? `<span class="term-dir">${esc(k)}/</span>`
      : `<span class="term-file">${esc(k)}</span>`).join('   '));
  }

  cmd_cd(args) {
    if (!args[0] || args[0] === '~' || args[0] === '/') { this.cwd = []; return; }
    const target = this.resolve(args[0]);
    const n = this.node(target);
    if (n === null) return this.print(`cd: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'string') return this.print(`cd: ${esc(args[0])}: not a directory`, 'err');
    this.cwd = target;
  }

  cmd_cat(args) {
    if (!args[0]) return this.print('cat: what file?', 'err');
    const n = this.node(this.resolve(args[0]));
    if (n === null) return this.print(`cat: ${esc(args[0])}: no such file or directory`, 'err');
    if (typeof n === 'object') return this.print(`cat: ${esc(args[0])}: is a directory`, 'err');
    this.print(`<pre>${esc(n)}</pre>`);
  }

  cmd_pwd() { this.print('/' + this.cwd.join('/')); }

  cmd_tree() {
    const walk = (n, depth, prefix) => {
      const keys = Object.keys(n);
      keys.forEach((k, i) => {
        const last = i === keys.length - 1;
        const isDir = typeof n[k] === 'object';
        this.print(`${esc(prefix)}${last ? '└── ' : '├── '}<span class="${isDir ? 'term-dir' : 'term-file'}">${esc(k)}${isDir ? '/' : ''}</span>`);
        if (isDir && depth < 3) walk(n[k], depth + 1, prefix + (last ? '    ' : '│   '));
      });
    };
    this.print('<span class="term-dir">.</span>');
    walk(FS, 0, '');
  }

  cmd_whoami() {
    this.print(`<b>${esc(PROFILE.name)}</b>`);
    this.print(esc(PROFILE.title) + ' · ' + esc(PROFILE.location));
    this.print('');
    this.print(esc(PROFILE.tagline), 'dim');
  }

  cmd_skills() {
    for (const g of SKILLS) {
      this.print(`<b>${esc(g.group)}</b>`);
      this.print('  ' + g.items.map((i) => `<span class="term-tag">${esc(i)}</span>`).join(' '));
    }
  }

  cmd_projects() {
    const feat = Object.entries(ENTRIES).filter(([, e]) => e.featured);
    for (const [, e] of feat) {
      this.print(`<span class="term-cmd">${esc(e.title)}</span>`);
      this.print(`  <span class="dim">${esc(e.sub || '')}</span>`);
    }
    this.print('');
    this.print('cat projects/*.md for the longer versions.', 'dim');
  }

  cmd_repos(args) {
    const term = (args.join(' ') || '').toLowerCase();
    const hits = REPOS.filter((r) => !term || r.name.toLowerCase().includes(term) || (r.desc || '').toLowerCase().includes(term));
    if (!hits.length) return this.print(`no repository matches "${esc(term)}"`, 'err');
    this.print(`${hits.length} of ${REPOS.length} repositories${term ? ` matching "${esc(term)}"` : ''}`, 'dim');
    for (const r of hits.slice(0, 60)) {
      this.print(`  <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="term-cmd">${esc(r.name.padEnd(30))}</a><span class="dim">${esc(r.lang || '')}</span>`);
    }
    if (hits.length > 60) this.print(`  … and ${hits.length - 60} more`, 'dim');
  }

  cmd_stats() {
    const langs = {};
    for (const r of REPOS) if (r.lang) langs[r.lang] = (langs[r.lang] || 0) + 1;
    const top = Object.entries(langs).sort((a, b) => b[1] - a[1]);
    this.print(`<b>public repositories</b>  ${REPOS.length}`);
    this.print(`<b>first commit</b>         ${REPOS.map((r) => r.created).sort()[0]}`);
    this.print(`<b>published apps</b>       1 (Google Play)`);
    this.print(`<b>live builds</b>          ${REPOS.filter((r) => r.pages || r.home).length}`);
    this.print('');
    this.print('<b>languages</b>');
    const max = top[0][1];
    for (const [l, n] of top) {
      const bar = '█'.repeat(Math.max(1, Math.round((n / max) * 24)));
      this.print(`  ${esc(l.padEnd(12))}<span class="term-bar">${bar}</span> <span class="dim">${n}</span>`);
    }
  }

  cmd_contact() {
    this.print(`<b>email</b>     <a href="mailto:${esc(PROFILE.email)}">${esc(PROFILE.email)}</a>`);
    this.print(`<b>github</b>    <a href="${esc(PROFILE.github)}" target="_blank" rel="noopener noreferrer">${esc(PROFILE.github)}</a>`);
    this.print(`<b>linkedin</b>  <a href="${esc(PROFILE.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(PROFILE.linkedin)}</a>`);
    this.print(`<b>play store</b> <a href="${esc(PROFILE.playStore)}" target="_blank" rel="noopener noreferrer">Taxi Cat</a>`);
  }

  cmd_clear() { this.out.innerHTML = ''; }
  cmd_exit() { this.game.ui.closeModal(); }
  cmd_resume() { this.game.ui.closeModal(); this.game.showResume(); }
  cmd_echo(args) { this.print(esc(args.join(' '))); }
  cmd_date() { this.print(new Date().toString()); }
  cmd_uname() { this.print('MacrisOverworld 1.0 canvas2d vanilla-js no-build-step'); }
  cmd_history() { this.history.forEach((h, i) => this.print(`  ${String(i + 1).padStart(3)}  ${esc(h)}`)); }

  /* ------------------------------ easter eggs --------------------------- */

  cmd_sudo(args) {
    const a = save.award('sudo');
    if (a) this.game.achievement('sudo');
    if (args[0] === 'hire' || (args[0] === 'make' && args[1] === 'me')) {
      this.print('that is not how any of this works, but the ambition is noted.', 'dim');
      return this.cmd_contact();
    }
    this.print(`macris is not in the sudoers file. This incident has been reported.`, 'err');
    this.print('(it has not been reported. there is no server.)', 'dim');
  }

  cmd_rm(args) {
    if (args.join(' ').includes('-rf')) {
      this.print('absolutely not.', 'err');
      this.print('he once found a function silently returning blank values for the life of an app domain. caution is earned.', 'dim');
    } else this.print('rm: permission denied (this filesystem is a bluff)', 'err');
  }

  cmd_vim() { this.print('you are already trapped somewhere else. try <b>exit</b>.', 'dim'); }
  cmd_vi() { this.cmd_vim(); }
  cmd_emacs() { this.print('a fine operating system, lacking only a decent editor.', 'dim'); }
  cmd_man(args) {
    if (!args[0]) return this.print('what manual page do you want?', 'err');
    const h = HELP.find((x) => x[0].split(' ')[0] === args[0]);
    this.print(h ? `<b>${esc(args[0])}</b> — ${esc(h[1])}` : `no manual entry for ${esc(args[0])}`, h ? '' : 'err');
  }
  cmd_xyzzy() { this.print('nothing happens.', 'dim'); }
  cmd_fortune() {
    const f = [
      'Profile before you optimise, or you will spend a week tuning the wrong thing.',
      'The best outcome of a rewrite is a bug you did not know you had.',
      'Knowing when not to reach for a model is the senior move.',
      'A portfolio that only shows the hits is a sales page.',
      'Shipping is its own skill.',
    ];
    this.print(f[Math.floor(Math.random() * f.length)], 'dim');
  }
  cmd_hello() { this.print('hello. the first repository on the account is also called that. September 2021.', 'dim'); }
  cmd_ping() { this.print('there is no server to ping. this whole site is static files.', 'dim'); }
  cmd_top() { this.print('  PID  COMMAND\n    1  requestAnimationFrame\n    2  a cat, idling', 'dim'); }
}
