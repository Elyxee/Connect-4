/* Draws the board on two stacked canvases:
   - pieces layer (#boardCanvas): chips, hover column, drop animations, win light;
   - frame layer (#frameCanvas): the board art above the chips, plus win rims.
   The board art PNG already has transparent holes, so chips show through it.
   Geometry comes from CONFIG.board (measured hole centres in the art). */
class BoardRenderer {
  constructor(boardCanvas, frameCanvas) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext("2d");
    this.frameCanvas = frameCanvas;
    this.frameCtx = frameCanvas.getContext("2d");
    this.onAssetReady = null;

    this.w = boardCanvas.width;
    this.h = boardCanvas.height;
    this.sourceRect = CONFIG.board.sourceRect;
    this.colNorms = CONFIG.board.colNorms;
    this.rowNorms = CONFIG.board.rowNorms;
    this.drawRect = { x: 0, y: 0, w: this.w, h: this.h };
    this.recomputeMetrics();

    // Static pieces are cached here and only redrawn when the board changes.
    this.baseCanvas = document.createElement("canvas");
    this.baseCtx = this.baseCanvas.getContext("2d");
    this.baseKey = "";
    this.baseCanvas.width = this.w;
    this.baseCanvas.height = this.h;

    this.frameOverlayCanvas = document.createElement("canvas");
    this.frameOverlayCtx = this.frameOverlayCanvas.getContext("2d");
    this.frameOverlayDirty = true;

    this.boardImage = new Image();
    this.boardImageLoaded = false;
    this.boardImage.onload = () => {
      this.boardImageLoaded = true;
      this.recomputeMetrics();
      this.baseKey = "";
      this.onAssetReady?.();
    };
    this.boardImage.src = CONFIG.assets.board;

    // Flat discs stand in until the chip artwork has loaded.
    this.pieceSprites = this.makePieceSprites();
    this.pieceImages = { [Player.Red]: null, [Player.Yellow]: null };
    this.loadPieceImage(Player.Red, CONFIG.assets.chips.red);
    this.loadPieceImage(Player.Yellow, CONFIG.assets.chips.yellow);

