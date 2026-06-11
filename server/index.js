require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const connectDB = require('./db');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const handleConnection = require('./ws/handler');

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
wss.on('connection', handleConnection);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', authRoutes);
app.use('/api/rooms', roomRoutes);

// Global error handler — keeps unhandled async throws from crashing the process
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => server.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch((err) => { console.error('Failed to connect to MongoDB:', err); process.exit(1); });
