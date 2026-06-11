# DEVLOG

---

## 2026-06-11 — Polish: Mongoose deprecation fix

### What was built

- Fixed Mongoose `findOneAndUpdate` deprecation warning in `server/routes/rooms.js`

### Files touched

```text
server/routes/rooms.js
```

### Key decisions and why

- **`new: true` → `returnDocument: 'after'`** — Mongoose 7+ deprecated the `new` option in favour of `returnDocument`, which maps directly to the MongoDB driver option. The behaviour is identical: return the document as it exists after the update is applied. The fix is a one-line swap with no logic change.

### How to test manually

```bash
npm run dev
# Start the server — the warning should no longer appear in the console
```

---

## 2026-06-11 — Phase 4 (revised): Rooms + Invite Links

### What was built

- `server/models/Room.js` — Room schema: name, UUID invite code, createdBy, members array
- `server/models/Message.js` — updated field `conversationId → roomId`
- `server/routes/rooms.js` — `POST /api/rooms` (create), `GET /api/rooms` (list), `GET /api/rooms/join?code=` (preview), `POST /api/rooms/join` (join via code), `GET /api/rooms/:id` (details + members), `GET /api/rooms/:id/messages` (history)
- `server/ws/handler.js` — routes `message` type to rooms; validates membership; persists then delivers
- `server/index.js` — wired room routes; removed conversation routes
- `public/join.html` + `public/join.js` — invite link landing page: previews room name + member count, requires login (saves `pending_join` to localStorage if not authenticated), joins then redirects to `chat.html?room=<id>`
- `public/app.js` — after login/register, checks `pending_join` and bounces back to join page if set
- `public/chat.html` — rooms sidebar with "# room" list + "+ New" button + Members panel; Create Room modal; chat area with "Copy invite link" button in header
- `public/chat.js` — full rooms model: load rooms on WS open, create room modal, open room (loads members + history in parallel), copy invite link to clipboard, presence-powered member online indicators, auto-open `?room=` URL param then clean URL
- `public/style.css` — styles for room list, new-room button, modal backdrop, offline dot variant, copy-link button, join page icon
- Deleted `server/models/Conversation.js` and `server/routes/conversations.js` (superseded)

### Files touched

```text
server/models/Room.js           (new)
server/models/Message.js        (roomId field)
server/routes/rooms.js          (new)
server/ws/handler.js
server/index.js
public/join.html                (new)
public/join.js                  (new)
public/app.js
public/chat.html
public/chat.js
public/style.css
docs/API.md
docs/DEVLOG.md
```

### Key decisions and why

- **UUID invite code on Room model** — `crypto.randomUUID()` is built into Node 18+, no extra dep. Unique index ensures no collisions. The code travels only in invite links, never in the UI, so it's safe to leave in the Room document for all members to read and share.
- **Join preview page (`join.html`)** — lets the user see what they're joining before committing; also handles the unauthenticated redirect gracefully via `pending_join` in localStorage.
- **`pending_join` in localStorage** — survives the login redirect. `app.js` checks it after every successful auth and sends the user back to the join page, so the flow isn't broken for new users who haven't registered yet.
- **`?room=<id>` on `chat.html`** — after joining, the redirect carries the room id so the app can open the room immediately. `history.replaceState` cleans the URL so refreshing doesn't re-trigger the open.
- **Presence stays global, used locally** — the WS still broadcasts the full online user list on every connect/disconnect. `chat.js` stores it as `state.onlineUserIds` (a Set) and uses it to render online indicators in the active room's member list. No room-scoped presence protocol needed.
- **Members loaded via `GET /api/rooms/:id`** — uses `.populate('members', 'username')` so the member panel shows usernames without a second request.
- **Global online list removed** — users don't need to see every registered user; discovery happens through invite links only.

### How to test manually

```bash
npm run dev
# 1. Register user A → land on chat.html → "+ New" → create a room → click "Copy invite link"
# 2. Open the copied link in an incognito tab → prompted to log in/register as user B → land on join.html → "Join Room" → redirected into the room
# 3. Both tabs should see each other in the Members panel (green dot = online)
# 4. Send messages from either tab — they appear in real time on both sides
# 5. Close user B's tab → user B's dot turns grey in user A's members panel
# 6. Try accessing the join link without being logged in → redirected to login → after login, lands back on join.html
```

---

## 2026-06-11 — Phase 3: Sockets + Presence

### What was built

- `server/ws/registry.js` — in-memory presence registry: `Map<userId, Set<WebSocket>>` with `add`, `remove`, `onlineUsers`, `broadcast`
- `server/ws/handler.js` — WebSocket connection handler: extracts + verifies JWT from `?token=` query param, registers presence, handles `ping`→`pong`, cleans up and re-broadcasts on close
- `server/index.js` — wired `handleConnection` in place of the Phase 2 placeholder
- `public/chat.html` — updated sidebar: ONLINE section (with live count badge) + CONVERSATIONS placeholder for Phase 4; empty-state chat main area
- `public/chat.js` — opens `ws[s]://host?token=<jwt>`, handles `presence` events, renders online user list with green dots, pings every 30 s, reconnects with exponential backoff on drop, redirects to `auth.html` on code 4001
- `public/style.css` — styles for `.sidebar-section`, `.online-list`, `.online-user`, `.presence-dot`, `.chat-empty`

