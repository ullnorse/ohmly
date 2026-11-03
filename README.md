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

`og:image` in `index.html` points at `https://ullnorse.github.io/ohmly/og.png`. Update it if you move to a custom domain.

## Project layout

```
index.html        page shell, metadata
css/app.css       all styles (theme tokens at the top)
css/fonts.css     local @font-face rules
fonts/            woff2 files + OFL license texts
js/data.js        course content: modules, ideas, formulas, quizzes
js/core.js        state, XP, badges, sound, confetti, plotting
js/labs.js        the 27 interactive labs
js/games.js       the arcade games
js/app.js         views (contents, modules, arcade, logbook, about), routing, settings, backup/import
og.png            social preview image (1200×630)
```

## Editing content

All course text lives in `js/data.js`. Each module has `n`, `part` (A, B or C), `title`, `blurb`, `big` (intro), `ideas`, `formulas`, `tip`, `labs` (lab ids from `labs.js`), `quiz` (`q`, options `o`, index of the right answer `a`, explanation `w`) and an optional `reading` note.

Progress is stored in `localStorage` under the key `ohmly-v1`. If you change the structure of the state, bump the key or add a migration.

## Before you publish

- **Pick a license.** No license is included yet. A common choice is MIT for the code and CC BY 4.0 for the course text. Add a `LICENSE` file once you decide.
- **Check the name.** Search for existing products called "Ohmly" before you buy a domain.
- **Book references.** Modules include a short "further reading" line pointing to printed page ranges of *Practical Electronics for Inventors* (4th ed.). It's a plain citation with no excerpts, and the site states it isn't affiliated. Remove the `reading` fields in `data.js` if you'd rather not reference any book.

## Credits

Fonts: Barlow Condensed, IBM Plex Sans and IBM Plex Mono, licensed under the SIL Open Font License 1.1 (see `fonts/OFL-*.txt`).

Labs use simplified models (ideal sources, typical part values, first-order behavior) for intuition. They are not a substitute for datasheets. Nothing here is guidance for working on mains-powered equipment.
