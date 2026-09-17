# Connect 4 Notes — Product Requirements Document

| Field | Value |
| --- | --- |
| Product | Connect 4 Notes |
| Type | Frontend-only Progressive Web App (PWA) |
| Primary platforms | iPad (landscape-first), desktop browsers |
| Document status | Final implementation snapshot |
| Last aligned build | Restored stylesheet + git-initialized project state |
| Language | English UI |

---

## 1. Product overview

### 1.1 Problem
Players and analysts need a lightweight Connect 4 board that supports:

- real-time play with clear visual feedback
- deep post-game review with branching variations
- state-bound doodle notes for teaching and annotation
- a polished, distraction-light interface suitable for tablet use

### 1.2 Product goal
Deliver a pure frontend Connect 4 review tool that feels like a native iPad app: offline-capable, responsive, precise board alignment, and analysis-first interaction.

### 1.3 Non-goals
- no backend / account system
- no multiplayer networking
- no AI move engine
- no cloud sync of notes/history
- no Light theme toggle in the shipping UI (Dark is fixed)

---

## 2. Users and use cases

### 2.1 Primary users
- coaches / teachers explaining tactics
- players reviewing their own games
- students practicing annotation and variation thinking

### 2.2 Core use cases
1. Play a standard game with hover preview and physical drop animation.
2. Jump through history and explore alternate lines without destroying prior history.
3. Annotate any position with pen/eraser notes bound to that exact history node.
4. Present a clean board-centric UI for live review on iPad or desktop.

---

## 3. Information architecture

### 3.1 Screen regions
1. **Top bar** — brand (`Connect 4`) + subtitle (`Game Review · Notes`)
2. **Stage HUD** — turn indicator (`Red/Yellow to move`)
3. **Board stage** — pixel-art board, pieces, notes canvas, O/E and 1–7 guides
4. **Analysis sidebar** — timeline + Prev/Next travel controls
5. **Assistive tools** — floating ball + expandable drawing/tool panel
6. **Toast** — transient feedback for clear actions

### 3.2 Core files
| File | Responsibility |
| --- | --- |
| `index.html` | App shell, semantic structure, PWA meta |
| `style.css` | Layout, theming tokens, Assistive UI, board chrome |
| `app.js` | Game tree, rendering, input, notes history, Assistive logic |
| `manifest.json` | PWA install metadata |
| `sw.js` | Offline asset caching |
| `board-art.png` | Pixel board artwork |
| `assets/red-chip.png` / `assets/yellow-chip.png` | Piece sprites |

---

## 4. Functional requirements

## 4.1 Game interaction layer

### FR-G1 Standard board
- Board is **7 columns × 6 rows**.
- Pieces fall to the lowest legal empty cell in the chosen column.
- Red starts; players alternate.

### FR-G2 Pointer play mode
- Default tool is **Finger / Pointer**.
- Hover or press over a column highlights that column.
- Preview chip appears at the **lowest legal landing cell** (not top-of-column only).
- Release / click drops immediately (no double-tap confirmation).
- When a node is already a win, hover highlight and preview chip are suppressed until the user jumps to a non-terminal node.

### FR-G3 Drop animation
- Drop uses non-blocking `requestAnimationFrame` animation.
- Rapid successive drops must not freeze input; logical board updates immediately while animation queues catch up.

### FR-G4 Win detection
- Detect 4-in-a-row in horizontal, vertical, and both diagonal directions.
- Collect **all** winning cells for highlight.
- Winning position locks further moves on that node.
- Timeline marks the winning ply with `#`.
- Winning chips keep pulse highlight and continuous flip/bounce celebration animation while the win node remains current.

---

## 4.2 Analysis / time-travel layer

### FR-A1 History as a tree (variations)
History is a node tree, not a linear overwrite list.

Each node stores at least:
- board snapshot
- side to move
- move metadata (`col`, `row`, `player`, `ply`)
- win state + win cells
- child variations
- note bitmap cache (`noteDataUrl`)

### FR-A2 Branching rule
If the user returns to node N and plays a move different from the existing next ply:
- do **not** overwrite the original continuation
- create a new child variation under N

