/* ============================================
   SCOREBOARD COMPONENT
   ============================================ */
import { gameState } from '../state.js';
import { events, EVT } from '../events.js';

let scoreboardEl;
let cleanupFns = [];

export function createScoreboard(parentEl) {
  const panel = document.createElement('div');
  panel.className = 'scoreboard';
  panel.innerHTML = `
    <div class="scoreboard-title">🏆 Players</div>
    <div class="scoreboard-list" id="scoreboard-list"></div>
  `;
  parentEl.appendChild(panel);
  scoreboardEl = document.getElementById('scoreboard-list');

  // Listen for score updates
  const offScore = events.on(EVT.SCORE_UPDATE, (data) => {
    gameState.updateScore(data.username, data.score, data.totalScore);
    renderScoreboard();
  });

  const offRound = events.on(EVT.ROUND_STARTED, () => {
    renderScoreboard();
  });

  const offJoined = events.on(EVT.PLAYER_JOINED, () => {
    renderScoreboard();
  });

  const offLeft = events.on(EVT.PLAYER_LEFT, () => {
    renderScoreboard();
  });

  const offGuessed = events.on(EVT.PLAYER_GUESSED, () => {
    renderScoreboard();
  });

  cleanupFns = [offScore, offRound, offJoined, offLeft, offGuessed];

  renderScoreboard();
  return panel;
}

export function renderScoreboard() {
  if (!scoreboardEl) return;
  const state = gameState.get();

  // Sort by score descending
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  scoreboardEl.innerHTML = sorted.map((p, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const isDrawing = p.isDrawing;
    const hasGuessed = p.hasGuessed;
    const isMe = p.username === state.username;

    // Extract a solid color from the gradient for the avatar
    const avatarColor = p.avatarColor || 'var(--gradient-neon)';

    let statusText = '';
    let statusClass = '';
    if (isDrawing) { statusText = '✏️ Drawing'; statusClass = 'drawing'; }
    else if (hasGuessed) { statusText = '✅ Guessed!'; statusClass = 'guessed'; }

    return `
      <div class="score-item ${isDrawing ? 'is-drawing' : ''} ${hasGuessed ? 'has-guessed' : ''}"
           style="${isMe ? 'border-left: 3px solid var(--accent-blue);' : ''}">
        <div class="score-rank ${rankClass}">${rank}</div>
        <div class="score-avatar-sm" style="background: ${avatarColor}">
          ${p.username.charAt(0).toUpperCase()}
        </div>
        <div class="score-info">
          <div class="score-name">${p.username}${isMe ? ' (you)' : ''}</div>
          ${statusText ? `<div class="score-status ${statusClass}">${statusText}</div>` : ''}
        </div>
        <div class="score-points">${p.score}</div>
      </div>
    `;
  }).join('');
}

export function destroyScoreboard() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  scoreboardEl = null;
}
