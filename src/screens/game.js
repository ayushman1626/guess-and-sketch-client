/* ============================================
   GAME SCREEN — Main game layout
   ============================================ */
import { gameState } from '../state.js';
import { events, EVT } from '../events.js';
import { createCanvas, clearCanvas, updateToolbarVisibility, destroyCanvas } from '../components/canvas.js';
import { createChat, destroyChat } from '../components/chat.js';
import { createScoreboard, renderScoreboard, destroyScoreboard } from '../components/scoreboard.js';
import { createTimer, startTimer, stopTimer, resetTimerUI } from '../components/timer.js';
import { showWordSelect, hideWordSelect } from '../components/wordSelect.js';
import { showRoundEnd, hideRoundEnd } from '../components/roundEnd.js';
import { playGameStart, playCorrectGuess, playRoundEnd as playRoundEndSfx, playWordSelect as playWordSelectSfx, playPlayerJoin, playPlayerLeave, playGameStop } from '../sounds.js';

let cleanupFns = [];
let timerCheckInterval = null;

export function renderGame(container) {
  const state = gameState.get();

  container.innerHTML = `
    <div class="game" id="game-container">
      <!-- Header Bar -->
      <div class="game-header">
        <div class="game-header-left">
          <span class="game-logo">🎨</span>
          <span class="game-room-id">Room: ${state.roomId}</span>
        </div>
        <div class="game-header-center">
          <div id="game-status-area">
            <span class="game-round-info" id="round-info">Waiting to start...</span>
          </div>
          <div id="word-hint-area"></div>
        </div>
        <div class="game-header-right" id="timer-area"></div>
      </div>

      <!-- Scoreboard (left) -->
      <div id="scoreboard-area"></div>

      <!-- Canvas (center) -->
      <div class="canvas-area" id="canvas-area"></div>

      <!-- Chat (right) -->
      <div id="chat-area"></div>
    </div>
  `;

  // ── Mount components ──
  createScoreboard(document.getElementById('scoreboard-area'));
  createCanvas(document.getElementById('canvas-area'));
  createChat(document.getElementById('chat-area'));
  createTimer(document.getElementById('timer-area'));

  playGameStart();

  // ── Timer danger vignette ──
  timerCheckInterval = setInterval(() => {
    const s = gameState.get();
    const gameEl = document.getElementById('game-container');
    if (gameEl) {
      gameEl.classList.toggle('timer-danger', s.timer <= 10 && s.gameState === 'DRAWING');
    }
  }, 500);

  // ── Event listeners ──

  // Round started — new drawer chosen
  const offRoundStarted = events.on(EVT.ROUND_STARTED, (drawer) => {
    hideWordSelect();
    hideRoundEnd();
    clearCanvas();
    resetTimerUI();

    gameState.setDrawer(drawer);
    gameState.set({ gameState: 'WORD_SELECTION', currentWord: null, wordHint: '' });
    updateToolbarVisibility();
    renderScoreboard();

    const isMe = drawer === gameState.get().username;
    updateRoundInfo(isMe ? 'Your turn to draw! 🎨' : `${drawer} is choosing a word...`);
    updateWordHint('');

    // Remove danger class
    const gameEl = document.getElementById('game-container');
    if (gameEl) gameEl.classList.remove('timer-danger');
  });

  // Word options received (drawer only)
  const offWordOptions = events.on(EVT.WORD_OPTIONS, (words) => {
    gameState.set({ wordOptions: words });
    playWordSelectSfx();
    showWordSelect(words);
  });

  // ── Check for pending word options (fixes race condition) ──
  // If WORD_OPTIONS arrived before the game screen mounted, show them now
  setTimeout(() => {
    const s = gameState.get();
    if (s.wordOptions && s.wordOptions.length > 0 && s.isDrawer && s.gameState === 'WORD_SELECTION') {
      console.log('[Game] Showing pending word options:', s.wordOptions);
      playWordSelectSfx();
      showWordSelect(s.wordOptions);
    }
  }, 100);

  // Word selected — drawing begins
  const offWordSelected = events.on(EVT.WORD_SELECTED, (drawer) => {
    hideWordSelect();
    gameState.set({ gameState: 'DRAWING' });
    updateToolbarVisibility();

    const isMe = drawer === gameState.get().username;
    if (isMe) {
      updateRoundInfo('You are drawing!');
      // The drawer knows the word from word select — stored in state
      const s = gameState.get();
      if (s.currentWord) {
        updateWordDisplay(s.currentWord);
      }
    } else {
      updateRoundInfo(`${drawer} is drawing`);
    }

    startTimer(60);
  });

  // Player guessed correctly
  const offGuessed = events.on(EVT.PLAYER_GUESSED, () => {
    playCorrectGuess();
    renderScoreboard();
  });

  // Round ended
  const offRoundEnded = events.on(EVT.ROUND_ENDED, (message) => {
    stopTimer();
    playRoundEndSfx();
    gameState.set({ gameState: 'ROUND_END', roundEndMessage: message, wordOptions: [] });
    updateRoundInfo('Round over!');

    // Remove danger class
    const gameEl = document.getElementById('game-container');
    if (gameEl) gameEl.classList.remove('timer-danger');

    // Show the word in the header
    const wordMatch = message.match(/The word was: (.+)/i);
    if (wordMatch) {
      updateWordDisplay(wordMatch[1]);
    }

    showRoundEnd(message);
    updateToolbarVisibility();
    renderScoreboard();
  });

  // Player joined mid-game
  const offJoined = events.on(EVT.PLAYER_JOINED, (username) => {
    gameState.addPlayer(username);
    playPlayerJoin();
    renderScoreboard();
  });

  // Player left mid-game
  const offLeft = events.on(EVT.PLAYER_LEFT, (username) => {
    gameState.removePlayer(username);
    playPlayerLeave();
    renderScoreboard();
  });

  // ROOM_UPDATE — full state sync from server (player list + draw events)
  const offRoomUpdate = events.on(EVT.ROOM_UPDATE, (data) => {
    if (data.players) {
      const existingPlayers = gameState.get().players;
      data.players.forEach(p => {
        if (!existingPlayers.find(ep => ep.username === p.username)) {
          gameState.addPlayer(p.username);
        }
        if (p.score !== undefined) {
          gameState.updateScore(p.username, p.score, p.score);
        }
      });
      renderScoreboard();
    }
    // Replay draw events for late joiners
    if (data.drawEvents && data.drawEvents.length > 0) {
      data.drawEvents.forEach(d => {
        events.emit(EVT.DRAW_EVENT, d);
      });
    }
  });

  // Game stopped — not enough players, go back to lobby
  const offGameStop = events.on(EVT.GAME_STOP, () => {
    stopTimer();
    hideWordSelect();
    hideRoundEnd();
    playGameStop();
    updateToolbarVisibility();

    // Remove danger class
    const gameEl = document.getElementById('game-container');
    if (gameEl) gameEl.classList.remove('timer-danger');

    gameState.addChatMessage(null, 'Game stopped — not enough players', 'system');
    events.emit(EVT.SHOW_TOAST, { message: 'Game stopped — waiting for more players', type: 'info' });

    // Navigate back to lobby after a short delay
    setTimeout(() => {
      events.emit(EVT.NAVIGATE, 'lobby');
    }, 2000);
  });

  cleanupFns = [offRoundStarted, offWordOptions, offWordSelected, offGuessed, offRoundEnded, offJoined, offLeft, offRoomUpdate, offGameStop];

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    if (timerCheckInterval) {
      clearInterval(timerCheckInterval);
      timerCheckInterval = null;
    }
    stopTimer();
    hideWordSelect();
    hideRoundEnd();
    destroyCanvas();
    destroyChat();
    destroyScoreboard();
  };
}

function updateRoundInfo(text) {
  const el = document.getElementById('round-info');
  if (el) {
    el.textContent = text;
    el.classList.add('animate-slide-up');
    setTimeout(() => el.classList.remove('animate-slide-up'), 500);
  }
}

function updateWordHint(hint) {
  const area = document.getElementById('word-hint-area');
  if (!area) return;

  if (!hint) {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <div class="word-hint">
      ${hint.split('').map(ch =>
        ch === ' '
          ? '<span class="word-hint-char word-hint-space"></span>'
          : `<span class="word-hint-char">${ch === '_' ? '' : ch}</span>`
      ).join('')}
    </div>
  `;
}

function updateWordDisplay(word) {
  const area = document.getElementById('word-hint-area');
  if (!area) return;
  area.innerHTML = `<span class="word-display">${word}</span>`;
}
