/* ============================================
   LANDING SCREEN
   ============================================ */
import { gameState } from '../state.js';
import { events, EVT } from '../events.js';
import { connect, createRoom, joinRoom, subscribeToRoom, isConnected } from '../websocket.js';

export function renderLanding(container) {
  container.innerHTML = `
    <div class="landing">
      <!-- Floating Doodles -->
      <div class="landing-doodles">
        <span class="doodle">🎨</span>
        <span class="doodle">✏️</span>
        <span class="doodle">⭐</span>
        <span class="doodle">🖌️</span>
        <span class="doodle">🎯</span>
        <span class="doodle">💡</span>
        <span class="doodle">🌈</span>
        <span class="doodle">✨</span>
      </div>

      <!-- Main Content -->
      <div class="landing-content">
        <div class="landing-logo">🎨</div>
        <h1 class="landing-title">
          <span class="word">Guess</span>
          <span class="word">&</span>
          <span class="word">Sketch</span>
        </h1>
        <p class="landing-subtitle">Draw, guess, and outsmart your friends!</p>

        <div class="landing-card glass">
          <div class="username-input-wrapper">
            <span class="input-icon">👤</span>
            <input
              type="text"
              id="username-input"
              class="input"
              placeholder="Enter your name..."
              maxlength="15"
              autocomplete="off"
            />
          </div>

          <div class="landing-actions">
            <button id="create-room-btn" class="btn btn-primary">
              🏠 Create Room
            </button>
          </div>

          <div class="join-section">
            <div class="label">Or join a friend's room</div>
            <div class="join-row">
              <input
                type="text"
                id="room-code-input"
                class="input"
                placeholder="CODE"
                maxlength="6"
                autocomplete="off"
              />
              <button id="join-room-btn" class="btn btn-secondary">
                🚀 Join
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Status -->
      <div class="connection-status glass">
        <span id="connection-dot" class="connection-dot connecting"></span>
        <span id="connection-text">Connecting...</span>
      </div>
    </div>
  `;

  // ── Elements ──
  const usernameInput = document.getElementById('username-input');
  const createBtn = document.getElementById('create-room-btn');
  const joinBtn = document.getElementById('join-room-btn');
  const roomCodeInput = document.getElementById('room-code-input');
  const connDot = document.getElementById('connection-dot');
  const connText = document.getElementById('connection-text');

  // ── Connect on mount ──
  initConnection(connDot, connText);

  // Room code input — allow only numbers
  roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  // ── Create room ──
  createBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
      usernameInput.classList.add('animate-wiggle');
      setTimeout(() => usernameInput.classList.remove('animate-wiggle'), 500);
      showToast('Please enter your name!', 'error');
      return;
    }
    if (!isConnected()) {
      showToast('Not connected to server!', 'error');
      return;
    }

    gameState.set({ username, isHost: true, hostUsername: username });
    createBtn.disabled = true;
    createBtn.textContent = '⏳ Creating...';
    createRoom(username);
  });

  // ── Join room ──
  joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomCodeInput.value.trim();

    if (!username) {
      usernameInput.classList.add('animate-wiggle');
      setTimeout(() => usernameInput.classList.remove('animate-wiggle'), 500);
      showToast('Please enter your name!', 'error');
      return;
    }
    if (roomId.length !== 6) {
      roomCodeInput.classList.add('animate-wiggle');
      setTimeout(() => roomCodeInput.classList.remove('animate-wiggle'), 500);
      showToast('Room code must be 6 digits!', 'error');
      return;
    }
    if (!isConnected()) {
      showToast('Not connected to server!', 'error');
      return;
    }

    gameState.set({ username, roomId, isHost: false });
    gameState.addPlayer(username);
    joinBtn.disabled = true;
    joinBtn.textContent = '⏳ Joining...';
    subscribeToRoom(roomId);
    joinRoom(roomId, username);

    // Navigate to lobby after a short delay
    setTimeout(() => {
      events.emit(EVT.NAVIGATE, 'lobby');
    }, 500);
  });

  // ── Room created handler ──
  const offRoomCreated = events.on(EVT.ROOM_CREATED, (roomId) => {
    gameState.set({ roomId });
    gameState.addPlayer(gameState.get().username);
    subscribeToRoom(roomId);
    events.emit(EVT.NAVIGATE, 'lobby');
  });

  // Enter key handling
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBtn.click();
  });
  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  // Focus username input
  setTimeout(() => usernameInput.focus(), 600);

  // Cleanup
  return () => {
    offRoomCreated();
  };
}

async function initConnection(dot, text) {
  try {
    dot.className = 'connection-dot connecting';
    text.textContent = 'Connecting...';
    await connect();
    dot.className = 'connection-dot connected';
    text.textContent = 'Connected';
  } catch (e) {
    dot.className = 'connection-dot';
    text.textContent = 'Connection failed';
    console.error('Connection failed:', e);
  }
}

function showToast(message, type = 'info') {
  events.emit(EVT.SHOW_TOAST, { message, type });
}