### Files touched

```text
server/index.js
server/ws/registry.js
server/ws/handler.js
public/chat.html
public/chat.js
public/style.css
docs/DEVLOG.md
```

### Key decisions and why

- **JWT in query param, not header** — WebSocket upgrade is a plain HTTP GET; the browser's `WebSocket` API cannot set custom headers, so the token must travel in the URL. The handler parses `req.url` via `new URL()` after the connection is established.
- **Close code 4001 for auth failure** — closing with a specific code lets the client distinguish "bad token → redirect to login" from "network drop → reconnect". Codes 4000–4999 are reserved for application use.
- **`socket.username` attached on connect** — avoids a DB lookup every time we need to build the presence list; the registry only stores socket references.
- **Presence broadcast on every join/leave** — sends the full user list rather than a diff, which keeps the client logic trivial: just replace the array and re-render.
- **Exponential backoff on reconnect** — doubles the delay (1 s → 2 s → 4 s … capped at 30 s) to avoid hammering the server after a restart.
- **Ping every 30 s** — keeps the connection alive through NAT/proxies that close idle TCP connections.

### How to test manually

```bash
npm run dev
# 1. Open http://localhost:3000, register/login → land on chat.html
# 2. See your username in the ONLINE list with a green dot and count badge "1"
# 3. Open a second browser tab and log in as a different user
#    → count becomes "2", both users appear in each tab's list
# 4. Close one tab → count drops back to "1" in the remaining tab
# 5. Log out → redirected to homepage; other tab's list updates
```

---

## 2026-06-11 — Phase 2: Login UI

### What was built

- `public/index.html` — auth page with login/register form (single HTML, toggled by JS)
- `public/chat.html` — chat shell with sidebar (username + logout) and empty main area
- `public/app.js` — auth logic: calls `/api/login` or `/api/register`, stores `token/userId/username` in `localStorage`, then redirects to `chat.html`; auto-redirects to `chat.html` if already logged in
- `public/chat.js` — guards `chat.html`; redirects back to `index.html` if no token; renders username in sidebar; handles logout (clears `localStorage`)
- `public/style.css` — dark-theme styles for auth card and chat layout (CSS custom properties, no framework)

### Files touched

```text
public/index.html
public/chat.html
public/app.js
public/chat.js
public/style.css
docs/DEVLOG.md
```

### Key decisions and why

- **Register then auto-login** — after a successful registration the client immediately calls `/api/login` so the user lands directly in chat without an extra step; avoids a second form submission.
- **`localStorage` for token** — simple and accessible from both REST and future WebSocket code; acceptable for a learning project (a production app might prefer `httpOnly` cookies).
- **`window.location.replace` instead of `href`** — removes the auth page from browser history so Back doesn't return to the login screen after login.
- **Single `index.html` for login + register** — toggling DOM text is simpler than two pages; reduces duplication.
- **No framework** — keeps to the architecture decision in CLAUDE.md.

### How to test manually

```bash
npm run dev
# Open http://localhost:3000
# 1. Register a new account — should land on chat.html
# 2. Log out — should return to index.html
# 3. Log back in with same credentials
# 4. Navigate directly to http://localhost:3000/chat.html without a token — should redirect to index.html
# 5. Navigate directly to http://localhost:3000 while logged in — should redirect to chat.html
```

---

## 2026-06-11 — Phase 1: Auth + REST skeleton

### What was built

- Project scaffolded with `npm init`; dependencies: `express`, `ws`, `mongoose`, `bcrypt`, `jsonwebtoken`, `dotenv`
- Folder structure: `server/` (index.js, db.js, models/, routes/, middleware/, ws/) and `public/`, `docs/`
- `server/db.js` — single Mongoose connection helper
- `server/models/User.js` — username (unique), passwordHash, timestamps
- `server/routes/auth.js` — `POST /api/register` and `POST /api/login`
- `server/middleware/auth.js` — `requireAuth` middleware (JWT Bearer verify, used from Phase 3)
- `server/index.js` — Express + HTTP server + empty WebSocketServer wired together

### Files touched

```text
server/index.js
server/db.js
server/models/User.js
server/routes/auth.js
server/middleware/auth.js
docs/API.md
docs/DEVLOG.md
package.json
.env / .env.example / .gitignore
```

### Key decisions and why

- **bcrypt rounds = 12** — slower than 10 (the common default) but still sub-second on modern hardware; reduces brute-force exposure.
- **Generic 401 on login failure** — "invalid credentials" for both bad username and bad password prevents user-enumeration attacks.
- **JWT payload contains `sub` (userId) + `username`** — avoids an extra DB round-trip to resolve a display name on every authenticated request.
- **JWT expiry = 7 days** — reasonable for a chat app; short enough that a stolen token has bounded damage.
- **Single HTTP server shared by Express and `ws`** — required for Phase 3 so WebSocket upgrades on the same port don't need a reverse-proxy.
- **`--watch` flag for dev** — built into Node 18+, no extra dependency needed.

### How to test manually

See curl commands in README or run:

```bash
# Register
curl -s -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}' | jq

# Login
curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}' | jq
```
