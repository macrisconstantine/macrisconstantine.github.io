/* =========================================================================
   data.js — every piece of content the world and the résumé both read from.
   One source of truth: the explorable world and the plain-text résumé mode
   render the same entries, so nothing can drift out of sync.
   ========================================================================= */

export const PROFILE = {
  name: 'Constantine Macris',
  handle: 'macrisconstantine',
  title: 'Software Developer · Game Developer',
  location: 'Chicago, IL',
  email: 'c.macris@gatech.edu',
  github: 'https://github.com/macrisconstantine',
  linkedin: 'https://www.linkedin.com/in/constantine-macris/',
  playStore: 'https://play.google.com/store/apps/details?id=edu.acg.taxidodger',
  tagline: 'Gameplay systems, and the model behaviour underneath them.',
  blurb:
    'A published Android game. A Unity action RPG whose companion NPC thinks with a 7B ' +
    'language model running on your own machine. An honors thesis that put LSTMs up ' +
    'against local LLMs on clinical interview data. And, by day, lead contributor on two ' +
    'production applications that people depend on to get paid.',
  longBlurb:
    'I build things that have to work and things that have to be fun, and I have come to ' +
    'think those are the same discipline wearing different clothes. The most interesting ' +
    'problems I have found sit where gameplay systems meet model behaviour — where a ' +
    'system has to feel alive and still be debuggable at 2am.',
};

/* -------------------------------------------------------------------------
   DISTRICTS — the five explorable areas plus the hub and the secret room.
   ------------------------------------------------------------------------- */

export const DISTRICTS = [
  { id: 'hub',        name: 'The Crossroads',  sub: 'start here',                      color: '#7fd4a8' },
  { id: 'arcade',     name: 'The Arcade',      sub: 'games · playable in your browser', color: '#ff6ec7' },
  { id: 'foundry',    name: 'The Foundry',     sub: 'production software · by day',     color: '#ff9a3c' },
  { id: 'observatory',name: 'The Observatory', sub: 'machine learning · research',      color: '#9d8cff' },
  { id: 'vault',      name: 'The Terminal',    sub: 'shells · databases · the web',     color: '#52e07a' },
  { id: 'archive',    name: 'The Archive',     sub: 'all 58 repositories · the record', color: '#e0c060' },
  { id: 'workshop',   name: 'The Workshop',    sub: 'locked',                           color: '#ff4d6d' },
];

/* -------------------------------------------------------------------------
   ENTRIES — one per interactable object in the world.

   kind    card | play | list | terminal | minigame | npc | contact
   barks   what the dialogue box says as you walk up, before the card opens
   body    array of paragraphs / bullet blocks for the expanded card
   links   [{label, url, kind}]  kind: primary | repo | live | store | doc
   tags    shown as chips; also feed the résumé skills index
   ------------------------------------------------------------------------- */