    this.winEffectKey = "";
    this.winEffectStart = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  }

  resize(nextW, nextH) {
    this.w = nextW;
    this.h = nextH;
    this.recomputeMetrics();

    this.baseCanvas.width = nextW;
    this.baseCanvas.height = nextH;
    this.baseKey = "";
    this.frameCanvas.width = nextW;
    this.frameCanvas.height = nextH;
    this.frameOverlayCanvas.width = nextW;
    this.frameOverlayCanvas.height = nextH;
    this.frameOverlayDirty = true;
    for (const ctx of [this.ctx, this.frameCtx, this.baseCtx, this.frameOverlayCtx]) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
  }

  recomputeMetrics() {
    const radiusShare = CONFIG.board.pieceRadius;
    this.frameOverlayDirty = true;
    if (!this.boardImageLoaded) {
      this.drawRect = { x: 0, y: 0, w: this.w, h: this.h };
      this.cellW = this.w / COLS;
      this.cellH = this.h / ROWS;
      this.radius = Math.min(this.cellW, this.cellH) * radiusShare;
      return;
    }
    // Fit the cropped art inside the canvas, centred, preserving its aspect ratio.
    const sw = this.sourceRect.w;
    const sh = this.sourceRect.h;
    const s = Math.min(this.w / sw, this.h / sh);
    const dw = sw * s;
    const dh = sh * s;
    this.drawRect = { x: (this.w - dw) / 2, y: (this.h - dh) / 2, w: dw, h: dh };
    const colNorms = this.colNorms;
    const rowNorms = this.rowNorms;
    const avgDx = (colNorms[colNorms.length - 1] - colNorms[0]) / (colNorms.length - 1);
    const avgDy = (rowNorms[rowNorms.length - 1] - rowNorms[0]) / (rowNorms.length - 1);
    this.cellW = (avgDx * this.boardImage.width / sw) * dw;
    this.cellH = (avgDy * this.boardImage.height / sh) * dh;
    this.radius = Math.min(this.cellW, this.cellH) * radiusShare;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  makePieceSprites() {
    const mk = (palette) => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const x = c.getContext("2d");
      x.beginPath();
      x.arc(128, 128, 120, 0, Math.PI * 2);
      x.fillStyle = palette.base;
      x.fill();
      x.strokeStyle = palette.edge;
      x.lineWidth = 8;
      x.stroke();
      x.beginPath();
      x.arc(128, 126, 95, 0, Math.PI * 2);
      x.strokeStyle = palette.shadow;
      x.lineWidth = 5;
      x.stroke();
      return c;
    };
    return {
      [Player.Red]: mk({ edge: "#5c0f14", base: "#ff3b30", shadow: "#b81f1a" }),
      [Player.Yellow]: mk({ edge: "#5f4b00", base: "#ffcc00", shadow: "#b58e00" }),
    };
  }

  loadPieceImage(player, src) {
    const img = new Image();
    img.onload = () => {
      this.pieceImages[player] = img;
      this.baseKey = "";
      this.onAssetReady?.();
    };
    img.src = src;
  }

  /* Canvas-pixel centre of a hole. */
  getCellCenter(col, row) {
    const { x: dx, y: dy, w, h } = this.drawRect;
    const colNorm = this.colNorms[clamp(col, 0, COLS - 1)];
    const rowNorm = this.rowNorms[clamp(row, 0, ROWS - 1)];
    if (!this.boardImageLoaded) return { x: dx + colNorm * w, y: dy + rowNorm * h };
    const s = this.sourceRect;
    const nx = colNorm * this.boardImage.width;
    const ny = rowNorm * this.boardImage.height;
    return { x: dx + ((nx - s.x) / s.w) * w, y: dy + ((ny - s.y) / s.h) * h };
  }

  /* Where a dropped chip starts, just above the column. */
  getTopCenter(col) {
    const c = this.getCellCenter(col, 0);
    return { x: c.x, y: c.y - this.cellH * 1.15 };
  }

  /* The playable grid's bounding box (CSS pixels when scale = CSS/canvas). */
  getGuideMetrics(scale = 1) {
    const topCenter = this.getCellCenter(0, 0);
    const rightCenter = this.getCellCenter(COLS - 1, 0);
    return {
      left: (topCenter.x - this.cellW * 0.58) * scale,
      top: (topCenter.y - this.cellH * 0.5) * scale,
      width: (rightCenter.x - topCenter.x + this.cellW * 1.16) * scale,
      height: this.cellH * ROWS * scale,
    };
  }

  ensureFrameOverlay() {
    if (!this.frameOverlayDirty) return;
    this.foregroundClean = false;
    const ctx = this.frameOverlayCtx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.boardImageLoaded) {
      // Draw the exported PNG unchanged: removing dark pixels or punching extra
      // circles would destroy its black outlines and gold rim.
      const { x, y, w, h } = this.drawRect;
      const s = this.sourceRect;
      ctx.drawImage(this.boardImage, s.x, s.y, s.w, s.h, x, y, w, h);
    }
    this.frameOverlayDirty = false;
  }

  drawPieces(board, highlightCol = -1, omitSet = null) {
    const ctx = this.ctx;
    ctx.save();

    // Column highlight: soft per-hole emphasis, no rectangular edge artifacts.
    if (highlightCol >= 0 && highlightCol < COLS) {
      ctx.save();
      for (let rr = 0; rr < ROWS; rr++) {
        const p = this.getCellCenter(highlightCol, rr);
        ctx.fillStyle = CONFIG.board.columnHighlight;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.radius * 1.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r][c];
        if (p === 0 || (omitSet && omitSet.has(`${r},${c}`))) continue;
        const { x, y } = this.getCellCenter(c, r);
        this.drawPieceAt(x, y, p);
        this.drawSeatShade(x, y);
      }
    }

    ctx.restore();
  }

  drawPieceAt(x, y, player, alpha = 1, scale = 1, rotation = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Hard clip into the hole so a chip never bleeds onto the frame.
    ctx.beginPath();
    ctx.arc(x, y, this.radius * 0.98, 0, Math.PI * 2);
    ctx.clip();
    const sprite = this.pieceImages[player] || this.pieceSprites[player];
    const size = this.radius * 1.98 * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawSeatShade(x, y, strength = 1) {
    const ctx = this.ctx;
    const r = this.radius;
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.clip();
    // The socket casts a fixed shadow onto the seated piece.
    const shade = ctx.createRadialGradient(x, y + r * 0.1, r * 0.69, x, y, r);
    shade.addColorStop(0, "rgba(45, 23, 27, 0)");
    shade.addColorStop(0.65, "rgba(45, 23, 27, 0.05)");
    shade.addColorStop(1, "rgba(45, 23, 27, 0.28)");
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---- Connect-four highlight ----

  winLightLevel(index, now) {
    if (this.reducedMotion.matches) return 0.65;
    const elapsed = Math.max(0, now - this.winEffectStart - index * CONFIG.winEffect.stagger);
    const entrance = clamp(elapsed / 180, 0, 1);
    const beat = (0.5 + 0.5 * Math.cos(elapsed / CONFIG.winEffect.pulse * Math.PI * 2)) ** 2;
    return entrance * (0.45 + 0.55 * beat);
  }

  drawWinBackdrop(ctx, winCells, now) {
    const fade = this.reducedMotion.matches ? 1 : clamp((now - this.winEffectStart) / 320, 0, 1);
    const key = `${this.w}:${this.h}:${this.radius}:${winCells.join(";")}`;
    if (this.winMaskKey !== key) {
      this.winMaskKey = key;
      const mask = new Path2D();
      mask.rect(0, 0, this.w, this.h);
      for (const cell of winCells) {
        const [row, col] = cell.split(",").map(Number);
        const { x, y } = this.getCellCenter(col, row);
        mask.moveTo(x + this.radius * 1.31, y);
        mask.arc(x, y, this.radius * 1.31, 0, Math.PI * 2);
      }
      this.winMask = mask;
    }
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.clip(this.winMask, "evenodd");
    ctx.fillStyle = `rgba(22, 13, 32, ${0.34 * fade})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  winningLinks(winCells) {
    const key = winCells.join(";");
    if (this.linksKey === key) return this.linksCache;
    this.linksKey = key;
    const cells = new Set(winCells);
    const links = new Map();
    for (const cell of winCells) {
      const [row, col] = cell.split(",").map(Number);
      for (const [dr, dc] of LINE_DIRECTIONS) {
        if (cells.has(`${row - dr},${col - dc}`)) continue;
        const run = [];
        for (let r = row, c = col; cells.has(`${r},${c}`); r += dr, c += dc) run.push([r, c]);
        if (run.length < 4) continue;
        for (let i = 1; i < run.length; i++) links.set(`${run[i - 1]}:${run[i]}`, [run[i - 1], run[i]]);
      }
    }
    return (this.linksCache = [...links.values()]);
  }

  drawWinLight(winCells, now) {
    const ctx = this.ctx;
    this.drawWinBackdrop(ctx, winCells, now);
    winCells.forEach((cell, index) => {
      const [row, col] = cell.split(",").map(Number);
      const { x, y } = this.getCellCenter(col, row);
      const r = this.radius * 0.93;
      const light = this.winLightLevel(index, now);
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      const faceLight = ctx.createRadialGradient(x - r * 0.25, y - r * 0.4, 0, x, y, r);
      faceLight.addColorStop(0, `rgba(255, 248, 205, ${light * 0.36})`);
      faceLight.addColorStop(0.7, `rgba(255, 227, 132, ${light * 0.15})`);
      faceLight.addColorStop(1, "rgba(255, 227, 132, 0)");
      ctx.fillStyle = faceLight;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.beginPath();
      ctx.arc(x, y, this.radius * 0.89, 0, Math.PI * 2);
      ctx.lineWidth = this.radius * 0.065;
      ctx.strokeStyle = `rgba(255, 250, 213, ${0.55 + light * 0.4})`;
      ctx.stroke();
      ctx.restore();
    });
  }

  drawWinningRims(winCells, now) {
    if (!this.winEffectKey) return;
    const ctx = this.frameCtx;
    const r = this.radius;
    this.drawWinBackdrop(ctx, winCells, now);
    ctx.save();
    // Tint only existing frame pixels: hole transparency and the gold artwork
    // remain intact while the socket and its piece share the same light pulse.
    ctx.globalCompositeOperation = "source-atop";
    ctx.lineCap = "round";
    winCells.forEach((cell, index) => {
      const [row, col] = cell.split(",").map(Number);
      const { x, y } = this.getCellCenter(col, row);
      const light = this.winLightLevel(index, now);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.22;
      ctx.strokeStyle = `rgba(255, 198, 37, ${0.45 + light * 0.5})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.075;
      ctx.strokeStyle = `rgba(255, 252, 221, ${0.65 + light * 0.35})`;
      ctx.stroke();
      if (!this.reducedMotion.matches) {
        const angle = (now - this.winEffectStart) / 1300 + index * 0.35;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.12, angle, angle + Math.PI * 0.45);
        ctx.lineWidth = r * 0.075;
        ctx.strokeStyle = `rgba(255, 253, 226, ${light * 0.88})`;
        ctx.stroke();
      }
    });
    ctx.restore();

    // Join the illuminated sockets across the frame without drawing over faces.
    const reveal = this.reducedMotion.matches ? 1 : clamp((now - this.winEffectStart - 120) / 600, 0, 1);
    const links = this.winningLinks(winCells);
    ctx.save();
    ctx.lineCap = "round";
    links.forEach(([a, b], index) => {
      const start = this.getCellCenter(a[1], a[0]);
      const end = this.getCellCenter(b[1], b[0]);
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const dx = (end.x - start.x) / length;
      const dy = (end.y - start.y) / length;
      const portion = clamp(reveal * links.length - index, 0, 1);
      if (!portion) return;
      const x = start.x + dx * r * 1.19;
      const y = start.y + dy * r * 1.19;
      const span = (length - r * 2.38) * portion;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * span, y + dy * span);
      ctx.strokeStyle = "rgba(62, 31, 39, 0.85)";
      ctx.lineWidth = r * 0.19;
      ctx.stroke();
      ctx.strokeStyle = "#ffd74f";
      ctx.lineWidth = r * 0.12;
      ctx.stroke();
      ctx.strokeStyle = "#fff5d4";
      ctx.lineWidth = r * 0.045;
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---- Frame composition ----

  /* Pieces layer: cached static pieces + in-flight animations + win light.
     Animations: {kind:"drop", col, row, player, y, rotation} or
                 {kind:"remove", col, row, player, alpha, scale}, each with start/progress. */
  drawFrame(board, highlightCol = -1, animations = [], winCells = []) {
    const now = performance.now();
    const omit = new Set();
    for (const a of animations) {
      if (a.kind === "drop" && a.progress < 1) omit.add(`${a.row},${a.col}`);
    }
    const baseKey = `${boardKey(board, highlightCol)}|omit:${[...omit].join(";")}|img:${this.boardImageLoaded ? 1 : 0}`;

    if (baseKey !== this.baseKey) {
      this.baseKey = baseKey;
      this.baseCtx.clearRect(0, 0, this.w, this.h);
      // Reuse the drawing methods by temporarily pointing them at the cache.
      const prevCtx = this.ctx;
      this.ctx = this.baseCtx;
      this.drawPieces(board, highlightCol, omit);
      this.ctx = prevCtx;
    }

    this.clear();
    this.ctx.drawImage(this.baseCanvas, 0, 0);

    for (const a of animations) {
      if (a.progress >= 1 || now < a.start) continue;
      if (a.kind === "drop") {
        const seat = this.getCellCenter(a.col, a.row);
        this.drawPieceAt(seat.x, a.y, a.player, 1, 1, a.rotation || 0);
        const contact = clamp(1 - Math.abs(seat.y - a.y) / (this.radius * 0.4), 0, 1);
        this.drawSeatShade(seat.x, seat.y, contact);
      } else if (a.kind === "remove") {
        const { x, y } = this.getCellCenter(a.col, a.row);
        this.drawPieceAt(x, y, a.player, a.alpha, a.scale);
      }
    }
    // Animate the light outside the static cache, without changing silhouettes.
    const winKey = winCells.length && !omit.size ? `${boardKey(board, -1)}|${winCells.join(";")}` : "";
    if (winKey !== this.winEffectKey) {
      this.winEffectKey = winKey;
      this.winEffectStart = now;
    }
    if (winKey) this.drawWinLight(winCells, now);
  }

  /* Frame layer: the board art, plus animated rims while a win is shown. */
  drawForegroundFrame(winCells = []) {
    this.ensureFrameOverlay();
    // A drop only changes the pieces layer; skip re-uploading the static frame.
    if (this.foregroundClean && !this.winEffectKey) return;
    this.frameCtx.clearRect(0, 0, this.w, this.h);
    this.frameCtx.drawImage(this.frameOverlayCanvas, 0, 0);
    this.drawWinningRims(winCells, performance.now());
    this.foregroundClean = !this.winEffectKey;
  }

  /* First-use shader/compositing work happens behind the startup screen.
     Reuse existing backing stores, then immediately restore the real board. */
  warmEffects() {
    const ctx = this.ctx, frameCtx = this.frameCtx;
    const key = this.winEffectKey, start = this.winEffectStart;
    const sample = ["5,0", "5,1", "5,2", "5,3"];
    this.ctx = this.baseCtx;
    this.frameCtx = this.frameOverlayCtx;
    this.winEffectKey = "warm";
    this.winEffectStart = performance.now() - 1000;
    try {
      this.drawWinLight(sample, performance.now());
      this.drawWinningRims(sample, performance.now());
    } finally {
      this.ctx = ctx;
      this.frameCtx = frameCtx;
      this.winEffectKey = key;
      this.winEffectStart = start;
      this.baseKey = "";
      this.frameOverlayDirty = true;
    }
  }
}

/* Cheap cache key for a board plus highlighted column. */
function boardKey(board, hiCol) {
  let s = `${hiCol}|`;
  for (let r = 0; r < ROWS; r++) s += board[r].join("");
  return s;
}
