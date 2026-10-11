/* One full-workspace ink surface with pressure-sensitive strokes and undo history.
   The canvas itself is pointer-transparent: app.js routes pointer events to the
   handlers installed by bindPointerHandlers. */
class NoteCanvas {
  constructor(noteCanvas) {
    this.canvas = noteCanvas;
    this.ctx = noteCanvas.getContext("2d");
    this.w = noteCanvas.width;
    this.h = noteCanvas.height;

    this.tool = "pen"; // pen | eraser
    this.loadRevision = 0;
    this.isLoading = false;

    this.isDrawing = false;
    this.lastPt = null;
    this.activePointerId = null;
    this.history = [];
    this.historyIndex = -1;

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
    this.history = [this.toDataUrl()];
    this.historyIndex = 0;
  }

  pushHistory() {
    const d = this.toDataUrl();
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === d) return;
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(d);
    if (this.history.length > CONFIG.notes.historyLimit) this.history.shift();
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

  /* Replaces the bitmap. A newer load always wins over a slower earlier one. */
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
      img.onerror = () => {
        if (revision === this.loadRevision) this.isLoading = false;
        resolve();
      };
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

    if (!enabled) return;

    const getLocal = (ev) => {
      const rect = c.getBoundingClientRect();
      return {
        x: ((ev.clientX - rect.left) / rect.width) * this.w,
        y: ((ev.clientY - rect.top) / rect.height) * this.h,
      };
    };

    c.onpointerdown = (ev) => {
      if (!ev.isPrimary || ev.button !== 0 || this.isDrawing || this.isLoading) return;
      this.isDrawing = true;
      this.activePointerId = ev.pointerId;
      c.setPointerCapture(ev.pointerId);
      this.lastPt = getLocal(ev);
      this.strokePoint(this.lastPt, this.lastPt, ev);
      ev.preventDefault();
    };

    c.onpointermove = (ev) => {
      if (!this.isDrawing || this.activePointerId !== ev.pointerId) return;
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
    c.onpointerup = end;
    c.onpointercancel = end;
  }

  strokePoint(a, b, ev) {
    const ctx = this.ctx;
    const pressure = typeof ev.pressure === "number" && ev.pressure > 0 ? ev.pressure : 0.5;
    const cssScale = this.w / Math.max(1, this.canvas.getBoundingClientRect().width);
    const base = this.tool === "eraser" ? CONFIG.notes.eraserWidth : CONFIG.notes.inkWidth;
    const w = Math.max(0.8, base * (0.7 + pressure * 0.6)) * cssScale;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = CONFIG.notes.inkColor;
      ctx.globalAlpha = CONFIG.notes.inkOpacity;
    }

    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}