export const ENTRIES = {

  /* ===================== THE CROSSROADS ===================== */

  guide: {
    district: 'hub', kind: 'npc', title: 'Pot', icon: 'cat',
    sub: 'a cat of no fixed occupation',
    barks: [
      'Oh good, someone else. Walk with the arrow keys or WASD.',
      '**Hold Shift to run.** **Z or X to roll** — it is faster than running and much more satisfying.',
      'Press E — or Space — next to anything that looks interesting. I will explain it.',
      'Everything here is real. The arcade cabinets run the actual games. The terminal takes actual commands.',
      'I will tag along from here. Press E on me any time you want this again.',
      'If you are in a hurry, hit R. That swaps to the plain résumé — no walking, no pixels, all the same facts.',
    ],
    body: [
      'I am the guide. I do not have a job in the traditional sense.',
      '**Move** with WASD or the arrows. **Hold Shift** to run. **Z or X** rolls you forward in a burst — use it to cross the Crossroads without getting bored.',
      'Six districts. Everything with a glow is worth pressing E on. Collect all the fragments and the locked door at the north end of the Crossroads opens.',
      'Constantine made me. He also built a companion NPC that follows you around a game he wrote, except that one thinks with a 7-billion-parameter language model running on your own machine. See **The Observatory**. I am the budget version and I am at peace with that.',
      'He also made a cat you can actually play as — it is in the Arcade, and it is on the Google Play Store, which is a sentence most side projects never get to say.',
    ],
    tags: ['WASD to move', 'Shift to run', 'Z to roll', 'E to interact', 'R for résumé'],
  },

  monument: {
    district: 'hub', kind: 'card', title: 'Constantine Macris', icon: 'statue',
    sub: 'Software Developer · Game Developer · Chicago, IL',
    barks: ['A carved slab. Someone has been very thorough about the lettering.'],
    body: [
      PROFILE.blurb,
      PROFILE.longBlurb,
      '**Right now:** lead contributor on two production ASP.NET/VB.NET applications at Gecko Software in Chicago, and a Georgia Tech OMSCS student specialising in machine learning.',
      '**Before that:** B.Sc. Information Technology (Software Development) at Deree — The American College of Greece, validated by The Open University, 3.95/4.00, with an honors thesis on detecting depression from clinical interview transcripts.',
      '**Languages:** English (native), Greek (proficient).',
    ],
    links: [
      { label: 'GitHub', url: PROFILE.github, kind: 'repo' },
      { label: 'LinkedIn', url: PROFILE.linkedin, kind: 'primary' },
      { label: 'Email', url: 'mailto:' + PROFILE.email, kind: 'primary' },
    ],
    tags: ['C#', 'Python', 'Java', 'JavaScript', 'SQL', 'VB.NET', 'C', 'Bash'],
  },

  noticeboard: {
    district: 'hub', kind: 'card', title: 'Notice Board', icon: 'sign',
    sub: 'how this works',
    barks: ['Hand-lettered. Mostly legible.'],
    body: [
      '**Move** — arrow keys, WASD, or the stick in the corner on a phone.',
      '**Run** — hold Shift, or push the stick to its edge.',
      '**Roll** — Z, X or Ctrl, or the ↯ button on a phone. A short burst, faster than running, with a brief cooldown.',
      '**Interact** — E or Space when something is glowing. Esc closes anything.',
      '**Résumé mode** — R, or the button top-right. Same content, no game, prints cleanly, works with a screen reader.',
      '**Map and progress** — M. **Music** — comma, or the ♪ button.',
      'Progress saves to this browser only. Nothing is uploaded anywhere; there is no server and no analytics.',
      'Every fragment you collect is one real thing he built. There are no filler rooms.',
    ],
    tags: ['no tracking', 'no server', 'saves locally'],
  },

  /* ===================== THE ARCADE ===================== */

  pottimea: {
    district: 'arcade', kind: 'card', title: 'Pots of Pottimea', icon: 'sword',
    sub: '2D action RPG · Unity, C# · 2022, revisited 2024',
    featured: true,
    barks: [
      'A cabinet with a wooden sword bolted to the side. The marquee reads POTS OF POTTIMEA.',
      '"My favourite project that I have made." — the README, and it shows.',
    ],
    body: [
      'A Zelda-inspired 2D action RPG, built solo in Unity over a single semester for a game programming course.',
      '**39 C# scripts**, covering movement and animation state machines, enemy AI, health and damage handling, destructibles and projectiles, menus and UI, and NPC navigation through the A* Pathfinding Project.',
      'It is the project he came back to. Two years later it became the host body for his capstone — see **The Observatory** for what got installed in its companion NPC.',
      'Windows build; clone or download and run `TheSmasherOfPots.exe`. The repository uses Git LFS for the large resource files, so cloning beats downloading the ZIP.',
    ],
    links: [
      { label: 'Source + build', url: 'https://github.com/macrisconstantine/pots-of-pottimea', kind: 'repo' },
      { label: 'Capstone companion', url: 'https://github.com/macrisconstantine/capstone-companion', kind: 'primary' },
    ],
    tags: ['Unity', 'C#', 'A* Pathfinding', 'state machines', 'enemy AI', 'Git LFS'],
  },

  taxicat: {
    district: 'arcade', kind: 'minigame', game: 'taxi', title: 'Taxi Cat', icon: 'cabinet',
    sub: 'Android arcade game · Java, Android SDK · published 2023',
    featured: true,
    barks: [
      'This cabinet is shorter than the others, and shaped a bit like a phone.',
      'A cat on the screen is being extremely careful about traffic.',
    ],
    body: [
      'A published arcade game, live and free on the Google Play Store since 2023. Built in Android Studio with Java and XML layouts: character customisation, a persistent high-score leaderboard, and escalating waves of oncoming taxis.',
      'It started from a tutorial foundation and then kept going into the part tutorials stop short of — signing, release configuration, writing the store listing, and surviving Play Store review. Shipping is its own skill and this is the proof he has done it.',
      '**The cabinet is playable right now.** This is a small homage he can be blamed for — the real thing is on your phone.',
    ],
    links: [
      { label: 'Google Play', url: PROFILE.playStore, kind: 'store' },
      { label: 'Source + APK', url: 'https://github.com/macrisconstantine/taxi-cat-android-game', kind: 'repo' },
    ],
    tags: ['Android', 'Java', 'XML layouts', 'Play Store release', 'shipped'],
  },

  debunking: {
    district: 'arcade', kind: 'play', title: 'Debunking Physics', icon: 'cabinet',
    sub: 'Unity WebGL · physics sandbox · honors creative project',
    embed: 'https://macrisconstantine.github.io/debunking-pseudoscience/',
    barks: [
      'The screen shows a spaceship and an uncomfortable amount of empty space.',
      'A sticker on the bezel: YOU MAY EDIT THE LAWS OF PHYSICS.',
    ],
    body: [
      'Fly a ship around a solar system whose physical laws you are allowed to edit from the pause menu. Larger planets pull proportionally harder; visiting one hands you a real fact about it.',
      'Made in Unity for the honors course *Debunking Pseudoscience* — the point being that you understand a law best when you are allowed to break it and watch what happens.',
      'Custom particle systems for the thrusters, custom ship lighting, and swappable skyboxes with and without constellation labels.',
      '**Runs in this cabinet.** It is a real Unity WebGL build — give it a moment to load.',
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/debunking-pseudoscience/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/debunking-pseudoscience', kind: 'repo' },
    ],
    tags: ['Unity', 'WebGL', 'physics', 'particle systems', 'playable'],
  },

  falling: {
    district: 'arcade', kind: 'play', title: 'Falling Sand', icon: 'cabinet',
    sub: 'JavaScript · cellular automaton',
    embed: 'https://macrisconstantine.github.io/falling-sand/',
    barks: ['Sand. Falling. Honestly it is exactly what it says.'],
    body: [
      'A falling-sand cellular automaton in plain HTML and JavaScript, inspired by The Coding Train. Drag with the mouse to spawn particles.',
      "The README's TODO list is the honest part, and the reason this cabinet is here: *\"Current code is extremely unoptimized and slows down dramatically after enough sand falls\"* — written by the author, about himself, in public.",
      'Knowing where your code falls over, and saying so out loud, is worth more than pretending it does not.',
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/falling-sand/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/falling-sand', kind: 'repo' },
    ],
    tags: ['JavaScript', 'Canvas', 'cellular automata', 'playable'],
  },

  chess: {
    district: 'arcade', kind: 'play', title: 'Chess', icon: 'cabinet',
    sub: 'JavaScript · full legal move generation',
    embed: 'https://macrisconstantine.github.io/chess-app/public/index.html',
    barks: ['A chessboard, waiting. One of his listed interests, turned into a project.'],
    body: [
      'A browser chess app written to learn the rules engine from the inside: legal move generation, check and checkmate detection, castling, en passant, promotion — the fiddly parts people skip.',
      'The repository also wires up Stockfish for position evaluation, which needs a local server and so cannot run on a static host. Clone it to get the engine.',
      "The README dedication is *\"For my favorite cousin who gives me apples and oranges and candy.\"* That stays in.",
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/chess-app/public/index.html', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/chess-app', kind: 'repo' },
    ],
    tags: ['JavaScript', 'game rules engine', 'Stockfish', 'playable'],
  },

  donut: {
    district: 'arcade', kind: 'play', title: 'Donut', icon: 'cabinet',
    sub: 'the famous spinning ASCII torus, taken apart',
    embed: 'https://macrisconstantine.github.io/donut/',
    barks: ['A torus made of punctuation, rotating patiently.'],
    body: [
      "Andy Sloane's donut.c is a rite of passage: a rotating 3D torus rendered in ASCII by code golfed into near-illegibility. This is Constantine working out how it actually does it — the parametric surface, the two rotation matrices, the z-buffer, the luminance-to-character ramp — and rebuilding it readably in JavaScript.",
      'Taking apart something clever until you can rebuild it is how you learn graphics.',
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/donut/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/donut', kind: 'repo' },
    ],
    tags: ['JavaScript', '3D maths', 'z-buffer', 'rendering', 'playable'],
  },

  multiplayer: {
    district: 'arcade', kind: 'play', title: 'Multiplayer Demo', icon: 'cabinet',
    sub: 'Unity WebGL · networking test bed',
    embed: 'https://macrisconstantine.github.io/multiplayer-demo/',
    barks: ['A cabinet built for two, currently seating one.'],
    body: [
      'A Unity project built specifically to find out how multiplayer actually behaves — state sync, authority, and all the latency problems that only show up once two clients disagree about reality.',
      'Not a game. A test bed, kept in public because the learning is the artefact.',
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/multiplayer-demo/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/multiplayer-demo', kind: 'repo' },
    ],
    tags: ['Unity', 'WebGL', 'networking', 'state sync', 'playable'],
  },

  panopticon: {
    district: 'arcade', kind: 'card', title: 'Panopticon Roulette', icon: 'cabinet',
    sub: 'Unity · one night · honors creative project',
    barks: ['The screen is mostly dark. A spotlight sweeps across cell doors.'],
    body: [
      'Built in a single night for the honors course *The Society of Spectacle*. Played entirely with the spacebar: press once to freeze the sweeping spotlight on one axis, press again to lock it onto a cell. Reveal the hero. Do not reveal the monster.',
      'The design argues with the course material directly — vision as power, the cost of looking, who gets to be seen. A mechanic doing the work an essay would otherwise have to.',
      'Constraint-driven design, shipped overnight.',
    ],
    links: [
      { label: 'Source + build', url: 'https://github.com/macrisconstantine/panopticon-roulette', kind: 'repo' },
    ],
    tags: ['Unity', 'C#', 'game design', 'one-button', 'game jam pace'],
  },

  /* ===================== THE FOUNDRY ===================== */

  role: {
    district: 'foundry', kind: 'card', title: 'Gecko Software LLC', icon: 'badge',
    sub: 'Software Developer · Chicago, IL · Nov 2024 – present',
    featured: true,
    barks: [
      'A time clock, still running. The ticket counter above it reads 89.',
      'This is the part of the portfolio that pays rent.',
    ],
    body: [
      'Lead contributor on two production ASP.NET / VB.NET applications backed by SQL Server — warranty and field-service platforms that real businesses run their day on.',
      '**89 tracked tickets and 223 commits in the year to October 2026 — roughly two thirds of the team\'s output.**',
      'The work is the unglamorous kind that matters: a decades-old codebase, real users who notice every regression, no option to rewrite it from scratch, and a production database you do not get to be casual with.',
      'It is also where he learned to be careful. Change control, staged promotion through dev before anything touches production, and a standing rule that the person who owns the system is the one who presses the button.',
    ],
    tags: ['ASP.NET', 'VB.NET', 'SQL Server', 'legacy modernisation', 'production ownership'],
  },

  sku: {
    district: 'foundry', kind: 'card', title: 'Quote-to-Approval System', icon: 'machine',
    sub: 'built from nothing · ~10,500 lines · largest single feature in the platform',
    featured: true,
    barks: ['A large machine with a great many levers. A label reads: BUILT FROM NOTHING.'],
    body: [
      'An end-to-end quoting workflow, designed and built from an empty file, now the largest single feature in the platform at roughly **10,500 lines**.',
      '**Staged requests** that survive a half-finished session instead of losing the user\'s work.',
      '**Duplicate detection** both in-form and against the database, because the expensive mistake is quoting the same thing twice at two different prices.',
      '**Live price calculation** as the form is filled in.',
      '**Excel price-sheet generation** so the output is something a salesperson can actually send.',
      '**Email notification on every state change**, so nothing sits in a queue nobody is watching.',
      'Shipping a feature this size into a live system is mostly a discipline problem rather than a typing problem: sequencing it so the application is never broken between here and done.',
    ],
    tags: ['feature ownership', 'workflow design', 'Excel generation', 'notifications', 'SQL Server'],
  },

  estimator: {
    district: 'foundry', kind: 'card', title: 'The Price Estimator Rewrite', icon: 'chart',
    sub: 'scored leave-one-out against 229 hand-priced historical quotes',
    featured: true,
    stats: [
      { label: 'Coverage',            from: '63%',  to: '97%' },
      { label: 'Median error',        from: '275%', to: '13%' },
      { label: 'Within 25% of price', from: '2%',   to: '71%' },
    ],
    barks: [
      'A gauge wall. Three needles, each one pinned hard to the right.',
      'Someone has written the old numbers underneath in smaller, sadder figures.',
    ],
    body: [
      'The platform had a price estimator. It was wrong often enough that people had stopped believing it.',
      'He rebuilt it and — this is the part that matters — **scored it honestly**, leave-one-out, against 229 hand-priced historical quotes rather than against its own training data.',
      'Getting there meant proving the pricing was not a black box at all: it is a separable multiplicative formula, recoverable per product line at a median R² of 0.9996. A deterministic calculator beat the machine-learning approach outright for the families covered by the published book, with a calibrated quantile model kept only as a labelled-as-rough fallback for the families that are not.',
      "**The best outcome of the rewrite was a bug.** Reading the old code line by line surfaced a local variable with the same name as a function it shadowed — legal in VB, case-insensitive, compiles clean — that had been silently returning blank estimates for the entire life of the application domain. Nobody had filed a ticket. They had simply stopped trusting the number.",
      'Knowing when *not* to reach for a model is the senior move here. The model was the worse answer and the measurement is what proved it.',
    ],
    tags: ['model evaluation', 'leave-one-out', 'quantile regression', 'calibration', 'debugging', 'VB.NET'],
  },

  perf: {
    district: 'foundry', kind: 'card', title: 'Performance Work', icon: 'gauge',
    sub: 'the slowest screen in daily use: 8.3s → 1.6s',
    stats: [
      { label: 'Slowest screen',   from: '8.3 s', to: '1.6 s' },
      { label: 'Home page queries', from: '~49',  to: '~16' },
    ],
    barks: ['A stopwatch nailed to the wall, stopped at 1.6 seconds. The 8.3 is crossed out.'],
    body: [
      'The screen people used most was the screen they waited on most. Server-side paging, a lightweight count query instead of hydrating the whole set to measure it, and sorting pushed down into the query: **8.3 seconds to 1.6**.',
      'Separately, a home page doing roughly **49 SQL round trips per load** came down to about **16** — role lookups cached, and the rest batched into multi-result-set commands.',
      'Neither fix was clever. Both came from measuring first and discovering the page was latency-bound, not query-bound: dozens of small round trips, each one cheap and each one costing a full network hop. Profile before you optimise, or you will spend a week tuning the wrong thing.',
    ],
    tags: ['profiling', 'query optimisation', 'caching', 'server-side paging', 'latency'],
  },

  craft: {
    district: 'foundry', kind: 'card', title: 'Working Practice', icon: 'toolbox',
    sub: 'how the production work actually gets done',
    barks: ['A tidy toolbox. Everything in it has been used.'],
    body: [
      '**Measure, then change.** Every number on the machines in this room is one he took before and after, not an estimate.',
      '**Dev first, always.** Build it in dev, test it in dev, promote it. Production databases are not a place to find out.',
      '**The owner presses the button.** He writes the change and hands over the commit; the person responsible for the system is the one who commits and deploys it.',
      '**Read the old code.** The estimator bug was not found by a tool. It was found by reading a function that had been quietly wrong for years.',
      '**Leave the note.** Findings get written down — topology, conventions, the traps — so the next person through does not pay the same tuition.',
    ],
    tags: ['change control', 'code review', 'documentation', 'legacy systems'],
  },

  /* ===================== THE OBSERVATORY ===================== */

  thesis: {
    district: 'observatory', kind: 'card', title: 'Detecting Depression from Speech', icon: 'telescope',
    sub: 'honors thesis · Python, Keras, LSTM, Django · 2023–2024',
    featured: true,
    barks: [
      'A long telescope aimed at something much closer than the stars.',
      'The eyepiece is labelled DAIC-WOZ.',
    ],
    body: [
      'His honors thesis. The brief was to demonstrate where language models could matter for a real societal problem; he picked clinical depression screening and then did the hard, unglamorous half properly.',
      '**Got the data legitimately.** Obtained access to the restricted DAIC-WOZ clinical interview corpus — the step most student projects skip by substituting something easier.',
      '**Built the pipeline.** Ingest and cleaning across 189 interviews and 283,000 words.',
      '**Trained the models.** Single- and double-layer LSTM classifiers in Keras over GloVe embeddings, predicting PHQ-8 severity.',
      '**Benchmarked against the alternative.** The same task run through Mistral 7B Instruct and WizardLM 13B locally, with prompt design forcing structured output so the comparison was actually apples to apples.',
      '**Shipped an interface.** A Django front end for real-time analysis and side-by-side model comparison, so the result was something a person could use rather than a notebook.',
      'This is the project that explains the rest of the Observatory: a supervised baseline, a modern generative approach, and an honest measured comparison — not a demo picking whichever looked better.',
    ],
    links: [
      { label: 'Source', url: 'https://github.com/macrisconstantine/depression-detection-thesis', kind: 'repo' },
    ],
    tags: ['Keras', 'LSTM', 'GloVe', 'NLP', 'Mistral 7B', 'WizardLM 13B', 'Django', 'PHQ-8'],
  },

  companion: {
    district: 'observatory', kind: 'card', title: 'The Companion That Thinks', icon: 'orb',
    sub: 'capstone · OpenHermes-2.5-Mistral-7B inside a Unity RPG · 2024',
    featured: true,
    barks: [
      'A glowing orb on a plinth. It appears to be listening.',
      'It is running a 7-billion-parameter model on whatever hardware you brought.',
    ],
    body: [
      'His capstone, and the best single answer to *what happens when gameplay systems meet model behaviour*.',
      'He went back into **Pots of Pottimea** — his own Zelda-like from two years earlier — tore out the companion NPC\'s dialogue tree, and replaced it with a language model running **locally on the player\'s machine**. No API key, no network call, no per-token bill.',
      '**The model:** OpenHermes-2.5-Mistral-7B, quantised to Q4_K_M, served through llamafile and wired into the engine with LLMUnity.',
      '**The context pipeline:** live quest state and inventory fed into the prompt, so the companion knows what you are actually carrying and where you actually are.',
      '**The constraints:** prompt design holding it inside the game\'s lore, because an NPC that breaks character is worse than one that just repeats a line.',
      '**The budget:** a round trip fast enough to still feel like conversation on consumer hardware. That constraint drove every decision above — quantisation level, context size, prompt length.',
      'Most people demonstrate this by calling a hosted API. Doing it offline, in-engine, inside a game you wrote yourself, is a different and much harder exercise.',
    ],
    links: [
      { label: 'Source + build', url: 'https://github.com/macrisconstantine/capstone-companion', kind: 'repo' },
      { label: 'The game it lives in', url: 'https://github.com/macrisconstantine/pots-of-pottimea', kind: 'primary' },
    ],
    tags: ['local LLM', 'GGUF', 'quantisation', 'llamafile', 'LLMUnity', 'prompt engineering', 'Unity', 'C#'],
  },

  omscs: {
    district: 'observatory', kind: 'card', title: 'Georgia Tech · OMSCS', icon: 'scroll',
    sub: 'M.S. Computer Science · Machine Learning specialisation · Jan 2026 – 2029',
    barks: ['A star chart, partially filled in. The remaining constellations are dated.'],
    body: [
      'M.S. Computer Science at the Georgia Institute of Technology, specialising in Machine Learning — taken part-time, around a full-time job.',
      '**Completed:** CS 7646 Machine Learning for Trading.',
      '**In progress:** CS 7641 Machine Learning.',
      'The specialisation is deliberate. The thesis and the capstone both ran into the same wall — knowing that a model works is easy, knowing *why* and being able to prove it is not — and this is the long way around that wall.',
      '**Before Georgia Tech:** B.Sc. Information Technology, Software Development — Deree, The American College of Greece, May 2024, validated by The Open University (UK). GPA 3.95 / 4.00, honors programme.',
    ],
    tags: ['supervised learning', 'model evaluation', 'experiment design', 'in progress'],
  },

  consciousness: {
    district: 'observatory', kind: 'card', title: 'Consciousness Demo', icon: 'brain',
    sub: 'Unity · honors creative project · Human Consciousness',
    barks: ['A machine simulating several futures at once and discarding most of them.'],
    body: [
      'A two-part Unity project for the honors course *Human Consciousness*.',
      '**Part one** is a simulation of a specific theory of mind: the conscious brain running many candidate futures in parallel and keeping the ones that survive. Watchable from any camera angle in the scene.',
      '**Part two** turns the same idea into a two-player game, so the class could argue with the model by playing against it.',
      'The same instinct as Panopticon Roulette and Debunking Physics: when the subject is abstract, build the thing and let people push on it.',
    ],
    links: [{ label: 'Source', url: 'https://github.com/macrisconstantine/consciousness-demo', kind: 'repo' }],
    tags: ['Unity', 'C#', 'simulation', 'search', 'interactive explanation'],
  },

  monty: {
    district: 'observatory', kind: 'play', title: 'The Monty Hall Problem', icon: 'doors',
    sub: 'C + JavaScript · probability, demonstrated rather than argued',
    embed: 'https://macrisconstantine.github.io/monty-hall-problem/',
    barks: ['Three doors. You already know this is a trap and you will still get it wrong.'],
    body: [
      'Switch or stay? The answer is counter-intuitive enough that arguing about it never works, so this runs the trials instead and shows you the distribution.',
      'Originally a C program running thousands of simulated rounds and comparing switch against stay; the browser version here lets you play it by hand first and lose on your own time.',
      '**Playable in this cabinet.**',
    ],
    links: [
      { label: 'Open full screen', url: 'https://macrisconstantine.github.io/monty-hall-problem/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/monty-hall-problem', kind: 'repo' },
    ],
    tags: ['C', 'JavaScript', 'Monte Carlo', 'probability', 'playable'],
  },

  /* ===================== THE TERMINAL ===================== */

  terminal: {
    district: 'vault', kind: 'terminal', title: 'Terminal', icon: 'terminal',
    sub: 'a real one — type into it',
    featured: true,
    barks: [
      'A CRT, warm, with a cursor blinking in the corner.',
      'It takes commands. Try `help`, or `ls`.',
    ],
    body: [
      'Not a picture of a terminal. It parses what you type.',
      'Start with `help`. `ls` and `cat` work. So does `whoami`. There are a few things in here that are not in the help text.',
    ],
    tags: ['try: help', 'try: ls', 'try: sudo'],
  },

  fccdb: {
    district: 'vault', kind: 'list', listKey: 'fccdb', title: 'Relational Database Certification', icon: 'database',
    sub: 'freeCodeCamp · 11 projects · Bash, PostgreSQL, Git, Vim',
    barks: ['Eleven server racks, each with a hand-written label.'],
    body: [
      'The full freeCodeCamp Relational Database certification — eleven projects, every one of them built in the terminal with Bash, PostgreSQL, Git and Vim, no IDE and no safety net.',
      'The point of this track is that it refuses to let you use a GUI. You design the schema in psql, you write the script in Vim, you commit from the command line, and the grader checks the database state rather than your intentions.',
      'Unfashionable and extremely load-bearing. The production work in The Foundry is SQL Server all day; this is where the fluency came from.',
    ],
    tags: ['Bash', 'PostgreSQL', 'psql', 'Git', 'Vim', 'schema design'],
  },

  fccweb: {
    district: 'vault', kind: 'list', listKey: 'fccweb', title: 'Web Certifications', icon: 'globe',
    sub: 'freeCodeCamp · Responsive Web Design + JavaScript Algorithms & Data Structures',
    barks: ['A wall of small, finished, working web pages.'],
    body: [
      'Two further freeCodeCamp certifications: Responsive Web Design, and JavaScript Algorithms and Data Structures (V8).',
      'Small projects, each one finished and deployed rather than left at 80%. Several are still live — the shelf beside this one has the links.',
      'He is also cheerfully rude about them in the READMEs. One is described by its own author as *"absolute garbage but minimum requirements to pass the tests"*, which is a healthier relationship with coursework than most people manage.',
    ],
    tags: ['HTML', 'CSS', 'JavaScript', 'responsive', 'algorithms', 'shipped'],
  },

  gamecave: {
    district: 'vault', kind: 'card', title: 'Game Cave', icon: 'server',
    sub: 'Django · full-stack web application · deployed',
    barks: ['A server humming quietly. It has been up a while.'],
    body: [
      'A video game catalogue built for Internet Programming, and the most complete web application in the archive.',
      '**Role-based access** across guest, user and admin, with a custom admin panel for creating categories and managing titles.',
      '**A recommendation system** that suggests titles from what a user has interacted with, and the consoles they interact on.',
      '**An AJAX star-rating system**, aggregating to a live average per title.',
      'HTML, CSS, JavaScript, Bootstrap, Django, deployed to PythonAnywhere — and it is still up.',
    ],
    links: [
      { label: 'Live site', url: 'https://macrisconstantine.pythonanywhere.com/', kind: 'live' },
      { label: 'Source', url: 'https://github.com/macrisconstantine/videogame-community-site', kind: 'repo' },
    ],
    tags: ['Django', 'Python', 'Bootstrap', 'AJAX', 'RBAC', 'deployed'],
  },

  scripts: {
    district: 'vault', kind: 'list', listKey: 'scripts', title: 'Scripts & Small Tools', icon: 'crate',
    sub: 'the things built because they were annoying',
    barks: ['A crate of small, sharp tools. Each one solved exactly one problem.'],
    body: [
      'The useful-on-a-Tuesday pile. Nothing here was an assignment; each one exists because something was tedious.',
      'A bank statement analyser, a scraper that cleans and merges text from a list of URLs, an Instagram bot driven off the Reddit API, a JSON SQL reference built in the terminal to learn Git properly, a recursive Sudoku solver with a UI that shows the recursion happening.',
      'Automating your own annoyances is how most people actually learn to program.',
    ],
    tags: ['Python', 'Bash', 'Java', 'automation', 'APIs', 'recursion'],
  },

  /* ===================== THE ARCHIVE ===================== */

  shelf: {
    district: 'archive', kind: 'list', listKey: 'all', title: 'The Stacks', icon: 'shelf',
    sub: 'all 58 public repositories · searchable',
    featured: true,
    barks: [
      'Shelves to the ceiling. Fifty-eight spines, oldest at the bottom.',
      'Everything. Not just the good ones.',
    ],
    body: [
      'Every public repository on the account, searchable and filterable by language, with the live ones marked.',
      'It includes the coursework, the throwaways, the half-finished experiments and the one called `hello` from September 2021. Nothing has been quietly deleted to make the graph look better.',
      'A portfolio that only shows the hits is a sales page. This is the record.',
    ],
    links: [{ label: 'GitHub profile', url: PROFILE.github, kind: 'repo' }],
    tags: ['58 repositories', 'since 2021', 'nothing hidden'],
  },

  timeline: {
    district: 'archive', kind: 'card', title: 'The Long Version', icon: 'book',
    sub: 'Uganda → Athens → Chicago → Georgia Tech',
    barks: ['A bound book, opened to a map with a great deal of travel on it.'],
    body: [
      '**2015–2019 · Masaka, Uganda and Chicago, IL** — high school, 4.00 GPA.',
      '**2020–2024 · Athens, Greece** — B.Sc. Information Technology, Software Development at Deree, The American College of Greece, validated by The Open University (UK). GPA 3.95 / 4.00, honors programme. Along the way: computer labs assistant, student affairs liaison, orientation leader.',
      '**Summers 2020–2023 · Hellenic Ministries, Athens** — warehouse manager. Led teams of 10 to 35 volunteers, recruiting, training and coordinating them through 20–60 pallets of literature packets in sixteen-day pushes. Up to 170,000 packets, seven elements each. Not a software job, and the single best thing on here for proving he can run a plan with other people in it.',
      '**2022–2024 · the projects** — the RPG, the Android game, the Django site, the thesis.',
      '**Nov 2024 – present · Chicago, IL** — Software Developer, Gecko Software LLC.',
      '**Jan 2026 – 2029 · Georgia Tech OMSCS** — M.S. Computer Science, Machine Learning specialisation, part-time.',
      'Three countries, two languages, one through-line.',
    ],
    tags: ['English (native)', 'Greek (proficient)', 'team leadership', 'tennis', 'chess', 'philosophy'],
  },

  early: {
    district: 'archive', kind: 'list', listKey: 'early', title: 'Coursework & Early Work', icon: 'chest',
    sub: 'where it started · 2021 onwards',
    barks: ['A chest of older things. Some of it is genuinely rough. It is still here.'],
    body: [
      'Java exercises, C coursework, a hash function implementation, a warehouse navigation app, a snake game from a YouTube tutorial, and numbered portfolio exercises from Internet Programming that do things like cycle colours and determine whether it is Sunday.',
      'The first repository on the account is called `hello` and is described, accurately, as "intro to github". September 2021.',
      'Kept on purpose. The distance between `hello` and a 7B model running inside your own game engine is the actual portfolio.',
    ],
    tags: ['Java', 'C', 'PL/SQL', 'HTML', 'since 2021'],
  },

  /* ===================== THE WORKSHOP (secret) ===================== */

  contact: {
    district: 'workshop', kind: 'contact', title: 'Get In Touch', icon: 'mail',
    sub: 'you found the room',
    featured: true,
    barks: ['The door was locked until you finished. Now it is not.'],
    body: [
      'You walked the whole thing. Thank you — genuinely, that took a while.',
      'Constantine is in Chicago, finishing a Georgia Tech master\'s in machine learning around a full-time job, and most interested in roles where gameplay systems meet model behaviour. Games, simulation, applied ML, or production software that has to be correct.',
    ],
    links: [
      { label: 'Email', url: 'mailto:' + PROFILE.email, kind: 'primary' },
      { label: 'LinkedIn', url: PROFILE.linkedin, kind: 'primary' },
      { label: 'GitHub', url: PROFILE.github, kind: 'repo' },
      { label: 'Taxi Cat on Google Play', url: PROFILE.playStore, kind: 'store' },
    ],
    tags: ['open to work', 'Chicago / remote'],
  },

  colophon: {
    district: 'workshop', kind: 'card', title: 'How This Was Built', icon: 'anvil',
    sub: 'no framework, no build step, no server',
    barks: ['A workbench with the site itself in pieces on it.'],
    body: [
      'Hand-written HTML, CSS and ES modules. **No framework, no build step, no bundler, no dependencies, nothing to install.**',
      'The world renders to a single `<canvas>` and scales up with nearest-neighbour filtering, so it stays crisp at any size. The render target changes shape with the window, so a phone in portrait gets a tall view of the map rather than a letterboxed strip stranded in the middle of the screen.',
      '**Every sprite you have walked past is pixel art authored as text** — a list of strings and a palette — painted to an off-screen canvas at load, with the outlines added programmatically. There is not one image asset in the world.',
      'The tilemaps are generated from a compact room spec with a seeded PRNG, so the decoration is random but identical for everyone. Music and sound are synthesised live with the Web Audio API; there are no audio files either.',
      'The arcade cabinets are real `<iframe>`s pointing at the real GitHub Pages builds of the real projects. Nothing in the arcade is a screenshot.',
      '**The whole site is one HTML file plus a handful of scripts, hosted free on GitHub Pages.** Résumé mode is the actual HTML of the page — the game is layered on top of it, so it works with JavaScript off, reads correctly in a screen reader and prints to a clean document.',
    ],
    tags: ['vanilla JS', 'Canvas 2D', 'Web Audio', 'zero dependencies', 'GitHub Pages'],
  },
};

