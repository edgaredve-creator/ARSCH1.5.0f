// db/database.js
// Using lowdb v7 — pure JavaScript JSON file database.
// No native compilation needed → works on Render free tier.
// Data stored in DATA_DIR/db.json

const { Low } = require('lowdb');
const { JSONFileSync } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const file = path.join(DATA_DIR, 'db.json');

const adapter = new JSONFileSync(file);
const db = new Low(adapter, {
  users: [],
  game_history: [],
  leaderboard: [],
});

// Load existing data
db.read();

// Helper — auto-save after every write
function save() { db.write(); }

// ── User helpers ──────────────────────────────────────────────────────────────

function getUserByUsername(username) {
  return db.data.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

function getUserById(id) {
  return db.data.users.find(u => u.id === id) || null;
}

function createUser({ id, username, password_hash, avatar }) {
  if (getUserByUsername(username)) throw new Error('USERNAME_TAKEN');
  const user = { id, username, password_hash, avatar, created_at: Date.now(), total_wins: 0, total_games: 0 };
  db.data.users.push(user);
  // Create leaderboard entry
  db.data.leaderboard.push({ user_id: id, username, avatar, total_wins: 0, total_games: 0 });
  save();
  return user;
}

function updateUserAvatar(id, avatar) {
  const user = getUserById(id);
  if (!user) return;
  user.avatar = avatar;
  const lb = db.data.leaderboard.find(l => l.user_id === id);
  if (lb) lb.avatar = avatar;
  save();
}

// ── Game history helpers ──────────────────────────────────────────────────────

function saveGameResult({ id, room_code, winner_id, winner_username, players, scores }) {
  db.data.game_history.push({
    id, room_code, winner_id, winner_username,
    players, scores,
    rounds: 6,
    completed_at: Date.now(),
  });

  // Update stats
  scores.forEach(s => {
    const user = getUserById(s.id);
    if (user) { user.total_games++; }
    const lb = db.data.leaderboard.find(l => l.user_id === s.id);
    if (lb) { lb.total_games++; }
  });

  if (winner_id) {
    const winner = getUserById(winner_id);
    if (winner) { winner.total_wins++; }
    const lb = db.data.leaderboard.find(l => l.user_id === winner_id);
    if (lb) { lb.total_wins++; lb.username = winner_username; }
  }

  save();
}

function getLeaderboard() {
  return [...db.data.leaderboard]
    .sort((a, b) => b.total_wins - a.total_wins || (b.total_games ? b.total_wins/b.total_games : 0) - (a.total_games ? a.total_wins/a.total_games : 0))
    .slice(0, 50)
    .map(r => ({
      ...r,
      id: r.user_id,
      win_rate: r.total_games > 0 ? Math.round(r.total_wins / r.total_games * 1000) / 10 : 0,
    }));
}

function getGameHistory(userId) {
  return db.data.game_history
    .filter(g => g.players?.some(p => p.id === userId))
    .sort((a, b) => b.completed_at - a.completed_at)
    .slice(0, 20);
}

module.exports = { getUserByUsername, getUserById, createUser, updateUserAvatar, saveGameResult, getLeaderboard, getGameHistory };
