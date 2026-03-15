/* ============================================
   MAIN.JS — Application Entry Point
   ============================================ */
import './styles/global.css';
import './styles/landing.css';
import './styles/lobby.css';
import './styles/game.css';

import { gameState } from './state.js';
import { events, EVT } from './events.js';
import { renderLanding } from './screens/landing.js';
import { renderLobby } from './screens/lobby.js';
import { renderGame } from './screens/game.js';

const app = document.getElementById('app');

let currentCleanup = null;

/* ── Toast System ── */
function initToasts() {
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.id = 'toast-container';
  document.body.appendChild(toastContainer);

  events.on(EVT.SHOW_TOAST, ({ message, type }) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  });
}

/* ── Router ── */
function navigate(screen) {
  // Cleanup previous screen
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  app.innerHTML = '';
  gameState.set({ currentScreen: screen });

  switch (screen) {
    case 'landing':
      currentCleanup = renderLanding(app);
      break;
    case 'lobby':
      currentCleanup = renderLobby(app);
      break;
    case 'game':
      currentCleanup = renderGame(app);
      break;
    default:
      currentCleanup = renderLanding(app);
  }
}

/* ── Init ── */
function init() {
  initToasts();
  events.on(EVT.NAVIGATE, navigate);
  navigate('landing');
}

init();
