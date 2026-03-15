/* ============================================
   WORD SELECT OVERLAY — Drawer picks a word
   ============================================ */
import { selectWord } from '../websocket.js';
import { gameState } from '../state.js';

let overlayEl = null;
let countdownInterval = null;

export function showWordSelect(words) {
  hideWordSelect();

  let countdown = 10;

  overlayEl = document.createElement('div');
  overlayEl.className = 'word-select-overlay';
  overlayEl.innerHTML = `
    <div class="word-select-card glass">
      <h2 class="word-select-title">🎨 Pick a Word!</h2>
      <p class="word-select-subtitle">Choose the word you want to draw</p>
      <div class="word-select-timer" id="word-select-countdown">${countdown}</div>
      <div class="word-options">
        ${words.map(w => `
          <button class="word-option" data-word="${w}">${w}</button>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Word click to select
  overlayEl.querySelectorAll('.word-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = btn.dataset.word;
      gameState.set({ currentWord: word, wordOptions: [] });
      selectWord(word);
      hideWordSelect();
    });
  });

  // Countdown
  const countdownEl = document.getElementById('word-select-countdown');
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      // Server auto-selects, just hide the overlay
      hideWordSelect();
    }
  }, 1000);
}

export function hideWordSelect() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}
