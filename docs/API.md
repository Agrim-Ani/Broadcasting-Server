# API Reference

Base URL: `http://localhost:3000`

## Authentication

### POST /api/register

Create a new user account.

#### Body

| Field    | Type   | Required | Notes                    |
|----------|--------|----------|--------------------------|
| username | string | yes      | must be unique           |
| password | string | yes      | min 6 characters         |

#### Responses

| Status | Body                                  | Meaning                             |
|--------|---------------------------------------|-------------------------------------|
| 201    | `{ userId, username }`                | Account created                     |
| 400    | `{ error }`                           | Missing fields / too short password |
| 409    | `{ error: "username already taken" }` | Duplicate username                  |

---

### POST /api/login

Authenticate and receive a JWT.

#### Body

| Field    | Type   | Required |
|----------|--------|----------|
| username | string | yes      |
| password | string | yes      |

#### Responses

| Status | Body                               | Meaning             |
|--------|------------------------------------|---------------------|
| 200    | `{ token, userId, username }`      | Login successful    |
| 400    | `{ error }`                        | Missing fields      |
| 401    | `{ error: "invalid credentials" }` | Wrong user/password |

The `token` is a JWT (7-day expiry). Pass it on protected REST endpoints as:

```http
Authorization: Bearer <token>
```

For WebSocket connections, pass it as a query param:

```http
ws://localhost:3000?token=<token>
```

---

## Rooms

All routes require `Authorization: Bearer <token>`.
Non-members are blocked from reading room data or messages.

### POST /api/rooms

Create a new room. The creator is automatically added as the first member.

#### Body

| Field | Type   | Required | Notes               |
|-------|--------|----------|---------------------|
| name  | string | yes      | max 100 characters  |

#### Responses

| Status | Body               | Meaning        |
|--------|--------------------|----------------|
| 201    | Room object        | Room created   |
| 400    | `{ error }`        | Missing name   |

#### Room object

```json
{
  "_id": "...",
  "name": "Design team",
  "inviteCode": "550e8400-e29b-41d4-a716-446655440000",
  "createdBy": "<userId>",
  "members": ["<userId>", "..."],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### GET /api/rooms

List all rooms the current user is a member of, sorted by most recently active.

#### Responses

| Status | Body              | Meaning         |
|--------|-------------------|-----------------|
| 200    | Array of Room objects | Newest first |

---

### GET /api/rooms/join?code=\<inviteCode\>

Preview a room without joining — used on the join page to show the room name
and member count before committing.

#### Query params

| Param | Type   | Notes              |
|-------|--------|--------------------|
| code  | string | UUID invite code   |

#### Responses

| Status | Body                                 | Meaning                 |
|--------|--------------------------------------|-------------------------|
| 200    | `{ _id, name, memberCount }`         | Room preview            |
| 400    | `{ error }`                          | Missing code            |
| 404    | `{ error: "invalid invite code" }`   | Code not found          |

---

### POST /api/rooms/join

Join a room via invite code. Idempotent — calling it for a room you are already
a member of returns the room unchanged.

#### Body

| Field | Type   | Required | Notes              |
|-------|--------|----------|--------------------|
| code  | string | yes      | UUID invite code   |

#### Responses

| Status | Body                               | Meaning               |
|--------|------------------------------------|-----------------------|
| 200    | Room object                        | Joined (or already in)|
| 400    | `{ error }`                        | Missing code          |
| 404    | `{ error: "invalid invite code" }` | Code not found        |

---

### GET /api/rooms/:id

Full room details including the populated member list. Current user must be a
member.

#### Responses

| Status | Body                           | Meaning                         |
|--------|--------------------------------|---------------------------------|
| 200    | Room object with members array | Members include `{ _id, username }` |
| 404    | `{ error }`                    | Room not found or not a member  |

---

### GET /api/rooms/:id/messages

Last 50 messages for a room, oldest first. Current user must be a member.
Supports cursor-based pagination for loading history.

#### Query params

| Param  | Type   | Notes                                                   |
|--------|--------|---------------------------------------------------------|
| before | string | Optional message `_id` — returns messages before this  |
| limit  | number | Max 100, default 50                                     |

#### Responses

| Status | Body                     | Meaning                         |
|--------|--------------------------|---------------------------------|
| 200    | Array of Message objects | Oldest-first                    |
| 404    | `{ error }`              | Room not found or not a member  |

#### Message object

```json
{
  "_id": "...",
  "roomId": "...",
  "senderId": "...",
  "senderUsername": "alice",
  "text": "hello",
  "createdAt": "..."
}
```

---

## WebSocket Messages

Connect with: `ws://localhost:3000?token=<jwt>`

### Server → Client

| `type`      | Payload fields                                                     | Meaning                              |
|-------------|--------------------------------------------------------------------|--------------------------------------|
| `connected` | `userId`, `username`                                               | Auth succeeded; sent once on open    |
| `presence`  | `users: [{ userId, username }]`                                    | Full online user list (join / leave) |
| `pong`      | —                                                                  | Response to client `ping`            |
| `message`   | `roomId`, `messageId`, `senderId`, `senderUsername`, `text`, `createdAt` | New message delivered to a member |

### Client → Server

| `type`    | Payload fields      | Meaning                               |
|-----------|---------------------|---------------------------------------|
| `ping`    | —                   | Keepalive; server replies with `pong` |
| `message` | `roomId`, `text`    | Send a message to a room              |

Close code `4001` means the JWT was rejected — the client should redirect to login.
