// routes/game.js
const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/leaderboard', (req, res) => {
  res.json({ leaderboard: db.getLeaderboard() });
});

router.get('/history', authMiddleware, (req, res) => {
  res.json({ history: db.getGameHistory(req.user.id) });
});

module.exports = router;
