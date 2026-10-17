# Tests

Logic tests (no dependencies): `npm test`, i.e. `node --test tests/*.test.cjs`.
They load the real `src/` scripts through `helpers/load.cjs`.

| Test | Covers |
| --- | --- |
| `clock.test.cjs` | Game clock rules (below) |
| `orbit.test.cjs` | Orbit lives, targets, pacing (see `MODULES.md`) |
| `home-drag.test.cjs` | Home sticker dragging |
| `experience.test.cjs` | Opening screen and cloud transition gating |
| `assets.test.cjs` | Every referenced file exists, is precached by `sw.js`, and `?v=` versions agree |

Browser checks: `npm run test:browser`, or run one with `node tests/<name>-browser.cjs`.
Each starts and stops its own static server and headless Chromium
(`helpers/browser.cjs`). Optional environment variables:
`PLAYWRIGHT_PACKAGE` (playwright module path), `PLAYWRIGHT_EXECUTABLE_PATH`
(an existing Chrome/Chromium), `SCREENSHOTS` (screenshot folder; default
`<tmp>/c4-shots`). Clocks are simulated, so timeouts are tested without waiting minutes.

| Check | Covers |
| --- | --- |
| `clock-browser.cjs` | Board and clock regressions |
| `modules-browser.cjs` | Module picker, swipes, Orbit, clocks across modes |
| `notes-browser.cjs` | Notes page, ink, eraser hold, undo/redo |
| `workspace-ink-browser.cjs` | Full-workspace ink routing with real touch input |
| `home-browser.cjs` | Home layout, New/Continue, reduced motion |
| `home-effects-browser.cjs` | WebGL water, drag tilt/landing, tap particles, intro on return, pause during a game |
| `display-browser.cjs` | iPad sizes, canvas density, background motion |

## Clock rules

- A time preset starts Red; New resets to preset selection. Presets come from `CONFIG.clock.presets`.
- Successful commits on the live game node settle elapsed time, add the mover's increment, and read `toPlay` from the resulting node. Terminal moves freeze at the win instant without a final increment.
- Clock mode allows moves only at the live endpoint while running. History selection, Prev/Next, Review and timeline clicks remain available, but cannot replay a move by clicking the board or create variations. The live clock keeps running during review; the clock offers a return to the live game/result. Review goes to the starting board.
- Timeout is a clock result, never a `GameNode.isWin` or `winCells` mutation. After any result, placement is blocked everywhere until New; historical browsing and notes remain available.
- A board pointer gesture belongs to its initial node. Switching history or starting a new game while holding a pointer cannot commit a chip on release to a different position.
- Full-board draws freeze both clocks. Returning from background/sleep checks elapsed time before allowing a new timed move.
- The supplied Red Active image is mirrored at display time to put its Yellow semicircle on the right; all four image files are preserved byte-for-byte.