/* -------------------------------------------------------------------------
   Curated repo groupings used by the `list` entries.
   ------------------------------------------------------------------------- */

export const LISTS = {
  fccdb: [
    'boilerplate-from-bash', 'five-bash-scripts', 'celestial-bodies-database', 'mario-database',
    'student-database', 'worldcup-database', 'kitty-ipsum-translator', 'bike-rental-bash',
    'salon-appointment-scheduler', 'nano-castle', 'sql-reference', 'periodic-table-database',
    'number-guessing-game',
  ],
  fccweb: [
    'survey-form', 'tribute-page', 'technical-documentation-page', 'product-landing-page',
    'personal-portfolio-webpage', 'palindrome-checker', 'roman-numeral-converter',
    'phone-number-validator', 'cash-register', 'rpg-creature-search', 'bee-movie-script',
  ],
  scripts: [
    'checking-history-analyzer', 'text-cleaner-kjv', 'instagram-reddit-bot', 'sudoku-solver',
    'sql-reference', 'instagram-bot-offline',
  ],
  early: [
    'hello', 'portfolio-website', 'bootstrap-group-coursework', 'portfolio5.1', 'portfolio5.2',
    'portfolio5.3', 'portfolio6.1', 'portfolio6.2', 'portfolio6.3', 'assorted-java-exercises',
    'snake-game', 'warehouse-app', 'c-hash-function-coursework', 'c-python-first-coursework',
    'in-class-exercise-collection', 'sql-database-project', 'RDBMS-midterm-Project',
  ],
};

