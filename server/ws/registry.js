const { WebSocket } = require('ws');

// In-memory presence: Map<userId, Set<WebSocket>>
// Never persisted — derived entirely from live socket connections.
const registry = new Map();

function add(userId, socket) {
  if (!registry.has(userId)) registry.set(userId, new Set());
  registry.get(userId).add(socket);
}

function remove(userId, socket) {
  const sockets = registry.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) registry.delete(userId);
}

// Returns [{userId, username}] for every user with at least one open socket.
function onlineUsers() {
  const users = [];
  for (const [userId, sockets] of registry) {
    const socket = sockets.values().next().value;
    users.push({ userId, username: socket.username });
  }
  return users;
}

// Send a message to every open socket across all users.
function broadcast(message) {
  const json = JSON.stringify(message);
  for (const sockets of registry.values()) {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(json);
    }
  }
}

// Send a message to all open sockets for a single user (supports multi-tab).
function sendToUser(userId, message) {
  const sockets = registry.get(userId.toString());
  if (!sockets) return;
  const json = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(json);
  }
}

module.exports = { add, remove, onlineUsers, broadcast, sendToUser };
