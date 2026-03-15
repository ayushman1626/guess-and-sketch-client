/* ============================================
   TIMER COMPONENT — Circular SVG countdown
   with sound effects & urgency visuals
   ============================================ */
import { gameState } from '../state.js';
import { playTick, playTickUrgent, playTimerWarning, playBuzzer } from '../sounds.js';

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let timerInterval = null;
let warningPlayed = false;

export function createTimer(parentEl) {
  const container = document.createElement('div');
  container.className = 'timer-container';
  container.id = 'timer-container';
  container.innerHTML = `
    <svg class="timer-svg" viewBox="0 0 48 48">
      <circle class="timer-bg" cx="24" cy="24" r="${RADIUS}" />
      <circle class="timer-progress" id="timer-arc"
              cx="24" cy="24" r="${RADIUS}"
              stroke-dasharray="${CIRCUMFERENCE}"
              stroke-dashoffset="0"
              stroke="var(--accent-green)" />
    </svg>
    <div class="timer-text" id="timer-text">60</div>
  `;
  parentEl.appendChild(container);
  return container;
}

export function startTimer(durationSec = 60) {
  stopTimer();
  warningPlayed = false;
  let remaining = durationSec;
  gameState.set({ timer: remaining });
  updateTimerUI(remaining, durationSec);

  timerInterval = setInterval(() => {
    remaining--;
    if (remaining < 0) remaining = 0;
    gameState.set({ timer: remaining });
    updateTimerUI(remaining, durationSec);

    // ── Sound effects ──
    if (remaining <= 10 && remaining > 0) {
      playTickUrgent();
    } else if (remaining <= 20 && remaining > 10) {
      if (remaining % 2 === 0) playTick();
    }

    // Warning sound at 15 seconds
    if (remaining === 15 && !warningPlayed) {
      playTimerWarning();
      warningPlayed = true;
    }

    // Buzzer at 0
    if (remaining === 0) {
      playBuzzer();
      stopTimer();
    }
  }, 1000);
}

export function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerUI(remaining, total) {
  const arc = document.getElementById('timer-arc');
  const text = document.getElementById('timer-text');
  const container = document.getElementById('timer-container');
  if (!arc || !text) return;

  const progress = remaining / total;
  const offset = CIRCUMFERENCE * (1 - progress);
  arc.style.strokeDashoffset = offset;

  text.textContent = remaining;

  // ── Color & urgency transitions ──
  if (progress > 0.5) {
    arc.style.stroke = 'var(--accent-green)';
    text.style.color = 'var(--accent-green)';
    text.style.animation = '';
    container?.classList.remove('timer-urgent', 'timer-critical');
  } else if (progress > 0.25) {
    arc.style.stroke = 'var(--accent-yellow)';
    text.style.color = 'var(--accent-yellow)';
    text.style.animation = '';
    container?.classList.remove('timer-critical');
    container?.classList.add('timer-urgent');
  } else {
    arc.style.stroke = 'var(--accent-red)';
    text.style.color = 'var(--accent-red)';
    container?.classList.remove('timer-urgent');
    container?.classList.add('timer-critical');

    if (remaining <= 10) {
      text.style.animation = 'pulse 0.5s infinite';
    }
    if (remaining <= 5) {
      text.style.animation = 'timerShake 0.3s infinite';
    }
  }
}

export function resetTimerUI() {
  const arc = document.getElementById('timer-arc');
  const text = document.getElementById('timer-text');
  const container = document.getElementById('timer-container');
  if (arc) {
    arc.style.strokeDashoffset = 0;
    arc.style.stroke = 'var(--accent-green)';
  }
  if (text) {
    text.textContent = '60';
    text.style.color = 'var(--accent-green)';
    text.style.animation = '';
  }
  container?.classList.remove('timer-urgent', 'timer-critical');
}
