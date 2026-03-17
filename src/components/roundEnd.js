/* ============================================
   ROUND END OVERLAY — Word reveal + confetti
   ============================================ */

import { gameState } from '../state.js';

let overlayEl = null;
let countdownInterval = null;

export function showRoundEnd(message, scores = []) {
  hideRoundEnd();

  // Extract word from "Round ended! The word was: <word>"
  let word = '???';
  const wordMatch = message.match(/The word was: (.+)/i);
  if (wordMatch) {
    word = wordMatch[1];
  } else {
    // Fallback if the word is in the message itself or state
    const s = gameState.get();
    if (s.currentWord) word = s.currentWord;
  }

  let countdown = 5;

  let scoresHtml = '';
  if (scores && scores.length > 0) {
    // Sort scores descending by round score, then total score
    const sortedScores = [...scores].sort((a, b) => b.score - a.score || b.totalScore - a.totalScore);
    
    scoresHtml = `
      <div class="round-end-scores">
        <h3 class="round-end-scores-title">Points this round</h3>
        <ul class="round-end-scores-list">
          ${sortedScores.map(s => `
            <li class="round-end-score-item ${s.score > 0 ? 'positive-score' : ''}">
              <span class="round-end-score-name">${s.username}</span>
              <span class="round-end-score-points">+${s.score || 0}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'round-end-overlay';
  overlayEl.innerHTML = `
    <div class="round-end-card glass">
      <div class="round-end-emoji">⏰</div>
      <h2 class="round-end-title">Round Over!</h2>
      <div class="round-end-word gradient-text">${word}</div>
      ${scoresHtml}
      <div class="round-end-countdown">Next round in <strong id="round-end-timer">${countdown}</strong>s</div>
    </div>
  `;

  document.body.appendChild(overlayEl);
  spawnConfetti();

  const timerEl = document.getElementById('round-end-timer');
  countdownInterval = setInterval(() => {
    countdown--;
    if (timerEl) timerEl.textContent = countdown;
    if (countdown <= 0) {
      hideRoundEnd();
    }
  }, 1000);
}

export function hideRoundEnd() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  removeConfetti();
}

/* ── Confetti ── */
const CONFETTI_COLORS = ['#ff6b9d', '#c471f5', '#6dd5fa', '#56ffa4', '#ffd166', '#ff8a5c', '#f093fb'];

function spawnConfetti() {
  removeConfetti();
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.id = 'confetti-container';

  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const size = 6 + Math.random() * 8;
    const shape = Math.random() > 0.5 ? '50%' : '2px';

    piece.style.cssText = `
      left: ${left}%;
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: ${shape};
      animation-delay: ${delay}s;
      animation-duration: ${2 + Math.random() * 2}s;
    `;
    container.appendChild(piece);
  }

  document.body.appendChild(container);
}

function removeConfetti() {
  const existing = document.getElementById('confetti-container');
  if (existing) existing.remove();
}
