/* ============================================
   GAME STATE — Reactive centralized store
   ============================================ */

const AVATAR_COLORS = [
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #6dd5fa, #2980b9)',
  'linear-gradient(135deg, #56ffa4, #59dfb2)',
  'linear-gradient(135deg, #ffd166, #ff8a5c)',
  'linear-gradient(135deg, #ff6b9d, #ee5a6f)',
  'linear-gradient(135deg, #c471f5, #fa71cd)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
];

function createState() {
  const state = {
    // Connection
    connected: false,

    // User
    username: '',
    sessionId: null,

    // Room
    roomId: null,
    isHost: false,
    hostUsername: null,  // Username of the room creator
    players: [],        // { username, score, isDrawing, hasGuessed, avatarColor }

    // Game
    gameState: 'WAITING', // WAITING | WORD_SELECTION | DRAWING | ROUND_END
    gameStarted: false,

    // Round
    currentDrawer: null,
    isDrawer: false,
    currentWord: null,  // Only set for drawer
    wordHint: '',       // e.g. "_ _ _ _ _" for guessers
    wordOptions: [],    // 3 words for drawer to pick

    // Timer
    timer: 60,
    wordSelectTimer: 10,

    // Chat
    chatMessages: [],   // { sender, message, type: 'chat'|'system'|'correct' }

    // Drawing
    drawEvents: [],     // Accumulated draw events

    // Round end
    roundEndMessage: '',

    // Screen
    currentScreen: 'landing', // landing | lobby | game
  };

  const listeners = new Set();

  return {
    get: () => ({ ...state }),

    set: (updates) => {
      Object.assign(state, updates);
      listeners.forEach(fn => fn(state));
    },

    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ── Player helpers ──
    addPlayer: (username) => {
      if (state.players.find(p => p.username === username)) return;
      state.players.push({
        username,
        score: 0,
        isDrawing: false,
        hasGuessed: false,
        avatarColor: AVATAR_COLORS[state.players.length % AVATAR_COLORS.length],
      });
      listeners.forEach(fn => fn(state));
    },

    removePlayer: (username) => {
      state.players = state.players.filter(p => p.username !== username);
      listeners.forEach(fn => fn(state));
    },

    updateScore: (username, score, totalScore) => {
      const player = state.players.find(p => p.username === username);
      if (player) {
        player.score = totalScore;
      }
      listeners.forEach(fn => fn(state));
    },

    setDrawer: (username) => {
      state.currentDrawer = username;
      state.isDrawer = username === state.username;
      state.players.forEach(p => {
        p.isDrawing = p.username === username;
        p.hasGuessed = false;
      });
      listeners.forEach(fn => fn(state));
    },

    markGuessed: (username) => {
      const player = state.players.find(p => p.username === username);
      if (player) player.hasGuessed = true;
      listeners.forEach(fn => fn(state));
    },

    addChatMessage: (sender, message, type = 'chat') => {
      state.chatMessages.push({ sender, message, type, id: Date.now() + Math.random() });
      if (state.chatMessages.length > 200) {
        state.chatMessages = state.chatMessages.slice(-100);
      }
      listeners.forEach(fn => fn(state));
    },

    getAvatarColor: (username) => {
      const player = state.players.find(p => p.username === username);
      return player?.avatarColor || AVATAR_COLORS[0];
    },

    reset: () => {
      state.roomId = null;
      state.isHost = false;
      state.hostUsername = null;
      state.players = [];
      state.gameState = 'WAITING';
      state.gameStarted = false;
      state.currentDrawer = null;
      state.isDrawer = false;
      state.currentWord = null;
      state.wordHint = '';
      state.wordOptions = [];
      state.timer = 60;
      state.chatMessages = [];
      state.drawEvents = [];
      state.roundEndMessage = '';
      state.currentScreen = 'landing';
      listeners.forEach(fn => fn(state));
    },
  };
}

export const gameState = createState();
export { AVATAR_COLORS };
