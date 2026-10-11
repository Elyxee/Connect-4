/* Game clock: timed play follows committed GameNodes; browsing the tree never
   moves the clock. Presets and thresholds live in CONFIG.clock. */

class GameClock {
  constructor(game, now = null) {
    this.game = game;
    const wallOrigin = Date.now();
    const monotonicOrigin = performance.now();
    // Wall time covers device sleep on browsers whose monotonic clock suspends.
    this.now = now || (() => Math.max(Date.now() - wallOrigin, performance.now() - monotonicOrigin));
    this.reset();
  }

  reset() {
    this.liveNode = this.game.root;
    this.status = "setup";
    this.remaining = { [Player.Red]: 0, [Player.Yellow]: 0 };
    this.increment = 0;
    this.preset = null;
    this.result = null;
    this.startedAt = null;
  }

  get runningPlayer() {
    return this.status === "running" ? this.liveNode.toPlay : null;
  }

  start(presetId) {
    const preset = CONFIG.clock.presets[presetId];
    if (this.status !== "setup" || !preset) return false;
    this.preset = presetId;
    this.remaining = { [Player.Red]: preset.minutes * 60000, [Player.Yellow]: preset.minutes * 60000 };
    this.increment = preset.increment * 1000;
    this.liveNode = this.game.current;
    this.status = "running";
    this.startedAt = this.now();
    return true;
  }

  timeLeft(player, now = this.now()) {
    const elapsed = player === this.runningPlayer ? Math.max(0, now - this.startedAt) : 0;
    return Math.max(0, this.remaining[player] - elapsed);
  }

  checkExpiry(now = this.now()) {
    const player = this.runningPlayer;
    if (player === null || this.timeLeft(player, now) > 0) return false;
    this.remaining[player] = 0;
    this.finish(otherPlayer(player), "time");
    return true;
  }

  finish(winner, reason) {
    this.status = "finished";
    this.startedAt = null;
    this.result = Object.freeze({ winner, reason, nodeId: this.liveNode.id });
  }

  canPlace(node = this.game.current) {
    // Timed games have one live line. History is read-only, even after a result.
    return this.status === "running" && node === this.liveNode;
  }

  commit(fromNode, move, now) {
    if (!move || this.status !== "running" || fromNode !== this.liveNode) return false;
    if (move.node !== this.game.current || move.node.parent !== fromNode || move.player !== fromNode.toPlay) return false;
    this.remaining[move.player] = this.timeLeft(move.player, now);
    this.liveNode = move.node;
    if (move.isWin) {
      this.finish(move.player, "connect-four");
    } else if (move.node.board.every((row) => row.every((cell) => cell !== 0))) {
      this.finish(null, "draw");
    } else {
      this.remaining[move.player] += this.increment;
      this.startedAt = now;
    }
    return true;
  }
}

/* Renders a GameClock into #gameClock: preset picker, the two running times
   over the active-side artwork, and the result card. */
class GameClockView {
  constructor(element, clock, { onExpire, onPreset }) {
    this.element = element;
    this.clock = clock;
    this.art = element.querySelector(".clock__art");
    this.setup = element.querySelector(".clock__setup");
    this.presetButtons = this.renderPresets(element.querySelector(".clock__presets"), onPreset);
    this.returnButton = element.querySelector(".clock__return");
    this.caption = element.querySelector(".clock__caption");
    this.redTime = element.querySelector(".clock__time--red");
    this.yellowTime = element.querySelector(".clock__time--yellow");
    this.result = element.querySelector(".clock__result");
    this.winner = element.querySelector(".clock__winner");
    this.reason = element.querySelector(".clock__reason");
    this.resultTime = element.querySelector(".clock__result-time");
    this.announcement = element.querySelector(".clock__announcement");
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.state = null;
    this.animation = null;
    this.timer = null;
    this.refresh = () => {
      clearTimeout(this.timer);
      this.timer = null;
      if (clock.checkExpiry()) onExpire();
      this.render();
      if (clock.status === "running") {
        this.timer = window.setTimeout(this.refresh, Math.min(100, clock.timeLeft(clock.runningPlayer)));
      }
    };
    document.addEventListener("visibilitychange", this.refresh);
    window.addEventListener("pageshow", this.refresh);
    window.addEventListener("focus", this.refresh);
    this.render();
  }

