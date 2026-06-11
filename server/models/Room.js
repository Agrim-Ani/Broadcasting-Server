const crypto = require('crypto');
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true, maxlength: 100 },
  // UUID used in invite links — unique index auto-created by mongoose
  inviteCode: { type: String, unique: true, default: () => crypto.randomUUID() },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
