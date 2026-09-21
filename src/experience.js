/* Screen presentation only. Board, clock and notebook state stay in app.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const boot = document.getElementById('bootScreen');
  const curtain = document.getElementById('cloudTransition');
  const home = document.getElementById('homeScreen');
  const game = document.getElementById('appRoot');
  const started = performance.now();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  let busy = true;
  const bounded = promise => Promise.race([promise.catch(() => {}), delay(8000)]);
  const extraImages = ['./assets/figma/board-live.png', './assets/figma/chip-red-enamel.svg', './assets/figma/chip-yellow-enamel.svg', './assets/modules/clock-cover.png', './assets/modules/orbit-bg.png'];
  const images = [...document.images, ...extraImages.map(src => { const img = new Image(); img.src = src; return img; })];
  const assetsReady = Promise.all([bounded(document.fonts.ready), ...images.map(img => bounded(img.decode()))]);
  home.inert = true;

  // iOS otherwise turns a held illustration into a selectable image range.
  for (const name of ['selectstart', 'dragstart', 'contextmenu']) {
    document.addEventListener(name, event => event.preventDefault());
  }
  for (const name of ['pointerdown', 'click', 'keydown']) {
    document.addEventListener(name, event => {
      if (busy && !event.target.closest('#bootScreen')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
  const unlock = () => {
    busy = false;
    document.body.classList.remove('screen-changing');
    home.inert = document.body.dataset.screen !== 'home';
    game.inert = document.body.dataset.screen !== 'game';
  };
  async function animate(el, frames, options) {
    const animation = el.animate(frames, options);
    try { await animation.finished; } catch (_) { /* Cancellation must never strand the curtain. */ }
    return animation;
  }
  window.AppExperience = {
    assetsReady,
    async ready() {
      await assetsReady;
      await delay(Math.max(0, 650 - (performance.now() - started)));
      await frame();
      const animation = await animate(boot, [{opacity:1}, {opacity:0}], {duration:reduce.matches ? 0 : 260, fill:'forwards'});
      boot.hidden = true;
      animation.cancel();
      document.body.classList.remove('booting');
      unlock();
    },
    failed() {
      boot.hidden = false;
      boot.querySelector('span').textContent = 'Couldn’t finish loading.';
      const retry = document.createElement('button');
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => location.reload());
      boot.append(retry);
    },
    async transition(swap) {
      if (busy) return false;
      busy = true;
      home.inert = game.inert = true;
      document.body.classList.add('screen-changing');
      curtain.hidden = false;
      const clouds = [...curtain.children];
      const animations = [];
      try {
        animations.push(...await Promise.all(clouds.map((cloud, i) => animate(cloud,
          [{transform:'translateX(115%)'}, {transform:'translateX(0)'}],
          {duration:reduce.matches ? 0 : 470, delay:reduce.matches ? 0 : i*45, easing:'cubic-bezier(.35,0,.2,1)', fill:'forwards'}))));
        await swap();
        if (document.body.dataset.screen === 'game') window.homeStickers?.reset();
        // Let layout, canvas and the background paint while completely covered.
        await frame(); await frame();
        animations.push(...await Promise.all(clouds.map((cloud, i) => animate(cloud,
          [{transform:'translateX(0)'}, {transform:'translateX(115%)'}],
          {duration:reduce.matches ? 0 : 540, delay:reduce.matches ? 0 : (2-i)*35, easing:'cubic-bezier(.55,0,.3,1)', fill:'forwards'}))));
        return true;
      } finally {
        curtain.hidden = true;
        animations.forEach(animation => animation.cancel());
        unlock();
      }
    }
  };

  // Touch feedback begins on pointerdown, without waiting for a synthesized click.
  const pressed = new Map();
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || button.closest('[inert]')) return;
    button.classList.add('is-pressed'); pressed.set(event.pointerId, button);
  }, true);
  const release = event => { pressed.get(event.pointerId)?.classList.remove('is-pressed'); pressed.delete(event.pointerId); };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', () => { pressed.forEach(button => button.classList.remove('is-pressed')); pressed.clear(); });

  const moves = {
    chip: ['scale(1)', 'translateY(-16%) rotate(18deg) scale(1.08)', 'translateY(3%) rotate(-5deg)', 'none'],
    edge: ['scaleY(1)', 'translateY(-12%) scaleY(.86)', 'translateY(4%) scaleY(1.06)', 'none'],
    heart: ['scale(1)', 'scale(1.24)', 'scale(.94)', 'scale(1.16)', 'none'],
    swan: ['scaleY(1)', 'translateY(-5%) scaleY(1.05)', 'translateY(1%) scaleY(.97)', 'none'],
    bulb: ['scale(1)', 'scale(1.1)', 'scale(.98)', 'none'],
    controller: ['none', 'translateY(-6%)', 'translateY(4%)', 'translateY(-3%)', 'none'],
    star: ['none', 'rotate(36deg) scale(1.18)', 'rotate(-8deg)', 'none'],
    burst: ['scale(1)', 'scale(.78)', 'scale(1.2)', 'none'],
    bubble: ['scaleY(1)', 'scaleY(.82)', 'scaleY(1.13)', 'none'],
    bolt: ['scaleY(1)', 'scaleY(.85)', 'scaleY(1.12)', 'none'],
    logo: ['none', 'translateY(-5%) scale(1.035)', 'translateY(1%) scale(.99)', 'none'],
    rays: ['scale(1)', 'scale(1.25)', 'scale(.9)', 'none']
  };
  home.querySelectorAll('.home__piece:not(.home__button)').forEach(piece => {
    const names = piece.className;
    const kind = names.includes('rays') ? 'rays' : /chip-edge|chip-corner/.test(names) ? 'edge' : Object.keys(moves).find(key => names.includes(key)) || 'rays';
    piece.removeAttribute('aria-hidden');
    piece.setAttribute('role', 'button'); piece.tabIndex = 0;
    piece.setAttribute('aria-label', `Animate ${kind === 'logo' ? 'Connect 4Live' : kind}`);
    let reaction;
    const react = () => {
      reaction?.cancel();
      const img = piece.querySelector('img');
      reaction = img.animate(reduce.matches ? [{opacity:.7}, {opacity:1}] : moves[kind].map(transform => ({transform})),
        {duration:reduce.matches ? 120 : kind === 'controller' ? 420 : 720, easing:'cubic-bezier(.22,.8,.3,1)'});
    };
    piece.addEventListener('click', react);
    piece.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); react(); } });
  });
})();
