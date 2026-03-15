# Guess & Sketch — Backend API Documentation

> **For Frontend Engineers** · Server: Spring Boot 4.0.3 · Protocol: STOMP over WebSocket (SockJS)

---

## Table of Contents

1. [Connection Setup](#1-connection-setup)
2. [Architecture Overview](#2-architecture-overview)
3. [Game Lifecycle & State Machine](#3-game-lifecycle--state-machine)
4. [Client → Server Messages (Send)](#4-client--server-messages-send)
5. [Server → Client Messages (Subscribe)](#5-server--client-messages-subscribe)
6. [Data Models (DTOs & Payloads)](#6-data-models-dtos--payloads)
7. [Scoring System](#7-scoring-system)
8. [Timers & Auto-Actions](#8-timers--auto-actions)
9. [Disconnect Handling](#9-disconnect-handling)
10. [Complete Integration Example](#10-complete-integration-example)
11. [Quick Reference Cheat Sheet](#11-quick-reference-cheat-sheet)

---

## 1. Connection Setup

### WebSocket Endpoint

| Property            | Value                           |
| ------------------- | ------------------------------- |
| **URL**             | `http://<host>:8080/ws`         |
| **Transport**       | SockJS (fallback to HTTP)       |
| **Protocol**        | STOMP 1.1+                      |
| **CORS**            | All origins allowed (`*`)       |
| **Default Port**    | `8080`                          |

### JavaScript Connection Example

```javascript
import SockJS from "sockjs-client";
import { Stomp } from "@stomp/stompjs";

const socket = new SockJS("http://localhost:8080/ws");
const stompClient = Stomp.over(socket);

stompClient.connect({}, () => {
  console.log("Connected!");
  // Subscribe to user-specific queues immediately
  subscribeToUserQueues(stompClient);
});
```

### STOMP Prefix Reference

| Prefix     | Direction         | Purpose                                                       |
| ---------- | ----------------- | ------------------------------------------------------------- |
| `/app`     | Client → Server   | All messages the client **sends** to the server               |
| `/topic`   | Server → Client   | Broadcast messages to **all subscribers** (room-based)        |
| `/user`    | Server → Client   | **Private** messages to the specific connected user           |
| `/queue`   | Server → Client   | User-specific queue (used with `/user` prefix)                |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Client                         │
│  SockJS + STOMP                                              │
└───────────┬─────────────────────────────────┬───────────────┘
            │  /app/*  (send)                 │  /topic/* & /user/* (subscribe)
            ▼                                 ▲
┌───────────────────────────────────────────────────────────────┐
│  GameController  (@MessageMapping)                            │
│  ├── /joinRoom     → GameService.handelJoinRoom()             │
│  ├── /createRoom   → RoomManager.createRoom()   → reply      │
│  ├── /chat         → GameService.handelChat()                 │
│  ├── /draw         → GameService.handelDraw()                 │
│  ├── /guess        → GameService.handleGuess()                │
│  ├── /requestWords → WordService.getRandomWords()  → reply    │
│  ├── /startGame    → GameService.handelGameStart()            │
│  └── /selectWord   → GameService.handelSelectWord()           │
├───────────────────────────────────────────────────────────────┤
│  Services                                                     │
│  ├── GameService      – Core game logic & broadcasting        │
│  ├── RoomManager      – In-memory room/session CRUD           │
│  ├── WordService      – Random word selection from pool        │
│  └── RoundScheduler   – 1-second ticker for round timeouts    │
├───────────────────────────────────────────────────────────────┤
│  WebSocketEventListener  – Handles disconnects & cleanup      │
└───────────────────────────────────────────────────────────────┘
```

> **Note:** There is **no database**. All state is held in-memory via `ConcurrentHashMap`. Restarting the server clears all rooms.

---

## 3. Game Lifecycle & State Machine

### Room States (`GameState` enum)

| State             | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `WAITING`         | Room created, waiting for host to start the game             |
| `WORD_SELECTION`  | A drawer has been chosen and is picking a word (10 sec max)  |
| `DRAWING`         | Drawer is sketching; guessers are submitting guesses         |
| `ROUND_END`       | Round over — word revealed, 5-second pause before next round |
| `ROUND_START`     | *(Transitional)* Server cycles to next drawer immediately    |

### Lifecycle Flow

```
 [Players join room]
        │
        ▼
    WAITING ──── Host sends /startGame ────►  GAME_STARTED event broadcast
        │                                              │
        │                                              ▼
        │                                     Pick next drawer
        │                                     Send WORD_OPTIONS to drawer (private)
        │                                     Broadcast ROUND_STARTED
        │                                              │
        │                                              ▼
        │                                      WORD_SELECTION
        │                                     (Drawer picks a word, or auto-select at 10s)
        │                                              │
        │                               Drawer sends /selectWord
        │                                              │
        │                                              ▼
        │                                        DRAWING
        │                          (Drawer sends /draw events continuously)
        │                          (Guessers send /guess attempts)
        │                                              │
        │                    ┌─────────────────────────┤
        │                    │                         │
        │           All guessed correctly        Timer expires (60s)
        │                    │                         │
        │                    ▼                         ▼
        │                              ROUND_END
        │                    (Correct word revealed to all)
        │                    (5-second pause)
        │                              │
        │                              ▼
        │                    Next drawer selected → WORD_SELECTION
        │                    (cycle repeats)
        └──────────────────────────────────────────────┘
```

### Key Timing Constants

| Timer                             | Duration  | Behavior                                                |
| --------------------------------- | --------- | ------------------------------------------------------- |
| Round duration                    | **60 sec** | After 60s, round auto-ends                             |
| Word selection timeout            | **10 sec** | If drawer doesn't pick within ~10s, auto-selects        |
| Pause between rounds              | **5 sec**  | After `ROUND_END`, next round starts after 5s           |

---

## 4. Client → Server Messages (Send)

All messages are sent to destinations prefixed with `/app`. The payload must be a valid JSON string.

---

### 4.1 `POST /app/createRoom`

**Purpose:** Create a new game room. Only the creator can later start the game.

**Payload:**
```json
{
  "username": "Alice"
}
```

**Response:** The server replies **privately** to the sender on:  
`/user/queue/room-created` → Plain string body containing the 6-digit room ID (e.g. `"482917"`).

**Side Effects:**
- A new room is created with a random 6-digit ID.
- The creator is automatically added as the first player.

---

### 4.2 `POST /app/joinRoom`

**Purpose:** Join an existing room by its ID.

**Payload:**
```json
{
  "roomId": "482917",
  "username": "Bob"
}
```

**Response:** Broadcasts to `/topic/room/{roomId}`:
```json
{
  "type": "PLAYER_JOINED",
  "payload": "Bob"
}
```

**Constraints:**
- Room must exist (throws error otherwise).
- Room must not be full (max **10 players**). If full, returns `null` silently.

---

### 4.3 `POST /app/startGame`

**Purpose:** Start the game. **Only the room creator** can trigger this.

**Payload:** Empty (`{}`)

**Preconditions:**
- The sender must be the room creator.
- Room must have ≥ 2 players.

**Response:** Broadcasts to `/topic/room/{roomId}`:
```json
{
  "type": "GAME_STARTED",
  "payload": null
}
```

Then immediately triggers the first round (see [Lifecycle Flow](#lifecycle-flow)).

---

### 4.4 `POST /app/selectWord`

**Purpose:** The drawer selects a word from the offered options.

**Payload:**
```json
{
  "word": "elephant"
}
```

**Preconditions:**
- Game state must be `WORD_SELECTION`.
- Sender must be the current drawer.

**Response:** Broadcasts to `/topic/room/{roomId}`:
```json
{
  "type": "WORD_SELECTED",
  "payload": "DrawerUsername"
}
```

> **Note:** The actual word is **NOT** broadcast. Only the drawer's username is sent to indicate that a word was selected.

---

### 4.5 `POST /app/draw`

**Purpose:** Send a drawing stroke from the drawer's canvas.

**Payload:**
```json
{
  "prevX": 100,
  "prevY": 150,
  "currentX": 120,
  "currentY": 160,
  "color": "#000000"
}
```

| Field       | Type     | Description                        |
| ----------- | -------- | ---------------------------------- |
| `prevX`     | `int`    | Starting X coordinate of the stroke |
| `prevY`     | `int`    | Starting Y coordinate of the stroke |
| `currentX`  | `int`    | Ending X coordinate of the stroke   |
| `currentY`  | `int`    | Ending Y coordinate of the stroke   |
| `color`     | `string` | Stroke color (e.g. `"black"`, `"#ff0000"`) |

**Preconditions:**
- Game state must be `DRAWING`.
- Sender must be the current drawer.

**Response:** Broadcasts to `/topic/room/{roomId}/draw`:
```json
{
  "type": "DRAW_EVENT",
  "payload": {
    "prevX": 100,
    "prevY": 150,
    "currentX": 120,
    "currentY": 160,
    "color": "#000000"
  }
}
```

---

### 4.6 `POST /app/guess`

**Purpose:** Submit a word guess (non-drawer players only).

**Payload:**
```json
{
  "message": "elephant"
}
```

**Preconditions:**
- Game state must be `DRAWING`.
- Round timer must not have expired.
- Sender must NOT be the drawer.
- Sender must NOT have already guessed correctly.

**Response (correct guess):** Broadcasts to `/topic/room/{roomId}`:
```json
{
  "type": "PLAYER_GUESSED",
  "payload": "Bob"
}
```
Plus a score update to `/topic/room/{roomId}/score` (see [Scoring System](#7-scoring-system)).

**Response (wrong guess):** Broadcasts to `/topic/room/{roomId}`:
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "sender": "Bob",
    "message": "giraffe"
  }
}
```

> **Important:** Wrong guesses appear as chat messages to all players.

---

### 4.7 `POST /app/chat`

**Purpose:** Send a regular chat message to the room.

**Payload:**
```json
{
  "message": "Hello everyone!"
}
```

> **Note:** The `sender` field is set by the server (based on session), not the client.

**Response:** Broadcasts to `/topic/room/{roomId}/chat`:
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "sender": "Alice",
    "message": "Hello everyone!"
  }
}
```

---

### 4.8 `POST /app/requestWords`

**Purpose:** Manually request word options. *(Note: The server also auto-sends word options to the drawer at round start.)*

**Payload:** Empty (`{}`)

**Response:** Private reply to `/user/queue/word-options`:
```json
{
  "words": ["elephant", "guitar", "sunset"]
}
```

> **Note:** This endpoint returns the raw `WordOptionMessage`, NOT wrapped in a `GameEvent`. However, when the server auto-sends word options at round start, they ARE wrapped in a `GameEvent`:
> ```json
> {
>   "type": "WORD_OPTIONS",
>   "payload": {
>     "words": ["elephant", "guitar", "sunset"]
>   }
> }
> ```

---

## 5. Server → Client Messages (Subscribe)

### 5.1 Subscription Channels

Subscribe to these channels **after joining/creating a room**:

| Channel                               | Scope        | When to Subscribe                     |
| ------------------------------------- | ------------ | ------------------------------------- |
| `/user/queue/room-created`            | Private      | Immediately after connecting          |
| `/user/queue/word-options`            | Private      | Immediately after connecting          |
| `/topic/room/{roomId}`               | Room-wide    | After creating or joining a room      |
| `/topic/room/{roomId}/chat`          | Room-wide    | After creating or joining a room      |
| `/topic/room/{roomId}/draw`          | Room-wide    | After creating or joining a room      |
| `/topic/room/{roomId}/score`         | Room-wide    | After creating or joining a room      |

---

### 5.2 `GameEvent` Envelope Format

Most server → client messages use this wrapper:

```json
{
  "type": "<EventType>",
  "payload": <varies>
}
```

### 5.3 Event Types Reference

| EventType         | Channel                         | Payload Type   | Payload Description                             |
| ----------------- | ------------------------------- | -------------- | ------------------------------------------------ |
| `PLAYER_JOINED`   | `/topic/room/{roomId}`          | `string`       | Username of the player who joined                |
| `PLAYER_LEFT`     | `/topic/room/{roomId}`          | `string`       | Username of the player who disconnected          |
| `GAME_STARTED`    | `/topic/room/{roomId}`          | `null`         | No payload                                       |
| `ROUND_STARTED`   | `/topic/room/{roomId}`          | `string`       | Username of the new drawer                       |
| `WORD_OPTIONS`    | `/user/queue/word-options`      | `object`       | `{ "words": ["w1", "w2", "w3"] }`               |
| `WORD_SELECTED`   | `/topic/room/{roomId}`          | `string`       | Username of the drawer who selected              |
| `DRAW_EVENT`      | `/topic/room/{roomId}/draw`     | `object`       | `DrawEvent` object (see §6)                      |
| `CHAT_MESSAGE`    | `/topic/room/{roomId}/chat` **or** `/topic/room/{roomId}` | `object` | `{ "sender": "...", "message": "..." }` |
| `PLAYER_GUESSED`  | `/topic/room/{roomId}`          | `string`       | Username of the player who guessed correctly     |
| `ROUND_ENDED`     | `/topic/room/{roomId}`          | `string`       | `"Round ended! The word was: <word>"`            |
| `SCORE_UPDATE`    | `/topic/room/{roomId}/score`    | `object`       | `ScoreUpdateRes` object (see §6)                 |

> [!IMPORTANT]
> **`CHAT_MESSAGE` can arrive on two different channels:**
> - Regular chat → `/topic/room/{roomId}/chat`
> - Wrong guesses → `/topic/room/{roomId}` (the main room topic)
>
> Your frontend must handle `CHAT_MESSAGE` events on **both** channels.

---

## 6. Data Models (DTOs & Payloads)

### `GameEvent`
The universal message envelope for all server-broadcast events.
```typescript
interface GameEvent {
  type: EventType;         // e.g. "PLAYER_JOINED", "DRAW_EVENT", etc.
  payload: any;            // Varies by type — see Event Types Reference
}
```

### `ChatMessage`
```typescript
interface ChatMessage {
  sender: string;          // Username (set by server)
  message: string;         // Message content
}
```

### `JoinRoomMessage` (client sends)
```typescript
interface JoinRoomMessage {
  roomId: string;          // 6-digit room ID
  username: string;        // Display name
}
```

### `CreateRoomMessage` (client sends)
```typescript
interface CreateRoomMessage {
  username: string;        // Display name of the room creator
}
```

### `DrawEvent`
```typescript
interface DrawEvent {
  prevX: number;           // Previous X coordinate (int)
  prevY: number;           // Previous Y coordinate (int)
  currentX: number;        // Current X coordinate (int)
  currentY: number;        // Current Y coordinate (int)
  color: string;           // Stroke color
}
```

### `GuessMessage` (client sends)
```typescript
interface GuessMessage {
  message: string;         // The guessed word
}
```

### `SelectWordMessage` (client sends)
```typescript
interface SelectWordMessage {
  word: string;            // The selected word from the options
}
```

### `WordOptionMessage` (server sends)
```typescript
interface WordOptionMessage {
  words: string[];         // Array of 3 word options
}
```

### `ScoreUpdateRes` (server sends)
```typescript
interface ScoreUpdateRes {
  username: string;        // Player who scored
  score: number;           // Points earned this guess
  totalScore: number;      // Cumulative score
}
```

### `Player` (server-side model, for reference)
```typescript
interface Player {
  sessionId: string;       // WebSocket session ID (internal)
  username: string;        // Display name
  score: number;           // Cumulative score (starts at 0)
}
```

### `Room` (server-side model, for reference)
```typescript
interface Room {
  roomId: string;              // 6-digit unique room ID
  players: Player[];           // Up to 10 players
  currentWord: string | null;  // The secret word (null before selection)
  currentDrawerIndex: number;  // Index into players array (-1 = none)
  creatorSessionId: string;    // Only this session can start the game
  state: GameState;            // Current game phase
  correctGuessers: Set<string>;// Session IDs of correct guessers
  drawEvents: DrawEvent[];     // Canvas stroke history
  roundEndTime: number;        // Unix timestamp (ms) when round ends
}
```

---

## 7. Scoring System

### How Scores Are Calculated

Scores are **time-based** — the faster you guess, the more points you earn.

```
guesser_score = 100 × (remaining_time_ms / 60000)
drawer_score  = guesser_score / 2
```

| Scenario              | Guesser Points | Drawer Points |
| --------------------- | -------------- | ------------- |
| Guess at 0s remaining | 0              | 0             |
| Guess at 15s remaining| 25             | 12            |
| Guess at 30s remaining| 50             | 25            |
| Guess at 45s remaining| 75             | 37            |
| Guess at 60s remaining| 100            | 50            |

### Score Update Events

When a player guesses correctly, **two** `SCORE_UPDATE` events are sent to `/topic/room/{roomId}/score`:

1. **Guesser's score update:**
```json
{
  "type": "SCORE_UPDATE",
  "payload": {
    "username": "Bob",
    "score": 75,
    "totalScore": 225
  }
}
```

2. **Drawer's score update:**
```json
{
  "type": "SCORE_UPDATE",
  "payload": {
    "username": "Alice",
    "score": 37,
    "totalScore": 112
  }
}
```

---

## 8. Timers & Auto-Actions

The server runs a `RoundScheduler` that checks all rooms **every 1 second**:

| Condition                                                   | Auto-Action                          |
| ----------------------------------------------------------- | ------------------------------------ |
| State is `DRAWING` or `WORD_SELECTION` and timer expired    | `endRound()` — reveals word, pauses |
| State is `DRAWING` and all non-drawers have guessed         | `endRound()` — early end            |
| State is `WORD_SELECTION` and 10s elapsed without selection | `autoSelectWord()` — random pick    |

> [!NOTE]
> The `roundEndTime` is set to `currentTime + 60000ms` when a round starts. The word selection auto-trigger fires when `currentTime > roundEndTime - 50000` (i.e., ~10 seconds into word selection).

---

## 9. Disconnect Handling

When a player disconnects (WebSocket closes):

1. Player is removed from the room's player list.
2. Session-to-room mapping is cleaned up.
3. A `PLAYER_LEFT` event is broadcast to `/topic/room/{roomId}`.
4. If the room becomes empty, it is automatically deleted.
5. If the **drawer** disconnects, the current round ends immediately and the next round begins.
6. If the drawer index becomes out of bounds, it resets to `0`.

> [!WARNING]
> There is a **minor bug** in the disconnect handler: the `PLAYER_LEFT` broadcast destination is missing a `/` separator (`"/topic/room" + roomId` instead of `"/topic/room/" + roomId`). This means `PLAYER_LEFT` events may not be received unless the server code is patched. Subscribe to `/topic/room{roomId}` (no slash before the ID) as a workaround, or notify the backend developer.

---

## 10. Complete Integration Example

Here's a full reference implementation for connecting a frontend client:

```javascript
import SockJS from "sockjs-client";
import { Stomp } from "@stomp/stompjs";

let stompClient = null;
let currentRoomId = null;

// ─── 1. Connect ───────────────────────────────────
function connect() {
  const socket = new SockJS("http://localhost:8080/ws");
  stompClient = Stomp.over(socket);

  stompClient.connect({}, () => {
    console.log("Connected");

    // Subscribe to private channels immediately
    stompClient.subscribe("/user/queue/room-created", (msg) => {
      currentRoomId = msg.body;
      console.log("Room created:", currentRoomId);
      subscribeToRoom(currentRoomId);
    });

    stompClient.subscribe("/user/queue/word-options", (msg) => {
      const event = JSON.parse(msg.body);
      // event = { type: "WORD_OPTIONS", payload: { words: [...] } }
      const words = event.payload.words;
      showWordOptions(words); // Your UI function
    });
  });
}

// ─── 2. Subscribe to Room Channels ────────────────
function subscribeToRoom(roomId) {

  // Main game events
  stompClient.subscribe(`/topic/room/${roomId}`, (msg) => {
    const event = JSON.parse(msg.body);
    handleGameEvent(event);
  });

  // Chat messages
  stompClient.subscribe(`/topic/room/${roomId}/chat`, (msg) => {
    const event = JSON.parse(msg.body);
    // event.payload = { sender: "...", message: "..." }
    displayChatMessage(event.payload);
  });

  // Draw strokes
  stompClient.subscribe(`/topic/room/${roomId}/draw`, (msg) => {
    const event = JSON.parse(msg.body);
    const d = event.payload;
    drawLineOnCanvas(d.prevX, d.prevY, d.currentX, d.currentY, d.color);
  });

  // Score updates
  stompClient.subscribe(`/topic/room/${roomId}/score`, (msg) => {
    const event = JSON.parse(msg.body);
    updateScoreboard(event.payload); // { username, score, totalScore }
  });
}

// ─── 3. Handle Game Events ────────────────────────
function handleGameEvent(event) {
  switch (event.type) {
    case "PLAYER_JOINED":
      addToPlayerList(event.payload); // payload = username
      break;
    case "PLAYER_LEFT":
      removeFromPlayerList(event.payload);
      break;
    case "GAME_STARTED":
      showGameStartedUI();
      break;
    case "ROUND_STARTED":
      clearCanvas();
      showDrawerName(event.payload); // payload = drawer username
      break;
    case "WORD_SELECTED":
      showDrawingPhaseUI(event.payload); // payload = drawer username
      break;
    case "PLAYER_GUESSED":
      showCorrectGuessNotification(event.payload); // payload = username
      break;
    case "ROUND_ENDED":
      showRoundEndUI(event.payload); // payload = "Round ended! The word was: xyz"
      clearCanvas();
      break;
    case "CHAT_MESSAGE":
      // Wrong guesses also come here on this channel
      displayChatMessage(event.payload);
      break;
  }
}

// ─── 4. Send Actions ─────────────────────────────
function createRoom(username) {
  stompClient.send("/app/createRoom", {}, JSON.stringify({ username }));
}

function joinRoom(roomId, username) {
  stompClient.send("/app/joinRoom", {}, JSON.stringify({ roomId, username }));
  subscribeToRoom(roomId);
}

function startGame() {
  stompClient.send("/app/startGame", {}, JSON.stringify({}));
}

function selectWord(word) {
  stompClient.send("/app/selectWord", {}, JSON.stringify({ word }));
}

function sendDrawStroke(prevX, prevY, currentX, currentY, color) {
  stompClient.send("/app/draw", {}, JSON.stringify({
    prevX, prevY, currentX, currentY, color
  }));
}

function sendGuess(message) {
  stompClient.send("/app/guess", {}, JSON.stringify({ message }));
}

function sendChat(message) {
  stompClient.send("/app/chat", {}, JSON.stringify({ message }));
}

// Start connection
connect();
```

---

## 11. Quick Reference Cheat Sheet

### Client Sends (→ Server)

| Destination           | Payload Fields               | Who Can Send  |
| --------------------- | ---------------------------- | ------------- |
| `/app/createRoom`     | `{ username }`               | Anyone        |
| `/app/joinRoom`       | `{ roomId, username }`       | Anyone        |
| `/app/startGame`      | `{}`                         | Creator only  |
| `/app/selectWord`     | `{ word }`                   | Drawer only   |
| `/app/draw`           | `{ prevX, prevY, currentX, currentY, color }` | Drawer only |
| `/app/guess`          | `{ message }`                | Non-drawers   |
| `/app/chat`           | `{ message }`                | Anyone        |
| `/app/requestWords`   | `{}`                         | Anyone        |

### Client Subscribes (← Server)

| Channel                             | Events Received                                                |
| ----------------------------------- | -------------------------------------------------------------- |
| `/user/queue/room-created`          | Plain text: 6-digit room ID                                   |
| `/user/queue/word-options`          | `GameEvent { WORD_OPTIONS, { words: [...] } }`                 |
| `/topic/room/{id}`                  | `PLAYER_JOINED`, `PLAYER_LEFT`, `GAME_STARTED`, `ROUND_STARTED`, `WORD_SELECTED`, `PLAYER_GUESSED`, `ROUND_ENDED`, `CHAT_MESSAGE` (wrong guesses) |
| `/topic/room/{id}/chat`            | `CHAT_MESSAGE`                                                  |
| `/topic/room/{id}/draw`            | `DRAW_EVENT`                                                    |
| `/topic/room/{id}/score`           | `SCORE_UPDATE`                                                  |

### Game Constants

| Constant              | Value   |
| --------------------- | ------- |
| Max players per room  | 10      |
| Room ID format        | 6-digit numeric string |
| Round duration        | 60 seconds |
| Word selection timeout| ~10 seconds |
| Inter-round pause     | 5 seconds |
| Word options count    | 3       |
| Max guesser score     | 100     |

---

*Documentation generated from source code analysis of `guess-and-sketch-server` v0.0.1-SNAPSHOT.*
