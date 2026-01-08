(() => {
  "use strict";

  const COLORS = ["red", "blue", "black", "yellow"];

  const els = {
    newGameBtn: document.getElementById("newGameBtn"),
    modeSelect: document.getElementById("modeSelect"),
    drawPileBtn: document.getElementById("drawPileBtn"),
    takeDiscardBtn: document.getElementById("takeDiscardBtn"),

    indicatorSlot: document.getElementById("indicatorSlot"),
    okeySlot: document.getElementById("okeySlot"),

    drawCount: document.getElementById("drawCount"),
    discardTop: document.getElementById("discardTop"),
    discardCount: document.getElementById("discardCount"),

    turnText: document.getElementById("turnText"),
    statusText: document.getElementById("statusText"),

    indicatorBonusToast: document.getElementById("indicatorBonusToast"),
    fireworks: document.getElementById("fireworks"),

    pNames: [
      document.getElementById("p0Name"),
      document.getElementById("p1Name"),
      document.getElementById("p2Name"),
      document.getElementById("p3Name"),
    ],

    p2WinPoints: document.getElementById("p2WinPoints"),

    botIconPoints: [
      null,
      document.getElementById("p1IconPoints"),
      document.getElementById("p2IconPoints"),
      document.getElementById("p3IconPoints"),
    ],

    handTitle: document.getElementById("handTitle"),
    handHint: document.getElementById("handHint"),

    handSection: document.querySelector("section.hand"),

    tableRing: document.querySelector(".tableRing"),
    tableCenter: document.querySelector(".tableCenter"),
    centerPiles: document.querySelector(".centerPiles"),

    userBoardSection: document.getElementById("userBoardSection"),
    userBoardTitle: document.getElementById("userBoardTitle"),
    winningBotBoardSection: document.getElementById("winningBotBoardSection"),
    winningBotBoardTitle: document.getElementById("winningBotBoardTitle"),
    winningBotBoardGrid: document.getElementById("winningBotBoardGrid"),

    winSeatWraps: [
      null,
      document.getElementById("p1WinWrap"),
      document.getElementById("p2WinWrap"),
      document.getElementById("p3WinWrap"),
    ],
    winSeatGrids: [
      null,
      document.getElementById("p1WinGrid"),
      document.getElementById("p2WinGrid"),
      document.getElementById("p3WinGrid"),
    ],
    botBoardsSection: document.getElementById("botBoardsSection"),
    botBoardGrids: [
      document.getElementById("botBoard0"),
      document.getElementById("botBoard1"),
      document.getElementById("botBoard2"),
      document.getElementById("botBoard3"),
    ],

    turnLogText: document.getElementById("turnLogText"),

    playerCards: [
      document.getElementById("player0"),
      document.getElementById("player1"),
      document.getElementById("player2"),
      document.getElementById("player3"),
    ],
    playerCounts: [
      document.getElementById("p0Count"),
      document.getElementById("p1Count"),
      document.getElementById("p2Count"),
      document.getElementById("p3Count"),
    ],

    lastDiscardSlots: [
      document.getElementById("p0Last"),
      document.getElementById("p1Last"),
      document.getElementById("p2Last"),
      document.getElementById("p3Last"),
    ],

    handGrid: document.getElementById("handGrid"),
    boardGrid: document.getElementById("boardGrid"),
  };

  let game = null;
  const scores = [0, 0, 0, 0];
  let nextDealerIndex = 0;
  let toastTimeout = null;

  let audioCtx = null;

  function resetSession() {
    for (let i = 0; i < scores.length; i++) scores[i] = 0;
    nextDealerIndex = 0;
  }

  function normalizedMode(raw) {
    return (raw === "bots" || raw === "pairs") ? raw : "human";
  }

  function isGameActive() {
    return !!(game && game.phase === "playing");
  }

  function canStartNewGameNow() {
    return !game || game.phase === "ended";
  }

  function updateNewGameButtonUI() {
    if (!els.newGameBtn) return;

    if (isGameActive()) {
      // Reset icon while an active game is running.
      els.newGameBtn.textContent = "↺";
      els.newGameBtn.setAttribute("aria-label", "Reset session");
      els.newGameBtn.title = "Reset session";
    } else {
      els.newGameBtn.textContent = "↻";
      els.newGameBtn.setAttribute("aria-label", "New game");
      els.newGameBtn.title = "New game";
    }
  }

  function stopActiveGame() {
    if (game && game.pendingBotTimeout) {
      clearTimeout(game.pendingBotTimeout);
      game.pendingBotTimeout = null;
    }
    game = null;
    selectedTileId = null;
  }

  function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function tileKey(tile) {
    return `${tile.color}:${tile.value}:${tile.isFakeJoker ? "F" : "N"}:${tile.dupIndex}`;
  }

  function createDeck() {
    const deck = [];
    for (let dupIndex = 0; dupIndex < 2; dupIndex++) {
      for (const color of COLORS) {
        for (let value = 1; value <= 13; value++) {
          const tile = { id: "", color, value, isFakeJoker: false, dupIndex };
          tile.id = tileKey(tile);
          deck.push(tile);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const tile = { id: `fake:${i}`, color: "fake", value: 0, isFakeJoker: true, dupIndex: i };
      deck.push(tile);
    }

    return shuffle(deck);
  }

  function nextValue(value) {
    return value === 13 ? 1 : value + 1;
  }

  function newGameState(mode, forcedDealerIndex = null) {
    const deck = createDeck();

    const indicator = deck.pop();
    if (!indicator || indicator.isFakeJoker) {
      return newGameState(mode, forcedDealerIndex);
    }

    const okey = { color: indicator.color, value: nextValue(indicator.value) };

    const players = [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }];

    const dealerIndex = (typeof forcedDealerIndex === "number") ? forcedDealerIndex : nextDealerIndex;
    for (let round = 0; round < 14; round++) {
      for (let p = 0; p < 4; p++) {
        players[p].hand.push(deck.pop());
      }
    }
    // Dealer starts with 15 tiles.
    players[dealerIndex].hand.push(deck.pop());

    // Advance dealer for the NEXT game (not for recursion retries).
    if (typeof forcedDealerIndex !== "number") {
      nextDealerIndex = (nextDealerIndex + 1) % 4;
    }
    const drawPile = deck;
    const discardPile = [];

    const board = {
      rows: 2,
      cols: 12,
      cells: Array(2 * 12).fill(null),
    };

    // In play mode, start with the user's tiles randomly placed on the board.
    if (mode !== "bots" && mode !== "pairs") {
      placeTilesRandomlyOnBoard(board, players[0].hand);
      players[0].hand = [];
    }

    return {
      mode: (mode === "bots" || mode === "pairs") ? mode : "human",
      phase: "playing",
      winner: null,
      winnerIndex: null,
      winnerTiles: null,
      isAnimating: false,
      discardDisplayTile: null,
      lastDiscarderIndex: null,
      indicatorBonusWinners: [false, false, false, false],
      indicatorBonusToastText: "",
      turnNumber: 0,
      turnLogLines: [],
      players,
      dealerIndex,
      currentPlayerIndex: dealerIndex,
      indicator,
      okey,
      drawPile,
      discardPile,
      board,
      lastDiscards: [null, null, null, null],
      pendingBotTimeout: null,
    };
  }

  function basePlayerName(state, index) {
    if (state.mode !== "human") return `Bot ${index}`;
    if (index === 0) return "You";
    return index === 1 ? "Crocodile" : index === 2 ? "Seal" : "Butterfly";
  }

  function pointsForWin(state, jokerOut) {
    if (state.mode === "pairs") return 4;
    if (jokerOut) return 4;
    return 2;
  }

  function isIndicatorFace(state, tile) {
    // Only the real indicator tile counts for the start bonus.
    // Fake jokers render as the indicator face but must NOT count as indicator tiles.
    if (!tile) return false;
    if (tile.isFakeJoker) return false;
    return tile.color === state.indicator.color && tile.value === state.indicator.value;
  }

  function awardIndicatorStartPoints(state) {
    // New game bonus: if a player starts with at least one indicator-faced tile, award +1 point.
    const winners = [];
    for (let p = 0; p < 4; p++) {
      const tiles = playerOwnedTiles(state, p);
      if (tiles.some((t) => isIndicatorFace(state, t))) {
        scores[p] += 1;
        if (Array.isArray(state.indicatorBonusWinners) && state.indicatorBonusWinners.length === 4) {
          state.indicatorBonusWinners[p] = true;
        }
        winners.push(p);
      }
    }

    if (Array.isArray(winners) && winners.length > 0) {
      const names = winners.map((i) => basePlayerName(state, i)).join(", ");
      state.indicatorBonusToastText = `${names} got +1 indicator bonus.`;
    } else {
      state.indicatorBonusToastText = "";
    }
  }

  function showToast(message, durationMs) {
    if (!els.indicatorBonusToast) return;
    const msg = (typeof message === "string") ? message.trim() : "";

    if (!msg) {
      els.indicatorBonusToast.hidden = true;
      els.indicatorBonusToast.classList.remove("toast--show");
      return;
    }

    els.indicatorBonusToast.textContent = msg;
    els.indicatorBonusToast.hidden = false;
    els.indicatorBonusToast.classList.add("toast--show");

    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    const ms = typeof durationMs === "number" ? durationMs : 2000;
    toastTimeout = setTimeout(() => {
      if (!els.indicatorBonusToast) return;
      els.indicatorBonusToast.hidden = true;
      els.indicatorBonusToast.classList.remove("toast--show");
    }, ms);
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function playApplause() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      // Best effort: resume (may require user gesture).
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const total = 1.6;

    // Create a short noise buffer for clap bursts.
    const sampleRate = ctx.sampleRate;
    const noiseLen = Math.floor(sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, noiseLen, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // White noise with a slight decay curve.
      const t = i / data.length;
      const decay = Math.pow(1 - t, 2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.7, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.0001, now + total);
    master.connect(ctx.destination);

    // Several randomized clap bursts.
    const bursts = 18;
    for (let i = 0; i < bursts; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 700 + Math.random() * 900;

      const g = ctx.createGain();
      const t0 = now + i * (total / bursts) + (Math.random() * 0.03);
      const amp = 0.18 + Math.random() * 0.24;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);

      src.connect(hp);
      hp.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + 0.13);
    }
  }

  function randomFireworkColor() {
    const palette = ["#6aa0ff", "#ff6ad5", "#ffd56a", "#6affb4", "#ff7a6a", "#9f7bff"];
    return palette[randInt(palette.length)];
  }

  function spawnFireworkBurst(container, xPct, yPct) {
    const burst = document.createElement("div");
    burst.className = "firework";
    burst.style.setProperty("--x", `${xPct}%`);
    burst.style.setProperty("--y", `${yPct}%`);
    container.appendChild(burst);

    const count = 22;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "firework__p";
      const angle = (Math.PI * 2 * i) / count;
      const radius = 70 + Math.random() * 90;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);
      p.style.setProperty("--c", randomFireworkColor());
      burst.appendChild(p);
    }

    // Cleanup after animation.
    setTimeout(() => {
      burst.remove();
    }, 1000);
  }

  function launchFireworks(durationMs = 5000) {
    if (!els.fireworks) return;
    if (prefersReducedMotion()) return;

    els.fireworks.hidden = false;
    els.fireworks.innerHTML = "";

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > durationMs) {
        clearInterval(interval);
        setTimeout(() => {
          if (!els.fireworks) return;
          els.fireworks.hidden = true;
          els.fireworks.innerHTML = "";
        }, 900);
        return;
      }

      const x = 12 + Math.random() * 76;
      const y = 14 + Math.random() * 38;
      spawnFireworkBurst(els.fireworks, x, y);
    }, 320);
  }

  function celebrateUserWin(state, awardedPoints) {
    // Fireworks should not block the UI.
    launchFireworks(5000);
    playApplause();
    showGameEndToast(state, 0, awardedPoints);
  }

  function showIndicatorBonusToastIfAny(state) {
    const msg = (state && typeof state.indicatorBonusToastText === "string") ? state.indicatorBonusToastText : "";
    showToast(msg, 2000);
  }

  function showGameEndToast(state, winnerIndex, awardedPoints) {
    if (!state || typeof winnerIndex !== "number") return;
    const who = basePlayerName(state, winnerIndex);
    const pts = typeof awardedPoints === "number" ? awardedPoints : 0;
    showToast(`${who} won (+${pts} points).`, 5000);
  }

  function awardWinPoints(state, winnerIndex, jokerOut) {
    if (typeof winnerIndex !== "number") return;
    if (winnerIndex < 0 || winnerIndex > 3) return;
    const pts = pointsForWin(state, jokerOut);
    scores[winnerIndex] += pts;
  }

  function placeTilesRandomlyOnBoard(board, tiles) {
    const empties = [];
    for (let i = 0; i < board.cells.length; i++) {
      if (!board.cells[i]) empties.push(i);
    }

    for (const tile of tiles) {
      if (empties.length === 0) break;
      const pick = randInt(empties.length);
      const idx = empties.splice(pick, 1)[0];
      board.cells[idx] = tile;
    }
  }

  function placeTileOnRandomEmptyBoardSlot(state, tile) {
    const empties = [];
    for (let i = 0; i < state.board.cells.length; i++) {
      if (!state.board.cells[i]) empties.push(i);
    }

    if (empties.length === 0) {
      // Fallback (shouldn't happen with 2x12 board): keep it in hand.
      state.players[0].hand.push(tile);
      return;
    }

    const idx = empties[randInt(empties.length)];
    state.board.cells[idx] = tile;
  }

  function pickRandomEmptyBoardIndex(state) {
    const empties = [];
    for (let i = 0; i < state.board.cells.length; i++) {
      if (!state.board.cells[i]) empties.push(i);
    }
    if (empties.length === 0) return -1;
    return empties[randInt(empties.length)];
  }

  function getBoardCellEl(boardIndex) {
    if (!els.boardGrid) return null;
    return els.boardGrid.querySelector(`[data-board-index="${boardIndex}"]`);
  }

  function animateTileFlightFromTo(tile, fromEl, toEl, state, opts = {}) {
    if (!fromEl || !toEl) return Promise.resolve();

    const from = opts.fromRect || fromEl.getBoundingClientRect();
    const to = opts.toRect || toEl.getBoundingClientRect();

    const flyer = document.createElement("div");
    flyer.className = opts.hideFace
      ? "tile tile--slot tile--discardBig tile--back"
      : "tile tile--slot tile--discardBig";
    if (!opts.hideFace) {
      renderTileInto(flyer, tile, state);
    }

    Object.assign(flyer.style, {
      position: "fixed",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: "0",
      zIndex: "9999",
      pointerEvents: "none",
      transformOrigin: "top left",
    });

    document.body.appendChild(flyer);

    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const sx = from.width ? (to.width / from.width) : 1;
    const sy = from.height ? (to.height / from.height) : 1;

    const durationMs = typeof opts.durationMs === "number"
      ? opts.durationMs
      : (state && state.mode !== "human" ? 120 : 750);

    const anim = flyer.animate(
      [
        { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1 },
      ],
      { duration: durationMs, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" }
    );

    return anim.finished
      .catch(() => {})
      .finally(() => {
        flyer.remove();
      });
  }

  function centeredRectWithin(el, width, height) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    return {
      left: r.left + (r.width - w) / 2,
      top: r.top + (r.height - h) / 2,
      width: w,
      height: h,
    };
  }

  function boardTiles(state) {
    return state.board.cells.filter(Boolean);
  }

  function playerOwnedTiles(state, playerIndex) {
    if (playerIndex === 0) return state.players[0].hand.concat(boardTiles(state));
    return state.players[playerIndex].hand;
  }

  function playerTileCount(state, playerIndex) {
    return playerOwnedTiles(state, playerIndex).length;
  }

  function faceOf(tile, state) {
    if (tile.isFakeJoker) {
      // Fake joker (sahte okey) has the same face as the real joker (okey), but is NOT wild.
      return { color: state.okey.color, value: state.okey.value, isJoker: false, isFakeJoker: true };
    }

    const isJoker = tile.color === state.okey.color && tile.value === state.okey.value;
    return { color: tile.color, value: tile.value, isJoker, isFakeJoker: false };
  }

  function tileLabel(tile, state) {
    const f = faceOf(tile, state);
    if (tile.isFakeJoker) {
      return { valueText: "★", colorClass: `c-${f.color}`, tag: "" };
    }
    if (f.isJoker) {
      return { valueText: `${f.value}`, colorClass: `c-${f.color}`, tag: "OK" };
    }
    return { valueText: `${f.value}`, colorClass: `c-${f.color}`, tag: "" };
  }

  function setStatus(text) {
    if (!els.statusText) return;
    els.statusText.textContent = text;
  }

  function setTurnText(text) {
    if (!els.turnText) return;
    els.turnText.textContent = text;
  }

  function isHumanTurn(state) {
    return state.mode === "human" && state.currentPlayerIndex === 0;
  }

  function isBotPlayer(state, playerIndex) {
    if (state.mode !== "human") return true;
    return playerIndex !== 0;
  }

  function currentPlayer(state) {
    return state.players[state.currentPlayerIndex];
  }

  function sortHandForDisplay(state, hand) {
    const mapped = hand.map((t) => {
      const f = faceOf(t, state);
      const colorOrder = COLORS.indexOf(f.color);
      const typeBoost = f.isJoker ? -2 : (t.isFakeJoker ? -1 : 0);
      return { tile: t, sortKey: [typeBoost, colorOrder === -1 ? 99 : colorOrder, f.value, t.dupIndex] };
    });

    mapped.sort((a, b) => {
      for (let i = 0; i < a.sortKey.length; i++) {
        if (a.sortKey[i] !== b.sortKey[i]) return a.sortKey[i] - b.sortKey[i];
      }
      return 0;
    });

    return mapped.map((m) => m.tile);
  }

  function renderNoGame() {
    const mode = normalizedMode((els.modeSelect && els.modeSelect.value) ? els.modeSelect.value : "human");
    applyModeUI({ mode });

    if (els.turnLogText) els.turnLogText.textContent = "";
    setTurnText("—");
    setStatus("Press “New game” to start.");
    showToast("", 0);
    if (els.fireworks) {
      els.fireworks.hidden = true;
      els.fireworks.innerHTML = "";
    }

    if (els.userBoardTitle && mode === "human") {
      els.userBoardTitle.textContent = `You (${scores[0] ?? 0})`;
    }

    if (els.pNames && els.pNames.length === 4) {
      for (let i = 0; i < 4; i++) {
        const base = basePlayerName({ mode }, i);
        els.pNames[i].textContent = `${base} (${scores[i] ?? 0})`;
      }
    }
    if (els.botIconPoints && els.botIconPoints.length === 4) {
      for (let i = 1; i <= 3; i++) {
        const el = els.botIconPoints[i];
        if (!el) continue;
        el.textContent = String(scores[i] ?? 0);
      }
    }

    for (let p = 0; p < 4; p++) {
      if (els.playerCounts && els.playerCounts[p]) els.playerCounts[p].textContent = "0";
      if (els.playerCards && els.playerCards[p]) els.playerCards[p].classList.remove("playerCard--active");
      if (els.lastDiscardSlots && els.lastDiscardSlots[p]) {
        renderTileInto(els.lastDiscardSlots[p], null, null, { blankWhenNull: true });
      }
    }

    if (els.indicatorSlot) renderTileInto(els.indicatorSlot, null, null, { blankWhenNull: true });
    if (els.okeySlot) renderTileInto(els.okeySlot, null, null, { blankWhenNull: true });
    if (els.discardTop) renderTileInto(els.discardTop, null, null, { blankWhenNull: true });
    if (els.drawCount) els.drawCount.textContent = "0";
    if (els.discardCount) els.discardCount.textContent = "0";

    if (els.drawPileBtn) els.drawPileBtn.disabled = true;
    if (els.takeDiscardBtn) {
      els.takeDiscardBtn.classList.add("tableDiscardBtn--disabled");
      els.takeDiscardBtn.setAttribute("aria-disabled", "true");
    }

    if (els.boardGrid) els.boardGrid.innerHTML = "";
    if (els.winningBotBoardGrid) els.winningBotBoardGrid.innerHTML = "";
    if (els.winningBotBoardSection) els.winningBotBoardSection.hidden = true;
    if (els.tableRing) els.tableRing.classList.remove("tableRing--winBoard");
    if (els.tableCenter) els.tableCenter.hidden = false;
    if (els.centerPiles) els.centerPiles.hidden = false;

    // Clear any in-seat win boards.
    for (let i = 1; i <= 3; i++) {
      const w = els.winSeatWraps ? els.winSeatWraps[i] : null;
      const g = els.winSeatGrids ? els.winSeatGrids[i] : null;
      if (w) w.hidden = true;
      if (g) g.innerHTML = "";
    }
  }

  function render() {
    updateNewGameButtonUI();
    if (!game) {
      renderNoGame();
      return;
    }

    applyModeUI(game);

    if (els.userBoardTitle && game.mode === "human") {
      els.userBoardTitle.textContent = `You (${scores[0] ?? 0})`;
    }

    // Show points next to names.
    if (els.pNames && els.pNames.length === 4) {
      for (let i = 0; i < 4; i++) {
        const base = basePlayerName(game, i);
        els.pNames[i].textContent = `${base} (${scores[i]})`;
      }
    }

    // Also overlay bot points on their icons.
    if (els.botIconPoints && els.botIconPoints.length === 4) {
      for (let i = 1; i <= 3; i++) {
        const el = els.botIconPoints[i];
        if (!el) continue;
        el.textContent = String(scores[i] ?? 0);
      }
    }

    if (els.p2WinPoints) {
      // Legacy: previously showed Bot B points under its icon on win.
      // Points are now always shown as overlays on all bot icons.
      els.p2WinPoints.hidden = true;
    }

    for (let p = 0; p < 4; p++) {
      const count = playerTileCount(game, p);
      els.playerCounts[p].textContent = String(count);
      els.playerCards[p].classList.toggle("playerCard--active", p === game.currentPlayerIndex);

      if (els.lastDiscardSlots && els.lastDiscardSlots[p]) {
        const t = game.lastDiscards ? game.lastDiscards[p] : null;
        renderTileInto(els.lastDiscardSlots[p], t, game, { blankWhenNull: true });
      }
    }

    renderTileInto(els.indicatorSlot, game.indicator, game);
    if (els.okeySlot) {
      renderTileInto(els.okeySlot, { color: game.okey.color, value: game.okey.value, isFakeJoker: false, dupIndex: 0 }, game, { forceNotJokerTag: true });
    }

    els.drawCount.textContent = String(game.drawPile.length);
    els.discardCount.textContent = String(game.discardPile.length);
    const top = game.discardPile[game.discardPile.length - 1] || null;

    // In Play mode, the UI places the "take discard" stack at Bot C's seat.
    // That stack should reflect Bot C's last discarded tile and only clear when
    // the user actually takes it (handled by clearing lastDiscards[3]).
    const shownDiscard = (game.mode === "human")
      ? ((Array.isArray(game.lastDiscards) && game.lastDiscards.length >= 4) ? (game.lastDiscards[3] || null) : null)
      : (top || (game.discardDisplayTile || null));
    renderTileInto(els.discardTop, shownDiscard, game, { blankWhenNull: true });

    const human = isHumanTurn(game);
    const curOwned = playerTileCount(game, game.currentPlayerIndex);
    const mustDraw = curOwned === 14;
    const mustDiscard = curOwned === 15;

    if (game.phase === "playing" && mustDraw && game.drawPile.length === 0) {
      game.phase = "ended";
      game.winner = "No one";
    }

    const animating = !!game.isAnimating;
    els.drawPileBtn.disabled = animating || !human || game.phase !== "playing" || !mustDraw || game.drawPile.length === 0;
    const canTakeDiscard = !animating && human && game.phase === "playing" && mustDraw && game.discardPile.length > 0 && game.lastDiscarderIndex === 3;
    els.takeDiscardBtn.classList.toggle("tableDiscardBtn--disabled", !canTakeDiscard);
    els.takeDiscardBtn.setAttribute("aria-disabled", canTakeDiscard ? "false" : "true");
    els.discardTop.draggable = canTakeDiscard;
    els.discardTop.classList.toggle("discardTopDraggable", canTakeDiscard);
    els.discardTop.ondragstart = (e) => {
      if (!canTakeDiscard) {
        e.preventDefault();
        return;
      }
      const payload = { source: "discard" };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    };

    renderWinningBotBoard();

    if (game.mode === "human") {
      renderBoard();
      renderBotBoards(); // clears
    } else {
      renderBotBoards();
    }
    renderHand();

    if (els.turnLogText) {
      els.turnLogText.textContent = (game.turnLogLines || []).slice(-30).join("\n");
    }

    setTurnText(`${basePlayerName(game, game.currentPlayerIndex)}${human ? " (your turn)" : ""}`);

    if (game.phase === "ended") {
      if (game.winnerTiles && Array.isArray(game.winnerTiles)) {
        setStatus(`${game.winner} wins. Hand: ${formatTilesInline(game, game.winnerTiles)}. Press “New game” to play again.`);
      } else {
        setStatus(`${game.winner} wins. Press “New game” to play again.`);
      }
    } else if (human) {
      if (mustDraw) setStatus("Draw from the pile or take the top discard.");
      else if (mustDiscard) setStatus("Drag a tile from your board to You discard. If it completes a win, drop it onto Draw in the center instead.");
      else setStatus("Waiting…");
    } else if (game.mode !== "human") {
      setStatus("Spectating: bots are playing.");
    }

    updateNewGameButtonUI();
  }

  function renderWinningBotBoard() {
    const showBoardInCenter =
      game &&
      game.mode === "human" &&
      game.phase === "ended" &&
      typeof game.winnerIndex === "number" &&
      game.winnerIndex > 0 &&
      Array.isArray(game.winnerTiles) &&
      game.winnerTiles.length === 14;

    // Always clear any in-seat win boards.
    for (let i = 1; i <= 3; i++) {
      const w = els.winSeatWraps ? els.winSeatWraps[i] : null;
      const g = els.winSeatGrids ? els.winSeatGrids[i] : null;
      if (w) w.hidden = true;
      if (g) g.innerHTML = "";
    }

    if (!showBoardInCenter) {
      if (els.tableRing) els.tableRing.classList.remove("tableRing--winBoard");
      if (els.winningBotBoardSection) els.winningBotBoardSection.hidden = true;
      if (els.winningBotBoardGrid) els.winningBotBoardGrid.innerHTML = "";
      if (els.tableCenter) els.tableCenter.hidden = false;
      if (els.centerPiles) els.centerPiles.hidden = false;
      return;
    }

    const idx = game.winnerIndex;
    if (els.winningBotBoardTitle) {
      els.winningBotBoardTitle.textContent = basePlayerName(game, idx);
    }

    if (els.tableRing) els.tableRing.classList.add("tableRing--winBoard");
    if (els.tableCenter) els.tableCenter.hidden = true;
    if (els.centerPiles) els.centerPiles.hidden = true;
    if (els.indicatorSlot) renderTileInto(els.indicatorSlot, null, game);

    if (els.winningBotBoardSection) els.winningBotBoardSection.hidden = false;
    if (els.winningBotBoardGrid) {
      els.winningBotBoardGrid.innerHTML = "";
      renderStaticBoardGrid(els.winningBotBoardGrid, game.winnerTiles, game, { preferWinning: true });
    }
  }

  function playerDisplayName(state, index) {
    // Back-compat: keep callers working, but route through the base naming.
    return basePlayerName(state, index);
  }

  function applyModeUI(state) {
    const isBots = state.mode !== "human";

    if (els.userBoardSection) els.userBoardSection.hidden = isBots;
    if (els.botBoardsSection) els.botBoardsSection.hidden = !isBots;

    // Hand section is not shown; tiles start on the board.
    if (els.handSection) els.handSection.hidden = true;

    if (els.handTitle) {
      els.handTitle.textContent = isBots ? "Bot 0 hand" : "Your hand";
    }
    if (els.handHint) {
      els.handHint.textContent = isBots
        ? "Spectator: hand is view-only."
        : "Draw (pile/discard), then drag a board tile to discard.";
    }

  }

  function renderBotBoards() {
    if (!game) return;
    if (game.mode === "human") {
      // Clear grids if present
      for (const grid of els.botBoardGrids || []) {
        if (grid) grid.innerHTML = "";
      }
      return;
    }

    for (let p = 0; p < 4; p++) {
      const grid = els.botBoardGrids[p];
      if (!grid) continue;
      const preferWinning = game.phase === "ended" && game.winner === `Bot ${p}` && Array.isArray(game.winnerTiles);
      renderStaticBoardGrid(grid, game.players[p].hand, game, { preferWinning });
    }
  }

  function renderStaticBoardGrid(gridEl, tiles, state, opts = {}) {
    const rows = 2;
    const cols = 12;
    const total = rows * cols;
    gridEl.innerHTML = "";

    const layout = layoutTilesForBoard(state, tiles, cols, total, opts);

    for (let i = 0; i < total; i++) {
      const cell = document.createElement("div");
      cell.className = "board__cell";
      cell.setAttribute("role", "gridcell");

      const tile = layout[i] || null;
      if (tile) {
        const tileEl = document.createElement("div");
        tileEl.className = "tile";
        renderTileInto(tileEl, tile, state);
        cell.appendChild(tileEl);
      }

      gridEl.appendChild(cell);
    }
  }

  function layoutTilesForBoard(state, tiles, cols, total, opts = {}) {
    const groups = computeGroupsForDisplay(state, tiles, opts);
    const out = Array(total).fill(null);
    let pos = 0;

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];

      // Keep groups within a single row.
      const remainingInRow = cols - (pos % cols);
      if (group.length > remainingInRow) {
        pos = Math.ceil(pos / cols) * cols;
      }

      for (const tile of group) {
        if (pos >= total) return out;
        out[pos] = tile;
        pos++;
      }

      // Space between groups (only if we are not at new row)
      if (gi !== groups.length - 1) {
        if (pos < total && (pos % cols) !== 0) {
          pos++; // leaves a null slot
        }
      }
    }

    return out;
  }

  function computeGroupsForDisplay(state, tiles, opts = {}) {
    if (opts.preferWinning && Array.isArray(tiles) && tiles.length === 14) {
      const exact = computeWinningGroupsForDisplay(state, tiles);
      if (exact) return exact;
    }

    // Greedy grouping for visualization:
    // 1) Extract longest runs (same color, consecutive) length >= 3
    // 2) Extract sets (same value, different colors) size 3-4
    // 3) Remaining tiles as a tail group

    const wildJokers = [];
    /** @type {Map<string, any[]>} */
    const byKey = new Map();

    for (const tile of tiles) {
      const f = faceOf(tile, state);
      if (f.isJoker) {
        wildJokers.push(tile);
        continue;
      }
      const key = `${f.color}:${f.value}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(tile);
    }

    function takeOne(color, value) {
      const key = `${color}:${value}`;
      const arr = byKey.get(key);
      if (!arr || arr.length === 0) return null;
      const tile = arr.pop();
      if (arr.length === 0) byKey.delete(key);
      return tile;
    }

    function count(color, value) {
      const key = `${color}:${value}`;
      const arr = byKey.get(key);
      return arr ? arr.length : 0;
    }

    /** @type {any[][]} */
    const groups = [];

    // Runs (same color) with optional gaps filled by wild jokers.
    while (true) {
      const cols = state.board?.cols || 12;
      let best = null;

      for (const color of COLORS) {
        for (let start = 1; start <= 13; start++) {
          let jokersNeeded = 0;
          let len = 0;
          let hasReal = false;
          const maxLen = Math.min(cols, 13);
          for (let step = 0; step < maxLen; step++) {
            const v = ((start - 1 + step) % 13) + 1;
            if (count(color, v) > 0) {
              len++;
              hasReal = true;
            } else if (jokersNeeded < wildJokers.length) {
              len++;
              jokersNeeded++;
            } else {
              break;
            }
          }

          if (hasReal && len >= 3) {
            const candidate = { color, start, len, jokersNeeded };
            if (!best) best = candidate;
            else if (candidate.len > best.len) best = candidate;
            else if (candidate.len === best.len && candidate.jokersNeeded < best.jokersNeeded) best = candidate;
          }
        }
      }

      if (!best) break;

      const run = [];
      for (let i = 0; i < best.len; i++) {
        const v = ((best.start - 1 + i) % 13) + 1;
        const t = takeOne(best.color, v);
        if (t) run.push(t);
        else if (wildJokers.length > 0) run.push(wildJokers.pop());
      }

      if (run.length >= 3) groups.push(run);
      else break;
    }

    // Sets (same value, different colors). Use wild jokers to reach size 3-4.
    while (true) {
      let bestValue = null;
      let bestColors = null;
      for (let value = 1; value <= 13; value++) {
        const availableColors = COLORS.filter((c) => count(c, value) > 0);
        if (availableColors.length + wildJokers.length >= 3) {
          // Prefer 4-of-a-kind
          const score = Math.min(4, availableColors.length + wildJokers.length);
          if (!bestColors || score > bestColors.length) {
            bestValue = value;
            bestColors = availableColors;
          }
        }
      }

      if (!bestColors || bestValue === null) break;
      const targetSize = Math.min(4, bestColors.length + wildJokers.length);
      const colorsToTake = bestColors.slice(0, Math.min(4, bestColors.length));
      const set = [];
      for (const c of colorsToTake) {
        const t = takeOne(c, bestValue);
        if (t) set.push(t);
      }

      while (set.length < targetSize && wildJokers.length > 0) {
        set.push(wildJokers.pop());
      }

      if (set.length >= 3) groups.push(set);
      else break;
    }

    // Remaining (including any unused wild jokers)
    const remaining = [];
    for (const [key, arr] of byKey.entries()) {
      // preserve some stability by sorting remaining keys
      void key;
      for (const t of arr) remaining.push(t);
    }
    if (wildJokers.length) remaining.push(...wildJokers);

    if (remaining.length) {
      const sortedRemaining = sortHandForDisplay(state, remaining);
      groups.push(sortedRemaining);
    }

    return groups;
  }

  function computeWinningGroupsForDisplay(state, tiles14) {
    if (state.mode === "pairs") {
      return computePairsModeGroupsForDisplay(state, tiles14);
    }
    if (!isWinningHand(state, tiles14)) return null;

    // 7 exact pairs
    if (isSevenPairs(state, tiles14)) {
      const byKey = new Map();
      for (const t of tiles14) {
        const f = faceOf(t, state);
        const k = `${f.color}:${f.value}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(t);
      }
      const groups = [];
      for (const arr of byKey.values()) {
        while (arr.length >= 2) groups.push([arr.pop(), arr.pop()]);
      }
      return groups.length >= 7 ? groups.slice(0, 7) : null;
    }

    const jokers = [];
    const normals = [];
    for (const t of tiles14) {
      const f = faceOf(t, state);
      if (f.isJoker) jokers.push(t);
      else normals.push({ tile: t, face: f });
    }

    normals.sort((a, b) => {
      const ca = COLORS.indexOf(a.face.color);
      const cb = COLORS.indexOf(b.face.color);
      if (ca !== cb) return ca - cb;
      if (a.face.value !== b.face.value) return a.face.value - b.face.value;
      return (a.tile.dupIndex ?? 0) - (b.tile.dupIndex ?? 0);
    });

    const memo = new Map();
    function sig(list, j) {
      let s = `J${j}|`;
      for (const it of list) s += `${it.face.color[0]}${it.face.value},`;
      return s;
    }

    function removeAtIndices(list, indices) {
      const toRemove = new Set(indices);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        if (!toRemove.has(i)) out.push(list[i]);
      }
      return out;
    }

    function combinations(arr, k, mustInclude) {
      const out = [];
      function rec(start, picked) {
        if (picked.length === k) {
          if (picked.includes(mustInclude)) out.push(picked.slice());
          return;
        }
        for (let i = start; i < arr.length; i++) {
          picked.push(arr[i]);
          rec(i + 1, picked);
          picked.pop();
        }
      }
      rec(0, []);
      return out;
    }

    function solve(list, jokerCount) {
      if (list.length === 0) {
        if (jokerCount === 0) return [];
        // Allow leftover jokers as a single placeholder run group (length >= 3)
        return jokerCount >= 3 ? [new Array(jokerCount).fill({ __wild: true })] : null;
      }

      const k = sig(list, jokerCount);
      if (memo.has(k)) return null;

      const anchor = list[0];

      // Try set first (size 3-4)
      {
        const value = anchor.face.value;
        const candidates = [];
        const colorsPresent = new Set();
        for (let i = 0; i < list.length; i++) {
          if (list[i].face.value === value) candidates.push(i);
        }

        const unique = [];
        for (const idx of candidates) {
          const c = list[idx].face.color;
          if (!colorsPresent.has(c)) {
            colorsPresent.add(c);
            unique.push(idx);
          }
        }

        for (const size of [3, 4]) {
          const maxReal = Math.min(size, unique.length);
          const minReal = Math.max(1, size - jokerCount);
          for (let realCount = minReal; realCount <= maxReal; realCount++) {
            if (!unique.includes(0)) continue;
            const combos = combinations(unique, realCount, 0);
            for (const combo of combos) {
              const jokersUsed = size - combo.length;
              if (jokersUsed > jokerCount) continue;
              const nextList = removeAtIndices(list, combo);
              const rest = solve(nextList, jokerCount - jokersUsed);
              if (rest) {
                const groupTiles = combo.map((i) => list[i].tile);
                for (let j = 0; j < jokersUsed; j++) groupTiles.push({ __wild: true });
                return [groupTiles, ...rest];
              }
            }
          }
        }
      }

      // Try run (size >= 3)
      {
        const runColor = anchor.face.color;
        const firstValue = anchor.face.value;
        const idxs = [];
        for (let i = 0; i < list.length; i++) {
          if (list[i].face.color === runColor) idxs.push(i);
        }
        if (idxs.length > 0) {
          const byValue = new Map();
          for (const i of idxs) {
            const v = list[i].face.value;
            if (!byValue.has(v)) byValue.set(v, []);
            byValue.get(v).push(i);
          }

          // Wrap rule: allow ...13-1 only when 1 is the FINAL tile.
          for (let start = 1; start <= 13; start++) {
            for (let len = 3; len <= 13; len++) {
              const rawEnd = start + len - 1;
              if (rawEnd > 13 && rawEnd !== 14) continue;
              const anchorOffset = (firstValue - start + 13) % 13;
              if (anchorOffset >= len) continue;

              let jokersNeeded = 0;
              const chosenIndices = [];

              for (let i = 0; i < len; i++) {
                const raw = start + i;
                const v = (raw <= 13)
                  ? raw
                  : (raw === 14 && i === len - 1) ? 1 : null;
                if (v === null) {
                  jokersNeeded = jokerCount + 1;
                  break;
                }
                const options = byValue.get(v) || [];
                if (i === anchorOffset) {
                  chosenIndices.push(0);
                } else if (options.length > 0) {
                  chosenIndices.push(options[0]);
                } else {
                  jokersNeeded++;
                }
              }

              if (jokersNeeded > jokerCount) continue;
              const uniq = Array.from(new Set(chosenIndices));
              const nextList = removeAtIndices(list, uniq);
              const rest = solve(nextList, jokerCount - jokersNeeded);
              if (rest) {
                const groupTiles = [];
                for (let i = 0; i < len; i++) {
                  const raw = start + i;
                  const v = (raw <= 13)
                    ? raw
                    : (raw === 14 && i === len - 1) ? 1 : null;
                  if (i === anchorOffset) {
                    groupTiles.push(anchor.tile);
                    continue;
                  }
                  if (v === null) {
                    groupTiles.push({ __wild: true });
                    continue;
                  }
                  const options = byValue.get(v) || [];
                  if (options.length > 0) groupTiles.push(list[options[0]].tile);
                  else groupTiles.push({ __wild: true });
                }
                return [groupTiles, ...rest];
              }
            }
          }
        }
      }

      memo.set(k, true);
      return null;
    }

    const groups = solve(normals, jokers.length);
    if (!groups) return null;

    // Replace placeholder wild objects with actual joker tiles, preserving count.
    const jokerStack = jokers.slice();
    const out = [];
    for (const g of groups) {
      const real = [];
      for (const t of g) {
        if (t && t.__wild) real.push(jokerStack.pop());
        else real.push(t);
      }
      out.push(real.filter(Boolean));
    }
    return out;
  }

  function isSevenPairsPairsMode(state, tiles14) {
    const groups = computePairsModeGroupsForDisplay(state, tiles14);
    return Array.isArray(groups) && groups.length === 7;
  }

  function computePairsModeGroupsForDisplay(state, tiles14) {
    // Pairs-mode rule:
    // - Win only if the 14 tiles can be split into exactly 7 groups of 2.
    // - Each group must represent a "same" pair.
    // - A group can include a wild joker, but cannot contain two wild jokers.
    //   (So every wild joker must pair with a non-joker tile.)

    if (!Array.isArray(tiles14) || tiles14.length !== 14) return null;

    const wildJokers = [];
    const byKey = new Map();
    for (const t of tiles14) {
      const f = faceOf(t, state);
      if (f.isJoker) {
        wildJokers.push(t);
        continue;
      }
      const k = `${f.color}:${f.value}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }

    const j = wildJokers.length;

    // If there are wild jokers, every one must pair with a non-joker tile.
    if (j > 0 && byKey.size === 0) return null;

    const entries = [];
    for (const [k, arr] of byKey.entries()) entries.push({ k, arr });
    entries.sort((a, b) => a.k.localeCompare(b.k));

    let oddFaces = 0;
    let extraCapacity = 0;
    for (const e of entries) {
      const c = e.arr.length;
      if (c % 2 === 1) oddFaces += 1;
      // After taking 1 to fix parity (if needed), we can take additional tiles in pairs (2 at a time).
      extraCapacity += c - (c % 2);
    }

    if (j < oddFaces) return null;
    if (((j - oddFaces) % 2) !== 0) return null;
    const extraNeeded = j - oddFaces;
    if (extraNeeded > extraCapacity) return null;

    const groups = [];

    // 1) Use 1 joker on each odd-count face (fix parity)
    for (const e of entries) {
      if (e.arr.length % 2 === 1) {
        const tile = e.arr.pop();
        const joker = wildJokers.pop();
        if (!tile || !joker) return null;
        groups.push([tile, joker]);
      }
    }

    // 2) Spend remaining jokers by consuming tiles in pairs from any face
    while (wildJokers.length > 0) {
      let consumed = false;
      for (const e of entries) {
        if (wildJokers.length >= 2 && e.arr.length >= 2) {
          const t1 = e.arr.pop();
          const t2 = e.arr.pop();
          const j1 = wildJokers.pop();
          const j2 = wildJokers.pop();
          if (!t1 || !t2 || !j1 || !j2) return null;
          groups.push([t1, j1]);
          groups.push([t2, j2]);
          consumed = true;
          break;
        }
      }
      if (!consumed) return null;
    }

    // 3) Remaining tiles must be exact pairs
    for (const e of entries) {
      if (e.arr.length % 2 !== 0) return null;
      while (e.arr.length >= 2) {
        groups.push([e.arr.pop(), e.arr.pop()]);
      }
    }

    return groups.length === 7 ? groups : null;
  }

  function formatBoardLocations(state, tiles) {
    // Uses the same layout as renderStaticBoardGrid so indices match the visible board.
    const rows = 2;
    const cols = 12;
    const total = rows * cols;
    const layout = layoutTilesForBoard(state, tiles, cols, total);

    const parts = [];
    for (let i = 0; i < layout.length; i++) {
      const t = layout[i];
      if (!t) continue;
      const f = faceOf(t, state);
      const colorShort = { red: "R", blue: "B", black: "K", yellow: "Y" };
      const c = colorShort[f.color] || "?";
      const base = `${c}${f.value}`;
      const label = t.isFakeJoker ? base : f.isJoker ? `OK(${base})` : base;
      parts.push(`${i}:${label}`);
    }
    return parts.join(" ");
  }

  function isBoardArrangementWinning(state) {
    // Require a fully arranged board: all 14 tiles placed, no tiles left in hand.
    if (state.players[0].hand.length !== 0) return false;
    const placed = state.board.cells.filter(Boolean);
    if (placed.length !== 14) return false;

    const segments = extractBoardSegments(state);
    if (segments.some((s) => s.length === 1)) return false;

    // Alternative win: 7 exact pairs (2-tile groups only)
    const allPairs = segments.length === 7 && segments.every((s) => s.length === 2);
    if (allPairs) {
      return segments.every((s) => isValidExactPair(state, s));
    }

    // Standard win: all segments are valid runs/sets of length >= 3
    if (segments.some((s) => s.length === 2)) return false;
    return segments.every((s) => s.length >= 3 && isValidGroup(state, s));
  }

  function extractBoardSegments(state) {
    const segments = [];
    const { cols, rows } = state.board;

    for (let row = 0; row < rows; row++) {
      let start = null;
      for (let c = 0; c <= cols; c++) {
        const idx = row * cols + c;
        const tile = c < cols ? state.board.cells[idx] : null;

        if (tile && start === null) start = idx;
        if ((!tile || c === cols) && start !== null) {
          const end = idx - 1;
          const segment = [];
          for (let i = start; i <= end; i++) {
            const t = state.board.cells[i];
            if (t) segment.push(t);
          }
          segments.push(segment);
          start = null;
        }
      }
    }

    return segments;
  }

  function isValidExactPair(state, segment) {
    if (segment.length !== 2) return false;
    const a = faceOf(segment[0], state);
    const b = faceOf(segment[1], state);
    return a.color === b.color && a.value === b.value;
  }

  function isValidGroup(state, segment) {
    // A segment is valid if it is either:
    // - a set: same value, all different colors, size 3-4, jokers allowed
    // - a run: same color, consecutive values, size >=3, jokers allowed
    const faces = segment.map((t) => faceOf(t, state));
    const wildCount = faces.filter((f) => f.isJoker).length;
    const nonWild = faces.filter((f) => !f.isJoker);

    // Board segments are ordered left-to-right, so validate runs by position.

    // Try set (order independent)
    if (segment.length >= 3 && segment.length <= 4 && nonWild.length > 0) {
      const v = nonWild[0].value;
      const sameValue = nonWild.every((f) => f.value === v);
      if (sameValue) {
        const colors = nonWild.map((f) => f.color);
        const uniqueColors = new Set(colors);
        if (uniqueColors.size === colors.length) {
          return true;
        }
      }
    }

    // Try run (order + joker placement)
    if (segment.length >= 3) {
      // Determine run color from the first non-joker tile.
      const firstNonJoker = faces.find((f) => !f.isJoker);
      if (firstNonJoker) {
        const runColor = firstNonJoker.color;
        if (faces.every((f) => f.isJoker || f.color === runColor)) {
          const len = segment.length;
          for (let start = 1; start <= 13; start++) {
            let ok = true;
            for (let i = 0; i < len; i++) {
              const f = faces[i];
              if (f.isJoker) continue;
              // Wrap rule: allow ...13-1 only when 1 is the FINAL tile.
              // Examples: 12-13-1 valid; 11-12-13-1 valid; 13-1-2 invalid.
              const raw = start + i;
              const expected = (raw <= 13)
                ? raw
                : (raw === 14 && i === len - 1) ? 1 : null;
              if (expected === null) {
                ok = false;
                break;
              }
              if (f.value !== expected) {
                ok = false;
                break;
              }
            }
            if (ok) return true;
          }
        }
      } else {
        // All jokers: allow as a run placeholder.
        return wildCount === segment.length;
      }
    }

    return false;
  }

  function logSpectatorTurn(state, actingBotIndex, actionText) {
    if (!state || state.mode === "human") return;
    state.turnNumber += 1;

    const lines = [];
    lines.push(`Turn ${state.turnNumber}: Bot ${actingBotIndex} ${actionText}`);

    // Requirement update: show hands of all bots (including Bot 0) in progression.
    for (let p = 0; p < 4; p++) {
      const handLine = formatTilesInline(state, state.players[p].hand);
      const locLine = formatBoardLocations(state, state.players[p].hand);
      lines.push(`  Bot ${p} hand: ${handLine}`);
      lines.push(`  Bot ${p} board: ${locLine}`);
    }

    state.turnLogLines.push(...lines, "");
  }

  function formatTilesInline(state, tiles) {
    // Compact, readable, no HTML.
    // Example: R1 B2 Y2 OK(B7) R5
    const colorShort = { red: "R", blue: "B", black: "K", yellow: "Y" };
    return tiles
      .map((t) => {
        const f = faceOf(t, state);
        const c = colorShort[f.color] || "?";
        const base = `${c}${f.value}`;
        if (t.isFakeJoker) return base;
        if (f.isJoker) return `OK(${base})`;
        return base;
      })
      .join(" ");
  }

  function renderTileInto(containerEl, tileOrNull, state, opts = {}) {
    containerEl.classList.remove("tile--clickable", "tile--selected", "tile--joker");
    containerEl.innerHTML = "";
    containerEl.title = "";

    if (!tileOrNull) {
      if (!opts.blankWhenNull) {
        containerEl.textContent = "—";
      }
      return;
    }

    const isRealTile = typeof tileOrNull.isFakeJoker === "boolean";
    const tile = isRealTile
      ? tileOrNull
      : { id: "", color: tileOrNull.color, value: tileOrNull.value, isFakeJoker: false, dupIndex: tileOrNull.dupIndex ?? 0 };

    const f = faceOf(tile, state);
    const label = tileLabel(tile, state);

    if (tile.isFakeJoker) {
      // Show the underlying number on hover.
      containerEl.title = String(f.value);
    }

    const inner = document.createElement("div");
    inner.className = "tile__inner";

    const value = document.createElement("div");
    value.className = `tile__value ${label.colorClass}`;
    value.textContent = label.valueText;

    const tag = document.createElement("div");
    tag.className = "tile__tag";
    tag.textContent = label.tag;

    inner.appendChild(value);
    inner.appendChild(tag);
    containerEl.appendChild(inner);

    if (f.isJoker && !opts.forceNotJokerTag) {
      containerEl.classList.add("tile--joker");
    }
  }

  let selectedTileId = null;

  function renderHand() {
    if (!game) return;
    const hand = sortHandForDisplay(game, game.players[0].hand);

    els.handGrid.innerHTML = "";

    // Allow dropping tiles back to hand from the board
    els.handGrid.ondragover = (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      e.preventDefault();
    };
    els.handGrid.ondrop = (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      e.preventDefault();
      const payload = safeParseDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.source === "board") {
        moveTileFromBoardToHand(payload.boardIndex);
      }
    };

    for (const tile of hand) {
      const el = document.createElement("div");
      el.className = "tile tile--clickable";
      el.setAttribute("role", "listitem");
      el.dataset.tileId = tile.id;
      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        const payload = { source: "hand", tileId: tile.id };
        e.dataTransfer.setData("application/json", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      });

      renderTileInto(el, tile, game);

      if (selectedTileId === tile.id) {
        el.classList.add("tile--selected");
      }

      el.addEventListener("click", () => {
        if (!game || game.phase !== "playing") return;
        if (!isHumanTurn(game)) return;
        selectedTileId = tile.id;
        render();
      });

      els.handGrid.appendChild(el);
    }
  }

  function renderBoard() {
    if (!game) return;
    if (!els.boardGrid) return;

    const { rows, cols } = game.board;
    const total = rows * cols;
    els.boardGrid.innerHTML = "";

    for (let index = 0; index < total; index++) {
      const cell = document.createElement("div");
      cell.className = "board__cell";
      cell.dataset.boardIndex = String(index);
      cell.setAttribute("role", "gridcell");

      const tile = game.board.cells[index];
      if (tile) {
        const tileEl = document.createElement("div");
        tileEl.className = "tile tile--clickable";
        tileEl.dataset.tileId = tile.id;
        tileEl.draggable = true;
        renderTileInto(tileEl, tile, game);

        tileEl.addEventListener("dragstart", (e) => {
          const payload = { source: "board", tileId: tile.id, boardIndex: index };
          e.dataTransfer.setData("application/json", JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "move";
        });

        cell.appendChild(tileEl);
      }

      cell.addEventListener("dragover", (e) => {
        if (!game || game.phase !== "playing") return;
        if (!isHumanTurn(game)) return;
        e.preventDefault();
        cell.classList.add("board__cell--over");
      });

      cell.addEventListener("dragleave", () => {
        cell.classList.remove("board__cell--over");
      });

      cell.addEventListener("drop", (e) => {
        if (!game || game.phase !== "playing") return;
        if (!isHumanTurn(game)) return;
        e.preventDefault();
        cell.classList.remove("board__cell--over");

        const payload = safeParseDragPayload(e.dataTransfer);
        if (!payload) return;

        if (payload.source === "hand") {
          moveTileFromHandToBoard(payload.tileId, index);
        } else if (payload.source === "board") {
          moveTileWithinBoard(payload.boardIndex, index);
        } else if (payload.source === "discard") {
          takeDiscardToBoard(index);
        }
      });

      els.boardGrid.appendChild(cell);
    }
  }

  function safeParseDragPayload(dataTransfer) {
    if (!dataTransfer) return null;
    const raw = dataTransfer.getData("application/json") || "";
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.source !== "string") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function rowBounds(state, boardIndex) {
    const { cols } = state.board;
    const row = Math.floor(boardIndex / cols);
    const start = row * cols;
    const end = start + cols - 1;
    return { start, end };
  }

  function insertTileWithShift(state, boardIndex, tile) {
    // If the slot is empty, place directly.
    if (!state.board.cells[boardIndex]) {
      state.board.cells[boardIndex] = tile;
      return true;
    }

    const { start, end } = rowBounds(state, boardIndex);

    // Prefer shifting right if there is space.
    let emptyRight = -1;
    for (let i = boardIndex; i <= end; i++) {
      if (!state.board.cells[i]) {
        emptyRight = i;
        break;
      }
    }
    if (emptyRight !== -1) {
      for (let i = emptyRight; i > boardIndex; i--) {
        state.board.cells[i] = state.board.cells[i - 1];
      }
      state.board.cells[boardIndex] = tile;
      return true;
    }

    // Otherwise try shifting left.
    let emptyLeft = -1;
    for (let i = boardIndex; i >= start; i--) {
      if (!state.board.cells[i]) {
        emptyLeft = i;
        break;
      }
    }
    if (emptyLeft !== -1) {
      for (let i = emptyLeft; i < boardIndex; i++) {
        state.board.cells[i] = state.board.cells[i + 1];
      }
      state.board.cells[boardIndex] = tile;
      return true;
    }

    // No space in this row.
    return false;
  }

  function moveTileFromHandToBoard(tileId, boardIndex) {
    if (!game) return;
    const hand = game.players[0].hand;
    const idx = hand.findIndex((t) => t.id === tileId);
    if (idx === -1) return;
    const [tile] = hand.splice(idx, 1);
    const ok = insertTileWithShift(game, boardIndex, tile);
    if (!ok) {
      // Put it back if we couldn't insert.
      hand.push(tile);
    }
    selectedTileId = null;
    render();
  }

  function moveTileFromBoardToHand(boardIndex) {
    if (!game) return;
    const tile = game.board.cells[boardIndex];
    if (!tile) return;
    game.board.cells[boardIndex] = null;
    game.players[0].hand.push(tile);
    selectedTileId = null;
    render();
  }

  function moveTileWithinBoard(fromIndex, toIndex) {
    if (!game) return;
    if (fromIndex === toIndex) return;
    const tile = game.board.cells[fromIndex];
    if (!tile) return;

    // Remove first so shifting can use that hole.
    game.board.cells[fromIndex] = null;
    const ok = insertTileWithShift(game, toIndex, tile);
    if (!ok) {
      // Revert
      game.board.cells[fromIndex] = tile;
    }
    selectedTileId = null;
    render();
  }

  function drawFromPile() {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;
    if (game.isAnimating) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 14) return;
    const tile = game.drawPile.pop();
    if (!tile) return;

    const targetIndex = pickRandomEmptyBoardIndex(game);
    if (targetIndex < 0) {
      game.players[0].hand.push(tile);
      selectedTileId = null;
      render();
      return;
    }

    game.isAnimating = true;
    render();

    const targetCell = getBoardCellEl(targetIndex);

    animateTileFlightFromTo(tile, els.drawPileBtn, targetCell, game)
      .finally(() => {
        game.board.cells[targetIndex] = tile;
        game.isAnimating = false;
        selectedTileId = null;
        render();
      });
  }

  function takeFromDiscard() {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 14) return;
    const tile = game.discardPile.pop();
    if (!tile) return;
    placeTileOnRandomEmptyBoardSlot(game, tile);
    selectedTileId = null;
    render();
  }

  function takeDiscardToBoard(boardIndex) {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;
    if (game.isAnimating) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 14) return;
    const tile = game.discardPile.pop();
    if (!tile) return;

    // Discard was taken: clear the origin slot.
    if (typeof game.lastDiscarderIndex === "number" && Array.isArray(game.lastDiscards)) {
      game.lastDiscards[game.lastDiscarderIndex] = null;
    }
    game.lastDiscarderIndex = null;
    game.discardDisplayTile = null;

    const ok = insertTileWithShift(game, boardIndex, tile);
    if (!ok) {
      game.discardPile.push(tile);
    }
    selectedTileId = null;
    render();
  }

  function humanDiscard({ tileId, source, boardIndex }) {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 15) return;

    let discarded = null;
    if (source === "hand") {
      const hand = game.players[0].hand;
      const idx = hand.findIndex((t) => t.id === tileId);
      if (idx === -1) return;
      [discarded] = hand.splice(idx, 1);
    } else if (source === "board") {
      const idx = typeof boardIndex === "number" ? boardIndex : game.board.cells.findIndex((t) => t && t.id === tileId);
      if (idx < 0) return;
      discarded = game.board.cells[idx];
      if (!discarded) return;
      game.board.cells[idx] = null;
    } else {
      return;
    }

    game.discardPile.length = 0;
    game.discardPile.push(discarded);
    game.discardDisplayTile = discarded;
    if (Array.isArray(game.lastDiscards)) game.lastDiscards[0] = discarded;
    game.lastDiscarderIndex = 0;

    const jokerOut = !!faceOf(discarded, game).isJoker;

    const tilesAfter = playerOwnedTiles(game, 0);
    const winOk = game.mode === "human" ? isBoardArrangementWinning(game) : isWinningHand(game, tilesAfter);
    if (winOk) {
      game.phase = "ended";
      game.winner = "You";
      game.winnerIndex = 0;
      game.winnerTiles = null;
      const pts = pointsForWin(game, jokerOut);
      awardWinPoints(game, 0, jokerOut);
      celebrateUserWin(game, pts);
      render();
      return;
    }

    advanceTurn();
  }

  function humanDiscardFromBoardToDiscard(boardIndex) {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 15) return;

    const tile = game.board.cells[boardIndex];
    if (!tile) return;

    const prevLast = (Array.isArray(game.lastDiscards)) ? game.lastDiscards[0] : null;

    // Apply discard
    game.board.cells[boardIndex] = null;
    game.discardPile.length = 0;
    game.discardPile.push(tile);
    game.discardDisplayTile = tile;
    if (Array.isArray(game.lastDiscards)) game.lastDiscards[0] = tile;
    game.lastDiscarderIndex = 0;

    // Enforce rule: if this discard would win, it must be dropped onto Draw instead.
    if (game.mode === "human" && isBoardArrangementWinning(game)) {
      game.discardPile.pop();
      game.board.cells[boardIndex] = tile;
      if (Array.isArray(game.lastDiscards)) game.lastDiscards[0] = prevLast;
      render();
      setStatus("That discard would win. Drop it onto Draw (center) to finish.");
      return;
    }

    selectedTileId = null;
    advanceTurn();
  }

  function humanDiscardFromBoardToDrawToWin(boardIndex) {
    if (!game || game.phase !== "playing") return;
    if (!isHumanTurn(game)) return;

    const owned = playerTileCount(game, 0);
    if (owned !== 15) return;

    const tile = game.board.cells[boardIndex];
    if (!tile) return;

    const prevLast = (Array.isArray(game.lastDiscards)) ? game.lastDiscards[0] : null;

    // Apply discard
    game.board.cells[boardIndex] = null;
    game.discardPile.length = 0;
    game.discardPile.push(tile);
    game.discardDisplayTile = tile;
    if (Array.isArray(game.lastDiscards)) game.lastDiscards[0] = tile;
    game.lastDiscarderIndex = 0;

    const jokerOut = !!faceOf(tile, game).isJoker;
    const winOk = game.mode === "human" ? isBoardArrangementWinning(game) : false;
    if (!winOk) {
      // Dropping to Draw is only allowed if it actually wins.
      game.discardPile.pop();
      game.board.cells[boardIndex] = tile;
      if (Array.isArray(game.lastDiscards)) game.lastDiscards[0] = prevLast;
      render();
      setStatus("Drop to Draw is only allowed when your board is winning.");
      return;
    }

    game.phase = "ended";
    game.winner = "You";
    game.winnerIndex = 0;
    game.winnerTiles = null;
    const pts = pointsForWin(game, jokerOut);
    awardWinPoints(game, 0, jokerOut);
    celebrateUserWin(game, pts);
    selectedTileId = null;
    render();
  }

  function advanceTurn() {
    if (!game) return;
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
    selectedTileId = null;
    render();

    if (game.phase === "playing" && !isHumanTurn(game)) {
      scheduleBots();
    }
  }

  function scheduleBots() {
    if (!game) return;
    if (game.pendingBotTimeout) {
      clearTimeout(game.pendingBotTimeout);
      game.pendingBotTimeout = null;
    }

    game.pendingBotTimeout = setTimeout(() => {
      if (!game || game.phase !== "playing") return;
      if (isHumanTurn(game)) return;
      botTakeTurn(game.currentPlayerIndex);
    }, 350);
  }

  async function botTakeTurn(botIndex) {
    if (!game || game.phase !== "playing") return;
    if (!isBotPlayer(game, botIndex)) return;
    if (game.currentPlayerIndex !== botIndex) return;
    if (game.isAnimating) return;

    const bot = game.players[botIndex];

    let actionSummary = "";

    if (bot.hand.length === 14) {
      const wantsDiscard = shouldBotTakeDiscard(game, bot);
      const willTakeDiscard = wantsDiscard && game.discardPile.length > 0;
      const prevIndex = (botIndex + 3) % 4;
      const sourceIndex = (typeof game.lastDiscarderIndex === "number") ? game.lastDiscarderIndex : prevIndex;
      const fromEl = willTakeDiscard
        ? ((els.lastDiscardSlots && els.lastDiscardSlots[sourceIndex]) ? els.lastDiscardSlots[sourceIndex] : els.discardTop)
        : els.drawPileBtn;
      const tile = willTakeDiscard ? game.discardPile.pop() : game.drawPile.pop();
      if (willTakeDiscard) {
        // Discard was taken: clear the origin slot immediately.
        if (Array.isArray(game.lastDiscards) && typeof sourceIndex === "number") {
          game.lastDiscards[sourceIndex] = null;
        }
        game.lastDiscarderIndex = null;
        game.discardDisplayTile = null;
      }
      if (tile) {
        const toEl = (game.mode !== "human" && els.botBoardGrids && els.botBoardGrids[botIndex])
          ? els.botBoardGrids[botIndex]
          : (els.playerCards && els.playerCards[botIndex] ? els.playerCards[botIndex] : null);
        const tileW = 88;
        const tileH = 112;
        const toRect = toEl ? centeredRectWithin(toEl, tileW, tileH) : null;
        const fromRect = fromEl ? centeredRectWithin(fromEl, tileW, tileH) : null;

        game.isAnimating = true;
        render();
        await animateTileFlightFromTo(tile, fromEl, toEl, game, {
          fromRect: fromRect || undefined,
          toRect: toRect || undefined,
          // Do not reveal drawn tile values while flying from the pile.
          hideFace: !willTakeDiscard,
        });
        bot.hand.push(tile);
        game.isAnimating = false;
        render();
      }
      actionSummary = willTakeDiscard ? "took discard" : "drew from pile";
    }

    if (bot.hand.length === 15) {
      const discardIndex = pickBotDiscardIndex(game, bot);
      const [discarded] = bot.hand.splice(discardIndex, 1);

      const jokerOut = !!faceOf(discarded, game).isJoker;

      const discText = formatTilesInline(game, [discarded]);
      actionSummary = actionSummary ? `${actionSummary}, discarded ${discText}` : `discarded ${discText}`;

      const winOk = (game.mode === "pairs")
        ? isSevenPairsPairsMode(game, bot.hand)
        : isWinningHand(game, bot.hand);

      // Animate discard moving from the bot seat to its discard slot.
      const fromEl = (game.mode !== "human" && els.botBoardGrids && els.botBoardGrids[botIndex])
        ? els.botBoardGrids[botIndex]
        : (els.playerCards && els.playerCards[botIndex] ? els.playerCards[botIndex] : null);
      const toEl = (els.lastDiscardSlots && els.lastDiscardSlots[botIndex])
        ? els.lastDiscardSlots[botIndex]
        : (els.discardTop || null);
      const toRect = toEl ? toEl.getBoundingClientRect() : null;
      const fromRect = (fromEl && toRect) ? centeredRectWithin(fromEl, toRect.width, toRect.height) : null;
      game.isAnimating = true;
      render();
      await animateTileFlightFromTo(discarded, fromEl, toEl, game, { fromRect: fromRect || undefined, toRect: toRect || undefined });

      // Apply discard only after the animation so the target slot updates on arrival.
      game.discardPile.length = 0;
      game.discardPile.push(discarded);
      game.discardDisplayTile = discarded;
      if (Array.isArray(game.lastDiscards)) game.lastDiscards[botIndex] = discarded;
      game.lastDiscarderIndex = botIndex;
      game.isAnimating = false;
      render();

      if (winOk) {
        game.phase = "ended";
        game.winner = playerDisplayName(game, botIndex);
        game.winnerIndex = botIndex;
        game.winnerTiles = bot.hand.slice();
        const pts = pointsForWin(game, jokerOut);
        awardWinPoints(game, botIndex, jokerOut);
        showGameEndToast(game, botIndex, pts);
        logSpectatorTurn(game, botIndex, actionSummary || "played");
        render();
        return;
      }
    }

    logSpectatorTurn(game, botIndex, actionSummary || "played");

    advanceTurn();
  }

  function shouldBotTakeDiscard(state, bot) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;

    if (state.mode === "pairs") {
      const cur = pairsModeHandScore(state, bot.hand).score;
      const next = pairsModeHandScore(state, bot.hand.concat([top])).score;
      return next > cur;
    }

    const topFace = faceOf(top, state);
    const faces = bot.hand.map((t) => faceOf(t, state));

    for (const f of faces) {
      if (f.isJoker) continue;
      if (f.value === topFace.value && f.color !== topFace.color) return true;
      if (f.color === topFace.color && (Math.abs(f.value - topFace.value) === 1)) return true;
    }
    return false;
  }

  function pickBotDiscardIndex(state, bot) {
    if (state.mode === "pairs") {
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < bot.hand.length; i++) {
        const remaining = bot.hand.filter((_, idx) => idx !== i);
        const s = pairsModeHandScore(state, remaining).score;
        if (s > bestScore) {
          bestScore = s;
          bestIndex = i;
        }
      }

      return bestIndex;
    }

    const faces = bot.hand.map((t) => faceOf(t, state));

    function usefulness(i) {
      const t = bot.hand[i];
      const f = faces[i];
      if (f.isJoker) return 1000;
      let score = 0;

      for (let j = 0; j < faces.length; j++) {
        if (i === j) continue;
        const g = faces[j];
        if (g.isJoker) continue;
        if (g.value === f.value && g.color !== f.color) score += 4;
        if (g.color === f.color && (g.value === f.value - 1 || g.value === f.value + 1)) score += 3;
        if (g.color === f.color && (g.value === f.value - 2 || g.value === f.value + 2)) score += 1;
      }

      if (t.isFakeJoker) score += 2;

      return score;
    }

    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < bot.hand.length; i++) {
      const s = usefulness(i);
      if (s < bestScore) {
        bestScore = s;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function pairsModeHandScore(state, tiles) {
    // Higher is better.
    // Goal: reach 7 groups of 2.
    // Wild jokers can pair with any single tile, but joker-joker is not allowed.
    let jokers = 0;
    const counts = new Map();

    for (const t of tiles) {
      const f = faceOf(t, state);
      if (f.isJoker) {
        jokers++;
        continue;
      }
      const k = `${f.color}:${f.value}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }

    let exactPairs = 0;
    let singles = 0;
    for (const c of counts.values()) {
      exactPairs += Math.floor(c / 2);
      singles += c % 2;
    }

    const coveredSingles = Math.min(jokers, singles);
    const leftoverJokers = jokers - coveredSingles;
    const effectivePairs = exactPairs + coveredSingles;

    // Penalize leftover jokers heavily because they cannot pair together.
    // Also penalize remaining singles (unpaired non-jokers).
    const score = (effectivePairs * 100) - (singles * 15) - (leftoverJokers * 80);

    return { score, exactPairs, singles, jokers, leftoverJokers, effectivePairs };
  }

  function normalizeTilesForSolver(state, tiles) {
    const normals = [];
    let jokers = 0;

    for (const t of tiles) {
      const f = faceOf(t, state);
      if (f.isJoker) jokers++;
      else normals.push({ color: f.color, value: f.value });
    }

    normals.sort((a, b) => {
      const ca = COLORS.indexOf(a.color);
      const cb = COLORS.indexOf(b.color);
      if (ca !== cb) return ca - cb;
      return a.value - b.value;
    });

    return { normals, jokers };
  }

  function isWinningHand(state, tiles14) {
    if (tiles14.length !== 14) return false;
    if (isSevenPairs(state, tiles14)) return true;

    const { normals, jokers } = normalizeTilesForSolver(state, tiles14);
    const memo = new Map();

    function sig(list, j) {
      let s = `J${j}|`;
      for (const t of list) s += `${t.color[0]}${t.value},`;
      return s;
    }

    function solve(list, j) {
      if (list.length === 0) return j >= 0;
      const k = sig(list, j);
      if (memo.has(k)) return memo.get(k);

      const first = list[0];

      if (tryGroup(list, j, first.value)) {
        memo.set(k, true);
        return true;
      }

      if (tryRun(list, j, first.color)) {
        memo.set(k, true);
        return true;
      }

      memo.set(k, false);
      return false;
    }

    function removeAtIndices(list, indices) {
      const toRemove = new Set(indices);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        if (!toRemove.has(i)) out.push(list[i]);
      }
      return out;
    }

    function combinations(arr, k, mustInclude) {
      const out = [];

      function rec(start, picked) {
        if (picked.length === k) {
          if (picked.includes(mustInclude)) out.push(picked.slice());
          return;
        }
        for (let i = start; i < arr.length; i++) {
          picked.push(arr[i]);
          rec(i + 1, picked);
          picked.pop();
        }
      }

      rec(0, []);
      return out;
    }

    function tryGroup(list, j, value) {
      const candidates = [];
      const colorsPresent = new Set();
      for (let i = 0; i < list.length; i++) {
        if (list[i].value === value) candidates.push(i);
      }
      if (candidates.length === 0) return false;

      const unique = [];
      for (const idx of candidates) {
        const c = list[idx].color;
        if (!colorsPresent.has(c)) {
          colorsPresent.add(c);
          unique.push(idx);
        }
      }

      for (const size of [3, 4]) {
        const maxReal = Math.min(size, unique.length);
        const minReal = Math.max(1, size - j);
        for (let realCount = minReal; realCount <= maxReal; realCount++) {
          if (list[0].value !== value) continue;
          if (!unique.includes(0)) continue;

          const combos = combinations(unique, realCount, 0);
          for (const combo of combos) {
            const jokersUsed = size - combo.length;
            if (jokersUsed > j) continue;
            const nextList = removeAtIndices(list, combo);
            if (solve(nextList, j - jokersUsed)) return true;
          }
        }
      }
      return false;
    }

    function tryRun(list, j, color) {
      const idxs = [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].color === color) idxs.push(i);
      }
      if (idxs.length === 0) return false;
      if (list[0].color !== color) return false;

      const firstValue = list[0].value;
      const byValue = new Map();
      for (const i of idxs) {
        const v = list[i].value;
        if (!byValue.has(v)) byValue.set(v, []);
        byValue.get(v).push(i);
      }

      // Wrap rule: allow ...13-1 only when 1 is the FINAL tile.
      for (let start = 1; start <= 13; start++) {
        for (let len = 3; len <= 13; len++) {
          const rawEnd = start + len - 1;
          if (rawEnd > 13 && rawEnd !== 14) continue;
          const anchorOffset = (firstValue - start + 13) % 13;
          if (anchorOffset >= len) continue;

          let jokersNeeded = 0;
          const chosenIndices = [];

          for (let i = 0; i < len; i++) {
            const raw = start + i;
            const v = (raw <= 13)
              ? raw
              : (raw === 14 && i === len - 1) ? 1 : null;
            if (v === null) {
              jokersNeeded = j + 1;
              break;
            }
            const options = byValue.get(v);
            if (options && options.length > 0) chosenIndices.push(options[0]);
            else jokersNeeded++;
          }

          if (jokersNeeded > j) continue;

          if (!chosenIndices.includes(0)) {
            const anchorVal = firstValue;
            const options = byValue.get(anchorVal) || [];
            if (!options.includes(0)) continue;
            if (chosenIndices[anchorOffset] !== undefined) chosenIndices[anchorOffset] = 0;
            else chosenIndices.push(0);
          }

          const uniq = Array.from(new Set(chosenIndices));
          const nextList = removeAtIndices(list, uniq);
          if (solve(nextList, j - jokersNeeded)) return true;
        }
      }

      return false;
    }

    return solve(normals, jokers);
  }

  function isSevenPairs(state, tiles) {
    // Exact-pairs win: 7 pairs of identical tile faces (including the physical joker tile face).
    // Does NOT allow using a wild joker as a substitute to complete a different tile.
    const counts = new Map();
    for (const t of tiles) {
      const f = faceOf(t, state);
      const k = `${f.color}:${f.value}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }

    let pairs = 0;
    for (const c of counts.values()) {
      pairs += Math.floor(c / 2);
    }

    return pairs >= 7;
  }

  function startNewGameFromModeSelect() {
    if (!canStartNewGameNow()) {
      showToast("Finish the active game before starting a new one.", 2500);
      updateNewGameButtonUI();
      return;
    }

    const mode = (els.modeSelect && els.modeSelect.value) ? els.modeSelect.value : "human";
    if (game && game.pendingBotTimeout) {
      clearTimeout(game.pendingBotTimeout);
      game.pendingBotTimeout = null;
    }
    game = newGameState(mode);
    awardIndicatorStartPoints(game);
    showIndicatorBonusToastIfAny(game);
    selectedTileId = null;
    setStatus("Game started.");
    render();
    if (game.phase === "playing" && !isHumanTurn(game)) scheduleBots();
  }

  function onNewGameButtonClick() {
    if (isGameActive()) {
      resetSession();
      stopActiveGame();
      showToast("Session reset.", 2000);
      render();
      return;
    }

    startNewGameFromModeSelect();
  }

  els.newGameBtn.addEventListener("click", onNewGameButtonClick);

  // Changing mode resets the session: scores to 0 and dealer rotation restarts at player 0.
  if (els.modeSelect) {
    els.modeSelect.addEventListener("change", () => {
      if (isGameActive()) {
        // Keep the current game consistent; mode changes apply after the game ends.
        els.modeSelect.value = game ? game.mode : "human";
        showToast("Mode can be changed after the game ends.", 2500);
        return;
      }

      resetSession();
      startNewGameFromModeSelect();
    });
  }

  els.drawPileBtn.addEventListener("click", drawFromPile);

  // Human discard is drag/drop only:
  // - Drop a board tile onto the You discard slot to discard normally.
  // - Drop a board tile onto Draw (center) to finish the game, only if that discard wins.
  const youDiscardSlot = els.lastDiscardSlots && els.lastDiscardSlots[0] ? els.lastDiscardSlots[0] : null;
  if (youDiscardSlot) {
    youDiscardSlot.addEventListener("dragover", (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      const owned = playerTileCount(game, 0);
      if (owned !== 15) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    youDiscardSlot.addEventListener("drop", (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      e.preventDefault();
      const payload = safeParseDragPayload(e.dataTransfer);
      if (!payload || payload.source !== "board") return;
      humanDiscardFromBoardToDiscard(payload.boardIndex);
    });
  }

  if (els.drawPileBtn) {
    els.drawPileBtn.addEventListener("dragover", (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      const owned = playerTileCount(game, 0);
      if (owned !== 15) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    els.drawPileBtn.addEventListener("drop", (e) => {
      if (!game || game.phase !== "playing") return;
      if (!isHumanTurn(game)) return;
      e.preventDefault();
      const payload = safeParseDragPayload(e.dataTransfer);
      if (!payload || payload.source !== "board") return;
      humanDiscardFromBoardToDrawToWin(payload.boardIndex);
    });
  }

  render();
})();
