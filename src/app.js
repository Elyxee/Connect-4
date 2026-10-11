/* App controller: wires the game model, board renderer, notes, move timeline,
   game clock and bottom-right module to the page, and owns screen changes.
   Classes live in their own files (see index.html for load order):
   config → game → board-renderer → note-canvas → timeline → clock → orbit →
   modules → app. Presentation-only scripts: home-drag, experience,
   background-flow, home-motion. */

const Tool = Object.freeze({
  Finger: "finger", // play: board input, history navigation
  Pen: "pen",
  Eraser: "eraser",
});

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function registerServiceWorker() {
  // Offline support for the browser/PWA build; a file:// iOS shell skips it.
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function setup() {
  const $ = (id) => document.getElementById(id);
  const workspace = $("appRoot");
  const toast = $("toast");
  const ghostRow = $("ghostRow");
  const hitLayer = $("hitLayer");
  const boardCanvas = $("boardCanvas");
  const frameCanvas = $("frameCanvas");
  const boardArea = document.querySelector(".boardArea");
  const layers = document.querySelector(".layers");
  const colLabels = $("colLabels");
  const turnText = $("turnText");
  const stepNow = $("stepNow");
  const btnStart = $("btnStart");
  const btnPrev = $("btnPrev");
  const btnNext = $("btnNext");
  const btnEnd = $("btnEnd");
  const btnEdit = $("btnEdit");
  const btnNew = $("btnNew");
  const btnSave = $("btnSave");
  const btnReview = $("btnReview");
  const btnEraser = $("btnEraser");
  const btnNoteUndo = $("btnNoteUndo");
  const btnNoteRedo = $("btnNoteRedo");
  const analysis = document.querySelector(".analysis");
  const dock = analysis.querySelector(".dock");
  const pageToggle = analysis.querySelector(".analysis__page-toggle");
  const subtitle = analysis.querySelector(".analysis__subtitle");
  const movesPage = analysis.querySelector(".analysis__moves");
  const paperPage = analysis.querySelector(".analysis__paper");
  const sideRed = analysis.querySelector(".analysis__side--red");
  const sideYellow = analysis.querySelector(".analysis__side--yellow");
  const bottomModule = $("bottomModule");
  const gamepad = document.querySelector(".decoGamepad");
  const homeScreen = $("homeScreen");

  // ---- State ----
  let activeTool = Tool.Finger;
  let analysisPage = "moves"; // "moves" | "notes"
  let hoverCol = -1;
  let activePlayPointerId = null; // a board gesture belongs to the node it started on
  let activePlayNode = null;
  let animations = []; // drop/remove animations, see BoardRenderer.drawFrame
  let rafRunning = false;
  let lastLayoutKey = "";
  let relayoutRaf = 0;
  let relayoutTimer = 0;
  let toastTimer = null;
  let noteHistoryBusy = false;
  let eraserHold = null;
  let suppressEraserClick = false;
  let suppressPageClickUntil = 0;
  let pageSwipe = null;
  let inkPointer = null;
  let suppressInkClickUntil = 0;
  let hasSession = false;

  // ---- Model and views ----
  const game = new GameState();
  const renderer = new BoardRenderer(boardCanvas, frameCanvas);
  const notes = new NoteCanvas($("noteCanvas")); // moves page: ink stored per position
  const paper = new NoteCanvas($("paperCanvas")); // notes page: one notebook per game
  const timeline = new MoveTimeline($("timeline"), game, renderer.reducedMotion);
  const clock = new GameClock(game);
  const clockView = new GameClockView($("gameClock"), clock, {
    onExpire: () => {
      modulePanel.sync();
      updateTurnUi();
      drawStatic();
    },
    onPreset: startClock,
  });
  const modulePanel = new BottomRightModule(bottomModule, clock, game, {
    onChange: () => {
      activePlayPointerId = null;
      activePlayNode = null;
      updateTurnUi();
      drawStatic();
    },
    newBoard: () => resetGame(),
  });

  renderer.onAssetReady = () => {
    // Re-layout after the art decodes so the first frame never uses fallback sizes.
    lastLayoutKey = "";
    scheduleRelayout();
    scheduleRelayout(80);
  };

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("toast--show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("toast--show"), CONFIG.toastDuration);
  }

  // ---- Placement rules and the game clock ----

  // Untimed boards allow variations anywhere; a timed game has one live line.
  const boardCanPlace = () => !modulePanel.clockRequired || clock.canPlace();

  function clockAllowsPlacement() {
    if (!boardCanPlace()) {
      if (clock.status === "setup") showToast("Choose a Game Clock time first");
      else if (clock.status === "finished") showToast("Game finished. Start a new game to play");
      else showToast("Return to the live game to place a chip");
      return false;
    }
    return true;
  }

  function startClock(presetId) {
    if (modulePanel.mode !== "clock" || game.nodeById.size > 1 || !clock.start(presetId)) return;
    modulePanel.sync();
    clockView.refresh();
    updateTurnUi();
    drawStatic();
  }
  clockView.returnButton.addEventListener("click", () => jumpToNode(clock.liveNode));

  // ---- Status text and navigation buttons ----

  function updateTurnUi() {
    const reviewing = modulePanel.clockRequired && game.current !== clock.liveNode;
    const liveFinished = game.current === clock.liveNode && clock.status === "finished";
    turnText.textContent = reviewing ? `Reviewing move ${game.current.ply}` : liveFinished
      ? (clock.result.winner ? `${playerName(clock.result.winner)} wins${clock.result.reason === "time" ? " on time" : " by connect four"}` : "Draw")
      : game.current.isWin ? `${playerName(game.current.movePlayer)} wins by connect four`
      : `${playerName(game.currentPlayer)} to move`;
    const showTurn = !reviewing && !liveFinished && !game.current.isWin;
    sideRed.classList.toggle("is-turn", showTurn && game.currentPlayer === Player.Red);
    sideYellow.classList.toggle("is-turn", showTurn && game.currentPlayer === Player.Yellow);
  }

  function updateTravelUi() {
    stepNow.textContent = String(game.current.ply);
    const browsing = activeTool === Tool.Finger;
    btnStart.disabled = !browsing || !game.current.parent;
    btnPrev.disabled = !browsing || !game.current.parent;
    btnNext.disabled = !browsing || !game.current.children[0];
    btnEnd.disabled = btnNext.disabled;
  }

  // ---- Layout ----

  async function relayoutCanvases() {
    // Match the notebook's rendered border box, including border-pixel rounding.
    dock.style.left = `${-parseFloat(getComputedStyle(analysis).borderLeftWidth)}px`;
    dock.style.width = `${analysis.getBoundingClientRect().width}px`;

    const rect = layers.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);

    const nextKey = `${cssW}x${cssH}@${dpr}`;
    if (nextKey === lastLayoutKey) return;
    lastLayoutKey = nextKey;

    // Resizing clears the bitmap: keep the current position's ink first.
    notes.finishStroke();
    if (!notes.isLoading) game.current.noteDataUrl = notes.toDataUrl();

    boardCanvas.width = pxW;
    boardCanvas.height = pxH;
    frameCanvas.width = pxW;
    frameCanvas.height = pxH;
    renderer.resize(pxW, pxH);
    resizeWorkspaceInk();

    // Align the hit area and column labels with the measured hole grid.
    const scale = cssW / pxW;
    const g = renderer.getGuideMetrics(scale);
    boardArea.style.setProperty("--grid-left", `${g.left}px`);
    boardArea.style.setProperty("--grid-top", `${g.top}px`);
    boardArea.style.setProperty("--grid-width", `${g.width}px`);
    boardArea.style.setProperty("--grid-height", `${g.height}px`);
    const spans = colLabels.querySelectorAll("span");
    for (let c = 0; c < Math.min(COLS, spans.length); c++) {
      spans[c].style.left = `${renderer.getCellCenter(c, ROWS - 1).x * scale - g.left}px`;
    }
    await loadNotesForIndex();
    drawStatic();
  }

  function scheduleRelayout(delay = 0) {
    if (relayoutRaf) cancelAnimationFrame(relayoutRaf);
    relayoutRaf = requestAnimationFrame(() => {
      relayoutRaf = 0;
      if (relayoutTimer) {
        clearTimeout(relayoutTimer);
        relayoutTimer = 0;
      }
      if (delay > 0) {
        relayoutTimer = window.setTimeout(() => {
          relayoutTimer = 0;
          relayoutCanvases();
        }, delay);
        return;
      }
      relayoutCanvases();
    });
  }

  /* Ink canvases cover the whole workspace at device resolution (max 2×). */
  function resizeWorkspaceInk() {
    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    for (const surface of [notes, paper]) {
      if (surface.w === width && surface.h === height) continue;
      surface.finishStroke();
      const copy = document.createElement("canvas");
      copy.width = surface.w;
      copy.height = surface.h;
      copy.getContext("2d").drawImage(surface.canvas, 0, 0);
      surface.canvas.width = width;
      surface.canvas.height = height;
      surface.resize(width, height);
      surface.ctx.drawImage(copy, 0, 0, width, height);
    }
  }

  // ---- Board drawing, preview and animation ----

  function previewReady() {
    return !animations.some((a) => a.kind === "drop" && a.progress < 0.9);
  }

  function rebuildGhostRow() {
    ghostRow.innerHTML = "";
    const piece = document.createElement("div");
    piece.className = `ghostPiece ghostPiece--${playerCss(game.currentPlayer)}`;
    piece.style.visibility = "hidden";
    ghostRow.appendChild(piece);
  }

  /* Shows a translucent chip where a drop in `col` would land. */
  function setGhostCol(col) {
    const show = col >= 0 && col < COLS && activeTool === Tool.Finger && !game.current.isWin && boardCanPlace() && previewReady();
    ghostRow.classList.toggle("ghostRow--show", show);
    const p = ghostRow.querySelector(".ghostPiece");
    if (!p) return;
    p.classList.toggle("ghostPiece--red", game.currentPlayer === Player.Red);
    p.classList.toggle("ghostPiece--yellow", game.currentPlayer === Player.Yellow);
    const landingRow = show ? findLandingRow(game.board, col) : -1;
    if (landingRow < 0) {
      p.style.visibility = "hidden";
      return;
    }
    const rect = boardCanvas.getBoundingClientRect();
    const hostRect = ghostRow.getBoundingClientRect();
    const sx = rect.width / renderer.w;
    const sy = rect.height / renderer.h;
    const target = renderer.getCellCenter(col, landingRow);
    const size = clamp(renderer.radius * sx * 1.82, 16, 34);
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${rect.left - hostRect.left + target.x * sx}px`;
    p.style.top = `${rect.top - hostRect.top + target.y * sy}px`;
    p.style.visibility = "visible";
  }

  /* Nearest real hole column under a client point, or -1 outside the grid. */
  function colFromClientPoint(clientX, clientY) {
    const rect = boardCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    const sx = rect.width / renderer.w;
    const sy = rect.height / renderer.h;

    // Only the band of playable rows counts.
    const topC = renderer.getCellCenter(0, 0);
    const botC = renderer.getCellCenter(0, ROWS - 1);
    const topY = rect.top + (topC.y - renderer.cellH * 0.55) * sy;
    const botY = rect.top + (botC.y + renderer.cellH * 0.55) * sy;
    if (clientY < topY || clientY > botY) return -1;

    let bestCol = -1;
    let bestDx = Infinity;
    for (let c = 0; c < COLS; c++) {
      const dx = Math.abs(clientX - (rect.left + renderer.getCellCenter(c, 0).x * sx));
      if (dx < bestDx) {
        bestDx = dx;
        bestCol = c;
      }
    }
    return bestDx > renderer.cellW * 0.62 * sx ? -1 : bestCol;
  }

  function drawStatic() {
    const showHover = activeTool === Tool.Finger && !game.current.isWin && boardCanPlace() && previewReady();
    renderer.drawFrame(game.board, showHover ? hoverCol : -1, animations, game.current.winCells || []);
    renderer.drawForegroundFrame(game.current.winCells || []);
    setGhostCol(showHover ? hoverCol : -1);
    if (game.current.winCells?.length && !renderer.reducedMotion.matches) ensureRaf();
  }

  /* Runs while chips are moving or a win is glowing, only on the visible game screen. */
  function ensureRaf() {
    if (rafRunning || document.hidden || document.body.dataset.screen !== "game") return;
    rafRunning = true;
    const tick = (t) => {
      if (document.hidden || document.body.dataset.screen !== "game") {
        rafRunning = false;
        return;
      }
      const now = t || performance.now();
      let active = 0;
      for (const a of animations) {
        const p = clamp((now - a.start) / a.duration, 0, 1);
        a.progress = p;
        if (a.kind === "drop") {
          const top = renderer.getTopCenter(a.col).y;
          const seat = renderer.getCellCenter(a.col, a.row).y;
          if (a.flightDuration) {
            // Placed chip: accelerating fall with a wobble, then two small bounces.
            const elapsed = Math.max(0, now - a.start);
            const flight = clamp(elapsed / a.flightDuration, 0, 1);
            if (flight < 1) {
              a.y = top + (seat - top) * flight * flight;
              a.rotation = a.tilt * Math.sin(Math.PI * flight);
            } else {
              const settle = clamp((elapsed - a.flightDuration) / (a.duration - a.flightDuration), 0, 1);
              const firstBounce = settle < 0.64;
              const u = firstBounce ? settle / 0.64 : (settle - 0.64) / 0.36;
              const height = renderer.radius * (firstBounce ? 0.14 : 0.025);
              a.y = seat - height * 4 * u * (1 - u);
              a.rotation = a.tilt * Math.sin(settle * Math.PI * 2) * (1 - settle) ** 2;
            }
          } else {
            // History navigation: quick eased slide.
            a.y = top + (seat - top) * easeOutCubic(p);
          }
        } else if (a.kind === "remove") {
          a.alpha = 1 - p;
          a.scale = 1 - p * 0.25;
        }
        if (p < 1) active++;
      }
      animations = animations.filter((a) => a.progress < 1);
      drawStatic();
      const keepWinAnim = !!game.current.winCells?.length && !renderer.reducedMotion.matches;
      if (active > 0 || keepWinAnim) requestAnimationFrame(tick);
      else rafRunning = false;
    };
    requestAnimationFrame(tick);
  }

  // ---- Moves and history ----

  async function handleDrop(col) {
    if (!clockAllowsPlacement()) return;
    if (!game.canPlayMove()) return;
    if (col < 0 || col >= COLS) return;

    const row = findLandingRow(game.board, col);
    if (row < 0) return;

    notes.finishStroke();
    if (!notes.isLoading) game.current.noteDataUrl = notes.toDataUrl();

    // Check the deadline before mutating the board; animation time never delays a handoff.
    const committedAt = clock.now();
    if (clock.checkExpiry(committedAt)) {
      clockView.refresh();
      updateTurnUi();
      drawStatic();
    }
    if (!boardCanPlace()) return;
    const fromNode = game.current;
    const res = game.applyMove(col);
    if (!res) return;
    if (modulePanel.clockRequired) clock.commit(fromNode, res, committedAt);
    modulePanel.sync();
    clockView.refresh();
    updateTurnUi();

    const reduced = renderer.reducedMotion.matches;
    const { flightBase, flightPerRow, settle, stackGap, tilt } = CONFIG.drop;
    const flightDuration = flightBase + flightPerRow * Math.sqrt(row + 1);
    let start = performance.now();
    // Rapid taps in one column land in order, even when the pile grows.
    if (!reduced) {
      for (const a of animations) {
        if (a.kind === "drop" && a.col === col) {
          start = Math.max(start, a.start + (a.flightDuration || a.duration) + stackGap - flightDuration);
        }
      }
    }
    animations.push({
      kind: "drop",
      col,
      row,
      player: res.player,
      start,
      duration: reduced ? 1 : flightDuration + settle,
      flightDuration: reduced ? 0 : flightDuration,
      tilt: (col % 2 ? -1 : 1) * tilt,
      rotation: 0,
      y: renderer.getTopCenter(col).y,
      progress: 0,
    });
    drawStatic();
    ensureRaf();

    await loadNotesForIndex();
    timeline.render();
    updateTravelUi();
    updateTurnUi();
    rebuildGhostRow();
    updateInputRouting();
  }

  /* Animates the board difference between two positions. */
  function queueJumpTransition(fromNode, toNode) {
    if (!fromNode || !toNode || fromNode.id === toNode.id) return;
    const H = CONFIG.historyJump;
    const now = performance.now();
    const remove = (row, col, player, duration) =>
      animations.push({ kind: "remove", row, col, player, start: now, duration, progress: 0, alpha: 1, scale: 1 });
    const drop = (row, col, player, delay, duration) =>
      animations.push({ kind: "drop", row, col, player, start: now + delay, duration, y: renderer.getTopCenter(col).y, progress: 0 });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = fromNode.board[r][c];
        const b = toNode.board[r][c];
        if (a === b) continue;
        if (b === 0) remove(r, c, a, H.remove);
        else if (a === 0) drop(r, c, b, 0, H.drop);
        else {
          remove(r, c, a, H.swapRemove);
          drop(r, c, b, H.swapDropDelay, H.swapDrop);
        }
      }
    }
    ensureRaf();
  }

  async function jumpToNode(targetNode) {
    if (activeTool !== Tool.Finger) return;
    if (!targetNode || targetNode.id === game.current.id) return;
    activePlayPointerId = null;
    activePlayNode = null;
    cancelEraserHold();
    notes.finishStroke();
    const from = game.current;
    // Cancel in-flight placements before rendering a different history node.
    animations = [];
    if (!notes.isLoading) game.current.noteDataUrl = notes.toDataUrl();
    game.goToNode(targetNode);
    clockView.refresh();
    updateTurnUi();
    queueJumpTransition(from, targetNode);
    await loadNotesForIndex();
    updateTravelUi();
    updateTurnUi();
    rebuildGhostRow();
    updateInputRouting();
    timeline.markCurrent();
    drawStatic();
  }

  function goPrev() {
    if (game.current.parent) jumpToNode(game.current.parent);
  }

  function goNext() {
    if (game.current.children[0]) jumpToNode(game.current.children[0]);
  }

  function goStart() {
    if (game.current !== game.root) jumpToNode(game.root);
  }

  function goEnd() {
    // Follow the same continuation as Next, staying inside this subtree.
    let last = game.current;
    while (last.children[0]) last = last.children[0];
    if (last !== game.current) jumpToNode(last);
  }

  btnStart.addEventListener("click", goStart);
  btnPrev.addEventListener("click", goPrev);
  btnNext.addEventListener("click", goNext);
  btnEnd.addEventListener("click", goEnd);
  btnReview.addEventListener("click", goStart);
  btnSave.addEventListener("click", () => showToast("Save coming soon"));

  $("timeline").addEventListener("click", (ev) => {
    if (activeTool !== Tool.Finger) return;
    const node = timeline.nodeFromEvent(ev);
    if (node) jumpToNode(node);
  });

  window.addEventListener("keydown", (ev) => {
    if (document.body.dataset.screen === "home") return;
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (analysisPage === "notes" && analysis.contains(t)) return;
    if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      goPrev();
    } else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      ev.preventDefault();
      goNext();
    }
  });

  // ---- Board input (hit layer over the hole grid) ----

  hitLayer.addEventListener("pointermove", (ev) => {
    if (activeTool !== Tool.Finger) return;
    hoverCol = colFromClientPoint(ev.clientX, ev.clientY);
    drawStatic();
  });
  hitLayer.addEventListener("pointerleave", () => {
    hoverCol = -1;
    drawStatic();
  });
  hitLayer.addEventListener("pointerdown", (ev) => {
    if (activeTool !== Tool.Finger) return;
    if (activePlayPointerId !== null || !clockAllowsPlacement()) return;
    if (!game.canPlayMove()) return;
    activePlayPointerId = ev.pointerId;
    activePlayNode = game.current;
    hitLayer.setPointerCapture(ev.pointerId);
    hoverCol = colFromClientPoint(ev.clientX, ev.clientY);
    drawStatic();
    ev.preventDefault();
  });
  hitLayer.addEventListener("pointerup", (ev) => {
    if (activePlayPointerId !== ev.pointerId) return;
    activePlayPointerId = null;
    const pressedNode = activePlayNode;
    activePlayNode = null;
    // The release only counts on the position where the press started.
    if (activeTool !== Tool.Finger || pressedNode !== game.current) return;
    const col = colFromClientPoint(ev.clientX, ev.clientY);
    hoverCol = col;
    drawStatic();
    if (col >= 0) handleDrop(col);
    ev.preventDefault();
  });
  hitLayer.addEventListener("pointercancel", (ev) => {
    if (activePlayPointerId === ev.pointerId) {
      activePlayPointerId = null;
      activePlayNode = null;
    }
  });

  // ---- Notes: tools, pages, ink routing, eraser, undo ----

  function currentNotes() {
    return analysisPage === "notes" ? paper : notes;
  }

  function syncNoteButtons() {
    const target = currentNotes();
    btnNoteUndo.disabled = noteHistoryBusy || target.isLoading || !target.canUndo();
    btnNoteRedo.disabled = noteHistoryBusy || target.isLoading || !target.canRedo();
  }

  async function loadNotesForIndex() {
    const node = game.current;
    const loading = notes.loadDataUrl(node.noteDataUrl || null);
    syncNoteButtons();
    await loading;
    if (node !== game.current) return;
    notes.resetHistoryWithCurrent();
    syncNoteButtons();
  }

  function updateInputRouting() {
    const editing = activeTool !== Tool.Finger;
    workspace.dataset.editing = String(editing);
    bottomModule.inert = editing;
    gamepad.inert = editing;
    updateTravelUi();
    hitLayer.style.pointerEvents = editing ? "none" : "auto";
    notes.canvas.hidden = analysisPage !== "moves";
    paper.canvas.hidden = analysisPage !== "notes";
    notes.bindPointerHandlers({
      enabled: editing && analysisPage === "moves",
      onStrokeEnd: () => {
        notes.pushHistory();
        game.current.noteDataUrl = notes.toDataUrl();
        syncNoteButtons();
      },
    });
    paper.bindPointerHandlers({
      enabled: editing && analysisPage === "notes",
      onStrokeEnd: () => {
        paper.pushHistory();
        syncNoteButtons();
      },
    });
    workspace.style.cursor = editing ? (activeTool === Tool.Eraser ? "cell" : "crosshair") : "";
  }

  function setActiveTool(tool) {
    cancelEraserHold();
    notes.finishStroke();
    paper.finishStroke();
    inkPointer = null;
    activePlayPointerId = null;
    activePlayNode = null;
    activeTool = tool;
    const editing = tool !== Tool.Finger;
    notes.setTool(editing ? tool : Tool.Pen);
    paper.setTool(editing ? tool : Tool.Pen);
    analysis.dataset.editing = String(editing);
    dock.dataset.editing = String(editing);
    btnEdit.setAttribute("aria-pressed", String(editing));
    btnEdit.title = editing ? "Return to playing" : "Draw with pen";
    [btnNew, btnSave, btnReview].forEach((b) => (b.hidden = editing));
    [btnEraser, btnNoteUndo, btnNoteRedo].forEach((b) => (b.hidden = !editing));
    btnEraser.setAttribute("aria-pressed", String(tool === Tool.Eraser));
    updateInputRouting();
    syncNoteButtons();
    drawStatic();
  }

  /* "moves" (history, play) or "notes" (notebook, pen). */
  function setAnalysisPage(page) {
    if (page === analysisPage) return;
    cancelEraserHold();
    notes.finishStroke();
    paper.finishStroke();
    analysisPage = page;
    const writing = page === "notes";
    analysis.dataset.page = page;
    movesPage.inert = writing;
    movesPage.setAttribute("aria-hidden", String(writing));
    paperPage.inert = !writing;
    paperPage.setAttribute("aria-hidden", String(!writing));
    pageToggle.innerHTML = `${writing ? "Notes" : "Analysis"} <span class="analysis__page-dots" aria-hidden="true">${writing ? "○ ●" : "● ○"}</span>`;
    pageToggle.setAttribute("aria-label", writing ? "Switch to move history" : "Switch to notes page");
    subtitle.textContent = writing ? "Draw anywhere · swipe edge for moves" : "Tap a move to explore";
    setActiveTool(writing ? Tool.Pen : Tool.Finger);
    if (!writing) timeline.follow();
  }

  btnEdit.addEventListener("click", () => setActiveTool(activeTool === Tool.Finger ? Tool.Pen : Tool.Finger));
  pageToggle.addEventListener("click", () => {
    if (performance.now() < suppressPageClickUntil) return;
    setAnalysisPage(analysisPage === "moves" ? "notes" : "moves");
  });

  // In play mode swipe anywhere in Analysis. While writing, use the header or an
  // edge so long horizontal pen/finger strokes never turn the page.
  function isAnalysisSwipeStart(ev) {
    if (!analysis.contains(ev.target) || ev.target.closest(".dock") || ev.pointerType === "pen") return false;
    if (activeTool === Tool.Finger) return true;
    const r = analysis.getBoundingClientRect();
    const edge = CONFIG.gestures.pageEdge;
    return !!ev.target.closest(".analysis__header") || ev.clientX - r.left < edge || r.right - ev.clientX < edge;
  }
  analysis.addEventListener("pointerdown", (ev) => {
    if (!ev.isPrimary || ev.button !== 0 || !isAnalysisSwipeStart(ev)) return;
    pageSwipe = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    if (activeTool !== Tool.Finger && !ev.target.closest("button")) {
      analysis.setPointerCapture(ev.pointerId);
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);
  analysis.addEventListener("pointerup", (ev) => {
    if (!pageSwipe || pageSwipe.id !== ev.pointerId) return;
    const dx = ev.clientX - pageSwipe.x, dy = ev.clientY - pageSwipe.y;
    pageSwipe = null;
    if (Math.abs(dx) < CONFIG.gestures.pageSwipe || Math.abs(dx) < Math.abs(dy) * CONFIG.gestures.pageSwipeRatio) return;
    const next = dx < 0 ? "notes" : "moves";
    if (next === analysisPage) return;
    suppressPageClickUntil = performance.now() + CONFIG.gestures.clickSuppress;
    ev.preventDefault();
    ev.stopPropagation();
    setAnalysisPage(next);
  }, true);
  analysis.addEventListener("pointercancel", () => (pageSwipe = null), true);
  analysis.addEventListener("click", (ev) => {
    if (performance.now() < suppressPageClickUntil && !ev.target.closest(".dock")) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  // The visible ink canvases are pointer-transparent. Route each stroke at the
  // app boundary, before a move token or mini-game can receive the input.
  workspace.addEventListener("pointerdown", (ev) => {
    if (activeTool === Tool.Finger || !ev.isPrimary || ev.button !== 0 || noteHistoryBusy) return;
    if ((ev.target.closest("button,input,a,select,textarea") && !ev.target.closest("#bottomModule,.decoGamepad")) || isAnalysisSwipeStart(ev)) return;
    const surface = currentNotes();
    if (surface.isLoading || inkPointer !== null) return;
    inkPointer = { id: ev.pointerId, surface };
    suppressInkClickUntil = performance.now() + CONFIG.gestures.clickSuppress;
    ev.stopImmediatePropagation();
    ev.preventDefault();
    surface.canvas.onpointerdown?.(ev);
  }, true);
  for (const type of ["pointermove", "pointerup", "pointercancel"]) {
    workspace.addEventListener(type, (ev) => {
      if (!inkPointer || inkPointer.id !== ev.pointerId) return;
      const surface = inkPointer.surface;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      surface.canvas["on" + type]?.(ev);
      if (type !== "pointermove") {
        inkPointer = null;
        suppressInkClickUntil = performance.now() + CONFIG.gestures.clickSuppress;
      }
    }, true);
  }
  workspace.addEventListener("lostpointercapture", (ev) => {
    if (inkPointer?.id === ev.pointerId) {
      inkPointer.surface.finishStroke();
      inkPointer = null;
    }
  }, true);
  workspace.addEventListener("click", (ev) => {
    if (activeTool !== Tool.Finger && ev.target.closest("#bottomModule,.decoGamepad")) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    if (performance.now() < suppressInkClickUntil && !ev.target.closest("button,input,a,select,textarea")) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);

  // Eraser: a short tap toggles eraser/pen; holding clears the page (undoable).
  function cancelEraserHold() {
    if (eraserHold) cancelAnimationFrame(eraserHold.raf);
    eraserHold = null;
    btnEraser.classList.remove("is-holding");
    btnEraser.style.setProperty("--hold", "0");
  }
  btnEraser.addEventListener("click", (ev) => {
    if (suppressEraserClick) {
      suppressEraserClick = false;
      ev.preventDefault();
      return;
    }
    if (activeTool !== Tool.Finger) setActiveTool(activeTool === Tool.Eraser ? Tool.Pen : Tool.Eraser);
  });
  btnEraser.addEventListener("contextmenu", (ev) => ev.preventDefault());
  btnEraser.addEventListener("pointerdown", (ev) => {
    if (!ev.isPrimary || ev.button !== 0 || activeTool === Tool.Finger || noteHistoryBusy || currentNotes().isLoading) return;
    suppressEraserClick = false;
    notes.finishStroke();
    paper.finishStroke();
    const target = currentNotes(), node = game.current;
    const hold = { pointer: ev.pointerId, start: performance.now(), raf: 0 };
    eraserHold = hold;
    btnEraser.setPointerCapture(ev.pointerId);
    btnEraser.classList.add("is-holding");
    const tick = () => {
      if (eraserHold !== hold) return;
      if (currentNotes() !== target || game.current !== node || document.hidden) {
        cancelEraserHold();
        return;
      }
      const progress = Math.min(1, (performance.now() - hold.start) / CONFIG.notes.clearHold);
      btnEraser.style.setProperty("--hold", String(progress));
      if (progress < 1) {
        hold.raf = requestAnimationFrame(tick);
        return;
      }
      target.clear();
      target.pushHistory();
      if (target === notes) node.noteDataUrl = target.toDataUrl();
      suppressEraserClick = true;
      cancelEraserHold();
      syncNoteButtons();
      showToast("Cleared this page · Undo to restore");
    };
    hold.raf = requestAnimationFrame(tick);
  });
  btnEraser.addEventListener("pointerup", cancelEraserHold);
  btnEraser.addEventListener("pointercancel", () => {
    suppressEraserClick = true;
    cancelEraserHold();
  });
  btnEraser.addEventListener("lostpointercapture", cancelEraserHold);
  btnEraser.addEventListener("pointermove", (ev) => {
    if (!eraserHold) return;
    const r = btnEraser.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) {
      suppressEraserClick = true;
      cancelEraserHold();
    }
  });
  window.addEventListener("blur", cancelEraserHold);

  async function travelNotes(direction) {
    if (noteHistoryBusy || currentNotes().isLoading) return;
    cancelEraserHold();
    const target = currentNotes(), node = game.current;
    target.finishStroke();
    noteHistoryBusy = true;
    syncNoteButtons();
    try {
      const operation = target[direction]();
      // Persist the chosen snapshot immediately, even if the user navigates
      // away while the bitmap is decoding.
      if (target === notes) node.noteDataUrl = target.history[target.historyIndex] || null;
      const changed = await operation;
      if (changed && target === notes && game.current === node) node.noteDataUrl = target.toDataUrl();
    } finally {
      noteHistoryBusy = false;
      syncNoteButtons();
    }
  }
  btnNoteUndo.addEventListener("click", () => travelNotes("undo"));
  btnNoteRedo.addEventListener("click", () => travelNotes("redo"));

  // ---- New game ----

  /* The single owner of a fresh board: tree, notes, clock and modules reset together. */
  async function resetGame() {
    cancelEraserHold();
    notes.finishStroke();
    paper.finishStroke();
    paper.loadDataUrl(null);
    paper.resetHistoryWithCurrent();
    setAnalysisPage("moves");
    setActiveTool(Tool.Finger);
    activePlayPointerId = null;
    activePlayNode = null;
    game.reset();
    clock.reset();
    modulePanel.reset();
    clockView.refresh();
    animations = [];
    notes.clear();
    notes.resetHistoryWithCurrent();
    await loadNotesForIndex();
    updateTravelUi();
    updateTurnUi();
    rebuildGhostRow();
    updateInputRouting();
    timeline.render();
    drawStatic();
    showToast("New game");
  }
  btnNew.addEventListener("click", resetGame);

  // ---- Screens: Home ⇄ game ----

  // Home is an entry screen; resetGame stays the sole owner of a new board.
  const enterGame = (fresh) => AppExperience.transition(async () => {
    if (fresh) await resetGame();
    hasSession = true;
    document.body.dataset.screen = "game";
    workspace.removeAttribute("aria-hidden");
    homeScreen.setAttribute("aria-hidden", "true");
    homeScreen.hidden = true;
    window.scrollTo(0, 0);
    await relayoutCanvases();
    modulePanel.resume();
    drawStatic();
    ensureRaf();
  });
  $("home-new").addEventListener("click", () => enterGame(true));
  $("home-continue").addEventListener("click", () => (hasSession ? enterGame(false) : showToast("Start a New Game first")));
  $("home-recent").addEventListener("click", () => showToast("No recent games yet"));
  $("btnHome").addEventListener("click", () => {
    // Do not lose an Orbit life while the cloud curtain is travelling in.
    modulePanel.suspend();
    return AppExperience.transition(async () => {
      cancelEraserHold();
      notes.finishStroke();
      paper.finishStroke();
      // Modules pause; a running Game Clock keeps running, as when reviewing
      // history or viewing another module. Continue never resets it.
      modulePanel.suspend();
      homeScreen.hidden = false;
      homeScreen.removeAttribute("aria-hidden");
      workspace.setAttribute("aria-hidden", "true");
      document.body.dataset.screen = "home";
      if (clock.status === "running") showToast("Game Clock keeps running · Continue to return");
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelEraserHold();
      notes.finishStroke();
      paper.finishStroke();
      inkPointer = null;
    }
    document.body.classList.toggle("motion-paused", document.hidden);
    if (!document.hidden) ensureRaf();
  });
  window.addEventListener("pageshow", () => document.body.classList.toggle("motion-paused", document.hidden));

  // ---- Startup ----
  (async () => {
    registerServiceWorker();
    notes.resetHistoryWithCurrent();
    resizeWorkspaceInk();
    paper.resetHistoryWithCurrent();
    setActiveTool(Tool.Finger);
    rebuildGhostRow();
    timeline.render();
    updateTurnUi();
    updateTravelUi();
    updateInputRouting();
    await relayoutCanvases();
    await AppExperience.assetsReady;
    // Decode and lay out behind the opening screen, before any first tap.
    await relayoutCanvases();
    renderer.warmEffects();
    drawStatic();
    await AppExperience.ready();
    scheduleRelayout(120);
    window.addEventListener("load", () => scheduleRelayout(40), { once: true });
    window.addEventListener("pageshow", () => scheduleRelayout(40));
    // Keep canvases aligned on any resize or orientation change.
    window.addEventListener("resize", () => scheduleRelayout());
    new ResizeObserver(() => scheduleRelayout()).observe(layers);
    new ResizeObserver(resizeWorkspaceInk).observe(workspace);
  })().catch((error) => {
    console.error("App startup failed", error);
    AppExperience.failed();
  });
}

document.addEventListener("DOMContentLoaded", setup);
