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

  reset() {
    this.root = new GameNode({ parent: null, board: emptyBoard(), toPlay: Player.Red, ply: 0 });
    this.current = this.root;
    this.nodeById = new Map();
    this.nodeById.set(this.root.id, this.root);
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
    this.boardImage.src = "./assets/figma/board-live.png";
    this.boardImage.onload = () => {
      this.boardImageLoaded = true;
      // Figma Main asset: fixed 7×6 calibration, excluding transparent margins.
      // Do not run the old dark-pixel detector: it mistakes ornamentation for holes.
      this.sourceRect = { x: 156, y: 87, w: 1132, h: 953 };
      this.recomputeMetrics();
      this.baseKey = "";
      this.lastStaticBoardKey = "";
      if (typeof this.onAssetReady === "function") this.onAssetReady();
    };

    // Normalized playable hole-grid coordinates inside the board art image.
    // Calibrated against assets/figma/board-live.png (1448×1086).
    this.gridNorm = {
      // Connect 4Live board (1448x1086) — measured hole centers.
      left: 0.16665,
      top: 0.15647,
      dx: 0.11078,
      dy: 0.1452,
    };
    // These measured centers are shared by rendering, hit testing and preview.
    this.colNorms = [0.16665, 0.2776, 0.38813, 0.49911, 0.60976, 0.72035, 0.83153];
    this.rowNorms = [0.15647, 0.30126, 0.44651, 0.59142, 0.73663, 0.88245];
    this.drawRect = { x: 0, y: 0, w: this.w, h: this.h };
    this.frameOverlayCanvas = document.createElement("canvas");
    this.frameOverlayCtx = this.frameOverlayCanvas.getContext("2d");
    this.frameOverlayDirty = true;
    this.pieceSprites = this.makePieceSprites();
    this.pieceImages = {
      [Player.Red]: null,
      [Player.Yellow]: null,
    };
    this.loadPieceImage(Player.Red, "./assets/figma/chip-red-enamel.svg");
    this.loadPieceImage(Player.Yellow, "./assets/figma/chip-yellow-enamel.svg");
    this.winEffectKey = "";
    this.winEffectStart = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    for (const ctx of [this.ctx, this.frameCtx, this.baseCtx, this.frameOverlayCtx]) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
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
    const exterior = new Uint8Array(iw * ih);
    const idx = (x, y) => y * iw + x;
    const qx = new Int32Array(iw * ih);
    const qy = new Int32Array(iw * ih);

    // Mark exterior transparency via flood-fill from the image borders.
    let head = 0;
    let tail = 0;
    const pushBorder = (x, y) => {
      const i = idx(x, y);
      if (data[i * 4 + 3] >= 28 || exterior[i]) return;
      exterior[i] = 1;
      qx[tail] = x;
      qy[tail] = y;
      tail++;
    };
    for (let x = 0; x < iw; x++) {
      pushBorder(x, 0);
      pushBorder(x, ih - 1);
    }
    for (let y = 0; y < ih; y++) {
      pushBorder(0, y);
      pushBorder(iw - 1, y);
    }
    while (head < tail) {
      const cx = qx[head];
      const cy = qy[head];
      head++;
      const n = [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1],
      ];
      for (const [nx, ny] of n) {
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const ni = idx(nx, ny);
        if (exterior[ni]) continue;
        if (data[ni * 4 + 3] >= 28) continue;
        exterior[ni] = 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }

    for (let p = 0, i = 0; i < mask.length; i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];
      const darkHole = a > 20 && r < 44 && g < 44 && b < 52;
      const clearHole = a < 28 && !exterior[i];
      mask[i] = darkHole || clearHole ? 1 : 0;
    }
    const vis = new Uint8Array(mask.length);
    const comps = [];
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const st = idx(x, y);
        if (!mask[st] || vis[st]) continue;
        head = 0;
        tail = 0;
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
        if (count > 480 && count < 14000 && ar > 0.72 && ar < 1.32) {
          const cx = sx / count;
          const cy = sy / count;
          if (cx > iw * 0.10 && cx < iw * 0.92 && cy > ih * 0.10 && cy < ih * 0.94) {
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
      const s = 256;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
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
    const key=document.documentElement.getAttribute('data-theme');
    if(this.themeKey===key && this.themeVars)return this.themeVars;
    this.themeKey=key;
    const cs = getComputedStyle(document.documentElement);
    return this.themeVars = {
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
    this.foregroundClean = false;
    const ctx = this.frameOverlayCtx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.boardImageLoaded) {
      this.frameOverlayDirty = false;
      return;
    }
    const { x, y, w, h } = this.drawRect;
    const s = this.sourceRect;
    ctx.drawImage(this.boardImage, s.x, s.y, s.w, s.h, x, y, w, h);

    // The exported PNG already contains alpha holes. Draw it unchanged: removing
    // dark pixels or punching more circles destroys its black outlines and gold rim.
    this.frameOverlayDirty = false;
  }

  drawHoles(board, theme, highlightCol = -1, omitSet = null) {
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
          this.drawPieceAt(x, y, p, theme);
          this.drawSeatShade(x, y);
        }
      }
    }

    ctx.restore();
  }

  drawPieceAt(x, y, player, theme, alpha = 1, scale = 1, rotation = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Hard clip into hole area to guarantee no frame bleed.
    ctx.beginPath();
    ctx.arc(x, y, this.radius * 0.98, 0, Math.PI * 2);
    ctx.clip();
    const sprite = this.pieceImages[player] || this.pieceSprites[player];
    const size = this.radius * 1.98 * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(x, y);
    ctx.rotate(rotation);
    // Both pieces use the same centered artwork and visible diameter.
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

  winLightLevel(index, now) {
    if (this.reducedMotion.matches) return 0.65;
    const elapsed = Math.max(0, now - this.winEffectStart - index * 110);
    const entrance = clamp(elapsed / 180, 0, 1);
    const beat = (0.5 + 0.5 * Math.cos(elapsed / 1600 * Math.PI * 2)) ** 2;
    return entrance * (0.45 + 0.55 * beat);
  }

  drawWinBackdrop(ctx, winCells, now) {
    const fade = this.reducedMotion.matches ? 1 : clamp((now - this.winEffectStart) / 320, 0, 1);
    const key=`${this.w}:${this.h}:${this.radius}:${winCells.join(';')}`;
    if(this.winMaskKey!==key){
      this.winMaskKey=key;
      const mask=new Path2D();mask.rect(0,0,this.w,this.h);
      for(const cell of winCells){
        const [row,col]=cell.split(',').map(Number);const {x,y}=this.getCellCenter(col,row);
        mask.moveTo(x+this.radius*1.31,y);mask.arc(x,y,this.radius*1.31,0,Math.PI*2);
      }
      this.winMask=mask;
    }
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.clip(this.winMask,"evenodd");
    ctx.fillStyle = `rgba(22, 13, 32, ${0.34 * fade})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  winningLinks(winCells) {
    const key=winCells.join(';');
    if(this.linksKey===key)return this.linksCache;
    this.linksKey=key;
    const cells = new Set(winCells);
    const links = new Map();
    for (const cell of winCells) {
      const [row, col] = cell.split(",").map(Number);
      for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        if (cells.has(`${row - dr},${col - dc}`)) continue;
        const run = [];
        for (let r = row, c = col; cells.has(`${r},${c}`); r += dr, c += dc) run.push([r, c]);
        if (run.length < 4) continue;
        for (let i = 1; i < run.length; i++) links.set(`${run[i - 1]}:${run[i]}`, [run[i - 1], run[i]]);
      }
    }
    return this.linksCache=[...links.values()];
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

  drawFrame(board, highlightCol = -1, animations = [], winCells = []) {
    const theme = this.readThemeVars();
    const now = performance.now();
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
    const baseKey = `${boardKey(board, highlightCol)}|omit:${omitKey}|theme:${theme.boardBg}|${theme.hole}|${theme.border}|img:${this.boardImageLoaded ? 1 : 0}`;

    if (baseKey !== this.baseKey) {
      this.baseKey = baseKey;
      const ctx = this.baseCtx;
      ctx.clearRect(0, 0, this.w, this.h);
      // draw base: reuse methods by temporarily swapping ctx
      const prevCtx = this.ctx;
      this.ctx = ctx;
      // pieces layer only; keep background fully transparent
      this.drawHoles(board, theme, highlightCol, omit);
      this.ctx = prevCtx;
    }

    // blit base to main canvas
    this.clear();
    this.ctx.drawImage(this.baseCanvas, 0, 0);

    // draw active animations on top
    for (const a of animations) {
      if (a.progress >= 1 || now < a.start) continue;
      if (a.kind === "drop") {
        const y = a.y;
        const x = this.getCellCenter(a.col, a.row).x;
        this.drawPieceAt(x, y, a.player, theme, 1, 1, a.rotation || 0);
        const seat = this.getCellCenter(a.col, a.row);
        const contact = clamp(1 - Math.abs(seat.y - y) / (this.radius * 0.4), 0, 1);
        this.drawSeatShade(seat.x, seat.y, contact);
      } else if (a.kind === "remove") {
        const { x, y } = this.getCellCenter(a.col, a.row);
        this.drawPieceAt(x, y, a.player, theme, a.alpha, a.scale);
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

  drawForegroundFrame(winCells = []) {
    this.ensureFrameOverlay();
    // A drop only changes the pieces layer. The static frame no longer needs
    // a full-resolution clear and upload on every frame of every move.
    if(this.foregroundClean && !this.winEffectKey)return;
    this.frameCtx.clearRect(0, 0, this.w, this.h);
    this.frameCtx.drawImage(this.frameOverlayCanvas, 0, 0);
    this.drawWinningRims(winCells, performance.now());
    this.foregroundClean=!this.winEffectKey;
  }

  warmEffects() {
    // First-use shader/compositing work happens behind the startup screen.
    // Reuse existing backing stores, then immediately restore the real board.
    const ctx=this.ctx,frameCtx=this.frameCtx;
    const key=this.winEffectKey,start=this.winEffectStart;
    this.ctx=this.baseCtx;this.frameCtx=this.frameOverlayCtx;
    this.winEffectKey='warm';this.winEffectStart=performance.now()-1000;
    try {this.drawWinLight(['5,0','5,1','5,2','5,3'],performance.now());this.drawWinningRims(['5,0','5,1','5,2','5,3'],performance.now());}
    finally {this.ctx=ctx;this.frameCtx=frameCtx;this.winEffectKey=key;this.winEffectStart=start;this.baseKey='';this.frameOverlayDirty=true;}
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
    this.color = "#242222";
    this.size = 2.5;
    this.loadRevision = 0;
    this.isLoading = false;

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
    const revision = ++this.loadRevision;
    this.isLoading = !!dataUrl;
    this.clear();
    if (!dataUrl) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (revision === this.loadRevision) {
          this.ctx.save();
          this.ctx.globalCompositeOperation = "source-over";
          this.ctx.drawImage(img, 0, 0, this.w, this.h);
          this.ctx.restore();
          this.isLoading = false;
        }
        resolve();
      };
      img.onerror = () => { if (revision === this.loadRevision) this.isLoading = false; resolve(); };
      img.src = dataUrl;
    });
  }

  finishStroke() {
    if (!this.isDrawing) return;
    const pointer = this.activePointerId;
    this.isDrawing = false;
    this.activePointerId = null;
    this.lastPt = null;
    if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.onStrokeEnd?.();
  }

  toDataUrl() {
    return this.canvas.toDataURL("image/png");
  }

  bindPointerHandlers({ enabled, onStrokeEnd }) {
    this.finishStroke();
    this.onStrokeEnd = onStrokeEnd;
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
      if (!ev.isPrimary || ev.button !== 0 || this.isDrawing || this.isLoading) return;
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
      const samples = ev.getCoalescedEvents?.() || [];
      for (const sample of samples.length ? samples : [ev]) {
        const pt = getLocal(sample);
        this.strokePoint(this.lastPt, pt, sample);
        this.lastPt = pt;
      }
      ev.preventDefault();
    };

    const end = (ev) => {
      if (this.activePointerId !== ev.pointerId) return;
      this.finishStroke();
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
    const cssScale = this.w / Math.max(1, this.canvas.getBoundingClientRect().width);
    const base = this.tool === "eraser" ? 18 : this.size;
    const w = Math.max(.8, base * (0.7 + pressure * 0.6)) * cssScale;

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
  const toast = document.getElementById("toast");
  const ghostRow = document.getElementById("ghostRow");
  const hitLayer = document.getElementById("hitLayer");
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


  const game = new GameState();
  const renderer = new BoardRenderer(boardCanvas, frameCanvas);
  const notes = new NoteCanvas(noteCanvas);
  const paper = new NoteCanvas(document.getElementById("paperCanvas"));
  const analysis = document.querySelector(".analysis");
  const workspace = document.getElementById("appRoot");
  let analysisPage = "moves";
  let noteHistoryBusy = false;
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
  let activePlayNode = null;
  let lastLayoutKey = "";
  let relayoutRaf = 0;
  let relayoutTimer = 0;
  let layoutObserver = null;
  let animations = []; // non-blocking
  let rafRunning = false;
  let toastTimer = null;


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

  const clock = new GameClock(game);
  const clockView = new GameClockView(document.getElementById("gameClock"), clock, () => {
    modulePanel.sync();
    updateTurnUi();
    drawStatic();
  });
  const modulePanel = new BottomRightModule(document.getElementById("bottomModule"), clock, game, {
    onChange: () => { activePlayPointerId = null; activePlayNode = null; updateTurnUi(); drawStatic(); },
    toast: showToast,
    newBoard: () => resetGame(),
  });
  const boardCanPlace = () => !modulePanel.clockRequired || clock.canPlace();
  document.querySelectorAll("[data-clock-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (modulePanel.mode !== "clock" || game.nodeById.size > 1 || !clock.start(button.dataset.clockPreset)) return;
      modulePanel.sync();
      clockView.refresh();
      updateTurnUi();
      drawStatic();
    });
  });
  clockView.returnButton.addEventListener("click", () => jumpToNode(clock.liveNode));

  function resizeWorkspaceInk() {
    const rect=workspace.getBoundingClientRect();
    if(!rect.width || !rect.height)return;
    const dpr=Math.min(2,window.devicePixelRatio || 1);
    const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    for(const surface of [notes,paper]){
      if(surface.w===width && surface.h===height)continue;
      surface.finishStroke();
      const copy=document.createElement("canvas");copy.width=surface.w;copy.height=surface.h;
      copy.getContext("2d").drawImage(surface.canvas,0,0);
      surface.canvas.width=width;surface.canvas.height=height;surface.resize(width,height);
      surface.ctx.drawImage(copy,0,0,width,height);
    }
  }

  function currentNotes() { return analysisPage === "notes" ? paper : notes; }
  function syncNoteButtons() {
    const target = currentNotes();
    btnNoteUndo.disabled = noteHistoryBusy || target.isLoading || !target.canUndo();
    btnNoteRedo.disabled = noteHistoryBusy || target.isLoading || !target.canRedo();
  }
  function updateInputRouting() {
    const editing=activeTool!==Tool.Finger;
    workspace.dataset.editing=String(editing);
    document.getElementById("bottomModule").inert=editing;
    document.querySelector(".decoGamepad").inert=editing;
    updateTravelUi();
    hitLayer.style.pointerEvents=editing?"none":"auto";
    notes.canvas.hidden=analysisPage!=="moves";
    paper.canvas.hidden=analysisPage!=="notes";
    notes.bindPointerHandlers({enabled:editing && analysisPage==="moves",onStrokeEnd:()=>{
      notes.pushHistory();game.current.noteDataUrl=notes.toDataUrl();syncNoteButtons();
    }});
    paper.bindPointerHandlers({enabled:editing && analysisPage==="notes",onStrokeEnd:()=>{
      paper.pushHistory();syncNoteButtons();
    }});
    workspace.style.cursor=editing?(activeTool===Tool.Eraser?"cell":"crosshair"):"";
  }

  function updateTurnUi() {
    const reviewing = modulePanel.clockRequired && game.current !== clock.liveNode;
    const liveFinished = game.current === clock.liveNode && clock.status === "finished";
    if (turnDot) {
      turnDot.style.background = game.currentPlayer === Player.Red ? "var(--p-red)" : "var(--p-yellow)";
    }
    if (turnText) {
      turnText.textContent = reviewing ? `Reviewing move ${game.current.ply}` : liveFinished
        ? (clock.result.winner ? `${playerName(clock.result.winner)} wins${clock.result.reason === "time" ? " on time" : " by connect four"}` : "Draw")
        : game.current.isWin ? `${playerName(game.current.movePlayer)} wins by connect four`
        : `${game.currentPlayer === Player.Red ? "Red" : "Yellow"} to move`;
    }
    document.querySelector(".analysis__side--red")?.classList.toggle("is-turn", !reviewing && !liveFinished && !game.current.isWin && game.currentPlayer === Player.Red);
    document.querySelector(".analysis__side--yellow")?.classList.toggle("is-turn", !reviewing && !liveFinished && !game.current.isWin && game.currentPlayer === Player.Yellow);
  }

  let timelineFollowFrame = 0;
  const stopTimelineFollow = () => {
    cancelAnimationFrame(timelineFollowFrame);
    timelineFollowFrame = 0;
  };
  timeline.addEventListener("wheel", stopTimelineFollow, { passive: true });
  timeline.addEventListener("touchstart", stopTimelineFollow, { passive: true });
  timeline.addEventListener("pointerdown", stopTimelineFollow, { passive: true });

  function renderTimeline() {
    const previousScrollTop = timeline.scrollTop;
    timeline.innerHTML = "";

    const moveNoOfPly = (ply) => Math.ceil(ply / 2);
    const moveToken = (node) => {
      const chipSrc = node.movePlayer === Player.Red ? "./assets/figma/chip-red-enamel.svg" : "./assets/figma/chip-yellow-enamel.svg";
      return `<span class="timelineMoveToken"><img class="timelineChip" src="${chipSrc}" alt="" aria-hidden="true" /><span>${node.moveCol + 1}${node.isWin ? "#" : ""}</span></span>`;
    };

    const appendMoveLine = ({ moveNo, redNode, yellowNode, onlyYellowEllipsis, indent, markVariation, targetNode }) => {
      const li = document.createElement("li");
      li.className = "timelineItem";
      li.dataset.nodeId = targetNode.id;
      if (redNode) li.dataset.redNodeId = redNode.id;
      if (yellowNode) li.dataset.yellowNodeId = yellowNode.id;
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

    timeline.scrollTop = previousScrollTop;
    updateTimelineActive();
  }

  function followCurrentTimelineRow() {
    cancelAnimationFrame(timelineFollowFrame);
    timelineFollowFrame = requestAnimationFrame(() => {
      timelineFollowFrame = 0;
      const row = timeline.querySelector(".timelinePly--current")?.closest(".timelineItem");
      const view = timeline.getBoundingClientRect();
      const box = row?.getBoundingClientRect();
      const target = box ? timeline.scrollTop + box.top - view.top - timeline.clientTop + box.height / 2 - timeline.clientHeight / 2 : 0;
      const top = clamp(target, 0, Math.max(0, timeline.scrollHeight - timeline.clientHeight));
      // Scroll just the notebook, never the page or the board on a phone.
      const startTop = timeline.scrollTop;
      if (renderer.reducedMotion.matches || Math.abs(top - startTop) < 1) {
        timeline.scrollTop = top;
        return;
      }
      const started = performance.now();
      const scroll = (now) => {
        const progress = clamp((now - started) / 200, 0, 1);
        timeline.scrollTop = startTop + (top - startTop) * (1 - (1 - progress) ** 3);
        timelineFollowFrame = progress < 1 ? requestAnimationFrame(scroll) : 0;
      };
      timelineFollowFrame = requestAnimationFrame(scroll);
    });
  }

  function updateTimelineActive() {
    const currentId = game.current.id;
    [...timeline.querySelectorAll(".timelineItem")].forEach((el) => {
      const rowContainsCurrent = el.dataset.redNodeId === currentId || el.dataset.yellowNodeId === currentId;
      el.classList.toggle("timelineItem--active", rowContainsCurrent);
      el.classList.toggle("timelineItem--turn-active", rowContainsCurrent);
      el.querySelectorAll(".timelinePly").forEach((ply) => {
        ply.classList.toggle("timelinePly--current", ply.dataset.nodeId === currentId);
      });
    });
    followCurrentTimelineRow();
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

  async function relayoutCanvases() {
    // Match the rendered border box, including the browser's border-pixel rounding.
    const analysis = document.querySelector(".analysis");
    const dock = analysis?.querySelector(".dock");
    if (dock) {
      dock.style.left = `${-parseFloat(getComputedStyle(analysis).borderLeftWidth)}px`;
      dock.style.width = `${analysis.getBoundingClientRect().width}px`;
    }
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
    notes.finishStroke();
    if (!notes.isLoading) game.current.noteDataUrl = notes.toDataUrl();

    // Resize backing store to match CSS pixels * DPR, keep CSS size controlled by layout
    boardCanvas.width = pxW;
    boardCanvas.height = pxH;
    frameCanvas.width = pxW;
    frameCanvas.height = pxH;

    renderer.resize(pxW, pxH);
    resizeWorkspaceInk();

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
    if (btnStart) btnStart.disabled = activeTool !== Tool.Finger || !game.current.parent;
    btnPrev.disabled = activeTool !== Tool.Finger || !game.current.parent;
    btnNext.disabled = activeTool !== Tool.Finger || !(game.current.children && game.current.children[0]);
    if (btnEnd) btnEnd.disabled = btnNext.disabled;
  }

  function rebuildGhostRow() {
    ghostRow.innerHTML = "";
    const piece = document.createElement("div");
    piece.className = `ghostPiece ghostPiece--${playerCss(game.currentPlayer)}`;
    piece.style.visibility = "hidden";
    ghostRow.appendChild(piece);
  }

  function previewReady() {
    return !animations.some((a) => a.kind === "drop" && a.progress < 0.9);
  }

  function setGhostCol(col) {
    const show = col >= 0 && col < COLS && activeTool === Tool.Finger && !game.current.isWin && boardCanPlace() && previewReady();
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
    const showHover = activeTool === Tool.Finger && !game.current.isWin && boardCanPlace() && previewReady();
    renderer.drawFrame(game.board, showHover ? hoverCol : -1, animations, game.current.winCells || []);
    renderer.drawForegroundFrame(game.current.winCells || []);
    setGhostCol(showHover ? hoverCol : -1);
    if (game.current.winCells?.length && !renderer.reducedMotion.matches) ensureRaf();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function ensureRaf() {
    if (rafRunning || document.hidden || document.body.dataset.screen !== 'game') return;
    rafRunning = true;
    const tick = (t) => {
      if (document.hidden || document.body.dataset.screen !== 'game') { rafRunning = false; return; }
      const now = t || performance.now();
      let active = 0;
      for (const a of animations) {
        const p = clamp((now - a.start) / a.duration, 0, 1);
        a.progress = p;
        if (a.kind === "drop") {
          const top = renderer.getTopCenter(a.col).y;
          const seat = renderer.getCellCenter(a.col, a.row).y;
          if (a.flightDuration) {
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
            // Preserve the existing quick history-navigation transition.
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

  function clockAllowsPlacement() {
    if (!boardCanPlace()) {
      if (clock.status === "setup") showToast("Choose a Game Clock time first");
      else if (clock.status === "finished") showToast("Game finished. Start a new game to play");
      else showToast("Return to the live game to place a chip");
      return false;
    }
    return true;
  }

  async function handleDrop(col) {
    if (!clockAllowsPlacement()) return;
    if (!game.canPlayMove()) return;
    if (col < 0 || col >= COLS) return;

    const row = findLandingRow(game.board, col);
    if (row < 0) return;

    notes.finishStroke();
    // Cache note for current node (even though play mode usually empty)
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

    // attach an animation (fast, non-blocking)
    const startPt = renderer.getTopCenter(col);
    const endPt = renderer.getCellCenter(col, row);
    const flightDuration = 150 + 65 * Math.sqrt(row + 1);
    const duration = renderer.reducedMotion.matches ? 1 : flightDuration + 160;
    let start = performance.now();
    // Rapid taps in one column land in order, even when the pile grows.
    if (!renderer.reducedMotion.matches) {
      for (const a of animations) {
        if (a.kind === "drop" && a.col === col) {
          start = Math.max(start, a.start + (a.flightDuration || a.duration) + 75 - flightDuration);
        }
      }
    }
    animations.push({
      kind: "drop",
      col,
      row,
      player: res.player,
      start,
      duration,
      flightDuration: renderer.reducedMotion.matches ? 0 : flightDuration,
      tilt: (col % 2 ? -1 : 1) * 0.065,
      rotation: 0,
      fromY: startPt.y,
      toY: endPt.y,
      y: startPt.y,
      progress: 0,
    });
    drawStatic();
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
      if (activePlayPointerId !== null || !clockAllowsPlacement()) return;
      if (!game.canPlayMove()) return;

      activePlayPointerId = ev.pointerId;
      activePlayNode = game.current;
      hitLayer.setPointerCapture(ev.pointerId);
      hoverCol = colFromClientPoint(ev.clientX, ev.clientY);
      drawStatic();
      ev.preventDefault();
    };
    hitLayer.onpointerup = (ev) => {
      if (activePlayPointerId !== ev.pointerId) return;
      activePlayPointerId = null;
      const pressedNode = activePlayNode;
      activePlayNode = null;

      if (activeTool !== Tool.Finger || pressedNode !== game.current) return;
      const col = colFromClientPoint(ev.clientX, ev.clientY);
      hoverCol = col;
      drawStatic();
      if (col >= 0) handleDrop(col);
      ev.preventDefault();
    };
    hitLayer.onpointercancel = (ev) => {
      if (activePlayPointerId === ev.pointerId) {
        activePlayPointerId = null;
        activePlayNode = null;
      }
    };
  }

  // Time travel buttons
  const btnStart = document.getElementById("btnStart");
  const btnEnd = document.getElementById("btnEnd");
  const btnEdit = document.getElementById("btnEdit");
  const btnNew = document.getElementById("btnNew");
  const btnSave = document.getElementById("btnSave");
  const btnReview = document.getElementById("btnReview");

  function goStart() {
    if (game.current === game.root) return;
    jumpToNode(game.root);
  }

  function goEnd() {
    // Follow the same continuation as Next, staying inside this subtree.
    let last = game.current;
    while (last.children[0]) last = last.children[0];
    if (last !== game.current) jumpToNode(last);
  }

  btnStart?.addEventListener("click", goStart);
  btnEnd?.addEventListener("click", goEnd);
  btnPrev.addEventListener("click", goPrev);
  btnNext.addEventListener("click", goNext);

  // Timeline click
  timeline.addEventListener("click", (ev) => {
    if (activeTool !== Tool.Finger) return;
    const item = ev.target.closest(".timelineItem");
    if (!item) return;
    const plyTarget = ev.target.closest(".timelinePly");
    const nodeId = plyTarget?.dataset.nodeId || item.dataset.nodeId;
    const node = game.nodeById.get(nodeId);
    if (!node) return;
    jumpToNode(node);
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

  // Theme
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === Theme.Light ? "light" : "dark");
    drawStatic();
  }

  const dock = analysis.querySelector('.dock');
  const btnEraser = document.getElementById('btnEraser');
  const pageToggle = analysis.querySelector('.analysis__page-toggle');
  const movesPage = analysis.querySelector('.analysis__moves');
  const paperPage = analysis.querySelector('.analysis__paper');
  let eraserHold = null;
  let suppressEraserClick = false;
  let suppressPageClickUntil = 0;

  function setActiveTool(tool) {
    cancelEraserHold();
    notes.finishStroke(); paper.finishStroke();
    inkPointer=null;
    activePlayPointerId = null; activePlayNode = null;
    activeTool = tool;
    const editing = tool !== Tool.Finger;
    notes.setTool(editing ? tool : Tool.Pen); paper.setTool(editing ? tool : Tool.Pen);
    analysis.dataset.editing = String(editing); dock.dataset.editing = String(editing);
    btnEdit.setAttribute('aria-pressed', String(editing));
    btnEdit.title = editing ? 'Return to playing' : 'Draw with pen';
    [btnNew,btnSave,btnReview].forEach(b => b.hidden = editing);
    [btnEraser,btnNoteUndo,btnNoteRedo].forEach(b => b.hidden = !editing);
    btnEraser.setAttribute('aria-pressed',String(tool === Tool.Eraser));
    updateInputRouting(); syncNoteButtons(); drawStatic();
  }
  function setAnalysisPage(page) {
    if (page === analysisPage) return;
    cancelEraserHold(); notes.finishStroke(); paper.finishStroke();
    analysisPage = page;
    const writing = page === 'notes';
    analysis.dataset.page = page;
    movesPage.inert = writing; movesPage.setAttribute('aria-hidden',String(writing));
    paperPage.inert = !writing; paperPage.setAttribute('aria-hidden',String(!writing));
    pageToggle.innerHTML = `${writing ? 'Notes' : 'Analysis'} <span class="analysis__page-dots" aria-hidden="true">${writing ? '○ ●' : '● ○'}</span>`;
    pageToggle.setAttribute('aria-label',writing ? 'Switch to move history' : 'Switch to notes page');
    analysis.querySelector('.analysis__subtitle').textContent = writing ? 'Draw anywhere · swipe edge for moves' : 'Tap a move to explore';
    setActiveTool(writing ? Tool.Pen : Tool.Finger);
    if (!writing) followCurrentTimelineRow();
  }
  btnEdit.addEventListener('click', () => setActiveTool(activeTool === Tool.Finger ? Tool.Pen : Tool.Finger));
  pageToggle.addEventListener('click', () => {
    if (performance.now() < suppressPageClickUntil) return;
    setAnalysisPage(analysisPage === 'moves' ? 'notes' : 'moves');
  });

  // In play mode swipe anywhere in Analysis. While writing, use the header
  // or an edge so long horizontal pen/finger strokes never turn the page.
  function isAnalysisSwipeStart(ev) {
    if (!analysis.contains(ev.target) || ev.target.closest('.dock') || ev.pointerType === 'pen') return false;
    if (activeTool === Tool.Finger) return true;
    const r=analysis.getBoundingClientRect();
    return !!ev.target.closest('.analysis__header') || ev.clientX-r.left<24 || r.right-ev.clientX<24;
  }
  let pageSwipe=null;
  analysis.addEventListener('pointerdown',ev=>{
    if(!ev.isPrimary || ev.button!==0 || !isAnalysisSwipeStart(ev))return;
    pageSwipe={id:ev.pointerId,x:ev.clientX,y:ev.clientY};
    if(activeTool!==Tool.Finger && !ev.target.closest('button')){analysis.setPointerCapture(ev.pointerId);ev.stopPropagation();ev.preventDefault();}
  },true);
  analysis.addEventListener('pointerup',ev=>{
    if(!pageSwipe || pageSwipe.id!==ev.pointerId)return;
    const dx=ev.clientX-pageSwipe.x,dy=ev.clientY-pageSwipe.y;pageSwipe=null;
    if(Math.abs(dx)<45 || Math.abs(dx)<Math.abs(dy)*1.4)return;
    const next=dx<0?'notes':'moves';if(next===analysisPage)return;
    suppressPageClickUntil=performance.now()+450;
    ev.preventDefault();ev.stopPropagation();setAnalysisPage(next);
  },true);
  analysis.addEventListener('pointercancel',()=>pageSwipe=null,true);
  analysis.addEventListener('click',ev=>{
    if(performance.now()<suppressPageClickUntil && !ev.target.closest('.dock')){ev.preventDefault();ev.stopPropagation();}
  },true);

  // The visible ink canvases are pointer-transparent. Route each stroke at
  // the app boundary, before a move token or mini-game can receive the input.
  let inkPointer=null;
  let suppressInkClickUntil=0;
  workspace.addEventListener('pointerdown',ev=>{
    if(activeTool===Tool.Finger || !ev.isPrimary || ev.button!==0 || noteHistoryBusy)return;
    if((ev.target.closest('button,input,a,select,textarea') && !ev.target.closest('#bottomModule,.decoGamepad')) || isAnalysisSwipeStart(ev))return;
    const surface=currentNotes();if(surface.isLoading || inkPointer!==null)return;
    inkPointer={id:ev.pointerId,surface};suppressInkClickUntil=performance.now()+450;
    ev.stopImmediatePropagation();ev.preventDefault();surface.canvas.onpointerdown?.(ev);
  },true);
  for(const type of ['pointermove','pointerup','pointercancel']){
    workspace.addEventListener(type,ev=>{
      if(!inkPointer || inkPointer.id!==ev.pointerId)return;
      const surface=inkPointer.surface;
      ev.stopImmediatePropagation();ev.preventDefault();surface.canvas['on'+type]?.(ev);
      if(type!=='pointermove'){inkPointer=null;suppressInkClickUntil=performance.now()+450;}
    },true);
  }
  workspace.addEventListener('lostpointercapture',ev=>{
    if(inkPointer?.id===ev.pointerId){inkPointer.surface.finishStroke();inkPointer=null;}
  },true);
  workspace.addEventListener('click',ev=>{
    if(activeTool!==Tool.Finger && ev.target.closest('#bottomModule,.decoGamepad')){ev.preventDefault();ev.stopImmediatePropagation();return;}
    if(performance.now()<suppressInkClickUntil && !ev.target.closest('button,input,a,select,textarea')){ev.preventDefault();ev.stopImmediatePropagation();}
  },true);

  function cancelEraserHold() {
    if (eraserHold) cancelAnimationFrame(eraserHold.raf);
    eraserHold = null;
    btnEraser.classList.remove('is-holding'); btnEraser.style.setProperty('--hold','0');
  }
  btnEraser.addEventListener('click', ev => {
    if (suppressEraserClick) {suppressEraserClick=false;ev.preventDefault();return;}
    if (activeTool !== Tool.Finger) setActiveTool(activeTool === Tool.Eraser ? Tool.Pen : Tool.Eraser);
  });
  btnEraser.addEventListener('contextmenu', ev => ev.preventDefault());
  btnEraser.addEventListener('pointerdown', ev => {
    if (!ev.isPrimary || ev.button !== 0 || activeTool === Tool.Finger || noteHistoryBusy || currentNotes().isLoading) return;
    suppressEraserClick = false;
    notes.finishStroke(); paper.finishStroke();
    const target = currentNotes(), node = game.current;
    const hold = {pointer:ev.pointerId,start:performance.now(),raf:0};
    eraserHold = hold; btnEraser.setPointerCapture(ev.pointerId); btnEraser.classList.add('is-holding');
    const tick = () => {
      if (eraserHold !== hold) return;
      if (currentNotes() !== target || game.current !== node || document.hidden) {cancelEraserHold();return;}
      const progress = Math.min(1,(performance.now()-hold.start)/3000);
      btnEraser.style.setProperty('--hold',String(progress));
      if (progress < 1) {hold.raf=requestAnimationFrame(tick);return;}
      target.clear(); target.pushHistory();
      if (target === notes) node.noteDataUrl = target.toDataUrl();
      suppressEraserClick = true; cancelEraserHold(); syncNoteButtons();
      showToast('Cleared this page · Undo to restore');
    };
    hold.raf=requestAnimationFrame(tick);
  });
  btnEraser.addEventListener('pointerup', cancelEraserHold);
  btnEraser.addEventListener('pointercancel', () => {suppressEraserClick=true;cancelEraserHold();});
  btnEraser.addEventListener('lostpointercapture', cancelEraserHold);
  btnEraser.addEventListener('pointermove', ev => {
    if (!eraserHold) return;
    const r=btnEraser.getBoundingClientRect();
    if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom){suppressEraserClick=true;cancelEraserHold();}
  });
  document.addEventListener('visibilitychange', () => {if(document.hidden){cancelEraserHold();notes.finishStroke();paper.finishStroke();inkPointer=null;}});
  window.addEventListener('blur', cancelEraserHold);

  async function travelNotes(direction) {
    if (noteHistoryBusy || currentNotes().isLoading) return;
    cancelEraserHold();
    const target = currentNotes(), node = game.current;
    target.finishStroke(); noteHistoryBusy = true; syncNoteButtons();
    try {
      const operation = target[direction]();
      // Persist the chosen history snapshot immediately, even if the user
      // navigates away while the bitmap is decoding.
      if (target === notes) node.noteDataUrl = target.history[target.historyIndex] || null;
      const changed = await operation;
      if (changed && target === notes && game.current === node) node.noteDataUrl=target.toDataUrl();
    } finally {noteHistoryBusy=false;syncNoteButtons();}
  }
  btnNoteUndo.addEventListener('click', () => travelNotes('undo'));
  btnNoteRedo.addEventListener('click', () => travelNotes('redo'));

  async function resetGame() {
    cancelEraserHold();
    notes.finishStroke(); paper.finishStroke();
    paper.loadDataUrl(null); paper.resetHistoryWithCurrent();
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
    renderTimeline();
    updateTimelineActive();
    drawStatic();
    showToast("New game");
  }
  btnNew?.addEventListener("click", resetGame);

  // Home is an entry screen. Keep the existing reset and game controllers as
  // the sole owners of a new board, notes, timer and module state.
  const homeScreen = document.getElementById('homeScreen');
  const homeNew = document.getElementById('home-new');
  let hasSession = false;
  const enterGame = fresh => AppExperience.transition(async () => {
    if (fresh) await resetGame();
    hasSession = true;
    document.body.dataset.screen = 'game';
    workspace.removeAttribute('aria-hidden');
    homeScreen.setAttribute('aria-hidden','true');
    homeScreen.hidden = true;
    window.scrollTo(0,0);
    await relayoutCanvases();
    if (modulePanel.mode === 'orbit') modulePanel.orbit.show();
    drawStatic(); ensureRaf();
  });
  homeNew.addEventListener('click', () => enterGame(true));
  document.getElementById('home-continue').addEventListener('click', () => hasSession ? enterGame(false) : showToast('Start a New Game first'));
  document.getElementById('btnHome').addEventListener('click', () => {
    // Do not lose an Orbit life while the cloud curtain is travelling in.
    modulePanel.orbit.hide();
    return AppExperience.transition(async () => {
    cancelEraserHold(); notes.finishStroke(); paper.finishStroke();
    // Orbit pauses; an active competitive clock keeps running, just as when
    // reviewing history or viewing another module. Continue never resets it.
    modulePanel.orbit.hide();
    homeScreen.hidden = false;
    homeScreen.removeAttribute('aria-hidden');
    workspace.setAttribute('aria-hidden','true');
    document.body.dataset.screen = 'home';
    document.getElementById('home-continue').setAttribute('aria-label','Continue');
    if (clock.status === 'running') showToast('Game Clock keeps running · Continue to return');
    });
  });
  document.getElementById('home-recent').addEventListener('click', () => showToast('No recent games yet'));
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('motion-paused', document.hidden);
    if (!document.hidden) ensureRaf();
  });
  window.addEventListener('pageshow', () => document.body.classList.toggle('motion-paused', document.hidden));


  btnSave?.addEventListener("click", () => {
    showToast("Save coming soon");
  });

  btnReview?.addEventListener("click", () => {
    goStart();
  });

  // Initial render + state
  (async () => {
    registerServiceWorker();

    // A single quiet, pressure-sensitive black ink preset.
    notes.resetHistoryWithCurrent();
    resizeWorkspaceInk();
    paper.resetHistoryWithCurrent();
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
    await AppExperience.assetsReady;
    // Decode and lay out behind the opening screen, before any first tap.
    await relayoutCanvases();
    renderer.warmEffects();
    drawStatic();
    await AppExperience.ready();
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
        new ResizeObserver(resizeWorkspaceInk).observe(workspace);
      }
    }


  })().catch(error => { console.error('App startup failed', error); AppExperience.failed(); });
}

document.addEventListener("DOMContentLoaded", setup);
