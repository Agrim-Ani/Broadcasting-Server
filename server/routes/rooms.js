const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const Room = require('../models/Room');
const Message = require('../models/Message');
const registry = require('../ws/registry');

// POST /api/rooms — create a new room; creator is auto-added as first member.
router.post('/', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const room = await Room.create({
    name:      name.trim(),
    createdBy: req.user.userId,
    members:   [req.user.userId],
  });
  res.status(201).json(room);
});

// GET /api/rooms — list all rooms the current user has joined.
router.get('/', requireAuth, async (req, res) => {
  const rooms = await Room.find({ members: req.user.userId }).sort({ updatedAt: -1 }).lean();
  res.json(rooms);
});

// GET /api/rooms/join?code=… — preview a room without joining (used on join.html).
// Must be defined before /:id or "join" would be treated as an id.
router.get('/join', requireAuth, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const room = await Room.findOne({ inviteCode: code }).select('name members').lean();
  if (!room) return res.status(404).json({ error: 'invalid invite code' });

  res.json({ _id: room._id, name: room.name, memberCount: room.members.length });
});

// POST /api/rooms/join — join a room via invite code; idempotent for existing members.
router.post('/join', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  // Snapshot members before the update so we know who to notify and whether the join is new.
  const before = await Room.findOne({ inviteCode: code }).lean();
  if (!before) return res.status(404).json({ error: 'invalid invite code' });

  const isNewMember = !before.members.some(m => m.toString() === req.user.userId);

  const room = await Room.findOneAndUpdate(
    { inviteCode: code },
    { $addToSet: { members: req.user.userId } },
    { returnDocument: 'after' }
  );

  // Push a WS event to all existing members so their member panels update instantly.
  if (isNewMember) {
    const payload = {
      type:     'member_joined',
      roomId:   room._id.toString(),
      member:   { _id: req.user.userId, username: req.user.username },
    };
    for (const memberId of before.members) {
      registry.sendToUser(memberId.toString(), payload);
    }
  }

  res.json(room);
});

// PATCH /api/rooms/:id — rename a room; only the creator may do this.
router.patch('/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const room = await Room.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user.userId },
    { $set: { name: name.trim() } },
    { returnDocument: 'after' }
  ).lean();
  if (!room) return res.status(403).json({ error: 'not found or not the owner' });

  const payload = { type: 'room_updated', roomId: room._id.toString(), name: room.name };
  for (const memberId of room.members) registry.sendToUser(memberId.toString(), payload);

  res.json(room);
});

// DELETE /api/rooms/:id — delete a room and all its messages; only the creator may do this.
router.delete('/:id', requireAuth, async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, createdBy: req.user.userId }).lean();
  if (!room) return res.status(403).json({ error: 'not found or not the owner' });

  await Promise.all([
    Room.deleteOne({ _id: req.params.id }),
    Message.deleteMany({ roomId: req.params.id }),
  ]);

  const payload = { type: 'room_deleted', roomId: req.params.id };
  for (const memberId of room.members) registry.sendToUser(memberId.toString(), payload);

  res.status(204).send();
});

// POST /api/rooms/:id/leave — remove yourself from a room; owner must delete instead.
router.post('/:id/leave', requireAuth, async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, members: req.user.userId }).lean();
  if (!room) return res.status(404).json({ error: 'room not found' });

  if (room.createdBy.toString() === req.user.userId) {
    return res.status(403).json({ error: 'owner cannot leave — delete the room instead' });
  }

  await Room.findByIdAndUpdate(req.params.id, { $pull: { members: req.user.userId } });

  // Notify remaining members so their member panels update instantly.
  const payload = { type: 'member_left', roomId: req.params.id, userId: req.user.userId };
  for (const memberId of room.members) {
    if (memberId.toString() !== req.user.userId) {
      registry.sendToUser(memberId.toString(), payload);
    }
  }

  res.status(204).send();
});

// GET /api/rooms/:id — full room details with populated member list.
router.get('/:id', requireAuth, async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, members: req.user.userId })
    .populate('members', 'username')
    .lean();
  if (!room) return res.status(404).json({ error: 'room not found' });
  res.json(room);
});

// GET /api/rooms/:id/messages — last 50 messages, oldest first.
// Supports ?before=<messageId> for loading earlier history.
router.get('/:id/messages', requireAuth, async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, members: req.user.userId }).lean();
  if (!room) return res.status(404).json({ error: 'room not found' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const query = { roomId: req.params.id };
  if (req.query.before) query._id = { $lt: req.query.before };

  const messages = await Message.find(query).sort({ _id: -1 }).limit(limit).lean();
  messages.reverse();
  res.json(messages);
});

module.exports = router;
