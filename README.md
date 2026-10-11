# Connect 4Live

A static iPad PWA with no build step. Serve the folder over HTTP and open
`index.html` (for example `python3 -m http.server 8080`). The iOS app in `ios/`
is a WKWebView shell that copies these files into its bundle at build time.

## Where to change things

| To change… | Edit |
| --- | --- |
| Timings, thresholds, clock presets, Orbit difficulty, ink, gestures, asset paths, board calibration | `src/config.js` |
| Layout, colours, sizes, CSS animations, Home sticker positions | `src/style.css` |
| Text and static markup | `index.html` |

After changing any file that browsers may have cached, run `npm run bump`
(`node scripts/bump-version.cjs`). It updates every `?v=` query and the
service-worker cache name. `npm test` checks that they agree.

## Code map (`src/`, loaded in this order by `index.html`)

| File | Responsibility |
| --- | --- |
| `config.js` | All tunable values (`CONFIG`) |
| `home-drag.js` | Draggable Home stickers |
| `experience.js` | Opening screen, Home ⇄ game cloud transition, press feedback, sticker tap reactions |
| `game.js` | Game model: players, win detection, move tree with variations (no DOM) |
| `board-renderer.js` | Board canvases: chips, drop animation frames, column highlight, win light |
| `note-canvas.js` | Ink surface with pressure and undo history |
| `timeline.js` | Move history list with embedded variations |
| `clock.js` | Game clock model (`GameClock`) and its panel (`GameClockView`) |
| `orbit.js` | Orbit mini-game model (`OrbitGame`) and its panel (`OrbitView`) |
| `modules.js` | Bottom-right module panel: cover picker and mode panes |
| `app.js` | Controller: wires everything to the page, input, notes, screens |
| `background-flow.js` | WebGL colour-field background of the game screen |
| `home-motion.js` | Pauses the Home water animation when hidden |

The scripts are classic (non-module) scripts sharing one global scope, because
ES modules do not load from `file://` URLs in the iOS WKWebView.

## Adding a bottom-right module

1. In `index.html`, add a `.module__slide` inside `.module__track` whose logo
   button has `data-enter-mode="<name>"`, and give neighbouring slides arrows
   with `data-select-mode="<index>"`.
2. Add the pane: any element inside `#bottomModule` with `data-module-pane="<name>"`.
3. If the mode needs to pause, reset or react to taps and the gamepad, register a
   controller in `BottomRightModule` (`src/modules.js`); the comment there lists
   the hooks.

Swipes, arrow keys, Back, Live Clock and New already handle any number of modes.

## Folders

| Directory | Contents |
| --- | --- |
| `src/` | Running JavaScript and stylesheet |
| `assets/figma/`, `assets/home/vector/`, `assets/modules/`, `assets/clock/`, `assets/fonts/` | Artwork and fonts loaded by the app |
| `assets/**/reference/`, `assets/reference/` | Earlier exports and design references (not loaded, not bundled into iOS) |
| `scripts/` | `bump-version.cjs` and the artwork preparation tools |
| `tests/` | Logic tests and browser checks (see `tests/README.md`) |
| `ios/` | Xcode project for the WKWebView shell |
| `backups/`, `previews/` | Earlier snapshot and visual recordings |

`index.html`, `manifest.json` and `sw.js` stay at the root as browser/PWA entry
points. `PRD.md` describes an earlier version; some of its paths are outdated.

## Tests

```bash
npm test
```

```bash
npm run test:browser
```

`npm test` runs the logic tests with no dependencies. The browser checks need
Playwright (`npm install`, or set `PLAYWRIGHT_PACKAGE` and
`PLAYWRIGHT_EXECUTABLE_PATH`). Details are in `tests/README.md`.
