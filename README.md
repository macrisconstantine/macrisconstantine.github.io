# macrisconstantine.github.io

My portfolio: **https://macrisconstantine.github.io**

It is a normal portfolio page — work, experience, education — whose hero is a
small game you can step into. Press **Play** and the page becomes a top-down
world in which every project on the page is something you can walk up to.
Several of the games in it run right there in the browser.

## How it is put together

- **Hand-written HTML, CSS and JavaScript modules.** No framework, no bundler,
  no build step; the repository is the site.
- **The page is the content.** Every project, role and course is an element in
  `index.html` marked `data-entry`. The page shows them in place; the game
  looks them up by id and clones them into its panels; the terminal builds its
  files from the same text. There is one copy of every sentence, so the three
  views cannot disagree, and the page reads correctly with JavaScript off.
- **The world is drawn in code.** Sprites are written as text in
  `assets/js/sprites.js` and painted to off-screen canvases at load. Rooms are
  small text maps in `assets/js/world.js`; floors and walls are painted once
  per room from a seeded generator, then lit each frame by cutting pools of
  light out of a darkness layer.
- **Whole-pixel scaling.** The canvas is always scaled by a whole number of
  device pixels, and the amount of world on show adapts to the window instead.
- **Real media for real projects.** Gameplay captures and screenshots live in
  `assets/media`. The Taxi Cat cabinet is drawn with the original sprites from
  the Android game.
- **Sound is synthesised** with the Web Audio API. Progress is kept in
  `localStorage`; there is no tracking of any kind.

## Layout

```
index.html                 the page, and all of the content
assets/css/site.css        the portfolio page (and its print stylesheet)
assets/css/game.css        play mode: HUD, journal, terminal, touch controls
assets/js/
  main.js                  boot, and switching between page and game
  site.js                  page behaviour: cards, filters, repository list
  content.js               reads entries from the page; districts; achievements
  ui.js                    the panel that shows an entry; journal; HUD
  game.js                  movement, lighting, rendering, interaction
  engine.js                screen scaling, input, camera, particles, audio
  world.js                 room maps, themes, floor and wall painting
  sprites.js               pixel art and the bitmap font, as text
  terminal.js              the shell
  taxi.js                  the Taxi Cat cabinet
  save.js                  progress
  repos.js                 repository list, baked from the GitHub API
assets/media/              gameplay captures, screenshots, Taxi Cat sprites
tests/run.js               regression suite
tools/headless.py          drives headless Chrome: screenshots, tests
tools/build_media.py       turns raw captures into assets/media
```

## Running it

Any static file server will do:

```bash
python .claude/devserver.py 8099
```

Then open http://localhost:8099. `devserver.py` is `http.server` with caching
switched off, which is useful while editing.

## Tests

The suite runs against the real page in a headless browser, pressing real keys
and clicking the real canvas, and steps the simulation by hand so that results
do not depend on frame timing:

```bash
python tools/headless.py test "http://localhost:8099/?test"
```

It needs Chrome or Edge and the `websocket-client` Python package. It checks
that the page and the world agree about what exists, that every room can be
walked, and the feel of the controls: walk, run and roll speeds; that Space
only ever rolls and never opens anything; that E and a click interact; that
whatever opened a panel also closes it. Opening `/?test` in a normal browser
runs the same suite and logs to the console (it resets saved progress).

`tools/headless.py shot <url> <file.png>` takes screenshots the same way.

## Printing

Printing the page gives a plain résumé: the stylesheet drops the game, the
pictures and the navigation and sets the text in reading order.

## Licence

Code is MIT (see `LICENSE`). The writing, the screenshots and the game art are
© Constantine Macris.
