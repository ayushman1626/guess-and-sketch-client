/* ============================================
   WEBSOCKET — STOMP/SockJS Connection Manager
   ============================================ */
import SockJS from 'sockjs-client/dist/sockjs.min.js';
import { Client } from '@stomp/stompjs';
import { events, EVT } from './events.js';
import { gameState } from './state.js';

// Read WS URL from environment variables, fallback to localhost for local dev
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080/ws';

let stompClient = null;
let roomSubscriptions = [];

/* ── Connect ── */
export function connect() {
  return new Promise((resolve, reject) => {
    stompClient = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 3000,
      debug: () => { },  // silence debug logs
      onConnect: () => {
        console.log('[WS] Connected');
        gameState.set({ connected: true });
        subscribeToUserQueues();
        events.emit(EVT.CONNECTED);
        resolve();
      },
      onDisconnect: () => {
        console.log('[WS] Disconnected');
        gameState.set({ connected: false });
        events.emit(EVT.DISCONNECTED);
      },
      onStompError: (frame) => {
        console.error('[WS] STOMP error:', frame);
        reject(frame);
      },
    });

    stompClient.activate();
  });
}

/* ── Disconnect ── */
export function disconnect() {
  if (stompClient) {
    stompClient.deactivate();
    stompClient = null;
  }
  unsubscribeRoom();
}

