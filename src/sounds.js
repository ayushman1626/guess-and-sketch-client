/* ============================================
   SOUNDS — Web Audio API sound effects
   ============================================ */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/* ── Generic tone ── */
function playTone(freq, duration = 0.15, type = 'sine', volume = 0.3) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Silently ignore audio errors
  }
}

/* ── Sound effects ── */

export function playTick() {
  playTone(800, 0.06, 'square', 0.08);
}

export function playTickUrgent() {
  playTone(1000, 0.1, 'square', 0.15);
}

export function playTimerWarning() {
  playTone(600, 0.2, 'sawtooth', 0.12);
  setTimeout(() => playTone(700, 0.2, 'sawtooth', 0.12), 120);
}

export function playCorrectGuess() {
  playTone(523, 0.12, 'sine', 0.25);
  setTimeout(() => playTone(659, 0.12, 'sine', 0.25), 100);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.25), 200);
}

export function playWordSelect() {
  playTone(440, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(660, 0.1, 'sine', 0.2), 80);
  setTimeout(() => playTone(880, 0.15, 'sine', 0.2), 160);
}

export function playRoundEnd() {
  playTone(400, 0.3, 'triangle', 0.2);
  setTimeout(() => playTone(350, 0.3, 'triangle', 0.15), 200);
  setTimeout(() => playTone(300, 0.4, 'triangle', 0.1), 400);
}

export function playGameStart() {
  playTone(440, 0.15, 'sine', 0.2);
  setTimeout(() => playTone(550, 0.15, 'sine', 0.2), 120);
  setTimeout(() => playTone(660, 0.15, 'sine', 0.2), 240);
  setTimeout(() => playTone(880, 0.25, 'sine', 0.25), 360);
}

export function playPlayerJoin() {
  playTone(600, 0.1, 'sine', 0.15);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.15), 80);
}

export function playPlayerLeave() {
  playTone(500, 0.15, 'sine', 0.1);
  setTimeout(() => playTone(350, 0.2, 'sine', 0.1), 100);
}

export function playBuzzer() {
  playTone(200, 0.5, 'sawtooth', 0.15);
  setTimeout(() => playTone(180, 0.5, 'sawtooth', 0.1), 100);
}

export function playGameStop() {
  playTone(500, 0.2, 'triangle', 0.2);
  setTimeout(() => playTone(400, 0.2, 'triangle', 0.15), 150);
  setTimeout(() => playTone(300, 0.3, 'triangle', 0.12), 300);
  setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.1), 450);
}
