/* ============================================
   EVENT EMITTER — Simple pub/sub for decoupling
   ============================================ */

class EventEmitter {
  constructor() {
    this._handlers = {};
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== handler);
  }

  emit(event, data) {
    if (!this._handlers[event]) return;
    this._handlers[event].forEach(h => {
      try { h(data); } catch (e) { console.error(`Event handler error [${event}]:`, e); }
    });
  }

  once(event, handler) {
    const wrapper = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

export const events = new EventEmitter();

/* Event names */
export const EVT = {
  // Connection
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',

  // Room
  ROOM_CREATED: 'roomCreated',
  ROOM_UPDATE: 'roomUpdate',
  PLAYER_JOINED: 'playerJoined',
  PLAYER_LEFT: 'playerLeft',

  // Game flow
  GAME_STARTED: 'gameStarted',
  GAME_STOP: 'gameStop',
  GAME_ENDED: 'gameEnded',
  ROUND_STARTED: 'roundStarted',
  WORD_OPTIONS: 'wordOptions',
  WORD_SELECTED: 'wordSelected',
  WORD_ASSIGNED: 'wordAssigned',
  ROUND_ENDED: 'roundEnded',
  ROUND_SCORES: 'roundScores',

  // Gameplay
  DRAW_EVENT: 'drawEvent',
  CHAT_MESSAGE: 'chatMessage',
  PLAYER_GUESSED: 'playerGuessed',
  SCORE_UPDATE: 'scoreUpdate',

  // UI
  NAVIGATE: 'navigate',
  SHOW_TOAST: 'showToast',
};