/* -------------------------------------------------------------------------
   Skills index — rendered in résumé mode, grouped the way a human reads it.
   ------------------------------------------------------------------------- */

export const SKILLS = [
  { group: 'Game development',
    items: ['Unity (C#)', 'Android (Java)', '2D gameplay systems', 'A* Pathfinding Project',
            'animation state machines', 'collision & physics', 'sprite pipelines', 'Play Store release'] },
  { group: 'Machine learning',
    items: ['Keras', 'LSTM & sequence models', 'GloVe embeddings', 'leave-one-out scoring',
            'calibration & error distributions', 'quantile regression', 'local LLM inference (GGUF, llamafile)',
            'LLMUnity', 'prompt design for structured output'] },
  { group: 'Languages',
    items: ['C#', 'Java', 'Python', 'JavaScript', 'C', 'SQL', 'PL/SQL', 'VB.NET', 'Bash', 'HTML', 'CSS'] },
  { group: 'Backend & data',
    items: ['ASP.NET / VB.NET', 'SQL Server', 'PostgreSQL', 'Django', 'query optimisation',
            'server-side paging', 'schema design', 'ERP integration'] },
  { group: 'Tools',
    items: ['Unity', 'Android Studio', 'Git (incl. LFS)', 'Visual Studio', 'VS Code', 'PyCharm',
            'IntelliJ', 'Vim', 'Photoshop', 'Illustrator'] },
];

