# broadcast-server

A real-time chat app built with Node.js, WebSockets, and MongoDB. Started from the [roadmap.sh broadcast server project](https://roadmap.sh/projects/broadcast-server) and extended into a full chat experience with rooms and invite links.

## Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Server   | Node.js + Express                       |
| Realtime | `ws` (WebSocket)                        |
| Database | MongoDB + Mongoose                      |
| Auth     | bcrypt + JWT (7-day expiry)             |
| Frontend | Plain HTML / CSS / JS — no frameworks   |

## Features

- Register and log in with a username and password
- Real-time presence — see who is online as users connect and disconnect
- Create named chat rooms
- Share invite links — anyone with the link can preview and join a room
- Real-time messaging within rooms, with message history on load
- Online indicators per room member (green = online, grey = offline)

## Project structure

```
server/
  index.js            # Express + HTTP + WebSocketServer entry point
  db.js               # Mongoose connect helper
  models/
    User.js           # username, passwordHash, timestamps
    Room.js           # name, UUID invite code, createdBy, members
    Message.js        # roomId, senderId, senderUsername, text
  routes/
    auth.js           # POST /api/register, POST /api/login
    rooms.js          # CRUD + join endpoints for rooms
  middleware/
    auth.js           # requireAuth — JWT Bearer verify for REST routes
  ws/
    registry.js       # In-memory presence Map<userId, Set<WebSocket>>
    handler.js        # WebSocket connection handler + message router
public/               # Static frontend (served by Express)
docs/
  API.md              # REST + WebSocket message reference
  DEVLOG.md           # Build log — one entry per phase
```

## Setup

**Prerequisites:** Node 18+, a running MongoDB instance.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in MONGODB_URI and JWT_SECRET
```

`.env` fields:

| Variable     | Example                              | Notes                        |
|--------------|--------------------------------------|------------------------------|
| PORT         | `3000`                               | Defaults to 3000 if omitted  |
| MONGODB_URI  | `mongodb://localhost:27017/chatapp`  |                              |
| JWT_SECRET   | `change-me-to-a-long-random-string`  | Keep secret                  |

## Running

```bash
npm run dev    # Development — auto-restarts on file changes (Node 18+ --watch)
npm start      # Production
```

Open `http://localhost:3000` in your browser.

## How it works

1. **Auth** — register or log in; the server returns a JWT stored in `localStorage`.
2. **WebSocket** — `chat.html` opens a WS connection with the token as a query param (`?token=...`). The server verifies it and registers the user as online.
3. **Rooms** — create a room and share its invite link. Anyone with the link can preview the room name and member count, then join.
4. **Messaging** — sending a message persists it to MongoDB first, then delivers it over WebSocket to all online members of that room.
5. **Presence** — the server broadcasts the full online user list on every connect/disconnect. The frontend uses this to show green/grey indicators in the active room's member list.

## API

See [docs/API.md](docs/API.md) for the full REST and WebSocket message reference.

## Build phases

| Phase | What was built                                    | Status |
|-------|---------------------------------------------------|--------|
| 1     | Project setup, auth endpoints, JWT middleware     | Done   |
| 2     | Login/register UI, chat shell, auth-guard         | Done   |
| 3     | WebSocket server, presence registry               | Done   |
| 4     | Rooms, invite links, message history              | Done   |
| 5     | Groups (planned)                                  |        |
| 6     | Polish (planned)                                  |        |
