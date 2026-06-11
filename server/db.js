const mongoose = require('mongoose');

// Opens a single Mongoose connection reused by all models.
async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected:', mongoose.connection.host);
}

module.exports = connectDB;
