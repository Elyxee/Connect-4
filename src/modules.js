/* Bottom-right module panel: a cover picker plus one pane per mode.

   Adding a mode (see tests/MODULES.md):
   1. index.html: add a .module__slide to .module__track whose logo button has
      data-enter-mode="<name>", and a pane element with data-module-pane="<name>".
   2. Optionally register a controller in `this.controllers` below:
        show()          the pane became visible (resume work)
        hide()          the pane is leaving or the game screen is hidden (pause)
        reset()         New game
        hit()           tap on the pane, the gamepad, or Space/Enter
        gamepadLabel    accessible name of the gamepad while this mode is open
   Modes without a controller are plain panes (like the clock).

   The visible module and the timed-board session are intentionally separate:
   leaving a running clock never stops it or unlocks historical variations. */
class BottomRightModule {
  constructor(element, clock, game, { onChange, newBoard }) {
    this.element = element; this.clock = clock; this.game = game; this.onChange = onChange; this.newBoard = newBoard;
    this.mode = 'picker'; this.selection = 0; this.clockSelected = false; this.suppressClickUntil = 0;
    this.cover = element.querySelector('.module__cover'); this.track = element.querySelector('.module__track');
    this.slides = [...this.track.querySelectorAll('.module__slide')];
    this.modes = this.slides.map(slide => slide.querySelector('[data-enter-mode]').dataset.enterMode);
    this.panes = Object.fromEntries(this.modes.map(mode => [mode, element.querySelector(`[data-module-pane="${mode}"]`)]));
    this.back = element.querySelector('.module__back'); this.badge = element.querySelector('.module__timed');
    this.lock = element.querySelector('.clock__new-board');
    this.gamepad = document.querySelector('.decoGamepad');

    this.orbit = new OrbitView(this.panes.orbit, kind => this.nudgeGamepad(kind));
    this.controllers = {
      orbit: {
        show: () => this.orbit.show(),
        hide: () => this.orbit.hide(),
        reset: () => { this.orbit.game.reset(); this.orbit.sync(); },
        hit: () => this.orbit.hit(),
        gamepadLabel: 'Hit Orbit target',
      },
    };

    element.querySelectorAll('[data-enter-mode]').forEach(b => b.addEventListener('click', () => {
      if (performance.now() < this.suppressClickUntil) return;
      this.enter(b.dataset.enterMode);
    }));
    element.querySelectorAll('[data-select-mode]').forEach(b => b.addEventListener('click', () => this.select(Number(b.dataset.selectMode))));
    this.back.addEventListener('click', () => this.showPicker());
    this.badge.addEventListener('click', () => this.enter('clock'));
    this.lock.querySelector('button').addEventListener('click', async () => { await this.newBoard(); this.enter('clock'); });
    this.bindCoverGestures();
    this.bindHits();
    this.select(0); this.sync();
  }

  get clockRequired() { return this.clockSelected || this.clock.status !== 'setup'; }
  get activeController() { return this.controllers[this.mode]; }

  bindCoverGestures() {
    const { moduleSwipe, moduleSwipeRatio } = CONFIG.gestures;
    let swipe = null;
    this.cover.addEventListener('pointerdown', e => { if (e.isPrimary && e.button === 0) swipe = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    this.cover.addEventListener('pointerup', e => {
      if (!swipe || swipe.id !== e.pointerId) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
      if (Math.abs(dx) > moduleSwipe && Math.abs(dx) > Math.abs(dy) * moduleSwipeRatio) {
        // A swipe must not also enter the logo underneath it.
        this.suppressClickUntil = performance.now() + 400; this.select(this.selection + (dx < 0 ? 1 : -1));
      }
    });
    this.cover.addEventListener('pointercancel', () => swipe = null);
    this.cover.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.select(this.selection + (e.key === 'ArrowRight' ? 1 : -1)); }
    });
  }

  /* Taps on the open pane or the gamepad go to the active mode's hit(). */
  bindHits() {
    const primary = e => e.isPrimary && e.button === 0;
    this.element.addEventListener('pointerdown', e => {
      const hit = this.activeController?.hit;
      if (!hit || e.target.closest('button')) return;
      if (primary(e)) { e.preventDefault(); hit(); }
    });
    this.gamepad.addEventListener('pointerdown', e => {
      const hit = this.activeController?.hit;
      if (hit && primary(e)) { e.preventDefault(); hit(); }
    });
    // Keyboard activation of the gamepad (detail 0); pointer taps are handled above.
    this.gamepad.addEventListener('click', e => { if (e.detail === 0) this.activeController?.hit?.(); });
    for (const [mode, controller] of Object.entries(this.controllers)) {
      if (!controller.hit) continue;
      this.panes[mode].addEventListener('keydown', e => {
        if ((e.code === 'Space' || e.code === 'Enter') && !e.target.closest('button')) { e.preventDefault(); if (!e.repeat) controller.hit(); }
      });
    }
  }

  nudgeGamepad(kind) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.gamepad.animate(kind === 'hit'
      ? [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-8deg) scale(1.08)' }, { transform: 'rotate(0) scale(1)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 240 });
  }

  /* Shows cover `index` in the picker (clamped to the available modes). */
  select(index) {
    this.selection = clamp(index, 0, this.slides.length - 1);
    this.slides.forEach((slide, i) => { slide.inert = i !== this.selection; slide.setAttribute('aria-hidden', String(i !== this.selection)); });
  }

  enter(mode) {
    this.mode = mode; this.clockSelected = mode === 'clock';
    for (const [name, controller] of Object.entries(this.controllers)) if (name !== mode) controller.hide?.();
    this.activeController?.show?.();
    this.sync(); this.animateIn(this.panes[mode]); this.onChange();
  }

  showPicker() {
    this.suspend(); this.selection = Math.max(0, this.modes.indexOf(this.mode));
    this.mode = 'picker'; this.clockSelected = false; this.select(this.selection); this.sync(); this.animateIn(this.cover); this.onChange();
  }

  /* The game screen is leaving (e.g. back to Home): pause every mode. */
  suspend() { Object.values(this.controllers).forEach(controller => controller.hide?.()); }

  /* The game screen is visible again: resume the open mode. */
  resume() { this.activeController?.show?.(); }

  reset() {
    this.suspend(); Object.values(this.controllers).forEach(controller => controller.reset?.());
    this.mode = 'picker'; this.clockSelected = false; this.select(0); this.sync();
  }

  sync() {
    const controller = this.activeController;
    this.element.dataset.module = this.mode;
    this.cover.hidden = this.mode !== 'picker';
    for (const [mode, pane] of Object.entries(this.panes)) pane.hidden = this.mode !== mode;
    this.back.hidden = this.mode === 'picker'; this.badge.hidden = this.mode === 'clock' || this.clock.status === 'setup';
    this.badge.textContent = this.clock.status === 'finished' ? 'Clock result' : 'Live Clock';
    this.gamepad.classList.toggle('is-playable', !!controller?.hit);
    this.gamepad.disabled = !controller?.hit; this.gamepad.setAttribute('aria-label', controller?.gamepadLabel || 'Game controller');
    // A used board must start a New timed game before a preset can run.
    const needsNew = this.clock.status === 'setup' && this.game.nodeById.size > 1;
    this.lock.hidden = !needsNew;
    this.panes.clock.querySelectorAll('[data-clock-preset]').forEach(b => b.disabled = needsNew);
  }

  animateIn(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.getAnimations().forEach(animation => animation.cancel());
    el.animate([{ opacity: 0, transform: 'scale(1.025)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 440, easing: 'cubic-bezier(.22,.8,.25,1)' });
  }
}