### FR-A3 Timeline presentation
- Display as chess-like move pairs: `1. R4 Y4`, `2. R5 ...`
- Variation starts are indented and marked with `↵`
- Yellow-only deviation lines use ellipsis style: `2. ... Y3`
- Each ply token is clickable for half-step jumps
- Tokens show chip icon + column number (+ `#` if winning)

### FR-A4 Travel controls
- Sidebar provides `< Prev` / `Next >`
- Keyboard:
  - `ArrowUp` / `ArrowLeft` → previous
  - `ArrowDown` / `ArrowRight` → next
- Jumping between nodes animates piece add/remove transitions when useful

---

## 4.3 Notes / doodle layer

### FR-N1 State-bound notes
- Every history node has its own transparent note layer.
- Jumping nodes swaps the note canvas to that node’s cached image.
- Entering a fresh node starts blank unless previously drawn.

### FR-N2 Tools
Assistive panel tools:
- Finger (board playthrough)
- Pen
- Eraser
- Size slider
- Color swatches (visible only when Pen is active)
- Undo / Redo for strokes (independent from game Prev/Next)
- Clear
- Close

Removed from final product:
- Highlighter tool
- Theme toggle button

### FR-N3 Pointer-events routing
- Finger selected → note canvas `pointer-events: none` (clicks reach board)
- Pen / Eraser selected → note canvas `pointer-events: auto` (board play blocked)

### FR-N4 Cursor feedback
- Pen mode uses pen cursor
- Eraser mode uses eraser cursor
- Finger mode uses default cursor

### FR-N5 Clear behavior
- Single click Clear → clears **current node** notes only
- Long-press Clear (~1.8–3s) → clears notes across **all** history nodes
- Provide hold progress feedback and toast confirmation

### FR-N6 Stroke undo/redo
- Maintains a per-canvas stroke history stack
- Undo/Redo only affect drawing, never game tree navigation

---

## 4.4 Assistive floating tools

### FR-F1 Ball behavior
- Draggable floating ball
- Idle after ~3 seconds: snap to nearest edge (left/right/top/bottom) and half-hide
- Interaction restores full visibility

### FR-F2 Panel open direction
- Open toward screen center by default:
  - ball on right half → open left
  - ball on left half → open right
- Hard viewport enforcement prevents panel overflow off-screen
- Panel is compact and absolutely positioned relative to the ball

---

## 4.5 Board visual system

### FR-V1 Artwork-first board
- Visual board uses `board-art.png`
- Layering order:
  1. pieces canvas
  2. frame canvas (board art with transparent holes)
  3. notes canvas
  4. logical hit grid
- Pieces sit behind the frame cutouts (no “clipping through frame”)

### FR-V2 Alignment requirements
- Logical hit grid aligns to detected hole centers
- Column labels `1–7` align to each column center
- Separators between `1–7` sit at midpoints between adjacent centers
- Row markers `O/E` align to row centers and stay visually close to the board
- Board source trims bottom artifact line from artwork

### FR-V3 Piece assets
- Settled pieces use pixel chip sprites (`red-chip.png`, `yellow-chip.png`)
- Hover preview remains a semi-transparent current-color disk (sprite not required)

### FR-V4 Layout / responsive behavior
- App height locked to viewport (`100vh`), no global page scroll
- Main composition: board stage (~80%) + analysis sidebar (~20%)
- Board scales with available space while preserving aspect and alignment
- Board group can be nudged vertically for composition (`translateY(-21px)` in final polish)

---

## 5. Non-functional requirements

### NFR-1 Performance
- Maintain smooth interaction on high-refresh iPad targets
- Prefer offscreen caching for static board frames
- Drop/jump animations must remain non-blocking

### NFR-2 Reliability / layout stability
- Relayout on resize, image load, and container size changes
- Avoid first-frame mis-sizing by scheduling layout after asset ready / load / pageshow

### NFR-3 Offline / PWA
- Installable via `manifest.json`
- Service worker caches core assets for offline open
- Standalone display, landscape orientation preference

