/* Connect4 Notes - front-end only PWA */

const COLS = 7;
const ROWS = 6;

const Player = Object.freeze({
  Red: 1,
  Yellow: 2,
});

const Theme = Object.freeze({
  Dark: "dark",
  Light: "light",
});

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function deepCopyBoard(board) {
  return board.map((row) => row.slice());
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
}

function otherPlayer(p) {
  return p === Player.Red ? Player.Yellow : Player.Red;
}

function playerName(p) {
  return p === Player.Red ? "Red" : "Yellow";
}

function playerCss(p) {
  return p === Player.Red ? "red" : "yellow";
}

function boardSignature(board) {
  // compact signature for equality; Connect4 is small so this is fine
  return board.map((r) => r.join("")).join("|");
}

function findLandingRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r;
  return -1;
}

function analyzeWinCells(board, player) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  const inb = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const cells = new Set();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        // start-of-run check: only evaluate once per contiguous segment
        const pr = r - dr;
        const pc = c - dc;
        if (inb(pr, pc) && board[pr][pc] === player) continue;

        let len = 0;
        let rr = r;
        let cc = c;
        while (inb(rr, cc) && board[rr][cc] === player) {
          len++;
          rr += dr;
          cc += dc;
        }
        if (len >= 4) {
          for (let i = 0; i < len; i++) cells.add(`${r + dr * i},${c + dc * i}`);
        }
      }
    }
  }
  return {
    isWin: cells.size > 0,
    cells: [...cells],
  };
}

