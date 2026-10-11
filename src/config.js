/* Tunable values for Connect 4Live, in one place.
   Change a number here instead of hunting through the code. Times are in
   milliseconds unless the name says otherwise; angles are in degrees.
   Layout and colours of the DOM live in src/style.css. */
const CONFIG = (() => {
  const freeze = (value) => {
    if (value && typeof value === "object") Object.values(value).forEach(freeze);
    return Object.freeze(value);
  };

  return freeze({
    assets: {
      board: "./assets/figma/board-live.png",
      chips: { red: "./assets/figma/chip-red-enamel.svg", yellow: "./assets/figma/chip-yellow-enamel.svg" },
      // Clock artwork: `${clockArtDir}${state}.png`, state = setup | red-active | yellow-active | full-red | full-yellow.
      clockArtDir: "./assets/clock/",
      orbitLives: {
        white: "./assets/modules/life-white.png",
        gold: "./assets/modules/life-gold.png",
        red: "./assets/modules/life-red.png",
      },
      // Backgrounds set in style.css; listed so the opening screen waits for them.
      cssBackgrounds: ["./assets/modules/clock-cover.png", "./assets/modules/orbit-bg.png"],
    },

    // Calibration of assets.board (1448 × 1086). Replace together with the art.
    board: {
      // Crop of the art that is drawn, excluding transparent margins (art pixels).
      sourceRect: { x: 156, y: 87, w: 1132, h: 953 },
      // Measured hole centres as fractions of the full art width/height. Shared by
      // drawing, hit testing, the drop preview and the column labels.
      colNorms: [0.16665, 0.2776, 0.38813, 0.49911, 0.60976, 0.72035, 0.83153],
      rowNorms: [0.15647, 0.30126, 0.44651, 0.59142, 0.73663, 0.88245],
      pieceRadius: 0.37, // fraction of the smaller cell side
      columnHighlight: "rgba(255, 45, 109, .18)", // hovered column, drawn behind pieces
    },

    // A placed chip falls, then settles with two small bounces.
    drop: {
      flightBase: 150, // + flightPerRow × √(rows fallen)
      flightPerRow: 65,
      settle: 160,
      stackGap: 75, // rapid taps in one column land at least this far apart
      tilt: 0.065, // radians of wobble while falling
    },

    // Board change when jumping through history (timeline, Prev/Next, Review).
    historyJump: { remove: 120, drop: 150, swapRemove: 100, swapDropDelay: 40, swapDrop: 140 },

    // Connect-four highlight: each winning chip lights up `stagger` after the previous.
    winEffect: { stagger: 110, pulse: 1600 },

    notes: {
      inkColor: "#242222",
      inkWidth: 2.5, // CSS pixels, scaled by pen pressure
      inkOpacity: 0.92,
      eraserWidth: 18,
      historyLimit: 80, // undo steps per surface
      clearHold: 3000, // hold Eraser this long to clear the page
    },

    gestures: {
      pageSwipe: 45, // px to turn the Analysis page
      pageSwipeRatio: 1.4, // horizontal must exceed vertical × ratio
      pageEdge: 24, // px edge strip that still swipes while drawing
      moduleSwipe: 30, // px to change the bottom-right cover
      moduleSwipeRatio: 1.2,
      clickSuppress: 450, // ignore the click that ends a swipe or stroke
    },

    toastDuration: 1200,

    clock: {
      // id: minutes per side, seconds added after each move. Buttons are generated
      // from this list (three fit the panel).
      presets: {
        "5+5": { minutes: 5, increment: 5 },
        "10+3": { minutes: 10, increment: 3 },
        "15+0": { minutes: 15, increment: 0 },
      },
      lowTime: 10000, // the running clock pulses below this
    },

    orbit: {
      startAngle: -90,
      // Extra-life rack, left to right. Lives are spent in this order too.
      // (Keep the .orbit__lives aria-label in index.html in step.)
      lifeSlots: ["white", "white", "white", "gold", "gold", "red"],
      hitsPerLife: { white: 5, gold: 3, red: 1 },
      targetWidth: { white: 52, gold: 30, red: 18, bonus: 8 },
      hitPause: 0.16, // seconds before the next target after a hit
      missPause: 0.22,
      // difficulty = 1 − e^(−hits / difficultyHits), rising from 0 towards 1.
      difficultyHits: 32,
      speed: { base: 80, gain: 180, jitterMin: 0.92, jitterRange: 0.16 }, // °/s = (base + gain × difficulty) × jitter
      whiteOnlyHits: 4, // first targets are always white
      odds: { white: 0.9, whiteDecayHits: 24, gold: 0.1, goldPeak: 0.28, goldPeakHits: 28 },
      reverse: { base: 0.15, gain: 0.4, late: 0.5 }, // chance the hand changes direction per round
      lateGameHits: 60, // reward targets, slow rounds and 50% reversals start here
      rewardChance: 0.1,
      slowRound: { chance: 0.12, speedMin: 0.42, speedRange: 0.13 },
      reaction: { start: 0.85, reduction: 0.5, margin: 12 }, // seconds of travel before the near edge
      farTarget: { afterHits: 8, chance: 0.25, window: 35 },
      nearSpread: { normal: 110, slow: 30 },
      lapMargin: 6,
      // Dial art calibration (orbit-dial.png, 1254 px square): track centre and radius.
      dial: { size: 1254, cx: 625.3, cy: 599.1, radius: 483.65 },
    },

    // Opening screen and Home ⇄ game cloud transition.
    screen: {
      assetTimeout: 8000,
      bootMinimum: 650,
      bootFade: 260,
      cloudIn: 470,
      cloudInStagger: 45,
      cloudOut: 540,
      cloudOutStagger: 35,
    },

    homeDrag: { startDistance: 8, clickSuppress: 650, grabMargin: 44 },
  });
})();
