const jwt = require('jsonwebtoken');
const registry = require('./registry');
const Room = require('../models/Room');
const Message = require('../models/Message');

// Authenticates the socket, registers presence, and sets up event listeners.
// Called by wss.on('connection', handleConnection).
function handleConnection(socket, req) {
  // Token arrives as a query param: ws://host?token=<jwt>
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const token = url.searchParams.get('token');

  let user;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    user = { userId: payload.sub, username: payload.username };
  } catch {
    // Close before the client treats this as a live connection.
    socket.close(4001, 'Unauthorized');
    return;
  }

  socket.userId   = user.userId;
  socket.username = user.username;

  registry.add(user.userId, socket);
  console.log(`[ws] connected: ${user.username}`);

  socket.send(JSON.stringify({ type: 'connected', userId: user.userId, username: user.username }));
  // Broadcast presence so member online-indicators update everywhere.
  registry.broadcast({ type: 'presence', users: registry.onlineUsers() });

  socket.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'message') {
      const { roomId, text } = msg;
      if (!roomId || !text?.trim()) return;

      try {
        // Verify sender is a member before accepting the message
        const room = await Room.findOne({ _id: roomId, members: user.userId }).lean();
        if (!room) return;

        // Persist first, then deliver — never lose a message due to delivery failure
        const saved = await Message.create({
          roomId,
          senderId:       user.userId,
          senderUsername: user.username,
          text:           text.trim().slice(0, 4000),
        });

        // Bump updatedAt so the room floats to the top of each member's list
        await Room.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } });

        const payload = {
          type:          'message',
          roomId:        roomId.toString(),
          messageId:     saved._id.toString(),
          senderId:      user.userId.toString(),
          senderUsername: user.username,
          text:          saved.text,
          createdAt:     saved.createdAt,
        };

        for (const memberId of room.members) {
          registry.sendToUser(memberId.toString(), payload);
        }
      } catch (err) {
        console.error(`[ws] message error for ${user.username}:`, err.message);
      }
    }
  });

  socket.on('close', () => {
    registry.remove(user.userId, socket);
    console.log(`[ws] disconnected: ${user.username}`);
    registry.broadcast({ type: 'presence', users: registry.onlineUsers() });
  });

  socket.on('error', (err) => {
    console.error(`[ws] error for ${user.username}:`, err.message);
  });
}

module.exports = handleConnection;
