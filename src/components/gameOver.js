/* ============================================
   GAME OVER OVERLAY — Final leaderboard + winner
   ============================================ */

import { events, EVT } from '../events.js';

let overlayEl = null;
let autoNavTimeout = null;
let countdownInterval = null;

const REASON_LABELS = {
  NOT_ENOUGH_PLAYERS: { text: 'Not enough players remained', emoji: '😢' },
  MAX_ROUNDS_REACHED: { text: 'All rounds completed!', emoji: '🎉' },
};

const CONFETTI_COLORS = ['#ff6b9d', '#c471f5', '#6dd5fa', '#56ffa4', '#ffd166', '#ff8a5c', '#f093fb'];

export function showGameOver({ reason, winner, finalScores }) {
  hideGameOver();

  const reasonInfo = REASON_LABELS[reason] || { text: reason, emoji: '🏁' };

  /* ── Build sorted leaderboard ── */
  const entries = Object.entries(finalScores || {})
    .sort(([, a], [, b]) => b - a);

  const rankEmojis = ['🥇', '🥈', '🥉'];

  const leaderboardHtml = entries.map(([username, score], i) => {
    const isWinner = username === winner;
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    const rankLabel = i < 3 ? rankEmojis[i] : `${i + 1}`;
    const initial = username.charAt(0).toUpperCase();
    const avatarColors = [
      '#c471f5', '#6dd5fa', '#56ffa4', '#ffd166',
      '#ff6b9d', '#ff8a5c', '#f093fb', '#4facfe',
    ];
    const avatarColor = avatarColors[username.charCodeAt(0) % avatarColors.length];

    return `
      <li class="go-score-item ${isWinner ? 'go-score-winner' : ''}">
        <span class="go-score-rank ${rankClass}">${rankLabel}</span>
        <span class="go-score-avatar" style="background:${avatarColor}">${initial}</span>
        <span class="go-score-name">
          ${username}
          ${isWinner ? '<span class="go-crown">👑</span>' : ''}
        </span>
        <span class="go-score-points">${score}</span>
      </li>`;
  }).join('');

  let countdown = 15;

  overlayEl = document.createElement('div');
  overlayEl.className = 'game-over-overlay';
  overlayEl.innerHTML = `
    <div class="game-over-card glass">
      <div class="game-over-trophy">${reasonInfo.emoji === '🎉' ? '🏆' : '😔'}</div>
      <h2 class="game-over-title">Game Over!</h2>
      <p class="game-over-subtitle">${reasonInfo.text}</p>

      ${winner ? `
        <div class="game-over-winner-banner">
          <span class="go-winner-crown">👑</span>
          <span class="go-winner-name">${winner} wins!</span>
        </div>
      ` : ''}

      <ul class="go-leaderboard">
        ${leaderboardHtml}
      </ul>

      <div class="game-over-actions">
        <button class="btn go-btn-lobby" id="go-back-lobby-btn">🏠 Back to Lobby</button>
      </div>
      <p class="go-auto-nav">Returning to lobby in <strong id="go-countdown">${countdown}</strong>s…</p>
    </div>
  `;

  document.body.appendChild(overlayEl);

  /* ── Confetti ── */
  if (reason === 'MAX_ROUNDS_REACHED') spawnConfetti();

  /* ── Button handler ── */
  document.getElementById('go-back-lobby-btn').addEventListener('click', () => {
    _goToLobby();
  });

  /* ── Countdown ── */
  const timerEl = () => document.getElementById('go-countdown');
  countdownInterval = setInterval(() => {
    countdown--;
    const el = timerEl();
    if (el) el.textContent = countdown;
    if (countdown <= 0) _goToLobby();
  }, 1000);

  /* ── Auto-navigate safety ── */
  autoNavTimeout = setTimeout(() => _goToLobby(), 15500);
}

export function hideGameOver() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  if (autoNavTimeout)    { clearTimeout(autoNavTimeout);    autoNavTimeout = null; }
  if (overlayEl)         { overlayEl.remove(); overlayEl = null; }
  _removeConfetti();
}

/* ── Internal helpers ── */
function _goToLobby() {
  hideGameOver();
  events.emit(EVT.NAVIGATE, 'lobby');
}

function spawnConfetti() {
  _removeConfetti();
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.id = 'go-confetti-container';

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 2.5;
    const size = 6 + Math.random() * 10;
    const shape = Math.random() > 0.5 ? '50%' : '2px';

    piece.style.cssText = `
      left: ${left}%;
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: ${shape};
      animation-delay: ${delay}s;
      animation-duration: ${2.5 + Math.random() * 2}s;
    `;
    container.appendChild(piece);
  }

  document.body.appendChild(container);
}

function _removeConfetti() {
  const existing = document.getElementById('go-confetti-container');
  if (existing) existing.remove();
}
