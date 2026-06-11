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