  renderPresets(container, onPreset) {
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return Object.entries(CONFIG.clock.presets).map(([id, { minutes, increment }]) => {
      const button = document.createElement("button");
      button.className = "clock__preset";
      button.type = "button";
      button.dataset.clockPreset = id;
      button.setAttribute("aria-label", `Start: ${plural(minutes, "minute")} each, ${increment ? `${plural(increment, "second")} increment` : "no increment"}`);
      button.innerHTML = `<strong>${minutes} <small>min</small></strong><span>${increment ? `+${increment} sec` : "No increment"}</span>`;
      button.addEventListener("click", () => onPreset(id));
      container.appendChild(button);
      return button;
    });
  }

  format(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  setArtwork(state) {
    const asset = state === "draw" ? "full-yellow" : state;
    const previous = this.art.lastElementChild;
    this.animation?.cancel();
    this.art.replaceChildren(...(previous ? [previous] : []));
    const incoming = document.createElement("div");
    incoming.className = "clock__image-layer";
    const img = document.createElement("img");
    img.src = `${CONFIG.assets.clockArtDir}${asset}.png`;
    img.alt = "";
    img.draggable = false;
    if (asset === "red-active") img.className = "clock__image--mirrored";
    incoming.appendChild(img);
    this.art.appendChild(incoming);
    if (!previous || this.reducedMotion.matches || state === "setup") {
      this.art.replaceChildren(incoming);
      return;
    }
    const origin = asset.startsWith("red") || asset === "full-red" ? "0%" : "100%";
    const animation = incoming.animate([
      { clipPath: `ellipse(0% 65% at ${origin} 50%)` },
      { clipPath: `ellipse(145% 160% at ${origin} 50%)` },
    ], { duration: 640, easing: "cubic-bezier(.22, .8, .25, 1)", fill: "both" });
    this.animation = animation;
    animation.onfinish = () => {
      if (this.animation !== animation) return;
      this.art.replaceChildren(incoming);
      animation.cancel();
      this.animation = null;
    };
  }

  render() {
    const clock = this.clock;
    const now = clock.now();
    const reviewing = clock.game.current !== clock.liveNode;
    const finished = clock.status === "finished";
    const state = finished
      ? (clock.result.winner ? `full-${playerCss(clock.result.winner)}` : "draw")
      : clock.status === "setup" ? "setup" : `${playerCss(clock.runningPlayer)}-active`;
    const changed = state !== this.state;
    if (changed) {
      this.setArtwork(state);
      this.element.dataset.state = state;
      this.state = state;
    }
    this.element.dataset.status = clock.status;
    this.setup.hidden = clock.status !== "setup";
    this.returnButton.hidden = !reviewing;
    this.returnButton.textContent = finished ? "Back to result" : "Back to live game";
    this.caption.hidden = clock.status === "setup" || finished;
    this.caption.textContent = reviewing && !finished ? "LIVE CLOCK" : "GAME CLOCK";
    this.redTime.hidden = finished || clock.status === "setup";
    this.yellowTime.hidden = finished || clock.status === "setup";
    for (const [player, element] of [[Player.Red, this.redTime], [Player.Yellow, this.yellowTime]]) {
      const time = clock.timeLeft(player, now);
      element.textContent = this.format(time);
      element.setAttribute("aria-label", `${playerName(player)}: ${element.textContent}${player === clock.runningPlayer ? ", running" : ", stopped"}`);
      element.classList.toggle("is-low", player === clock.runningPlayer && time <= CONFIG.clock.lowTime);
    }
    this.result.hidden = !finished;
    if (finished) {
      this.winner.textContent = clock.result.winner ? playerName(clock.result.winner).toUpperCase() : "DRAW";
      this.reason.textContent = { "connect-four": "WIN BY CONNECT FOUR", time: "WIN ON TIME", draw: "BOARD FULL" }[clock.result.reason];
      this.resultTime.textContent = clock.result.winner ? this.format(clock.remaining[clock.result.winner]) : "";
      if (changed) this.announcement.textContent = `${this.winner.textContent}. ${this.reason.textContent}. ${this.resultTime.textContent}`;
    } else if (changed) {
      this.announcement.textContent = clock.status === "setup" ? "Choose a time control to begin." : `${playerName(clock.runningPlayer)} clock running.`;
    }
  }
}
