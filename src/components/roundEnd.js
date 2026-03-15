/* ============================================
   ROUND END OVERLAY — Word reveal + confetti
   ============================================ */

let overlayEl = null;
let countdownInterval = null;

export function showRoundEnd(message) {
  hideRoundEnd();

  // Extract word from "Round ended! The word was: <word>"
  const wordMatch = message.match(/The word was: (.+)/i);
  const word = wordMatch ? wordMatch[1] : '???';

  let countdown = 5;

  overlayEl = document.createElement('div');
  overlayEl.className = 'round-end-overlay';
  overlayEl.innerHTML = `
    <div class="round-end-card glass">
      <div class="round-end-emoji">⏰</div>
      <h2 class="round-end-title">Round Over!</h2>
      <div class="round-end-word gradient-text">${word}</div>
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
