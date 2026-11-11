# macrisconstantine.github.io

My portfolio. It is a small explorable world — six districts, twenty-nine
things I actually built — with a plain résumé one keypress away.

**Live:** https://macrisconstantine.github.io

## What is in here

- **The Arcade** — games, several of them playable in the page. The cabinets
  are real `<iframe>`s pointing at the real GitHub Pages builds of the real
  projects, not screenshots.
- **The Foundry** — production ASP.NET / VB.NET work, with the numbers.
- **The Observatory** — the honors thesis, the local-LLM companion, OMSCS.
- **The Terminal** — a working shell. `help`, `ls`, `cat`, `stats`, and a few
  things that are not in the help text.
- **The Archive** — all 58 public repositories, searchable.
- **The Workshop** — locked until you have collected everything.

Press <kbd>R</kbd> at any point for the plain résumé. That version is the
actual HTML of the page: it works with JavaScript switched off, reads
correctly in a screen reader, and prints to a clean document.

## How it is built

- Hand-written HTML, CSS and ES modules. **No framework, no build step, no
  bundler, no dependencies, nothing to install.**
- The world renders to one `<canvas>` and scales up with nearest-neighbour
  filtering. The render target changes shape with the window, so a phone in
  portrait gets a tall view rather than a letterboxed strip.
- **Every sprite is pixel art authored as text** in `assets/js/sprites.js` and
  painted to an off-screen canvas at load, with the outlines added
  programmatically. There are no image assets in the world at all — the only
  image in the repository is the social preview card. The tilemaps come from a
  compact room spec and a seeded PRNG, so the scatter is random-looking but
  identical for everyone.
- Movement has momentum. Hold <kbd>Shift</kbd> to run; <kbd>Space</kbd>
  rolls when nothing is in reach. Chained rolls average about 1.45x running
  speed, because you keep your momentum coming out of each one — a roll that
  left you slower than walking was a roll nobody would ever use. Rolling into
  a crate goes straight through it.
- Music and sound effects are synthesised live with the Web Audio API.
- No analytics, no cookies, no tracking. Progress is saved in `localStorage`
  and goes nowhere else.

## Layout

```
index.html              the page, and the full résumé as real markup
assets/css/style.css
assets/js/
  main.js               boot and mode switching
  game.js               the loop: movement, rendering, interaction
  engine.js             screen, input, camera, particles, audio
  world.js              the six districts and the tile generator
  sprites.js            all pixel art, as text
  data.js               every piece of content, in one place
  repos.js              the GitHub repo list, baked in at build time
  ui.js                 dialogue, cards, the archive, the HUD, the map
  terminal.js           the shell
  taxi.js               the Taxi Cat minigame
  save.js               progress, XP, achievements
```

`data.js` is the single source of truth: the explorable world and the plain
résumé render from the same entries, so they cannot drift apart.

## Running it locally

Any static server will do:

```bash
python -m http.server 8099
```

Then open http://localhost:8099. There is nothing to build.

`.claude/devserver.py` is the same thing with caching disabled, which is
handy while editing.

## Refreshing the repository list

`assets/js/repos.js` is generated from the GitHub API so the site needs no
network calls at runtime. To regenerate it:

```bash
curl -s "https://api.github.com/users/macrisconstantine/repos?per_page=100&sort=pushed" -o repos.json
```

…then rewrite `assets/js/repos.js` with the fields it uses: `name`, `desc`,
`lang`, `url`, `home`, `pages`, `stars`, `size`, `created`, `pushed`, `fork`,
`topics`.

## Licence

Code is MIT (see `LICENSE`). The written content, the résumé text and the
pixel art are © Constantine Macris — please do not lift the copy wholesale
for your own portfolio.
