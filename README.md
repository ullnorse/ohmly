# Ohmly

An interactive platform for learning electronics. Free, and it runs entirely in the browser.

Live at **https://ullnorse.github.io/ohmly/**

- 17 modules in three parts (foundations, building, going deeper), from Ohm's law to op amps, microcontrollers and motors
- 27 hands-on labs: animated circuits, an oscilloscope simulator, a filter you can hear, a 555 timer that blinks and plays tones, motors, logic and more
- 7 arcade games: Color Code Rush, Divider Designer, Gate Detective, Meter Madness, Formula Flashcards, Pop Quiz Roulette, Scope Sleuth
- 91 quiz questions with explanations, plus XP, levels and badges
- No build step, no dependencies, no tracking. Fonts are bundled.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```sh
cd ohmly
python3 -m http.server 8000
# then open http://localhost:8000
```

## Publish it

It's a static site, so any static host works.

**GitHub Pages**
1. Create a new repository and push the contents of this folder to it.
2. In the repository, go to Settings → Pages, set Source to "Deploy from a branch", pick `main` and `/ (root)`.
3. The site appears at `https://<your-username>.github.io/<repo>/` after a minute.

**Netlify or Cloudflare Pages**
Drag the folder onto the Netlify dashboard (app.netlify.com/drop), or connect the repository in Cloudflare Pages with no build command and `/` as the output directory.

`og:image` in `index.html` points at `https://ullnorse.github.io/ohmly/og.png`. Update it, `og:url`, the canonical link and `<base>` in `404.html` if you move to a custom domain.

## Project layout

```
index.html        page shell, metadata
css/app.css       all styles (theme tokens at the top)
css/fonts.css     local @font-face rules
fonts/            woff2 files + OFL license texts
js/data.js        course content: modules, ideas, formulas, quizzes
js/core.js        state, XP, badges, sound, confetti, plotting
js/problems.js    practice-problem templates, SI answer parser, grading, problem cards
js/labs.js        the 27 interactive labs
js/games.js       the arcade games
js/app.js         views (contents, modules, reference, practice, arcade, logbook, about), routing, settings, backup/import
og.png            social preview image (1200×630)
apple-touch-icon.png  home-screen icon (180×180)
404.html          not-found page for GitHub Pages
LICENSE           MIT (code) and CC BY 4.0 (course text)
```

## Editing content

All course text lives in `js/data.js`. Each module has `n`, `part` (A, B or C), `title`, `blurb`, `big` (intro), `ideas`, `formulas`, `tip`, `labs` (lab ids from `labs.js`), `quiz` (`q`, options `o`, index of the right answer `a`, explanation `w`) and an optional `reading` note. Two optional fields add sections that are hidden when absent:

- `ex: [{q, steps:[...], ans}]` worked examples, one numbered step per line, units at every step.
- `deep: [{t, body}]` collapsed "Going deeper" entries, never counted toward completion. In `body`, blocks are separated by a blank line; a block of `= ` lines is a formula, a block of `- ` lines is a list, anything else is a paragraph.

Module page order: intro, key points, formulas, worked examples, labs, practice problems, quiz, going deeper, note, reading.

## Practice problems

Add templates to `BC.PROBLEMS[moduleNumber]` in `js/problems.js` (3 or 4 per module). A template is a function returning `{q, ans, unit, steps}` with random values, plus optional `tol` (relative, default `0.02`) and `std:true` (also accept the nearest E12 or E24 value). `ans` is in base SI units (A, V, Ω, W, Hz, s); build `steps` from the same numbers as `q`, with `BC.fmt` for prefixes. The module's Practice section and the Practice page drill pick new templates up automatically; the drill draws only from modules that have templates. XP (15) is paid once per template, stored in `probs` as `"module-index"`.

Answers go through `BC.parseSI`: `4.7k`, `15m`, `2.2u`, `2.2µ`, `1M`, `1meg`, `4k7`, `1e-3`. A unit after the number (`mA`, `kΩ`, `Hz`) is ignored.

Reference sections are listed in `reference()` in `app.js`; add one entry per new section.

Progress is stored in `localStorage` under the key `ohmly-v1`. If you change the structure of the state, bump the key or add a migration.

## Before you publish

- **Licence.** `LICENSE` is MIT for the code and CC BY 4.0 for the course text (`js/data.js`). Change it there if you disagree.
- **Check the name.** Search for existing products called "Ohmly" before you buy a domain.
- **Book references.** Modules include a short "further reading" line pointing to printed page ranges of *Practical Electronics for Inventors* (4th ed.). It's a plain citation with no excerpts, and the site states it isn't affiliated. Remove the `reading` fields in `data.js` if you'd rather not reference any book.

## Credits

Fonts: Barlow Condensed, IBM Plex Sans and IBM Plex Mono, licensed under the SIL Open Font License 1.1 (see `fonts/OFL-*.txt`).

Labs use simplified models (ideal sources, typical part values, first-order behavior) for intuition. They are not a substitute for datasheets. Nothing here is guidance for working on mains-powered equipment.
