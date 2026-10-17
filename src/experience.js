/* Screen presentation only: opening screen (with real loading progress),
   Home ⇄ game cloud transition and press feedback. Home's own effects live in
   home-fx.js; board, clock and notebook state stay in app.js. Timings live in
   CONFIG.screen. */
(() => {
  const T = CONFIG.screen;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const boot = document.getElementById('bootScreen');
  const curtain = document.getElementById('cloudTransition');
  const home = document.getElementById('homeScreen');
  const game = document.getElementById('appRoot');
  const started = performance.now();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  let busy = true;
  const bounded = promise => Promise.race([promise.catch(() => {}), delay(T.assetTimeout)]);
  // Art that is not an <img> in index.html: canvas art, CSS backgrounds, generated icons.
  const { board, chips, orbitLives, cssBackgrounds } = CONFIG.assets;
  const extraImages = [board, ...Object.values(chips), ...cssBackgrounds, ...Object.values(orbitLives)];
  const images = [...document.images, ...extraImages.map(src => { const img = new Image(); img.src = src; return img; })];
  const setProgress = value => boot.style.setProperty('--progress', value.toFixed(3));
  const tasks = [bounded(document.fonts.ready), ...images.map(img => bounded(img.decode()))];
  let settled = 0;
  tasks.forEach(task => task.then(() => setProgress(++settled / tasks.length)));
  const assetsReady = Promise.all(tasks);
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
      await delay(Math.max(0, T.bootMinimum - (performance.now() - started)));
      setProgress(1);
      await delay(reduce.matches ? 0 : T.bootFinish);
      await frame();
      // Home pops in while the opening screen zooms away.
      window.homeFx?.intro();
      const animation = await animate(boot, [{opacity:1, transform:'scale(1)'}, {opacity:0, transform:'scale(1.08)'}], {duration:reduce.matches ? 0 : T.bootFade, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards'});
      boot.hidden = true;
      animation.cancel();
      document.body.classList.remove('booting');
      unlock();
    },
    failed() {
      boot.hidden = false;
      boot.querySelector('.boot__label').textContent = 'Couldn’t finish loading.';
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
          {duration:reduce.matches ? 0 : T.cloudIn, delay:reduce.matches ? 0 : i*T.cloudInStagger, easing:'cubic-bezier(.35,0,.2,1)', fill:'forwards'}))));
        await swap();
        if (document.body.dataset.screen === 'game') window.homeStickers?.reset();
        // Let layout, canvas and the background paint while completely covered.
        await frame(); await frame();
        if (document.body.dataset.screen === 'home') window.homeFx?.intro({quick:true});
        animations.push(...await Promise.all(clouds.map((cloud, i) => animate(cloud,
          [{transform:'translateX(0)'}, {transform:'translateX(115%)'}],
          {duration:reduce.matches ? 0 : T.cloudOut, delay:reduce.matches ? 0 : (clouds.length-1-i)*T.cloudOutStagger, easing:'cubic-bezier(.55,0,.3,1)', fill:'forwards'}))));
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
})();
