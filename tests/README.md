# Clock checks

Run the deterministic clock tests with `node --test tests/clock.test.cjs`.

Run `node tests/clock-browser.cjs` with Playwright installed. The test starts and closes its own static HTTP server and Chromium. Optional environment variables: `PLAYWRIGHT_PACKAGE` (package path), `PLAYWRIGHT_EXECUTABLE_PATH` (existing Chromium), `CLOCK_SCREENSHOTS` (output directory). The browser clock is simulated to test both timeout outcomes without waiting minutes.

Clock rules:

- A time preset starts Red; New resets to preset selection.
- Successful commits on the live game node settle elapsed time, add the mover's increment, and read `toPlay` from the resulting node. Terminal moves freeze at the win instant without a final increment.
- Clock mode allows moves only at the live endpoint while running. History selection, Prev/Next, Review and timeline clicks remain available, but cannot replay a move by clicking the board or create variations. The live clock keeps running during review; the clock offers a return to the live game/result. Review goes to the starting board.
- Timeout is a clock result, never a `GameNode.isWin` or `winCells` mutation. After any result, placement is blocked everywhere until New; historical browsing and notes remain available.
- A board pointer gesture belongs to its initial node. Switching history or starting a new game while holding a pointer cannot commit a chip on release to a different position.
- Full-board draws freeze both clocks. Returning from background/sleep checks elapsed time before allowing a new timed move.
- The supplied Red Active image is mirrored at display time to put its Yellow semicircle on the right; all four image files are preserved byte-for-byte.
