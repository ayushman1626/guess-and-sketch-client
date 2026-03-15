/* ============================================
   LOBBY SCREEN
   ============================================ */
import { gameState } from '../state.js';
import { events, EVT } from '../events.js';
import { startGame } from '../websocket.js';

let cleanup = null;

export function renderLobby(container) {
  const state = gameState.get();

  container.innerHTML = `
    <div class="lobby">
      <div class="lobby-card glass">
        <div class="lobby-header">
          <h2 class="lobby-title">🎮 Game Lobby</h2>
        </div>

        <!-- Room Code -->
        <div class="room-code-section">
          <div class="room-code-label">Room Code</div>
          <div class="room-code" id="room-code-copy" title="Click to copy">
            <span class="room-code-digits" id="room-code-digits">${state.roomId || '------'}</span>
            <span class="room-code-copy">📋</span>
          </div>
          <div id="copied-msg" class="room-code-copied hidden">✅ Copied!</div>
        </div>

        <!-- Players -->
        <div class="players-section">
          <div class="players-header">
            <span class="players-title">🎭 Players</span>
            <span class="players-count" id="player-count">${state.players.length}/10</span>
          </div>
          <div class="players-grid" id="players-grid">
            ${renderPlayers(state.players)}
          </div>
        </div>

        <!-- Waiting Indicator -->
        <div class="waiting-indicator" id="waiting-indicator">
          <span>Waiting for players</span>
          <div class="waiting-dots">
            <span></span><span></span><span></span>
          </div>
        </div>

        <!-- Actions -->
        <div class="lobby-actions">
          ${state.isHost ? `
            <button id="start-game-btn" class="btn btn-primary" ${state.players.length < 2 ? 'disabled' : ''}>
              🎮 Start Game
            </button>
          ` : `
            <div class="status-banner waiting">
              Waiting for host to start...
            </div>
          `}
          <button id="back-btn" class="btn btn-ghost back-btn">← Back to Home</button>
        </div>
      </div>
    </div>
  `;

  // ── Copy room code ──
  const copyBtn = document.getElementById('room-code-copy');
  const copiedMsg = document.getElementById('copied-msg');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomId).then(() => {
      copiedMsg.classList.remove('hidden');
      setTimeout(() => copiedMsg.classList.add('hidden'), 2000);
    });
  });

  // ── Start game ──
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startGame();
      startBtn.disabled = true;
      startBtn.innerHTML = '⏳ Starting...';
    });
  }

  // ── Back button ──
  document.getElementById('back-btn').addEventListener('click', () => {
    gameState.reset();
    events.emit(EVT.NAVIGATE, 'landing');
  });

  // ── Event listeners ──
  const offJoined = events.on(EVT.PLAYER_JOINED, (username) => {
    gameState.addPlayer(username);
    updatePlayerGrid();
    gameState.addChatMessage(null, `${username} joined the room`, 'system');
  });

  const offLeft = events.on(EVT.PLAYER_LEFT, (username) => {
    gameState.removePlayer(username);
    updatePlayerGrid();
    gameState.addChatMessage(null, `${username} left the room`, 'system');
  });

  // ROOM_UPDATE — sync full player list from server (handles late joiners)
  const offRoomUpdate = events.on(EVT.ROOM_UPDATE, (data) => {
    if (data.players) {
      // Rebuild the player list from server data
      const existingPlayers = gameState.get().players;
      data.players.forEach(p => {
        if (!existingPlayers.find(ep => ep.username === p.username)) {
          gameState.addPlayer(p.username);
        }
        // Sync scores
        if (p.score !== undefined) {
          gameState.updateScore(p.username, p.score, p.score);
        }
      });
      updatePlayerGrid();
    }
  });

  const offGameStarted = events.on(EVT.GAME_STARTED, () => {
    gameState.set({ gameStarted: true, gameState: 'WAITING' });
    events.emit(EVT.NAVIGATE, 'game');
  });

  // GAME_STOP — sync player list if received while on lobby
  const offGameStop = events.on(EVT.GAME_STOP, () => {
    updatePlayerGrid();
  });

  cleanup = () => {
    offJoined();
    offLeft();
    offRoomUpdate();
    offGameStarted();
    offGameStop();
  };

  return cleanup;
}

function updatePlayerGrid() {
  const state = gameState.get();
  const grid = document.getElementById('players-grid');
  const count = document.getElementById('player-count');
  const startBtn = document.getElementById('start-game-btn');

  if (grid) grid.innerHTML = renderPlayers(state.players);
  if (count) count.textContent = `${state.players.length}/10`;
  if (startBtn) startBtn.disabled = state.players.length < 2;
}

function renderPlayers(players) {
  const state = gameState.get();
  // Host is determined by: server-provided hostUsername, or if this client is host then it's their username
  const hostName = state.hostUsername || (state.isHost ? state.username : null);

  return players.map(p => `
    <div class="player-card">
      <div class="player-avatar" style="background: ${p.avatarColor}">
        ${p.username.charAt(0)}
      </div>
      <div class="player-name">${p.username}</div>
      ${p.username === hostName ? '<span class="player-badge">👑 Host</span>' : ''}
    </div>
  `).join('');
}
