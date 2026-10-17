/* Movable Home stickers. Offsets are stored as fractions of the scene size and
   live only until the next game entry (experience.js calls reset()). A dragged
   sticker leans with its speed; onDrop(piece, {x, y, tilt}) lets home-fx.js
   animate the landing. */
class HomeStickers {
  constructor(home) {
    this.home = home;
    this.scene = home.querySelector('.home__scene');
    this.pieces = [...home.querySelectorAll('.home__piece')];
    this.positions = new Map();
    this.front = 10;
    this.gesture = null;
    this.suppressed = null;
    home.addEventListener('pointerdown', event => this.start(event));
    home.addEventListener('pointermove', event => this.move(event));
    home.addEventListener('pointerup', event => this.end(event));
    home.addEventListener('pointercancel', event => this.cancel(event));
    home.addEventListener('lostpointercapture', event => this.cancel(event));
    home.addEventListener('click', event => {
      if (this.gesture?.dragging || (this.suppressed && performance.now() < this.suppressed.until && event.target.closest('.home__piece') === this.suppressed.piece)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    new ResizeObserver(() => this.resize()).observe(this.scene);
  }
  start(event) {
    if (!event.isPrimary || event.button !== 0 || this.gesture || this.home.inert) return;
    const piece = event.target.closest('.home__piece');
    if (!piece || piece.disabled) return;
    this.suppressed = null;
    piece.style.zIndex = String(++this.front);
    const scene = this.scene.getBoundingClientRect();
    const previous = this.positions.get(piece) || {x:0,y:0};
    this.gesture = {piece,id:event.pointerId,x:event.clientX,y:event.clientY,previous,
      dx:previous.x * scene.width,dy:previous.y * scene.height,dragging:false,
      lastX:event.clientX,lastTime:event.timeStamp || 0,tilt:0};
    piece.setPointerCapture(event.pointerId);
  }
  move(event) {
    const g = this.gesture;
    if (!g || event.pointerId !== g.id) return;
    const dx = event.clientX-g.x, dy = event.clientY-g.y;
    if (!g.dragging && Math.hypot(dx,dy) < CONFIG.homeDrag.startDistance) return;
    g.dragging = true;
    g.piece.classList.add('is-dragging');
    g.piece.classList.remove('is-pressed');
    event.preventDefault();
    const scene = this.scene.getBoundingClientRect();
    const position = {x:(g.dx+dx)/scene.width,y:(g.dy+dy)/scene.height};
    this.positions.set(g.piece,position);
    this.paint(g.piece,position,scene);
    // Lean into the movement, smoothed so the sticker swings rather than jitters.
    const now = event.timeStamp || 0, max = CONFIG.homeDrag.maxTilt;
    const speed = (event.clientX - g.lastX) / Math.max(8, now - g.lastTime);
    g.tilt = g.tilt * 0.75 + Math.max(-max, Math.min(max, speed * 10)) * 0.25;
    g.lastX = event.clientX; g.lastTime = now;
    g.piece.style.rotate = `${g.tilt.toFixed(2)}deg`;
  }
  end(event) {
    const g = this.gesture;
    if (!g || event.pointerId !== g.id) return;
    this.gesture = null;
    if (g.dragging) {
      this.keepReachable(g.piece);
      this.suppressed = {piece:g.piece,until:performance.now()+CONFIG.homeDrag.clickSuppress};
      g.piece.style.removeProperty('rotate');
      this.onDrop?.(g.piece,{x:event.clientX,y:event.clientY,tilt:g.tilt});
      event.preventDefault();
    }
    g.piece.classList.remove('is-dragging');
    if (g.piece.hasPointerCapture(g.id)) g.piece.releasePointerCapture(g.id);
  }
  cancel(event) {
    const g = this.gesture;
    if (!g || (event && event.pointerId !== g.id)) return;
    this.gesture = null;
    this.positions.set(g.piece,g.previous);
    this.paint(g.piece,g.previous);
    g.piece.style.removeProperty('rotate');
    g.piece.classList.remove('is-dragging','is-pressed');
    this.suppressed = {piece:g.piece,until:performance.now()+CONFIG.homeDrag.clickSuppress};
    if (g.piece.hasPointerCapture(g.id)) g.piece.releasePointerCapture(g.id);
  }
  paint(piece,position,scene=this.scene.getBoundingClientRect()) {
    piece.style.translate = `${position.x*scene.width}px ${position.y*scene.height}px`;
  }
  keepReachable(piece) {
    // Allow partial off-screen play, but retain a finger-sized grab area.
    const rect=piece.getBoundingClientRect(),view=this.home.getBoundingClientRect();
    const margin=Math.min(CONFIG.homeDrag.grabMargin,rect.width/2,rect.height/2);
    const dx=Math.max(view.left+margin-rect.right,Math.min(0,view.right-margin-rect.left));
    const dy=Math.max(view.top+margin-rect.bottom,Math.min(0,view.bottom-margin-rect.top));
    const scene=this.scene.getBoundingClientRect();
    const previous=this.positions.get(piece)||{x:0,y:0};
    const position={x:previous.x+dx/scene.width,y:previous.y+dy/scene.height};
    this.positions.set(piece,position);this.paint(piece,position,scene);
  }
  resize() {
    this.cancel();
    for (const [piece,position] of this.positions) {
      this.paint(piece,position);
      if (!this.home.hidden) this.keepReachable(piece);
    }
  }
  reset() {
    this.cancel();this.positions.clear();this.suppressed=null;this.front=10;
    for (const piece of this.pieces) {
      piece.style.removeProperty('translate');piece.style.removeProperty('rotate');piece.style.removeProperty('z-index');
      piece.classList.remove('is-dragging','is-pressed');
    }
  }
}
window.homeStickers = new HomeStickers(document.getElementById('homeScreen'));
