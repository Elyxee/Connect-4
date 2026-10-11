/* Game model: players, win detection and the move tree.
   No DOM access, so the Node tests load it as-is. */

const COLS = 7;
const ROWS = 6;

const Player = Object.freeze({
  Red: 1,
  Yellow: 2,
});

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
}

function boardSignature(board) {
  return board.map((r) => r.join("")).join("|");
}

function findLandingRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r;
  return -1;
}

// The four line directions as [dRow, dCol]: vertical, horizontal and both diagonals.
const LINE_DIRECTIONS = Object.freeze([
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]);

/* All cells of `player` that belong to a run of four or more, as "row,col" keys. */
function analyzeWinCells(board, player) {
  const inb = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const cells = new Set();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of LINE_DIRECTIONS) {
        // Evaluate each contiguous run once, from its first cell.
        if (inb(r - dr, c - dc) && board[r - dr][c - dc] === player) continue;
        let len = 0;
        while (inb(r + dr * len, c + dc * len) && board[r + dr * len][c + dc * len] === player) len++;
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

function makeNodeId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

class GameNode {
  constructor({ parent, board, toPlay, moveCol = null, moveRow = null, movePlayer = null, ply = 0, isWin = false, winCells = [] }) {
    this.id = makeNodeId();
    this.parent = parent || null;
    this.children = []; // children[0] is the main line; the rest are variations
    this.board = board;
    this.toPlay = toPlay;
    this.moveCol = moveCol;
    this.moveRow = moveRow;
    this.movePlayer = movePlayer;
    this.ply = ply; // 0 = root; 1..n for moves
    this.isWin = isWin;
    this.winCells = winCells;
    this.noteDataUrl = null; // move-page ink drawn on this position
    this.sig = boardSignature(board);
  }
}

/* A tree of positions. Playing a different move from a position adds a
   variation instead of overwriting the existing continuation. */
class GameState {
  constructor() {
    this.reset();
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
    const nextBoard = this.current.board.map((r) => r.slice());
    nextBoard[row][col] = player;

    const winInfo = analyzeWinCells(nextBoard, player);
    const nextSig = boardSignature(nextBoard);

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
    this.nodeById = new Map([[this.root.id, this.root]]);
  }
}
