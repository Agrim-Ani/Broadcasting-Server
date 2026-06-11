const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Denormalized so reads never need a User join
  senderUsername: { type: String, required: true },
  text:           { type: String, required: true, maxlength: 4000 },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
