# 🍡 Arschmallows — Multiplayer Card Game

A full-stack real-time multiplayer implementation of the Arschmallows card game.
Built with Node.js + Socket.IO (backend) and React + Vite (frontend).

---

## 🏗 Architecture

| Layer | Technology | Why |
|---|---|---|
| Backend | Node.js + Express + Socket.IO | Real-time events, fast, simple |
| Frontend | React 18 + Vite | Fast HMR, optimal bundle, great DX |
| Database | SQLite (better-sqlite3) | Zero-config, file-based, perfect for Render |
| Auth | JWT (7-day tokens) | Stateless, works across reconnects |
| State | Server-authoritative | No client cheating possible |

---

## 📁 Project Structure

```
arschmallows/
├── server/
│   └── src/
│       ├── index.js              # Express + Socket.IO server
│       ├── db/database.js        # SQLite setup + schema
│       ├── game/
│       │   ├── GameEngine.js     # Complete game logic (server-only)
│       │   └── RoomManager.js    # Room registry + socket mapping
│       ├── middleware/auth.js    # JWT middleware
│       ├── routes/auth.js        # Register, login, profile
│       ├── routes/game.js        # Leaderboard, history
│       └── socket/socketHandler.js # All real-time game events
├── client/
│   └── src/
│       ├── App.jsx               # Root with auth guard
│       ├── context/              # Auth + Socket contexts
│       ├── pages/                # AuthPage, GamePage, LeaderboardPage
│       ├── components/
│       │   ├── game/             # GameBoard, Card, Timer, PlayerArea, RoundEnd, GameOver
│       │   ├── lobby/            # Lobby (create/join/browse rooms)
│       │   └── ui/               # Avatar, Toast
│       ├── hooks/useToast.js     # Notification system
│       └── utils/sounds.js       # Web Audio API sound effects
├── render.yaml                   # Render deployment config
└── package.json                  # Root scripts for concurrent dev
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start both server and client (concurrent)
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

The Vite dev server proxies `/api` and `/socket.io` to the backend automatically.

---

## 🌐 Deploy to Render

### Option A: render.yaml (Recommended — one click)

1. Push your code to a GitHub repository
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repo — Render will detect `render.yaml` automatically
4. Click **Apply** — done!

The `render.yaml` config:
- Builds the React frontend first (`npm run build` in `/client`)
- Installs server deps
- Starts the Node server which serves the built frontend as static files
- Mounts a persistent disk for the SQLite database at `/opt/render/project/data`

### Option B: Manual Web Service

1. Create a new **Web Service** on Render
2. Connect your GitHub repo
3. Set these fields:
   - **Build Command:** `cd client && npm install && npm run build && cd ../server && npm install`
   - **Start Command:** `cd server && node src/index.js`
   - **Environment:** Node
4. Add environment variables:
   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` |
   | `JWT_SECRET` | *(generate a random 64-char string)* |
   | `DATA_DIR` | `/opt/render/project/data` |
5. Add a **Disk**:
   - Name: `arschmallows-data`
   - Mount Path: `/opt/render/project/data`
   - Size: 1 GB

---

## 🎮 Game Rules Summary

- 2–6 players, 6 rounds
- Each player gets 6 face-down cards; peek at 2 before the round starts
- On your turn: draw from deck or discard pile
  - **Keep it:** swap with one of your face-down cards (without looking)
  - **Discard it:** flip one of your own face-down cards face-up
- **Action cards:** SPY (peek), GO AGAIN (2 bonus turns), SWAP (exchange cards blind)
- **Group discard:** Before drawing, discard 3+ same-value cards or 2+ action cards
- **Arschmallows!:** Call it when you think you have the lowest total → if wrong, your points double
- After 6 rounds, lowest total score wins

---

## 🔧 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` serves React build |
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | dev default | **Change in production!** |
| `DATA_DIR` | `./data` | SQLite database directory |

---

## 🛡 Security Notes

- All game state validated **server-side only** — clients cannot cheat
- JWT tokens expire after 7 days
- Passwords hashed with bcrypt (10 rounds)
- No sensitive data sent to non-owning clients (face-down cards hidden)
- Rate limiting on turn actions via state machine (must resolve each step before next)
