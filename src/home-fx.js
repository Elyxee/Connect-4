/* Home interaction effects: tap reactions for every sticker, particle bursts
   (dots, stars, hearts, notes, confetti, rings) drawn in the stickers' inked
   style, button confetti, water ripples, drag tilt/drop squash, and the
   stickers popping in when Home appears (homeFx.intro). Tuning: CONFIG.home. */
(() => {
  const home = document.getElementById('homeScreen');
  if (!home) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const { fx: FX, intro: INTRO } = CONFIG.home;
  const INK = FX.ink;
  const [PINK, YELLOW, BLUE, CYAN, ORANGE] = FX.colors;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---- Particles ------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.className = 'home__fx';
  canvas.setAttribute('aria-hidden', 'true');
  home.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const particles = [];
  let frame = 0, last = 0, ratio = 1;

  function resize() {
    ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(home.clientWidth * ratio);
    canvas.height = Math.round(home.clientHeight * ratio);
  }

  function add(p) {
    if (particles.length >= FX.maxParticles) particles.shift();
    particles.push({ age: 0, rotation: rand(0, Math.PI * 2), spin: rand(-6, 6), drag: 1.6, gravity: 900, ...p });
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
  }

  /* Particles flying out from (x, y) in client coordinates. */
  function burst(x, y, { shape = 'dot', count = 10, colors = FX.colors, speed = [220, 520], size = [4, 9], life = [0.6, 1.0], gravity = 900, spread = Math.PI * 2, angle = -Math.PI / 2, rise = 0 } = {}) {
    if (reduce.matches) return;
    for (let i = 0; i < count; i++) {
      const a = angle + (spread >= Math.PI * 2 ? rand(0, Math.PI * 2) : rand(-spread / 2, spread / 2));
      const v = rand(...speed);
      add({ shape, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rise, size: rand(...size), color: pick(colors), life: rand(...life), gravity });
    }
  }

  function ring(x, y, color = PINK, radius = 70, life = 0.5) {
    if (!reduce.matches) add({ shape: 'ring', x, y, vx: 0, vy: 0, gravity: 0, size: radius, color, life, spin: 0 });
  }

  function flash(x, y, color = YELLOW, radius = 180) {
    if (!reduce.matches) add({ shape: 'flash', x, y, vx: 0, vy: 0, gravity: 0, size: radius, color, life: 0.45, spin: 0 });
  }

  function rays(x, y, color = YELLOW, count = 10, radius = 60) {
    if (reduce.matches) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.15, 0.15);
      add({ shape: 'streak', x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, rotation: a, spin: 0, gravity: 0, drag: 3, size: rand(14, 22), color, life: 0.42 });
    }
  }

  function path(shape, s) {
    ctx.beginPath();
    if (shape === 'star' || shape === 'sparkle') {
      const points = shape === 'star' ? 5 : 4, inner = shape === 'star' ? 0.48 : 0.32;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? s * inner : s, a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    } else if (shape === 'heart') {
      ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.15, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.7, -s * 1.15, s * 1.4, -s * 0.1, 0, s * 0.9);
    } else if (shape === 'confetti') {
      ctx.roundRect(-s, -s * 0.45, s * 2, s * 0.9, s * 0.3);
    } else {
      ctx.arc(0, 0, s, 0, Math.PI * 2);
    }
  }

  function draw(p, t) {
    const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.shape === 'ring') {
      const r = p.size * (0.35 + 0.65 * (1 - Math.pow(1 - t, 3)));
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.stroke();
    } else if (p.shape === 'flash') {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * (0.6 + 0.4 * t));
      g.addColorStop(0, p.color + 'cc');
      g.addColorStop(1, p.color + '00');
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'streak') {
      ctx.rotate(p.rotation);
      ctx.globalAlpha = fade;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-p.size * (1 - t), 0);
      ctx.lineTo(p.size * (1 - t), 0);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.color;
      ctx.stroke();
    } else if (p.shape === 'note') {
      ctx.rotate(Math.sin(p.age * 6) * 0.25);
      ctx.globalAlpha = fade;
      ctx.font = `900 ${p.size * 2.6}px ui-rounded, "Avenir Next", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.strokeText('♪', 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText('♪', 0, 0);
    } else {
      // Pop in, then shrink away: inked sticker-style bits.
      const scale = Math.min(1, t / 0.12) * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
      ctx.rotate(p.rotation);
      ctx.scale(scale, scale);
      path(p.shape, p.size);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, p.size * 0.32);
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.fill();
      if (p.shape !== 'confetti') {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-p.size * 0.32, -p.size * 0.34, p.size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    const origin = home.getBoundingClientRect();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { particles.splice(i, 1); continue; }
      p.vx *= Math.exp(-p.drag * dt);
      p.vy = p.vy * Math.exp(-p.drag * dt) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      ctx.save();
      ctx.translate(-origin.left, -origin.top);
      draw(p, t);
      ctx.restore();
    }
    frame = particles.length && !document.hidden ? requestAnimationFrame(step) : 0;
    if (!frame) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ---- Sticker reactions ----------------------------------------------------
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const play = (el, frames, duration, easing = 'cubic-bezier(.22,.8,.3,1)') => {
    el.getAnimations().filter((a) => a.id === 'react').forEach((a) => a.cancel());
    const animation = el.animate(reduce.matches ? [{ opacity: 0.7 }, { opacity: 1 }] : frames, { duration: reduce.matches ? 120 : duration, easing });
    animation.id = 'react';
    return animation;
  };
  const t = (transform) => ({ transform });

  const reactions = {
    chip(piece, img, x, y) {
      play(img, [t('none'), t('perspective(600px) translateY(-24%) rotateY(180deg) scale(1.1)'), t('perspective(600px) translateY(-10%) rotateY(340deg)'), t('perspective(600px) translateY(4%) rotateY(360deg) scaleY(.9)'), t('none')], 820);
      const gold = piece.classList.contains('home__chip-gold') || piece.classList.contains('home__chip-bottom');
      const colors = gold ? [YELLOW, '#ffffff', ORANGE] : ['#ff3b3b', '#ffffff', PINK];
      burst(x, y, { count: 9, colors, size: [4, 8] });
      burst(x, y, { shape: 'confetti', count: 6, colors, size: [5, 8], speed: [260, 560] });
      ring(x, y, gold ? YELLOW : PINK, 80);
    },
    edge(piece, img, x, y) {
      play(img, [t('scaleY(1)'), t('translateY(-14%) scaleY(.84) rotate(-8deg)'), t('translateY(5%) scaleY(1.08) rotate(5deg)'), t('none')], 720);
      burst(x, y, { count: 8, colors: ['#ff3b3b', '#ffffff', PINK] });
    },
    heart(piece, img, x, y) {
      play(img, [t('scale(1)'), t('scale(1.32)'), t('scale(.9)'), t('scale(1.2)'), t('scale(.97)'), t('none')], 820);
      burst(x, y, { shape: 'heart', count: 7, colors: [PINK, '#ff7fae', '#ff4f8b'], size: [8, 13], speed: [90, 200], gravity: -260, rise: 140, life: [0.9, 1.3], spread: Math.PI * 0.9 });
      burst(x, y, { count: 8, colors: [PINK, '#ffd0e2'], size: [3, 6] });
    },
    swan(piece, img, x, y) {
      play(img, [t('none'), t('translateY(-10%) rotate(-6deg) scaleY(1.06)'), t('translateY(2%) rotate(3deg) scaleY(.94)'), t('translateY(-4%) rotate(-2deg)'), t('none')], 820);
      burst(x, y - 30, { shape: 'note', count: 3, colors: [PINK, BLUE, ORANGE], size: [9, 12], speed: [80, 160], gravity: -200, rise: 160, life: [1.0, 1.4], spread: Math.PI * 0.8 });
      const box = piece.getBoundingClientRect();
      window.homeFlow?.ripple(box.left + box.width * 0.55, box.bottom - box.height * 0.08, 1);
    },
    bulb(piece, img, x, y) {
      play(img, [t('scale(1)'), t('scale(1.16) rotate(-4deg)'), t('scale(.95) rotate(2deg)'), t('scale(1.05)'), t('none')], 760);
      flash(x, y, YELLOW, 220);
      rays(x, y, YELLOW, 10, 70);
      burst(x, y, { shape: 'sparkle', count: 6, colors: [YELLOW, '#ffffff'], size: [6, 10] });
    },
    controller(piece, img, x, y) {
      play(img, [t('none'), t('translate(-4%, 2%) rotate(-5deg)'), t('translate(4%, -2%) rotate(5deg)'), t('translate(-3%, 1%) rotate(-3deg)'), t('translate(3%, 0) rotate(3deg)'), t('translateY(-6%)'), t('none')], 560, 'linear');
      burst(x, y, { count: 12, colors: [BLUE, PINK, YELLOW, CYAN], size: [4, 8] });
      burst(x, y, { shape: 'star', count: 3, colors: [YELLOW], size: [7, 10] });
    },
    star(piece, img, x, y) {
      play(img, [t('none'), t('rotate(200deg) scale(1.28)'), t('rotate(330deg) scale(.94)'), t('rotate(360deg)')], 820);
      burst(x, y, { shape: 'star', count: 7, colors: [YELLOW, '#ffe57a', ORANGE], size: [5, 9] });
      burst(x, y, { shape: 'sparkle', count: 4, colors: ['#ffffff', YELLOW], size: [6, 9], speed: [120, 260] });
    },
    burst(piece, img, x, y) {
      play(img, [t('scale(1)'), t('scale(.74) rotate(-8deg)'), t('scale(1.32) rotate(6deg)'), t('scale(.95)'), t('none')], 760);
      ring(x, y, PINK, 110);
      ring(x, y, ORANGE, 70, 0.4);
      burst(x, y, { shape: 'confetti', count: 14, size: [5, 8], speed: [300, 640] });
    },
    bubble(piece, img, x, y) {
      play(img, [t('scaleY(1)'), t('scaleY(.8) scaleX(1.08)'), t('scaleY(1.14) scaleX(.95)'), t('none')], 680);
      burst(x, y - 10, { count: 3, colors: [INK], size: [4, 6], speed: [140, 220], spread: Math.PI * 0.6, gravity: 500 });
      ring(x, y, BLUE, 70);
    },
    bolt(piece, img, x, y) {
      play(img, [t('none'), t('translate(-6%, 0) rotate(-6deg)'), t('translate(6%, -3%) rotate(5deg) scale(1.1)'), t('translate(-3%, 2%)'), t('none')], 520, 'linear');
      flash(x, y, YELLOW, 160);
      rays(x, y, YELLOW, 7, 40);
    },
    logo(piece, img, x, y) {
      play(img, [t('none'), t('scale(1.07, .92)'), t('scale(.95, 1.07)'), t('scale(1.03, .98)'), t('none')], 820, 'ease-in-out');
      burst(x, y, { shape: 'confetti', count: 22, size: [5, 9], speed: [320, 700] });
      burst(x, y, { shape: 'star', count: 5, colors: [YELLOW], size: [6, 10] });
    },
    rays(piece, img, x, y) {
      play(img, [t('scale(1)'), t('scale(1.35)'), t('scale(.9)'), t('none')], 600);
      burst(x, y, { count: 6, colors: [PINK, YELLOW], size: [3, 6] });
    },
  };

  home.querySelectorAll('.home__piece[data-react]').forEach((piece) => {
    const kind = piece.dataset.react;
    piece.removeAttribute('aria-hidden');
    piece.setAttribute('role', 'button');
    piece.tabIndex = 0;
    piece.setAttribute('aria-label', `Animate ${kind === 'logo' ? 'Connect 4Live' : kind}`);
    const react = (event) => {
      const [cx, cy] = centre(piece);
      const x = event?.clientX || cx, y = event?.clientY || cy;
      reactions[kind](piece, piece.querySelector('img'), x, y);
    };
    piece.addEventListener('click', react);
    piece.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        react();
      }
    });
  });

  // Buttons throw confetti as they are pressed.
  home.querySelectorAll('.home__button').forEach((button) => {
    button.addEventListener('click', () => {
      const [x, y] = centre(button);
      burst(x, y, { shape: 'confetti', count: 16, size: [5, 8], speed: [320, 680] });
      burst(x, y, { count: 6, size: [3, 6] });
    });
  });

  // Any touch sends a ripple through the water; the paper splashes a little.
  home.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || home.inert) return;
    const onSticker = event.target.closest('.home__piece');
    window.homeFlow?.ripple(event.clientX, event.clientY, onSticker ? 0.55 : 1);
    if (!onSticker) burst(event.clientX, event.clientY, { count: 6, colors: [PINK, BLUE, YELLOW], size: [3, 5], speed: [120, 260] });
  });

  // Dragged stickers: spring back upright and squash on landing.
  if (window.homeStickers) {
    window.homeStickers.onDrop = (piece, { x, y, tilt }) => {
      if (reduce.matches) return;
      piece.animate([{ rotate: `${tilt}deg` }, { rotate: `${-tilt * 0.35}deg` }, { rotate: '0deg' }], { duration: 480, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      piece.querySelector('img')?.animate([t('scale(1.06)'), t('scale(1.1, .88)'), t('scale(.96, 1.05)'), t('none')], { duration: 420, easing: 'ease-out' });
      ring(x, y, BLUE, 56, 0.4);
      burst(x, y, { count: 6, colors: [INK, '#ffffff'], size: [2, 4], speed: [100, 200], spread: Math.PI, angle: Math.PI / 2 * 3, gravity: 600 });
    };
  }

  // ---- Intro ----------------------------------------------------------------
  /* Stickers pop in from the centre outwards; quick when returning from a game. */
  function intro({ quick = false } = {}) {
    if (reduce.matches) return;
    const scene = home.getBoundingClientRect();
    const cx = scene.left + scene.width / 2, cy = scene.top + scene.height / 2;
    const pieces = [...home.querySelectorAll('.home__piece')].filter((p) => p.offsetParent);
    const order = (p) => (p.classList.contains('home__logo') ? -2 : p.classList.contains('home__button') ? -1 : 0);
    pieces
      .map((p) => { const [x, y] = centre(p); return { p, d: Math.hypot(x - cx, y - cy) }; })
      .sort((a, b) => order(a.p) - order(b.p) || a.d - b.d)
      .forEach(({ p }, i) => {
        const delay = (quick ? 0.45 : 1) * i * INTRO.stagger + (quick ? 0 : 60);
        const duration = INTRO.duration * (quick ? 0.8 : 1);
        const frames = p.classList.contains('home__logo')
          ? [{ translate: '0 -60%', scale: '0.7', opacity: 0 }, { translate: '0 6%', scale: '1.04', opacity: 1, offset: 0.6 }, { translate: '0 -2%', scale: '0.99', offset: 0.8 }, { translate: '0 0', scale: '1', opacity: 1 }]
          : [{ scale: '0.3', rotate: `${rand(-16, 16)}deg`, opacity: 0 }, { scale: '1.12', rotate: `${rand(-4, 4)}deg`, opacity: 1, offset: 0.6 }, { scale: '0.97', rotate: '0deg', offset: 0.82 }, { scale: '1', rotate: '0deg', opacity: 1 }];
        p.animate(frames, { duration, delay, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
      });
    if (!quick) window.homeFlow?.intro();
  }

  window.homeFx = { burst, ring, flash, intro };
  new ResizeObserver(resize).observe(home);
  resize();
})();
