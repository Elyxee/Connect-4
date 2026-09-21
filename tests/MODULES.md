# Bottom Right Module behavior

Fresh load and New reset the module to the Game Clock cover. Arrows, swipes and
left/right keys switch covers; click a logo to enter. Modes returns to covers.

The normal board permits variations while no timed session exists. Opening
Clock settings gates placement until a preset is selected. A used board must
start New timed game before a preset can run (including if its cursor is back
at root). Once running or finished, a timed session retains its one-line
restriction across module navigation. Switching to Orbit never pauses the
clock. The Live Clock badge returns to it; after expiry it reads Clock result.
New resets the board, clock, Orbit and picker together.

Orbit starts with no lives. First four targets are white; thereafter probabilities
shift from white to gold to predominantly red. Speed follows a saturating curve
with bounded per-round variation; direction changes only on a new round. A
160ms hit / 220ms miss interval ignores further taps. Targets' near edges have
at least 850ms initially, falling toward 350ms, of travel before reach, plus
additional randomized distance. White/gold/red windows are 52/30/18 degrees.

Lifetime color totals unlock at most 3 white (5 each), 2 gold (3 each), 1 red
(1 hit). Spent lives remain spent. Miss consumption uses white/gold/red order.
A missed target is detected even when a frame skips over its entire width.
Only one miss is charged per update; an unseen target cannot be consumed.
Leaving Orbit or hiding the document pauses it; return requires Resume.
Clock continues during these pauses. Hits and elapsed active play time are
shown during play and after game over. Play again resets all run state.

Run the logic tests with `node --test tests/clock.test.cjs tests/orbit.test.cjs`.
The browser scripts use Playwright and accept PLAYWRIGHT_EXECUTABLE_PATH.
`clock-browser.cjs` covers board/clock regressions; `modules-browser.cjs` covers
picker, touch-like swipes, untimed variations, clocks across modes, panel and
controller hits, life consumption, replay, pause and responsive views.


Analysis notes (v45): default move history; swipe left to a separate, per-game
ruled notebook and automatic pen mode. Swipe right from its edge/header returns
to moves and playing. Header title also switches pages. Edit manually toggles
pen/play without changing the page. A short Eraser tap toggles eraser/pen;
holding for 3000ms clears the active paper/board canvas only and can be undone.
Release/cancel/leaving the button, changing pages/nodes, or hiding the document
cancels the hold. Notebook strokes are independent of node-bound board notes.
New resets both. Black 2.5 CSS pixel ink has pressure and coalesced pointer input;
the old floating tools, color and size selectors are removed.
Run `tests/notes-browser.cjs` for real canvas, swipe, hold and history checks.


Full-workspace ink (v33): each Analysis page owns a full-app canvas. Move-page
annotations remain tied to the current game node; the Notes-page canvas is
per-game. The pointer-transparent overlay is drawn above all content. A capture
router assigns each non-control stroke exclusively to the active canvas, so
move tokens and mini-game body inputs cannot receive drawing taps. Actual
buttons remain interactive. Play mode allows body swipes in Analysis; in edit
mode use the header or 24px page-edge swipe handles. Pen strokes never become
page swipes. tests/workspace-ink-browser.cjs verifies real touch input, move
click suppression, cross-region ink, navigation restoration and module isolation.
