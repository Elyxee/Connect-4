/* Move history list ("Analysis" page). Renders the main line with variations
   embedded and indented, marks the current position and keeps it in view. */
class MoveTimeline {
  constructor(list, game, reducedMotion) {
    this.list = list;
    this.game = game;
    this.reducedMotion = reducedMotion;
    this.followFrame = 0;
    // Any manual scroll wins over the automatic follow.
    const stop = () => this.stopFollow();
    list.addEventListener("wheel", stop, { passive: true });
    list.addEventListener("touchstart", stop, { passive: true });
    list.addEventListener("pointerdown", stop, { passive: true });
  }

  /* The node a click inside the list refers to, if any. */
  nodeFromEvent(ev) {
    const item = ev.target.closest(".timelineItem");
    if (!item) return null;
    const nodeId = ev.target.closest(".timelinePly")?.dataset.nodeId || item.dataset.nodeId;
    return this.game.nodeById.get(nodeId) || null;
  }

  render() {
    const timeline = this.list;
    const game = this.game;
    const previousScrollTop = timeline.scrollTop;
    timeline.innerHTML = "";

    const moveToken = (node) => {
      const chipSrc = CONFIG.assets.chips[playerCss(node.movePlayer)];
      return `<span class="timelineMoveToken"><img class="timelineChip" src="${chipSrc}" alt="" aria-hidden="true" /><span>${node.moveCol + 1}${node.isWin ? "#" : ""}</span></span>`;
    };

    const appendMoveLine = ({ moveNo, redNode, yellowNode, onlyYellowEllipsis, indent, markVariation, targetNode }) => {
      const li = document.createElement("li");
      li.className = "timelineItem";
      li.dataset.nodeId = targetNode.id;
      if (redNode) li.dataset.redNodeId = redNode.id;
      if (yellowNode) li.dataset.yellowNodeId = yellowNode.id;
      li.style.paddingLeft = `${10 + indent * 16}px`;

      const mark = markVariation ? `<div class="timelineMark">↵</div>` : ``;
      const ellipsis = onlyYellowEllipsis ? `<span class="timelineEllipsis">... </span>` : ``;
      const red = redNode ? `<span class="timelinePly timelinePly--red" data-node-id="${redNode.id}">${moveToken(redNode)}</span>` : ``;
      const yellow = yellowNode ? `<span class="timelinePly timelinePly--yellow" data-node-id="${yellowNode.id}">${moveToken(yellowNode)}</span>` : ``;
      li.innerHTML = `${mark}
        <div class="timelineRow">
          <div class="timelineNo">${moveNo}.</div>
          <div class="timelineMoves">${ellipsis}${red}${red && yellow ? " " : ""}${yellow}</div>
        </div>`;
      timeline.appendChild(li);
    };

    const collectPrimaryLine = (startNode) => {
      const out = [];
      for (let n = startNode; n && n !== game.root; n = n.children[0] || null) out.push(n);
      return out;
    };

    const renderVariations = (node, indent) => {
      for (let k = 1; k < node.children.length; k++) renderLine(node.children[k], indent + 1, true);
    };

    // One row per move pair (Red, Yellow). A line that starts on Yellow shows "... Y".
    const renderLine = (startNode, indent, variationStart) => {
      const plies = collectPrimaryLine(startNode);
      let i = 0;
      let firstLine = true;

      while (i < plies.length) {
        const a = plies[i];
        const moveNo = Math.ceil(a.ply / 2);

        if (a.ply % 2 === 1) {
          const redNode = a;
          const yellowNode = plies[i + 1] && plies[i + 1].ply === redNode.ply + 1 ? plies[i + 1] : null;
          const targetNode = yellowNode || redNode;
          appendMoveLine({ moveNo, redNode, yellowNode, onlyYellowEllipsis: false, indent, markVariation: variationStart && firstLine, targetNode });
          renderVariations(redNode, indent); // alternative Yellow replies
          renderVariations(targetNode, indent); // alternative next Red moves
          i += yellowNode ? 2 : 1;
        } else {
          appendMoveLine({ moveNo, redNode: null, yellowNode: a, onlyYellowEllipsis: true, indent, markVariation: variationStart && firstLine, targetNode: a });
          renderVariations(a, indent);
          i += 1;
        }
        firstLine = false;
      }
    };

    if (game.root.children[0]) renderLine(game.root.children[0], 0, false);
    for (let i = 1; i < game.root.children.length; i++) renderLine(game.root.children[i], 1, true);

    timeline.scrollTop = previousScrollTop;
    this.markCurrent();
  }

  markCurrent() {
    const currentId = this.game.current.id;
    for (const el of this.list.querySelectorAll(".timelineItem")) {
      el.classList.toggle("timelineItem--active", el.dataset.redNodeId === currentId || el.dataset.yellowNodeId === currentId);
      el.querySelectorAll(".timelinePly").forEach((ply) => {
        ply.classList.toggle("timelinePly--current", ply.dataset.nodeId === currentId);
      });
    }
    this.follow();
  }

  stopFollow() {
    cancelAnimationFrame(this.followFrame);
    this.followFrame = 0;
  }

  /* Smoothly centres the current row, scrolling only the list (never the page). */
  follow() {
    const timeline = this.list;
    cancelAnimationFrame(this.followFrame);
    this.followFrame = requestAnimationFrame(() => {
      this.followFrame = 0;
      const row = timeline.querySelector(".timelinePly--current")?.closest(".timelineItem");
      const view = timeline.getBoundingClientRect();
      const box = row?.getBoundingClientRect();
      const target = box ? timeline.scrollTop + box.top - view.top - timeline.clientTop + box.height / 2 - timeline.clientHeight / 2 : 0;
      const top = clamp(target, 0, Math.max(0, timeline.scrollHeight - timeline.clientHeight));
      const startTop = timeline.scrollTop;
      if (this.reducedMotion.matches || Math.abs(top - startTop) < 1) {
        timeline.scrollTop = top;
        return;
      }
      const started = performance.now();
      const scroll = (now) => {
        const progress = clamp((now - started) / 200, 0, 1);
        timeline.scrollTop = startTop + (top - startTop) * (1 - (1 - progress) ** 3);
        this.followFrame = progress < 1 ? requestAnimationFrame(scroll) : 0;
      };
      this.followFrame = requestAnimationFrame(scroll);
    });
  }
}
