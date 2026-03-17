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
import { showGameOver, hideGameOver } from '../components/gameOver.js';
import { requestWords } from '../websocket.js';
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

      <!-- Mobile Tab Bar -->
      <div class="mobile-tab-bar" id="mobile-tab-bar">
        <button class="mobile-tab active" data-tab="chat" id="tab-chat">
          💬 Chat
          <span class="mobile-tab-badge" id="chat-badge"></span>
        </button>
        <button class="mobile-tab" data-tab="scores" id="tab-scores">
          🏆 Scores
        </button>
      </div>
    </div>
  `;

  // ── Mount components ──
  createScoreboard(document.getElementById('scoreboard-area'));
  createCanvas(document.getElementById('canvas-area'));
  createChat(document.getElementById('chat-area'));
  createTimer(document.getElementById('timer-area'));

  // ── Mobile Tab Switching ──
  setupMobileTabs();

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
    
    startTimer(60);

    // RACE CONDITION FIX & FALLBACK: check if we have word options
    const s = gameState.get();
    if (isMe) {
      if (s.wordOptions && s.wordOptions.length > 0) {
        console.log('[Game] Displaying pending word options directly in round started listener.');
        playWordSelectSfx();
        showWordSelect(s.wordOptions);
      } else {
        // Fallback: If 1 second passes and we still have no word options, request them forcefully
        setTimeout(() => {
          const checkState = gameState.get();
          if (checkState.gameState === 'WORD_SELECTION' && (!checkState.wordOptions || checkState.wordOptions.length === 0)) {
            console.log('[Game] Word options missing, triggering requestWords fallback...');
            requestWords();
          }
        }, 1000);
      }
    }
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

  // Auto-assigned word (when drawer didn't pick in time)
  const offWordAssigned = events.on(EVT.WORD_ASSIGNED, (word) => {
    // We already set gameState in websocket, but let's make sure updateWordDisplay is called
    // if we are already in drawing phase and we are the drawer.
    const s = gameState.get();
    if (s.gameState === 'DRAWING' && s.isDrawer) {
      updateWordDisplay(word);
    }
  });

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
  });

  // Player guessed correctly
  const offGuessed = events.on(EVT.PLAYER_GUESSED, () => {
    playCorrectGuess();
    renderScoreboard();
  });

  // Round ended
  const offRoundEnded = events.on(EVT.ROUND_ENDED, (payload) => {
    stopTimer();
    playRoundEndSfx();
    let message = 'Round over!';
    
    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && payload.message) {
      message = payload.message;
    }

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

    // Pass the message but empty scores initially. Scores will arrive via ROUND_SCORES
    showRoundEnd(message, []);
    updateToolbarVisibility();
    renderScoreboard();
  });

  // Round scores arrived
  const offRoundScores = events.on(EVT.ROUND_SCORES, (payload) => {
    let scores = [];
    if (payload && payload.playerScores) {
      scores = payload.playerScores;
    } else if (Array.isArray(payload)) {
      scores = payload;
    }

    const s = gameState.get();
    let message = s.roundEndMessage || 'Round over!';
    
    // Update the existing round end screen with scores
    if (s.gameState === 'ROUND_END') {
      showRoundEnd(message, scores);
    }
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
    // If GAME_ENDED already fired (graceful end), let that handler own the flow.
    if (gameState.get().gameState === 'GAME_OVER') return;

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

  // Game ended gracefully (max rounds or not enough players — graceful path)
  const offGameEnded = events.on(EVT.GAME_ENDED, (payload) => {
    stopTimer();
    hideWordSelect();
    hideRoundEnd();
    updateToolbarVisibility();

    const gameEl = document.getElementById('game-container');
    if (gameEl) gameEl.classList.remove('timer-danger');

    showGameOver(payload);
  });

  cleanupFns = [offRoundStarted, offWordOptions, offWordAssigned, offWordSelected, offGuessed, offRoundEnded, offRoundScores, offJoined, offLeft, offRoomUpdate, offGameStop, offGameEnded];

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
    hideGameOver();
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

function setupMobileTabs() {
  const tabs = document.querySelectorAll('.mobile-tab');
  if (!tabs.length) return;

  const chatPanel = document.querySelector('.chat-panel');
  const scoreboardPanel = document.querySelector('.scoreboard');

  // Initial setup: activate chat tab
  if (chatPanel) chatPanel.classList.add('mobile-active');
  if (scoreboardPanel) scoreboardPanel.classList.remove('mobile-active');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update tab styles
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabId = tab.getAttribute('data-tab');

      // Refresh panels in case they were recreated
      const currentChat = document.querySelector('.chat-panel');
      const currentScoreboard = document.querySelector('.scoreboard');

      if (tabId === 'chat') {
        if (currentChat) currentChat.classList.add('mobile-active');
        if (currentScoreboard) currentScoreboard.classList.remove('mobile-active');
        
        // Clear chat badge
        const badge = document.getElementById('chat-badge');
        if (badge) badge.textContent = '';
      } else if (tabId === 'scores') {
        if (currentChat) currentChat.classList.remove('mobile-active');
        if (currentScoreboard) currentScoreboard.classList.add('mobile-active');
      }
    });
  });
}