/* -------------------------------------------------------------------------
   Achievements.
   ------------------------------------------------------------------------- */

export const ACHIEVEMENTS = [
  { id: 'firststep',  name: 'First Steps',        desc: 'Move for the first time.' },
  { id: 'roll',       name: 'Somersault',         desc: 'Roll. Z, X, or the ↯ button.' },
  { id: 'smash',      name: 'Crate Expectations', desc: 'Roll through a crate.' },
  { id: 'firstfrag',  name: 'Something Found',    desc: 'Collect your first fragment.' },
  { id: 'arcade',     name: 'Press Start',        desc: 'Clear The Arcade.' },
  { id: 'foundry',    name: 'Ships On Friday',    desc: 'Clear The Foundry.' },
  { id: 'observatory',name: 'Seeing Further',     desc: 'Clear The Observatory.' },
  { id: 'vault',      name: 'Permission Denied',  desc: 'Clear The Terminal.' },
  { id: 'archive',    name: 'Full Record',        desc: 'Clear The Archive.' },
  { id: 'played',     name: 'Actually Playable',  desc: 'Launch a real build inside a cabinet.' },
  { id: 'cli',        name: 'Shell Access',       desc: 'Run a command in the terminal.' },
  { id: 'sudo',       name: 'Nice Try',           desc: 'Attempt to sudo.' },
  { id: 'taxi',       name: 'Defensive Driving',  desc: 'Score 20 in Taxi Cat.' },
  { id: 'taxipro',    name: 'Nine Lives',         desc: 'Score 60 in Taxi Cat.' },
  { id: 'konami',     name: 'Old Habits',         desc: 'Up up down down left right left right B A.' },
  { id: 'resume',     name: 'Straight To Business', desc: 'Open résumé mode.' },
  { id: 'complete',   name: 'Completionist',      desc: 'Collect every fragment and open the Workshop.' },
];

export const ENTRY_IDS = Object.keys(ENTRIES);
export const FRAGMENT_IDS = ENTRY_IDS.filter((k) => ENTRIES[k].district !== 'workshop');