### NFR-4 Compatibility
- Works as static site (no build step required)
- Compatible with Safari and Chromium browsers
- Prefer static HTTP serving for CSS content-type correctness (avoid mistaken Vite CSS module serving during local debug)

### NFR-5 Maintainability
- Project is git-tracked
- Keep UI copy in English
- Keep feature logic in `app.js`, presentation in `style.css`, structure in `index.html`

---

## 6. UX / visual requirements

### 6.1 Visual direction
- Pixel-art board as the visual centerpiece (“Pixel Palace” tone)
- Deep dark minimalist background for note-taking comfort
- Peripheral UI uses restrained borders and translucent panels (not noisy neon glass)

### 6.2 Content language
All user-facing copy is English, including:
- turn text
- sidebar titles
- tool labels
- toasts
- aria labels

### 6.3 Accessibility / affordances
- Timeline items and ply tokens are clickable
- Buttons expose titles / aria labels
- Toast announcements for destructive/clear actions

---

## 7. Technical design summary

### 7.1 Architecture
Pure client-side SPA/PWA:

```text
DOM shell (index.html)
  ├─ BoardRenderer (canvas pieces + frame)
  ├─ NoteCanvas (drawing + stroke history)
  ├─ GameState tree (variations + notes cache)
  ├─ Assistive controller (drag/snap/panel)
  └─ Timeline renderer + travel controls
```

### 7.2 Key algorithms / systems
- landing-row search for legal drops
- win-cell collection across 4 directions
- 1D clustering / hole-center calibration from board image
- source-rect detection and bottom-line trim
- jump transition diffing between boards
- note dataURL persistence per node

### 7.3 Local run
Recommended:

```bash
python3 -m http.server 4174
```

Then open `http://localhost:4174/`.

Notes:
- This is a static HTML/CSS/JS project (no `package.json` required).
- `npx vite --host` can temporarily serve files, but is not part of the product build pipeline.

---

## 8. Acceptance criteria (final)

The build is accepted when all of the following pass:

1. Fresh load shows styled UI without relying on browser cache (`style.css` present on disk).
2. Board holes, hover preview, and drop targets stay aligned across resize/refresh.
3. Win detection locks play, highlights all winning chips, and marks `#` in timeline.
4. Variations appear as indented branches and remain independently visitable.
5. Notes are node-bound; stroke undo/redo does not affect game travel.
6. Assistive panel never opens off-screen; idle ball can hide on any edge.
7. English UI is consistent; no Light-mode toggle is exposed.
8. App remains usable offline via service worker cache after first successful load.

---

## 9. Known constraints / risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Missing stylesheet on disk | Unstyled fallback UI | Keep `style.css` in repo; git protect |
| Service worker stale cache | Confusing “looks fine only in one browser” | Hard refresh / cache bump when assets change |
| Board artwork hole detection drift | Misaligned hover/drop | Recalibrate norms after art changes |
| Vite serving CSS as JS modules | Chrome style failure | Prefer static server for this project |

---

## 10. Changelog of major capability waves

1. **Core PWA** — board play, doodle mode, timeline basics, offline shell
2. **Responsive layout** — 100vh flex/grid, no global scroll, canvas DPR alignment
3. **Analysis upgrade** — win detection, tree variations, chess-style timeline
4. **Assistive tools** — floating ball replaces mode toggle/toolbar flow
5. **Pixel board integration** — artwork board, z-layering, hole calibration
6. **Polish pass** — chip sprites, win flip animation, English copy, fixed Dark UI
7. **Recovery pass** — restore missing `style.css`, initialize git for continuity

---

## 11. Open follow-ups (optional)

Not required for current acceptance, but useful next:

- bump service worker cache version when shipping asset changes
- add PWA icons to `manifest.json`
- optional export/import of game tree + notes
- optional move-engine / evaluation overlay
- optional Light theme return behind an explicit settings entry

---

## 12. Ownership snapshot

This PRD describes the product as implemented in the current repository snapshot and should be treated as the source of truth for feature intent when extending the app.
