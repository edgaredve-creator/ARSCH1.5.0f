// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { signToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();
const AVATARS = ['marshmallow1','marshmallow2','marshmallow3','marshmallow4','marshmallow5','marshmallow6'];

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Username must be 2-20 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Only letters, numbers, underscores' });

  const selectedAvatar = AVATARS.includes(avatar) ? avatar : AVATARS[0];
  try {
    const user = db.createUser({ id: uuidv4(), username, password_hash: bcrypt.hashSync(password, 10), avatar: selectedAvatar });
    const userData = { id: user.id, username: user.username, avatar: user.avatar };
    res.json({ token: signToken(userData), user: userData });
  } catch (e) {
    if (e.message === 'USERNAME_TAKEN') return res.status(409).json({ error: 'Username already taken' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const userData = { id: user.id, username: user.username, avatar: user.avatar };
  res.json({ token: signToken(userData), user: userData });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, total_wins: user.total_wins, total_games: user.total_games } });
});

// PUT /api/auth/avatar
router.put('/avatar', authMiddleware, (req, res) => {
  const { avatar } = req.body;
  if (!AVATARS.includes(avatar)) return res.status(400).json({ error: 'Invalid avatar' });
  db.updateUserAvatar(req.user.id, avatar);
  res.json({ success: true, avatar });
});

module.exports = router;
