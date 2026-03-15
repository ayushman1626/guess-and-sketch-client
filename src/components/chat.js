/* ============================================
   CHAT COMPONENT
   ============================================ */
import { gameState } from '../state.js';
import { sendGuess, sendChat } from '../websocket.js';
import { events, EVT } from '../events.js';

let messagesEl, inputEl;
let cleanupFns = [];

export function createChat(parentEl) {
  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-title">💬 Chat</div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <input
        type="text"
        class="input"
        id="chat-input"
        placeholder="Type your guess..."
        maxlength="100"
        autocomplete="off"
      />
      <button class="chat-send-btn" id="chat-send-btn">➤</button>
    </div>
  `;
  parentEl.appendChild(panel);

  messagesEl = document.getElementById('chat-messages');
  inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  // ── Send message ──
  const handleSend = () => {
    const text = inputEl.value.trim();
    if (!text) return;

    const state = gameState.get();

    if (state.gameState === 'DRAWING' && !state.isDrawer) {
      // Send as guess
      sendGuess(text);
    } else {
      // Send as chat
      sendChat(text);
    }

    inputEl.value = '';
    inputEl.focus();
  };

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  // ── Event listeners ──
  const offChat = events.on(EVT.CHAT_MESSAGE, (data) => {
    gameState.addChatMessage(data.sender, data.message, 'chat');
    renderMessages();
  });

  const offGuessed = events.on(EVT.PLAYER_GUESSED, (username) => {
    gameState.addChatMessage(null, `🎉 ${username} guessed the word!`, 'correct');
    gameState.markGuessed(username);
    renderMessages();
  });

  const offJoined = events.on(EVT.PLAYER_JOINED, (username) => {
    gameState.addChatMessage(null, `${username} joined the game`, 'system');
    renderMessages();
  });

  const offLeft = events.on(EVT.PLAYER_LEFT, (username) => {
    gameState.addChatMessage(null, `${username} left the game`, 'system');
    renderMessages();
  });

  const offRoundStarted = events.on(EVT.ROUND_STARTED, (drawer) => {
    gameState.addChatMessage(null, `🎨 ${drawer} is drawing now!`, 'system');
    renderMessages();
    updateInputPlaceholder();
  });

  const offRoundEnded = events.on(EVT.ROUND_ENDED, () => {
    updateInputPlaceholder();
  });

  const offWordSelected = events.on(EVT.WORD_SELECTED, () => {
    updateInputPlaceholder();
  });

  cleanupFns = [offChat, offGuessed, offJoined, offLeft, offRoundStarted, offRoundEnded, offWordSelected];

  updateInputPlaceholder();
  renderMessages();

  return panel;
}

function renderMessages() {
  if (!messagesEl) return;
  const state = gameState.get();

  messagesEl.innerHTML = state.chatMessages.map(msg => {
    if (msg.type === 'system') {
      return `<div class="chat-msg system">${msg.message}</div>`;
    }
    if (msg.type === 'correct') {
      return `<div class="chat-msg correct-guess">${msg.message}</div>`;
    }
    return `
      <div class="chat-msg">
        <span class="chat-msg-sender" style="color: ${gameState.getAvatarColor(msg.sender)?.replace('linear-gradient(135deg, ', '').split(',')[0] || 'var(--accent-purple)'}">${msg.sender}:</span>
        <span>${escapeHtml(msg.message)}</span>
      </div>
    `;
  }).join('');

  // Auto-scroll
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateInputPlaceholder() {
  if (!inputEl) return;
  const state = gameState.get();

  if (state.isDrawer) {
    inputEl.placeholder = 'You are drawing! 🎨';
    inputEl.disabled = true;
  } else if (state.gameState === 'DRAWING') {
    inputEl.placeholder = 'Type your guess...';
    inputEl.disabled = false;
  } else {
    inputEl.placeholder = 'Type a message...';
    inputEl.disabled = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function destroyChat() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  messagesEl = null;
  inputEl = null;
}