/* ── Private queues ── */
function subscribeToUserQueues() {
  // Room created response
  stompClient.subscribe('/user/queue/room-created', (msg) => {
    const roomId = msg.body.replace(/"/g, ''); // plain string
    console.log('[WS] Room created:', roomId);
    events.emit(EVT.ROOM_CREATED, roomId);
  });

  // Word options (auto-sent at round start, wrapped in GameEvent)
  stompClient.subscribe('/user/queue/word-options', (msg) => {
    try {
      let words;
      let data;
      try {
        data = JSON.parse(msg.body);
      } catch(e) {
        // If it's a plain comma-separated string instead of json
        if (msg.body && msg.body.includes(',')) {
          words = msg.body.replace(/"/g, '').split(',').map(w => w.trim());
        }
      }

      if (!words && data) {
        if (Array.isArray(data)) {
          words = data;
        } else if (data.type === 'WORD_OPTIONS') {
          words = Array.isArray(data.payload) ? data.payload : data.payload?.words;
        } else if (data.words) {
          words = data.words;
        }
      }

      if (words && words.length > 0) {
        console.log('[WS] Word options:', words);
        gameState.set({ wordOptions: words });
        events.emit(EVT.WORD_OPTIONS, words);
      }
    } catch (e) {
      console.error('[WS] Error processing word options:', e);
    }
  });

  // Selected Word
  stompClient.subscribe('/user/queue/selected-word', (msg) => {
    try {
      let payload;
      let wordToAssign = null;
      try {
        payload = JSON.parse(msg.body);
      } catch (e) {
        // Plain string fallback
        wordToAssign = msg.body;
      }
      
      if (wordToAssign === null && payload) {
        if (payload.type === 'SELECTED_WORD') {
          wordToAssign = payload.payload;
          if (typeof wordToAssign === 'object' && wordToAssign !== null) {
            wordToAssign = wordToAssign.word || wordToAssign;
          }
        } else if (payload.word) {
          wordToAssign = payload.word;
        } else if (typeof payload === 'string') {
          wordToAssign = payload;
        }
      }

      if (wordToAssign) {
        let finalWord = String(wordToAssign).replace(/"/g, '').trim();
        console.log('[WS] Auto-selected word:', finalWord);
        gameState.set({ currentWord: finalWord });
        events.emit(EVT.WORD_ASSIGNED, finalWord);
      }
    } catch (e) {
      console.error('[WS] Error processing selected word:', e);
    }
  });
}

/* ── Room subscriptions ── */
export function subscribeToRoom(roomId) {
  unsubscribeRoom();

  // Main game events
  const sub1 = stompClient.subscribe(`/topic/room/${roomId}`, (msg) => {
    try {
      const event = JSON.parse(msg.body);
      handleGameEvent(event);
    } catch (e) {
      console.error('[WS] Error parsing game event:', e);
    }
  });

  // Chat messages
  const sub2 = stompClient.subscribe(`/topic/room/${roomId}/chat`, (msg) => {
    try {
      const event = JSON.parse(msg.body);
      if (event.payload) {
        events.emit(EVT.CHAT_MESSAGE, { ...event.payload, fromChat: true });
      }
    } catch (e) {
      console.error('[WS] Error parsing chat:', e);
    }
  });

  // Draw events
  const sub3 = stompClient.subscribe(`/topic/room/${roomId}/draw`, (msg) => {
    try {
      const event = JSON.parse(msg.body);
      if (event.payload) {
        events.emit(EVT.DRAW_EVENT, event.payload);
      }
    } catch (e) {
      console.error('[WS] Error parsing draw event:', e);
    }
  });

  // Score updates
  const sub4 = stompClient.subscribe(`/topic/room/${roomId}/score`, (msg) => {
    try {
      const event = JSON.parse(msg.body);
      if (event.payload) {
        events.emit(EVT.SCORE_UPDATE, event.payload);
      }
    } catch (e) {
      console.error('[WS] Error parsing score update:', e);
    }
  });

  roomSubscriptions = [sub1, sub2, sub3, sub4];
}

function unsubscribeRoom() {
  roomSubscriptions.forEach(sub => {
    try { sub.unsubscribe(); } catch (e) { }
  });
  roomSubscriptions = [];
}

/* ── Handle game events ── */
function handleGameEvent(event) {
  switch (event.type) {
    case 'PLAYER_JOINED':
      events.emit(EVT.PLAYER_JOINED, event.payload);
      break;
    case 'PLAYER_LEFT':
      events.emit(EVT.PLAYER_LEFT, event.payload);
      break;
    case 'GAME_STARTED':
      events.emit(EVT.GAME_STARTED);
      break;
    case 'ROOM_UPDATE':
      // Sync player list into state IMMEDIATELY (before screen mounts)
      if (event.payload && event.payload.players) {
        // Server lists creator first — track host username
        if (event.payload.players.length > 0) {
          gameState.set({ hostUsername: event.payload.players[0].username });
        }
        event.payload.players.forEach(p => {
          gameState.addPlayer(p.username);
          if (p.score !== undefined) {
            gameState.updateScore(p.username, p.score, p.score);
          }
        });
      }
      events.emit(EVT.ROOM_UPDATE, event.payload);
      break;
    case 'ROUND_STARTED':
      // Store drawer in state immediately so game screen can read it on mount
      gameState.setDrawer(event.payload);
      gameState.set({ gameState: 'WORD_SELECTION' });
      events.emit(EVT.ROUND_STARTED, event.payload);
      break;
    case 'WORD_SELECTED':
      events.emit(EVT.WORD_SELECTED, event.payload);
      break;
    case 'PLAYER_GUESSED':
      events.emit(EVT.PLAYER_GUESSED, event.payload);
      break;
    case 'ROUND_ENDED':
      events.emit(EVT.ROUND_ENDED, event.payload);
      break;
    case 'ROUND_SCORES':
      events.emit(EVT.ROUND_SCORES, event.payload);
      break;
    case 'CHAT_MESSAGE':
      // Wrong guesses come on the main room topic
      if (event.payload) {
        events.emit(EVT.CHAT_MESSAGE, { ...event.payload, fromGuess: true });
      }
      break;
    case 'GAME_STOP':
      // If GAME_ENDED already fired and we are showing the game over screen, ignore GAME_STOP.
      if (gameState.get().gameState === 'GAME_OVER') break;
      // Server says game must stop (not enough players)
      if (event.payload) {
        // Sync player list from payload
        if (event.payload.players) {
          // Clear existing players and rebuild from server data
          const currentPlayers = gameState.get().players;
          // Remove players no longer in the server list
          currentPlayers.forEach(p => {
            if (!event.payload.players.find(sp => sp.username === p.username)) {
              gameState.removePlayer(p.username);
            }
          });
          // Add/update players from server
          event.payload.players.forEach(p => {
            gameState.addPlayer(p.username);
            if (p.score !== undefined) {
              gameState.updateScore(p.username, p.score, p.score);
            }
          });
        }
      }
      gameState.set({ gameState: 'WAITING', gameStarted: false, wordOptions: [] });
      events.emit(EVT.GAME_STOP, event.payload);
      break;
    case 'GAME_ENDED':
      gameState.set({ gameState: 'GAME_OVER', gameStarted: false, wordOptions: [] });
      events.emit(EVT.GAME_ENDED, event.payload);
      break;
    default:
      console.log('[WS] Unknown event type:', event.type);
  }
}

/* ── Send Actions ── */
export function createRoom(username) {
  stompClient.publish({
    destination: '/app/createRoom',
    body: JSON.stringify({ username }),
  });
}

export function joinRoom(roomId, username) {
  stompClient.publish({
    destination: '/app/joinRoom',
    body: JSON.stringify({ roomId, username }),
  });
}

export function startGame() {
  stompClient.publish({
    destination: '/app/startGame',
    body: JSON.stringify({}),
  });
}

export function selectWord(word) {
  stompClient.publish({
    destination: '/app/selectWord',
    body: JSON.stringify({ word }),
  });
}

export function sendDraw(prevX, prevY, currentX, currentY, color) {
  stompClient.publish({
    destination: '/app/draw',
    body: JSON.stringify({ prevX, prevY, currentX, currentY, color }),
  });
}

export function sendGuess(message) {
  stompClient.publish({
    destination: '/app/guess',
    body: JSON.stringify({ message }),
  });
}

export function sendChat(message) {
  stompClient.publish({
    destination: '/app/chat',
    body: JSON.stringify({ message }),
  });
}

export function requestWords() {
  stompClient.publish({
    destination: '/app/requestWords',
    body: JSON.stringify({}),
  });
}

export function isConnected() {
  return stompClient?.connected ?? false;
}