function registerServiceWorker() {
  // Optional: user didn't request SW, but having offline is core PWA feel.
  // Keep it minimal and safe.
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function makeNodeId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

class GameNode {
  constructor({ parent, board, toPlay, moveCol = null, moveRow = null, movePlayer = null, ply = 0, isWin = false, winCells = [] }) {
    this.id = makeNodeId();
    this.parent = parent || null;
    this.children = [];
    this.board = board;
    this.toPlay = toPlay;
    this.moveCol = moveCol;
    this.moveRow = moveRow;
    this.movePlayer = movePlayer;
    this.ply = ply; // 0 = root; 1..n for moves
    this.isWin = isWin;
    this.winCells = winCells;
    this.noteDataUrl = null;
    this.sig = boardSignature(board);
  }
}

class GameState {
  constructor() {
    this.theme = Theme.Dark;
    this.root = new GameNode({ parent: null, board: emptyBoard(), toPlay: Player.Red, ply: 0 });
    this.current = this.root;

    this.nodeById = new Map();
    this.nodeById.set(this.root.id, this.root);
  }

  get board() {
    return this.current.board;
  }

  get currentPlayer() {
    return this.current.toPlay;
  }

  canPlayMove() {
    return !this.current.isWin;
  }

  applyMove(col) {
    if (!this.canPlayMove()) return null;
    if (col < 0 || col >= COLS) return null;
    const row = findLandingRow(this.current.board, col);
    if (row < 0) return null;

    const player = this.current.toPlay;
    const nextBoard = deepCopyBoard(this.current.board);
    nextBoard[row][col] = player;

    const winInfo = analyzeWinCells(nextBoard, player);
    const nextSig = boardSignature(nextBoard);

    // Variation rule: do NOT overwrite; create a new child if the next board differs.
    let child = this.current.children.find((ch) => ch.sig === nextSig);
    if (!child) {
      child = new GameNode({
        parent: this.current,
        board: nextBoard,
        toPlay: otherPlayer(player),
        moveCol: col,
        moveRow: row,
        movePlayer: player,
        ply: this.current.ply + 1,
        isWin: winInfo.isWin,
        winCells: winInfo.cells,
      });
      this.current.children.push(child);
      this.nodeById.set(child.id, child);
    }

    this.current = child;
    return { col, row, player, node: child, isWin: winInfo.isWin };
  }

  goToNode(node) {
    if (!node) return;
    this.current = node;
  }
}

class BoardRenderer {
  constructor(boardCanvas, frameCanvas) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext("2d");
    this.frameCanvas = frameCanvas;
    this.frameCtx = frameCanvas.getContext("2d");

    this.w = boardCanvas.width;
    this.h = boardCanvas.height;
    this.recomputeMetrics();

    this.baseCanvas = document.createElement("canvas");
    this.baseCtx = this.baseCanvas.getContext("2d");
    this.baseKey = "";
    this.baseCanvas.width = this.w;
    this.baseCanvas.height = this.h;

    this.lastStaticBoardKey = "";
    this.boardImage = new Image();
    this.boardImageLoaded = false;
    this.sourceRect = { x: 0, y: 0, w: 1, h: 1 };
    this.boardImage.src = "./board-art.png";
    this.boardImage.onload = () => {
      this.boardImageLoaded = true;
      this.detectSourceRectFromImage();
      this.detectHoleGridFromImage();
      this.recomputeMetrics();
      this.baseKey = "";
      this.lastStaticBoardKey = "";
      if (typeof this.onAssetReady === "function") this.onAssetReady();
    };

    // Normalized playable hole-grid coordinates inside the board art image.
    // Calibrated for current sprite (1024x768).
    this.gridNorm = {
      // Re-calibrated for the clean square board art.
      // These values map ONLY to the 7x6 playable holes region.
      left: 0.287,
      top: 0.303,
      dx: 0.0748,
      dy: 0.0778,
    };
    this.colNorms = null;
    this.rowNorms = null;
    this.drawRect = { x: 0, y: 0, w: this.w, h: this.h };
    this.frameOverlayCanvas = document.createElement("canvas");
    this.frameOverlayCtx = this.frameOverlayCanvas.getContext("2d");
    this.frameOverlayDirty = true;
    this.pieceSprites = this.makePieceSprites();
    this.pieceImages = {
      [Player.Red]: null,
      [Player.Yellow]: null,
    };
    this.loadPieceImage(Player.Red, "./assets/red-chip.png");
    this.loadPieceImage(Player.Yellow, "./assets/yellow-chip.png");
    this.onAssetReady = null;
  }

  resize(nextW, nextH) {
    this.w = nextW;
    this.h = nextH;
    this.recomputeMetrics();
    this.lastStaticBoardKey = "";

    this.baseCanvas.width = nextW;
    this.baseCanvas.height = nextH;
    this.baseKey = "";
    this.frameCanvas.width = nextW;
    this.frameCanvas.height = nextH;
    this.frameOverlayCanvas.width = nextW;
    this.frameOverlayCanvas.height = nextH;
    this.frameOverlayDirty = true;
  }

  recomputeMetrics() {
    if (this.boardImageLoaded) {
      const sw = this.sourceRect.w;
      const sh = this.sourceRect.h;
      const s = Math.min(this.w / sw, this.h / sh);
      const dw = sw * s;
      const dh = sh * s;
      const dx = (this.w - dw) / 2;
      const dy = (this.h - dh) / 2;
      this.drawRect = { x: dx, y: dy, w: dw, h: dh };
      const colNorms = this.colNorms || Array.from({ length: COLS }, (_, i) => this.gridNorm.left + this.gridNorm.dx * i);
      const rowNorms = this.rowNorms || Array.from({ length: ROWS }, (_, i) => this.gridNorm.top + this.gridNorm.dy * i);
      const avgDx =
        colNorms.length > 1 ? (colNorms[colNorms.length - 1] - colNorms[0]) / (colNorms.length - 1) : this.gridNorm.dx;
      const avgDy =
        rowNorms.length > 1 ? (rowNorms[rowNorms.length - 1] - rowNorms[0]) / (rowNorms.length - 1) : this.gridNorm.dy;
      const iw = this.boardImage.width;
      const ih = this.boardImage.height;
      this.cellW = (avgDx * iw / sw) * dw;
      this.cellH = (avgDy * ih / sh) * dh;
      this.radius = Math.min(this.cellW, this.cellH) * 0.37;
      this.frameOverlayDirty = true;
      return;
    }
    this.drawRect = { x: 0, y: 0, w: this.w, h: this.h };
    this.cellW = this.w / COLS;
    this.cellH = this.h / ROWS;
    this.radius = Math.min(this.cellW, this.cellH) * 0.37;
    this.frameOverlayDirty = true;
  }

  detectSourceRectFromImage() {
    const iw = this.boardImage.width;
    const ih = this.boardImage.height;
    if (!iw || !ih) return;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(this.boardImage, 0, 0);
    const data = ctx.getImageData(0, 0, iw, ih).data;
    let minX = iw, minY = ih, maxX = -1, maxY = -1;
    const p = (x, y) => {
      const i = (y * iw + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const corners = [p(0, 0), p(iw - 1, 0), p(0, ih - 1), p(iw - 1, ih - 1)];
    const bg = [
      (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4,
      (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4,
      (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4,
    ];
    const dist = (r, g, b) => {
      const dr = r - bg[0];
      const dg = g - bg[1];
      const db = b - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const i = (y * iw + x) * 4;
        const a = data[i + 3];
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // consider pixels sufficiently different from corner background as content
        if (a > 20 && dist(r, g, b) > 26) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX > minX && maxY > minY) {
      // small safety padding around art
      const pad = 2;
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const ex = Math.min(iw - 1, maxX + pad);
      const eyRaw = Math.min(ih - 1, maxY + pad);
      // Board source has a thin artifact line near the very bottom; trim harder.
      const ey = Math.max(sy + 1, eyRaw - 4);
      this.sourceRect = { x: sx, y: sy, w: ex - sx + 1, h: ey - sy + 1 };
    } else {
      this.sourceRect = { x: 0, y: 0, w: iw, h: ih };
    }
  }

  kmeans1d(values, k, maxIter = 24) {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length < k) return null;
    let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor((i * (sorted.length - 1)) / (k - 1))]);
    for (let it = 0; it < maxIter; it++) {
      const buckets = Array.from({ length: k }, () => []);
      for (const v of sorted) {
        let bi = 0;
        let bd = Math.abs(v - centers[0]);
        for (let i = 1; i < k; i++) {
          const d = Math.abs(v - centers[i]);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        buckets[bi].push(v);
      }
      const next = centers.map((c, i) => (buckets[i].length ? buckets[i].reduce((s, v) => s + v, 0) / buckets[i].length : c));
      const moved = next.reduce((m, c, i) => Math.max(m, Math.abs(c - centers[i])), 0);
      centers = next;
      if (moved < 0.001) break;
    }
    return centers.sort((a, b) => a - b);
  }

  median(values) {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  detectHoleGridFromImage() {
    const iw = this.boardImage.width;
    const ih = this.boardImage.height;
    if (!iw || !ih) return;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(this.boardImage, 0, 0);
    const data = ctx.getImageData(0, 0, iw, ih).data;
    const mask = new Uint8Array(iw * ih);
    for (let p = 0, i = 0; i < mask.length; i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];
      mask[i] = a > 20 && r < 44 && g < 44 && b < 52 ? 1 : 0;
    }
    const vis = new Uint8Array(mask.length);
    const comps = [];
    const qx = new Int32Array(mask.length);
    const qy = new Int32Array(mask.length);
    const idx = (x, y) => y * iw + x;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const st = idx(x, y);
        if (!mask[st] || vis[st]) continue;
        let head = 0;
        let tail = 0;
        qx[tail] = x;
        qy[tail] = y;
        tail++;
        vis[st] = 1;
        let count = 0;
        let sx = 0;
        let sy = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        while (head < tail) {
          const cx = qx[head];
          const cy = qy[head];
          head++;
          count++;
          sx += cx;
          sy += cy;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          const n = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ];
          for (const [nx, ny] of n) {
            if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
            const ni = idx(nx, ny);
            if (!mask[ni] || vis[ni]) continue;
            vis[ni] = 1;
            qx[tail] = nx;
            qy[tail] = ny;
            tail++;
          }
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const ar = bw / Math.max(1, bh);
        if (count > 480 && count < 8500 && ar > 0.72 && ar < 1.32) {
          const cx = sx / count;
          const cy = sy / count;
          if (cx > iw * 0.2 && cx < iw * 0.82 && cy > ih * 0.2 && cy < ih * 0.78) {
            comps.push({ cx, cy });
          }
        }
      }
    }
    if (comps.length < 30) return;
    const xs = comps.map((c0) => c0.cx);
    const ys = comps.map((c0) => c0.cy);
    const xc = this.kmeans1d(xs, COLS);
    const yc = this.kmeans1d(ys, ROWS);
    if (!xc || !yc) return;
    const xDiffs = [];
    for (let i = 0; i < xc.length - 1; i++) xDiffs.push(xc[i + 1] - xc[i]);
    const xStep = this.median(xDiffs);
    const x0 = xc[0];
    const rebuiltCols = Array.from({ length: COLS }, (_, i) => x0 + i * xStep);
    this.colNorms = rebuiltCols.map((v) => v / iw);

    // Bottom rows are often biased by base ornament shadows; enforce evenly spaced rows.
    const diffs = [];
    for (let i = 0; i < yc.length - 1; i++) diffs.push(yc[i + 1] - yc[i]);
    const step = this.median(diffs);
    const row0 = yc[0];
    const rebuiltRows = Array.from({ length: ROWS }, (_, i) => row0 + i * step);
    this.rowNorms = rebuiltRows.map((v) => v / ih);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  makePieceSprites() {
    const mk = (palette) => {
      const s = 20;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const x = c.getContext("2d");
      x.imageSmoothingEnabled = false;
      // Pixel chip (octagon-ish), not procedural smooth circle.
      const drawRect = (x0, y0, w0, h0, color) => {
        x.fillStyle = color;
        x.fillRect(x0, y0, w0, h0);
      };
      // base body
      drawRect(3, 1, 14, 1, palette.edge);
      drawRect(2, 2, 16, 1, palette.edge);
      drawRect(1, 3, 18, 14, palette.edge);
      drawRect(2, 17, 16, 1, palette.edge);
      drawRect(3, 18, 14, 1, palette.edge);

      drawRect(3, 2, 14, 1, palette.light);
      drawRect(2, 3, 16, 1, palette.light);
      drawRect(2, 4, 16, 12, palette.base);
      drawRect(3, 16, 14, 1, palette.shadow);
      drawRect(4, 17, 12, 1, palette.shadow);

      // inner highlight
      drawRect(5, 5, 4, 1, palette.glint);
      drawRect(4, 6, 5, 1, palette.glint);
      drawRect(4, 7, 3, 1, palette.glint);
      return c;
    };
    return {
      [Player.Red]: mk({
        edge: "#5c0f14",
        light: "#ff6e63",
        base: "#ff3b30",
        shadow: "#b81f1a",
        glint: "#ffd4d0",
      }),
      [Player.Yellow]: mk({
        edge: "#5f4b00",
        light: "#ffe07a",
        base: "#ffcc00",
        shadow: "#b58e00",
        glint: "#fff2b8",
      }),
    };
  }

  loadPieceImage(player, src) {
    const img = new Image();
    img.onload = () => {
      this.pieceImages[player] = img;
      this.baseKey = "";
      this.lastStaticBoardKey = "";
      if (typeof this.onAssetReady === "function") this.onAssetReady();
    };
    img.src = src;
  }

  getCellCenter(col, row) {
    const { x: dx, y: dy, w, h } = this.drawRect;
    const colNorms = this.colNorms || Array.from({ length: COLS }, (_, i) => this.gridNorm.left + this.gridNorm.dx * i);
    const rowNorms = this.rowNorms || Array.from({ length: ROWS }, (_, i) => this.gridNorm.top + this.gridNorm.dy * i);
    if (!this.boardImageLoaded) {
      const x = dx + colNorms[clamp(col, 0, COLS - 1)] * w;
      const y = dy + rowNorms[clamp(row, 0, ROWS - 1)] * h;
      return { x, y };
    }
    const iw = this.boardImage.width;
    const ih = this.boardImage.height;
    const sx = this.sourceRect.x;
    const sy = this.sourceRect.y;
    const sw = this.sourceRect.w;
    const sh = this.sourceRect.h;
    const nx = colNorms[clamp(col, 0, COLS - 1)] * iw;
    const ny = rowNorms[clamp(row, 0, ROWS - 1)] * ih;
    const x = dx + ((nx - sx) / sw) * w;
    const y = dy + ((ny - sy) / sh) * h;
    return { x, y };
  }

  getTopCenter(col) {
    const c = this.getCellCenter(col, 0);
    const x = c.x;
    const y = c.y - this.cellH * 1.15;
    return { x, y };
  }

  getGuideMetrics(scale = 1) {
    const topCenter = this.getCellCenter(0, 0);
    const rightCenter = this.getCellCenter(COLS - 1, 0);
    const left = (topCenter.x - this.cellW * 0.58) * scale;
    const width = (rightCenter.x - topCenter.x + this.cellW * 1.16) * scale;
    const top = (topCenter.y - this.cellH * 0.5) * scale;
    const height = this.cellH * ROWS * scale;
    return {
      left,
      top,
      width,
      height,
      rowCell: this.cellH * scale,
      colCell: this.cellW * scale,
    };
  }

  readThemeVars() {
    const cs = getComputedStyle(document.documentElement);
    return {
      boardBg: cs.getPropertyValue("--board-bg").trim() || "#1a2233",
      hole: cs.getPropertyValue("--hole").trim() || "#0b0f17",
      colHi: cs.getPropertyValue("--col-hi").trim() || "rgba(255,255,255,.06)",
      red: cs.getPropertyValue("--p-red").trim() || "#ff3b30",
      yellow: cs.getPropertyValue("--p-yellow").trim() || "#ffd60a",
      text: cs.getPropertyValue("--text").trim() || "#e7eaf0",
      border: cs.getPropertyValue("--border").trim() || "rgba(255,255,255,.10)",
    };
  }

  drawBoardPlate(theme) {
    const ctx = this.ctx;
    ctx.save();
    if (this.boardImageLoaded) {
      const { x, y, w, h } = this.drawRect;
      const s = this.sourceRect;
      ctx.drawImage(this.boardImage, s.x, s.y, s.w, s.h, x, y, w, h);
    } else {
      ctx.fillStyle = theme.boardBg;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }

  ensureFrameOverlay() {
    if (!this.frameOverlayDirty) return;
    const ctx = this.frameOverlayCtx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.boardImageLoaded) {
      this.frameOverlayDirty = false;
      return;
    }
    const { x, y, w, h } = this.drawRect;
    const s = this.sourceRect;
    ctx.drawImage(this.boardImage, s.x, s.y, s.w, s.h, x, y, w, h);

    // Remove black matte from source image (treat near-black as transparent)
    const img = ctx.getImageData(0, 0, this.w, this.h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 18 && g < 18 && b < 18) data[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);

    // "Cut out" playable holes to transparent so pieces can be seen below frame.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.getCellCenter(c, r);
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.radius * 1.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    this.frameOverlayDirty = false;
  }

  drawHoles(board, theme, highlightCol = -1, omitSet = null, winSet = null, pulse = 0) {
    const ctx = this.ctx;
    ctx.save();

    // Column highlight: soft per-hole emphasis, avoid harsh rectangular edge artifacts.
    if (highlightCol >= 0 && highlightCol < COLS) {
      ctx.save();
      for (let rr = 0; rr < ROWS; rr++) {
        const p = this.getCellCenter(highlightCol, rr);
        ctx.fillStyle = theme.colHi;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.radius * 1.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = this.getCellCenter(c, r);

        const p = board[r][c];
        const k = `${r},${c}`;
        if (p !== 0 && !(omitSet && omitSet.has(k))) {
          let py = y;
          let flip = 1;
          if (winSet && winSet.has(k)) {
            const tt = performance.now();
            flip = 0.24 + 0.76 * Math.abs(Math.sin(tt / 210));
            py = y + Math.sin(tt / 140 + (r * COLS + c) * 0.45) * this.radius * 0.08;
          }
          this.drawPieceAt(x, py, p, theme, 1, 1, flip);
          if (winSet && winSet.has(k)) {
            const ring = this.radius * (1.02 + pulse * 0.08);
            this.ctx.save();
            this.ctx.strokeStyle = theme.border;
            this.ctx.lineWidth = 6;
            this.ctx.beginPath();
            this.ctx.arc(x, py, ring, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
          }
        }
      }
    }

    ctx.restore();
  }

  drawPieceAt(x, y, player, theme, alpha = 1, scale = 1, flipX = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Hard clip into hole area to guarantee no frame bleed.
    ctx.beginPath();
    ctx.arc(x, y, this.radius * 0.98, 0, Math.PI * 2);
    ctx.clip();
    const sprite = this.pieceImages[player] || this.pieceSprites[player];
    const size = this.radius * 2.2 * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.scale(Math.max(0.16, flipX), 1);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawFrame(board, highlightCol = -1, animations = [], winCells = []) {
    const theme = this.readThemeVars();
    const winSet = new Set(winCells);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    const omit = new Set();
    const omitKeyParts = [];
    for (const a of animations) {
      if (a.kind === "drop" && a.progress < 1) {
        const k = `${a.row},${a.col}`;
        omit.add(k);
        omitKeyParts.push(k);
      }
    }
    const omitKey = omitKeyParts.join(";");
    const baseKey = `${boardKey(board, highlightCol)}|omit:${omitKey}|theme:${theme.boardBg}|${theme.hole}|${theme.border}|wins:${winCells.join(";")}|p:${Math.round(pulse * 4)}|img:${this.boardImageLoaded ? 1 : 0}`;

    if (baseKey !== this.baseKey) {
      this.baseKey = baseKey;
      const ctx = this.baseCtx;
      ctx.clearRect(0, 0, this.w, this.h);
      // draw base: reuse methods by temporarily swapping ctx
      const prevCtx = this.ctx;
      this.ctx = ctx;
      // pieces layer only; keep background fully transparent
      this.drawHoles(board, theme, highlightCol, omit, winSet, pulse);
      this.ctx = prevCtx;
    }

    // blit base to main canvas
    this.clear();
    this.ctx.drawImage(this.baseCanvas, 0, 0);

    // draw active animations on top
    for (const a of animations) {
      if (a.progress >= 1) continue;
      if (a.kind === "drop") {
        const y = a.y;
        const x = this.getCellCenter(a.col, a.row).x;
        this.drawPieceAt(x, y, a.player, theme, 1, 1);
      } else if (a.kind === "remove") {
        const { x, y } = this.getCellCenter(a.col, a.row);
        this.drawPieceAt(x, y, a.player, theme, a.alpha, a.scale);
      }
    }

  }

  drawForegroundFrame() {
    this.ensureFrameOverlay();
    this.frameCtx.clearRect(0, 0, this.w, this.h);
    this.frameCtx.drawImage(this.frameOverlayCanvas, 0, 0);
  }
}

function boardKey(board, hiCol) {
  // cheap-ish key to avoid redundant redraw
  let s = `${hiCol}|`;
  for (let r = 0; r < ROWS; r++) s += board[r].join("");
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

class NoteCanvas {
  constructor(noteCanvas) {
    this.canvas = noteCanvas;
    this.ctx = noteCanvas.getContext("2d");
    this.w = noteCanvas.width;
    this.h = noteCanvas.height;

    this.tool = "pen"; // pen | eraser
    this.color = "#ff3b30";
    this.size = 10;

    this.isDrawing = false;
    this.lastPt = null;
    this.activePointerId = null;
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 80;

    // allow pencil + finger
    this.canvas.style.touchAction = "none";
  }

  resize(nextW, nextH) {
    this.w = nextW;
    this.h = nextH;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  resetHistoryWithCurrent() {
    const d = this.toDataUrl();
    this.history = [d];
    this.historyIndex = 0;
  }

  pushHistory() {
    const d = this.toDataUrl();
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === d) return;
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(d);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  async undo() {
    if (!this.canUndo()) return false;
    this.historyIndex--;
    await this.loadDataUrl(this.history[this.historyIndex] || null);
    return true;
  }

  async redo() {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    await this.loadDataUrl(this.history[this.historyIndex] || null);
    return true;
  }

  setTool(tool) {
    this.tool = tool;
  }

  setColor(color) {
    this.color = color;
  }

  setSize(size) {
    this.size = size;
  }

  loadDataUrl(dataUrl) {
    this.clear();
    if (!dataUrl) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.save();
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.drawImage(img, 0, 0, this.w, this.h);
        this.ctx.restore();
        resolve();
      };
      img.src = dataUrl;
    });
  }

  toDataUrl() {
    return this.canvas.toDataURL("image/png");
  }

  bindPointerHandlers({ enabled, onStrokeEnd }) {
    const c = this.canvas;
    c.onpointerdown = null;
    c.onpointermove = null;
    c.onpointerup = null;
    c.onpointercancel = null;
    c.onpointerleave = null;

    if (!enabled) return;

    const getLocal = (ev) => {
      const rect = c.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * this.w;
      const y = ((ev.clientY - rect.top) / rect.height) * this.h;
      return { x, y };
    };

    const start = (ev) => {
      this.isDrawing = true;
      this.activePointerId = ev.pointerId;
      c.setPointerCapture(ev.pointerId);
      this.lastPt = getLocal(ev);
      this.strokePoint(this.lastPt, this.lastPt, ev);
      ev.preventDefault();
    };

    const move = (ev) => {
      if (!this.isDrawing) return;
      if (this.activePointerId !== ev.pointerId) return;
      const pt = getLocal(ev);
      this.strokePoint(this.lastPt, pt, ev);
      this.lastPt = pt;
      ev.preventDefault();
    };

    const end = (ev) => {
      if (this.activePointerId !== ev.pointerId) return;
      this.isDrawing = false;
      this.activePointerId = null;
      this.lastPt = null;
      if (typeof onStrokeEnd === "function") onStrokeEnd();
      ev.preventDefault();
    };

    c.onpointerdown = start;
    c.onpointermove = move;
    c.onpointerup = end;
    c.onpointercancel = end;
    c.onpointerleave = end;
  }

  strokePoint(a, b, ev) {
    const ctx = this.ctx;
    const pressure = typeof ev.pressure === "number" && ev.pressure > 0 ? ev.pressure : 0.5;
    const base = this.size;
    const w = clamp(base * (0.55 + pressure * 0.85), 1.5, 48);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.92;
    }

    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function setup() {
  const btnClear = document.getElementById("btnClear");
  const toast = document.getElementById("toast");
  const ghostRow = document.getElementById("ghostRow");
  const hitLayer = document.getElementById("hitLayer");
  const assistive = document.getElementById("assistive");
  const assistiveBall = document.getElementById("assistiveBall");
  const assistivePanel = document.getElementById("assistivePanel");
  const assistiveOverlay = document.getElementById("assistiveOverlay");
  const btnPanelClose = document.getElementById("btnPanelClose");
  const btnNoteUndo = document.getElementById("btnNoteUndo");
  const btnNoteRedo = document.getElementById("btnNoteRedo");

  const boardCanvas = document.getElementById("boardCanvas");
  const frameCanvas = document.getElementById("frameCanvas");
  const noteCanvas = document.getElementById("noteCanvas");
  const boardArea = document.querySelector(".boardArea");
  const colLabels = document.getElementById("colLabels");
  const turnDot = document.getElementById("turnDot");
  const turnText = document.getElementById("turnText");
  const stepNow = document.getElementById("stepNow");
  const stepMax = document.getElementById("stepMax");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const timeline = document.getElementById("timeline");

  const toolFinger = document.getElementById("toolFinger");
  const toolPen = document.getElementById("toolPen");
  const toolEraser = document.getElementById("toolEraser");
  const sizeSlider = document.getElementById("sizeSlider");
  const colorsRow = document.querySelector(".assistivePanel__row.colors");

  const game = new GameState();
  const renderer = new BoardRenderer(boardCanvas, frameCanvas);
  const notes = new NoteCanvas(noteCanvas);
  renderer.onAssetReady = () => {
    // Critical: re-layout after image decode to avoid first-frame wrong sizing.
    lastLayoutKey = "";
    scheduleRelayout();
    scheduleRelayout(80);
  };
  if (renderer.boardImageLoaded) renderer.onAssetReady();

  let hoverCol = -1;
  let isDropping = false;
  let activePlayPointerId = null;
  let lastLayoutKey = "";
  let relayoutRaf = 0;
  let relayoutTimer = 0;
  let layoutObserver = null;
  let animations = []; // non-blocking
  let rafRunning = false;
  let toastTimer = null;
  let clearHold = {
    active: false,
    done: false,
    startAt: 0,
    raf: 0,
    pointerId: null,
  };

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("toast--show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("toast--show"), 1200);
  }

  const Tool = Object.freeze({
    Finger: "finger",
    Pen: "pen",
    Eraser: "eraser",
  });
  let activeTool = Tool.Finger;

  function updateInputRouting() {
    const isFinger = activeTool === Tool.Finger;
    // Finger tool => canvas pass-through, board interactive
    noteCanvas.style.pointerEvents = isFinger ? "none" : "auto";
    hitLayer.style.pointerEvents = isFinger ? "auto" : "none";

    notes.bindPointerHandlers({
      enabled: !isFinger,
      onStrokeEnd: () => {
        notes.pushHistory();
        game.current.noteDataUrl = notes.toDataUrl();
      },
    });

    if (isFinger) {
      noteCanvas.style.cursor = "default";
    } else if (activeTool === Tool.Eraser) {
      noteCanvas.style.cursor =
        'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2728%27 viewBox=%270 0 28 28%27><rect x=%276%27 y=%278%27 width=%2716%27 height=%2712%27 rx=%272%27 fill=%27%23f4e9d9%27 stroke=%232a1a18 stroke-width=%272%27/><path d=%27M10 8l4-4h8v4z%27 fill=%27%23c9b8a4%27 stroke=%232a1a18 stroke-width=%271.5%27/></svg>") 6 18, crosshair';
    } else {
      noteCanvas.style.cursor =
        'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2728%27 viewBox=%270 0 28 28%27><path d=%27M6 22l2-6 10-10 4 4-10 10z%27 fill=%27%23ffe0b5%27 stroke=%23261a12 stroke-width=%272%27/><path d=%27M16 8l4 4%27 stroke=%23261a12 stroke-width=%272%27/></svg>") 5 22, crosshair';
    }

  }

  function updateTurnUi() {
    turnDot.style.background = game.currentPlayer === Player.Red ? "var(--p-red)" : "var(--p-yellow)";
    turnText.textContent = `${game.currentPlayer === Player.Red ? "Red" : "Yellow"} to move`;
  }

  function renderTimeline() {
    timeline.innerHTML = "";

    const moveNoOfPly = (ply) => Math.ceil(ply / 2);
    const moveToken = (node) => {
      const chipSrc = node.movePlayer === Player.Red ? "./assets/red-chip.png" : "./assets/yellow-chip.png";
      return `<span class="timelineMoveToken"><img class="timelineChip" src="${chipSrc}" alt="" aria-hidden="true" /><span>${node.moveCol + 1}${node.isWin ? "#" : ""}</span></span>`;
    };

    const appendMoveLine = ({ moveNo, redNode, yellowNode, onlyYellowEllipsis, indent, markVariation, targetNode }) => {
      const li = document.createElement("li");
      li.className = "timelineItem";
      li.dataset.nodeId = targetNode.id;
      li.style.paddingLeft = `${10 + indent * 16}px`;

      const noText = `${moveNo}.`;
      const mark = markVariation ? `<div class="timelineMark">↵</div>` : ``;
      const ellipsis = onlyYellowEllipsis ? `<span class="timelineEllipsis">... </span>` : ``;
      const red = redNode
        ? `<span class="timelinePly timelinePly--red" data-node-id="${redNode.id}">${moveToken(redNode)}</span>`
        : ``;
      const yellow = yellowNode
        ? `<span class="timelinePly timelinePly--yellow" data-node-id="${yellowNode.id}">${moveToken(yellowNode)}</span>`
        : ``;
      li.innerHTML = `${mark}
        <div class="timelineRow">
          <div class="timelineNo">${noText}</div>
          <div class="timelineMoves">${ellipsis}${red}${red && yellow ? " " : ""}${yellow}</div>
        </div>`;
      timeline.appendChild(li);
    };

    const collectPrimaryLine = (startNode) => {
      const out = [];
      let n = startNode;
      while (n && n !== game.root) {
        out.push(n);
        n = (n.children && n.children[0]) || null;
      }
      return out;
    };

    const renderLineWithEmbeddedVariations = (startNode, indent, variationStart) => {
      const plies = collectPrimaryLine(startNode);
      let i = 0;
      let firstLine = true;

      while (i < plies.length) {
        const a = plies[i];
        const isRedPly = a.ply % 2 === 1;
        const moveNo = moveNoOfPly(a.ply);

        if (isRedPly) {
          const redNode = a;
          const yellowNode = plies[i + 1] && plies[i + 1].ply === redNode.ply + 1 ? plies[i + 1] : null;
          const targetNode = yellowNode || redNode;

          appendMoveLine({
            moveNo,
            redNode,
            yellowNode,
            onlyYellowEllipsis: false,
            indent,
            markVariation: variationStart && firstLine,
            targetNode,
          });

          // Variations: alternatives for yellow reply from redNode
          if (redNode.children && redNode.children.length > 1) {
            for (let k = 1; k < redNode.children.length; k++) {
              renderLineWithEmbeddedVariations(redNode.children[k], indent + 1, true);
            }
          }
          // Variations: alternatives for next red move from the chosen target node
          if (targetNode.children && targetNode.children.length > 1) {
            for (let k = 1; k < targetNode.children.length; k++) {
              renderLineWithEmbeddedVariations(targetNode.children[k], indent + 1, true);
            }
          }

          i += yellowNode ? 2 : 1;
        } else {
          // line starts from yellow (variation deviation on black move): show "... Yx"
          const yellowNode = a;
          appendMoveLine({
            moveNo,
            redNode: null,
            yellowNode,
            onlyYellowEllipsis: true,
            indent,
            markVariation: variationStart && firstLine,
            targetNode: yellowNode,
          });

          // variations from this yellow node (next red alternatives)
          if (yellowNode.children && yellowNode.children.length > 1) {
            for (let k = 1; k < yellowNode.children.length; k++) {
              renderLineWithEmbeddedVariations(yellowNode.children[k], indent + 1, true);
            }
          }

          i += 1;
        }

        firstLine = false;
      }
    };

    if (game.root.children[0]) renderLineWithEmbeddedVariations(game.root.children[0], 0, false);
    for (let i = 1; i < game.root.children.length; i++) {
      renderLineWithEmbeddedVariations(game.root.children[i], 1, true);
    }

    updateTimelineActive();
  }

  function updateTimelineActive() {
    [...timeline.querySelectorAll(".timelineItem")].forEach((el) => {
      el.classList.toggle("timelineItem--active", el.dataset.nodeId === game.current.id);
    });
  }

  async function loadNotesForIndex() {
    await notes.loadDataUrl(game.current.noteDataUrl || null);
    notes.resetHistoryWithCurrent();
    btnNoteUndo && (btnNoteUndo.disabled = !notes.canUndo());
    btnNoteRedo && (btnNoteRedo.disabled = !notes.canRedo());
  }

  async function relayoutCanvases() {
    const layers = document.querySelector(".layers");
    if (!layers) return;

    const rect = layers.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);

    const nextKey = `${cssW}x${cssH}@${dpr}`;
    if (nextKey === lastLayoutKey) return;
    lastLayoutKey = nextKey;

    // Cache current note before resizing (resizing clears the bitmap)
    game.current.noteDataUrl = notes.toDataUrl();

    // Resize backing store to match CSS pixels * DPR, keep CSS size controlled by layout
    boardCanvas.width = pxW;
    boardCanvas.height = pxH;
    frameCanvas.width = pxW;
    frameCanvas.height = pxH;
    noteCanvas.width = pxW;
    noteCanvas.height = pxH;

    renderer.resize(pxW, pxH);
    notes.resize(pxW, pxH);

    // Align side row markers and bottom col labels to actual hole grid.
    if (boardArea) {
      const scale = cssW / pxW;
      const g = renderer.getGuideMetrics(scale);
      boardArea.style.setProperty("--grid-left", `${g.left}px`);
      boardArea.style.setProperty("--grid-top", `${g.top}px`);
      boardArea.style.setProperty("--grid-width", `${g.width}px`);
      boardArea.style.setProperty("--grid-height", `${g.height}px`);
      if (colLabels) {
        const spans = colLabels.querySelectorAll("span");
        const centers = [];
        for (let c = 0; c < Math.min(COLS, spans.length); c++) {
          const center = renderer.getCellCenter(c, ROWS - 1);
          const localX = center.x * scale - g.left;
          centers.push(localX);
          spans[c].style.left = `${localX}px`;
        }
        let sepNodes = colLabels.querySelectorAll(".colSep");
        if (sepNodes.length !== COLS - 1) {
          colLabels.querySelectorAll(".colSep").forEach((n) => n.remove());
          for (let i = 0; i < COLS - 1; i++) {
            const d = document.createElement("i");
            d.className = "colSep";
            colLabels.appendChild(d);
          }
          sepNodes = colLabels.querySelectorAll(".colSep");
        }
        for (let i = 0; i < Math.min(COLS - 1, sepNodes.length); i++) {
          const midX = (centers[i] + centers[i + 1]) / 2;
          sepNodes[i].style.left = `${midX}px`;
        }
      }
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

  function updateTravelUi() {
    stepNow.textContent = String(game.current.ply);
    stepMax.textContent = "∞";
    btnPrev.disabled = !game.current.parent;
    btnNext.disabled = !(game.current.children && game.current.children[0]);
  }

  function rebuildGhostRow() {
    ghostRow.innerHTML = "";
    const piece = document.createElement("div");
    piece.className = `ghostPiece ghostPiece--${playerCss(game.currentPlayer)}`;
    piece.style.visibility = "hidden";
    ghostRow.appendChild(piece);
  }

  function setGhostCol(col) {
    const show = col >= 0 && col < COLS && activeTool === Tool.Finger;
    ghostRow.classList.toggle("ghostRow--show", show);
    const p = ghostRow.querySelector(".ghostPiece");
    if (!p) return;
    p.classList.toggle("ghostPiece--red", game.currentPlayer === Player.Red);
    p.classList.toggle("ghostPiece--yellow", game.currentPlayer === Player.Yellow);
    if (!show) {
      p.style.visibility = "hidden";
      return;
    }
    const landingRow = findLandingRow(game.board, col);
    if (landingRow < 0) {
      p.style.visibility = "hidden";
      return;
    }
    const rect = boardCanvas.getBoundingClientRect();
    const hostRect = ghostRow.getBoundingClientRect();
    const sx = rect.width / renderer.w;
    const sy = rect.height / renderer.h;
    const target = renderer.getCellCenter(col, landingRow);
    const x = rect.left - hostRect.left + target.x * sx;
    const y = rect.top - hostRect.top + target.y * sy;
    const size = clamp(renderer.radius * sx * 1.82, 16, 34);
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.visibility = "visible";
  }

  function colFromClientPoint(clientX, clientY) {
    // Map pointer to nearest REAL hole-column center, not linear slicing.
    const rect = boardCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    const sx = rect.width / renderer.w;
    const sy = rect.height / renderer.h;

    // vertical gating: only active inside playable rows band
    const topC = renderer.getCellCenter(0, 0);
    const botC = renderer.getCellCenter(0, ROWS - 1);
    const topY = rect.top + (topC.y - renderer.cellH * 0.55) * sy;
    const botY = rect.top + (botC.y + renderer.cellH * 0.55) * sy;
    if (clientY < topY || clientY > botY) return -1;

    let bestCol = -1;
    let bestDx = Infinity;
    for (let c = 0; c < COLS; c++) {
      const cc = renderer.getCellCenter(c, 0);
      const cx = rect.left + cc.x * sx;
      const dx = Math.abs(clientX - cx);
      if (dx < bestDx) {
        bestDx = dx;
        bestCol = c;
      }
    }

    // If too far from any column center, treat as outside playable grid.
    const maxDx = renderer.cellW * 0.62 * sx;
    if (bestDx > maxDx) return -1;
    return bestCol;
  }

  function drawStatic() {
    const showHover = activeTool === Tool.Finger && !game.current.isWin;
    renderer.drawFrame(game.board, showHover ? hoverCol : -1, animations, game.current.winCells || []);
    renderer.drawForegroundFrame();
    setGhostCol(showHover ? hoverCol : -1);
    if (game.current.winCells && game.current.winCells.length) ensureRaf();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function ensureRaf() {
    if (rafRunning) return;
    rafRunning = true;
    const tick = (t) => {
      const now = t || performance.now();
      let active = 0;
      for (const a of animations) {
        const p = clamp((now - a.start) / a.duration, 0, 1);
        a.progress = p;
        if (a.kind === "drop") {
          const e = easeOutCubic(p);
          a.y = a.fromY + (a.toY - a.fromY) * e;
        } else if (a.kind === "remove") {
          a.alpha = 1 - p;
          a.scale = 1 - p * 0.25;
        }
        if (p < 1) active++;
      }
      animations = animations.filter((a) => a.progress < 1);
      drawStatic();
      const keepWinAnim = !!(game.current.winCells && game.current.winCells.length);
      if (active > 0 || keepWinAnim) requestAnimationFrame(tick);
      else rafRunning = false;
    };
    requestAnimationFrame(tick);
  }

  async function handleDrop(col) {
    if (!game.canPlayMove()) return;
    if (col < 0 || col >= COLS) return;

    const row = findLandingRow(game.board, col);
    if (row < 0) return;

    // Cache note for current node (even though play mode usually empty)
    game.current.noteDataUrl = notes.toDataUrl();

    const res = game.applyMove(col);
    if (!res) return;

    // attach an animation (fast, non-blocking)
    const startPt = renderer.getTopCenter(col);
    const endPt = renderer.getCellCenter(col, row);
    animations.push({
      kind: "drop",
      col,
      row,
      player: res.player,
      start: performance.now(),
      duration: 180,
      fromY: startPt.y,
      toY: endPt.y,
      y: startPt.y,
      progress: 0,
    });
    ensureRaf();

    await loadNotesForIndex();
    renderTimeline();
    updateTravelUi();
    updateTurnUi();
    rebuildGhostRow();
    updateInputRouting();
  }

  function queueJumpTransition(fromNode, toNode) {
    if (!fromNode || !toNode || fromNode.id === toNode.id) return;
    const from = fromNode.board;
    const to = toNode.board;
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = from[r][c];
        const b = to[r][c];
        if (a === b) continue;
        if (a !== 0 && b === 0) {
          animations.push({
            kind: "remove",
            row: r,
            col: c,
            player: a,
            start: now,
            duration: 120,
            progress: 0,
            alpha: 1,
            scale: 1,
          });
        } else if (a === 0 && b !== 0) {
          const startPt = renderer.getTopCenter(c);
          const endPt = renderer.getCellCenter(c, r);
          animations.push({
            kind: "drop",
            row: r,
            col: c,
            player: b,
            start: now,
            duration: 150,
            fromY: startPt.y,
            toY: endPt.y,
            y: startPt.y,
            progress: 0,
          });
        } else {
          animations.push({
            kind: "remove",
            row: r,
            col: c,
            player: a,
            start: now,
            duration: 100,
            progress: 0,
            alpha: 1,
            scale: 1,
          });
          const startPt = renderer.getTopCenter(c);
          const endPt = renderer.getCellCenter(c, r);
          animations.push({
            kind: "drop",
            row: r,
            col: c,
            player: b,
            start: now + 40,
            duration: 140,
            fromY: startPt.y,
            toY: endPt.y,
            y: startPt.y,
            progress: 0,
          });
        }
      }
    }
    ensureRaf();
  }

  async function jumpToNode(targetNode) {
    if (!targetNode || targetNode.id === game.current.id) return;
    const from = game.current;
    game.current.noteDataUrl = notes.toDataUrl();
    game.goToNode(targetNode);
    queueJumpTransition(from, targetNode);
    await loadNotesForIndex();
    updateTravelUi();
    updateTurnUi();
    rebuildGhostRow();
    updateInputRouting();
    updateTimelineActive();
    drawStatic();
  }

  function goPrev() {
    if (!game.current.parent) return;
    jumpToNode(game.current.parent);
  }

  function goNext() {
    const next = game.current.children && game.current.children[0];
    if (!next) return;
    jumpToNode(next);
  }

  function onPointerMovePlay(ev) {
    if (activeTool !== Tool.Finger) return;
    const col = colFromClientPoint(ev.clientX, ev.clientY);
    hoverCol = col;
    drawStatic();
  }

  function onPointerLeavePlay() {
    hoverCol = -1;
    drawStatic();
  }

  function bindPlayInput(enabled) {
    hitLayer.onpointermove = null;
    hitLayer.onpointerdown = null;
    hitLayer.onpointerup = null;
    hitLayer.onpointercancel = null;
    hitLayer.onpointerleave = null;

    if (!enabled) return;

    // Ensure sizing is correct before pointer mapping begins
    relayoutCanvases();

    hitLayer.onpointermove = onPointerMovePlay;
    hitLayer.onpointerleave = onPointerLeavePlay;
    hitLayer.onpointerdown = (ev) => {
      if (activeTool !== Tool.Finger) return;
      if (!game.canPlayMove()) return;

      activePlayPointerId = ev.pointerId;
      hitLayer.setPointerCapture(ev.pointerId);
      hoverCol = colFromClientPoint(ev.clientX, ev.clientY);
      drawStatic();
      ev.preventDefault();
    };
    hitLayer.onpointerup = (ev) => {
      if (activePlayPointerId !== ev.pointerId) return;
      activePlayPointerId = null;

      if (activeTool !== Tool.Finger) return;
      const col = colFromClientPoint(ev.clientX, ev.clientY);
      hoverCol = col;
      drawStatic();
      if (col >= 0) handleDrop(col);
      ev.preventDefault();
    };
    hitLayer.onpointercancel = (ev) => {
      if (activePlayPointerId === ev.pointerId) activePlayPointerId = null;
    };
  }

  // Time travel buttons
  btnPrev.addEventListener("click", goPrev);
  btnNext.addEventListener("click", goNext);

  // Timeline click
  timeline.addEventListener("click", (ev) => {
    const item = ev.target.closest(".timelineItem");
    if (!item) return;
    const plyTarget = ev.target.closest(".timelinePly");
    const nodeId = plyTarget?.dataset.nodeId || item.dataset.nodeId;
    const node = game.nodeById.get(nodeId);
    if (!node) return;
    jumpToNode(node);
  });

  window.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      goPrev();
    } else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      ev.preventDefault();
      goNext();
    }
  });

  // Theme
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === Theme.Light ? "light" : "dark");
    drawStatic();
  }

  // Clear button: click clears current node only; long press 3s clears all nodes
  function clearCurrentNote() {
    game.current.noteDataUrl = null;
    notes.ctx.clearRect(0, 0, notes.w, notes.h);
    notes.pushHistory();
    btnNoteUndo && (btnNoteUndo.disabled = !notes.canUndo());
    btnNoteRedo && (btnNoteRedo.disabled = !notes.canRedo());
    showToast("Cleared current note");
  }

  function clearAllNotes() {
    for (const n of game.nodeById.values()) n.noteDataUrl = null;
    notes.clear();
    notes.resetHistoryWithCurrent();
    btnNoteUndo && (btnNoteUndo.disabled = !notes.canUndo());
    btnNoteRedo && (btnNoteRedo.disabled = !notes.canRedo());
    showToast("Cleared all notes");
  }

  function setHoldProgress(p) {
    if (!btnClear) return;
    btnClear.style.setProperty("--hold", String(clamp(p, 0, 1)));
  }

  function startClearHold(ev) {
    if (!btnClear) return;
    clearHold.active = true;
    clearHold.done = false;
    clearHold.startAt = performance.now();
    clearHold.pointerId = ev.pointerId ?? "mouse";
    btnClear.classList.add("is-holding");
    setHoldProgress(0);

    const tick = () => {
      if (!clearHold.active) return;
      const t = performance.now();
      const p = clamp((t - clearHold.startAt) / 1800, 0, 1);
      setHoldProgress(p);
      if (p >= 1 && !clearHold.done) {
        clearHold.done = true;
        clearHold.active = false;
        btnClear.classList.remove("is-holding");
        setHoldProgress(0);
        clearAllNotes();
        return;
      }
      clearHold.raf = requestAnimationFrame(tick);
    };
    clearHold.raf = requestAnimationFrame(tick);
  }

  function endClearHold(ev) {
    if (!btnClear) return;
    if (clearHold.pointerId != null && ev && ev.pointerId != null && clearHold.pointerId !== ev.pointerId) return;
    if (clearHold.raf) cancelAnimationFrame(clearHold.raf);
    btnClear.classList.remove("is-holding");
    setHoldProgress(0);
    const wasDone = clearHold.done;
    clearHold.active = false;
    clearHold.done = false;
    clearHold.pointerId = null;
    return wasDone;
  }

  if (btnClear) {
    btnClear.addEventListener("click", (ev) => {
      // If long-press already fired, swallow the click.
      if (clearHold.done) {
        ev.preventDefault();
        return;
      }
      clearCurrentNote();
    });

    btnClear.addEventListener("pointerdown", (ev) => {
      // only in draw mode should matter, but harmless otherwise
      btnClear.setPointerCapture?.(ev.pointerId);
      startClearHold(ev);
      ev.preventDefault();
    });
    btnClear.addEventListener("pointerup", (ev) => {
      const done = endClearHold(ev);
      if (done) ev.preventDefault();
    });
    btnClear.addEventListener("pointercancel", (ev) => endClearHold(ev));
    btnClear.addEventListener("pointerleave", (ev) => endClearHold(ev));
  }

  // Tools
  function setActiveTool(tool) {
    activeTool = tool;
    toolFinger?.classList.toggle("tool--active", tool === Tool.Finger);
    toolPen?.classList.toggle("tool--active", tool === Tool.Pen);
    toolEraser?.classList.toggle("tool--active", tool === Tool.Eraser);
    colorsRow?.classList.toggle("is-hidden", tool !== Tool.Pen);
    if (tool !== Tool.Finger) notes.setTool(tool);
    updateInputRouting();
  }
  toolFinger?.addEventListener("click", () => setActiveTool(Tool.Finger));
  toolPen?.addEventListener("click", () => setActiveTool(Tool.Pen));
  toolEraser?.addEventListener("click", () => setActiveTool(Tool.Eraser));

  btnNoteUndo?.addEventListener("click", async () => {
    if (!(await notes.undo())) return;
    game.current.noteDataUrl = notes.toDataUrl();
    btnNoteUndo.disabled = !notes.canUndo();
    btnNoteRedo.disabled = !notes.canRedo();
  });
  btnNoteRedo?.addEventListener("click", async () => {
    if (!(await notes.redo())) return;
    game.current.noteDataUrl = notes.toDataUrl();
    btnNoteUndo.disabled = !notes.canUndo();
    btnNoteRedo.disabled = !notes.canRedo();
  });

  sizeSlider.addEventListener("input", () => notes.setSize(Number(sizeSlider.value)));

  document.querySelectorAll(".swatch").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("swatch--active"));
      el.classList.add("swatch--active");
      notes.setColor(el.dataset.color);
    });
  });

  // AssistiveTouch ball + panel
  let assistiveOpen = false;
  let idleTimer = null;
  let dragging = false;
  let dragPointerId = null;
  let dragOffset = { x: 0, y: 0 };
  let ballPos = { x: 0, y: 0 };
  const BALL = 54;
  const MARGIN = 10;

  const clampBall = (x, y) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: clamp(x, MARGIN, w - BALL - MARGIN),
      y: clamp(y, MARGIN, h - BALL - MARGIN),
    };
  };

  const setBallPos = (x, y, animate) => {
    if (!assistive) return;
    const p = clampBall(x, y);
    ballPos = p;
    assistive.style.transition = animate ? "transform 180ms ease" : "none";
    assistive.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  };

  const snapToEdge = (animate) => {
    if (!assistive) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = ballPos.x + BALL / 2;
    const cy = ballPos.y + BALL / 2;
    const edge = [
      ["left", cx],
      ["right", w - cx],
      ["top", cy],
      ["bottom", h - cy],
    ].sort((a, b) => a[1] - b[1])[0][0];
    assistive.setAttribute("data-edge", edge);
    let x = ballPos.x;
    let y = ballPos.y;
    if (edge === "left") x = MARGIN;
    else if (edge === "right") x = w - BALL - MARGIN;
    else if (edge === "top") y = MARGIN;
    else y = h - BALL - MARGIN;
    setBallPos(x, y, animate);
  };

  const setIdle = (on) => {
    assistive?.classList.toggle("assistive--idle", on);
    if (!assistiveBall || !assistive) return;
    if (!on) {
      assistiveBall.style.transform = "translateX(0)";
      assistiveBall.style.opacity = ".9";
      return;
    }
    const edge = assistive.getAttribute("data-edge") || "right";
    if (edge === "right") assistiveBall.style.transform = "translateX(27px)";
    else if (edge === "left") assistiveBall.style.transform = "translateX(-27px)";
    else if (edge === "top") assistiveBall.style.transform = "translateY(-27px)";
    else assistiveBall.style.transform = "translateY(27px)";
    assistiveBall.style.opacity = ".45";
  };
  const resetIdle = () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    setIdle(false);
    if (assistiveOpen) return;
    idleTimer = window.setTimeout(() => {
      if (dragging || assistiveOpen) return;
      snapToEdge(true);
      setIdle(true);
    }, 3000);
  };

  const pickPanelSide = () => {
    if (!assistive) return "left";
    return ballPos.x + BALL / 2 > window.innerWidth / 2 ? "left" : "right";
  };

  const applyPanelSide = (side) => {
    if (!assistive || !assistivePanel) return;
    assistive.setAttribute("data-panel-side", side);
  };

  const enforcePanelInViewport = () => {
    if (!assistive || !assistivePanel || !assistiveOpen) return;
    const panelRect = assistivePanel.getBoundingClientRect();
    const vw = window.innerWidth;
    if (panelRect.right > vw - 4) {
      applyPanelSide("left");
      return;
    }
    if (panelRect.left < 4) {
      applyPanelSide("right");
    }
  };

  const openPanel = () => {
    if (assistive) applyPanelSide(pickPanelSide());
    assistiveOpen = true;
    assistivePanel?.classList.add("assistivePanel--open");
    assistivePanel?.setAttribute("aria-hidden", "false");
    assistiveOverlay?.classList.add("assistiveOverlay--show");
    // One more pass after panel is measurable to guarantee no overflow.
    if (assistive) applyPanelSide(pickPanelSide());
    requestAnimationFrame(() => enforcePanelInViewport());
    if (idleTimer) window.clearTimeout(idleTimer);
    setIdle(false);
  };
  const closePanel = () => {
    assistiveOpen = false;
    assistivePanel?.classList.remove("assistivePanel--open");
    assistivePanel?.setAttribute("aria-hidden", "true");
    assistiveOverlay?.classList.remove("assistiveOverlay--show");
    resetIdle();
  };

  assistiveOverlay?.addEventListener("click", closePanel);
  btnPanelClose?.addEventListener("click", closePanel);

  assistiveBall?.addEventListener("pointerdown", (ev) => {
    resetIdle();
    dragging = true;
    dragPointerId = ev.pointerId;
    assistiveBall.setPointerCapture(ev.pointerId);
    const b = assistiveBall.getBoundingClientRect();
    dragOffset.x = ev.clientX - b.left;
    dragOffset.y = ev.clientY - b.top;
    ev.preventDefault();
  });
  assistiveBall?.addEventListener("pointermove", (ev) => {
    if (!dragging || ev.pointerId !== dragPointerId) return;
    setBallPos(ev.clientX - dragOffset.x, ev.clientY - dragOffset.y, false);
    ev.preventDefault();
  });
  assistiveBall?.addEventListener("pointerup", (ev) => {
    if (ev.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
    resetIdle();
    ev.preventDefault();
  });
  assistiveBall?.addEventListener("pointercancel", () => {
    dragging = false;
    dragPointerId = null;
    resetIdle();
  });
  assistiveBall?.addEventListener("click", () => {
    resetIdle();
    if (assistiveOpen) closePanel();
    else openPanel();
  });

  window.addEventListener("resize", () => {
    // keep it on screen and free-floating
    setBallPos(ballPos.x, ballPos.y, false);
    if (assistiveOpen && assistive) {
      applyPanelSide(pickPanelSide());
      requestAnimationFrame(() => enforcePanelInViewport());
    }
  });

  // Initial render + state
  (async () => {
    registerServiceWorker();

    // Set default tool options
    notes.setColor("#ff3b30");
    notes.setSize(Number(sizeSlider.value));
    setActiveTool(Tool.Finger);

    game.theme = Theme.Dark;
    applyTheme(game.theme);
    rebuildGhostRow();
    renderTimeline();
    updateTurnUi();
    updateTravelUi();
    updateInputRouting();
    bindPlayInput(true);
    await relayoutCanvases();
    scheduleRelayout(120);
    window.addEventListener("load", () => scheduleRelayout(40), { once: true });
    window.addEventListener("pageshow", () => scheduleRelayout(40));

    // Keep canvases perfectly aligned on any resize/orientation changes
    window.addEventListener("resize", () => {
      // rAF to let layout settle
      scheduleRelayout();
    });
    if ("ResizeObserver" in window) {
      const layersEl = document.querySelector(".layers");
      if (layersEl) {
        layoutObserver = new ResizeObserver(() => scheduleRelayout());
        layoutObserver.observe(layersEl);
      }
    }

    // Init AssistiveTouch position (use translate so it doesn't affect layout)
    if (assistive) {
      assistive.style.left = "0";
      assistive.style.top = "0";
      assistive.style.right = "auto";
      assistive.style.bottom = "auto";
      setBallPos(window.innerWidth - BALL - MARGIN, window.innerHeight * 0.32, false);
      snapToEdge(false);
      resetIdle();
    }
  })();
}

document.addEventListener("DOMContentLoaded", setup);

