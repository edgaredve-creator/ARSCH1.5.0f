// game/RoomManager.js
// In-memory room registry. Rooms are ephemeral; only scores persist to DB.

const { GameEngine } = require('./GameEngine');
const { v4: uuidv4 } = require('uuid');

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

class RoomManager {
  constructor() {
    this.rooms = new Map();      // roomCode -> Room
    this.socketToRoom = new Map(); // socketId -> roomCode
    this.socketToUser = new Map(); // socketId -> { userId, username, avatar }
    this.userToSocket = new Map(); // userId -> socketId (most recent)
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId, hostUser) {
    const code = this.generateRoomCode();
    const room = {
      code,
      hostId: hostUser.id,
      phase: 'LOBBY',          // LOBBY | PEEK | PLAYING | ROUND_END | GAME_OVER
      players: [{
        ...hostUser,
        socketId: hostSocketId,
        ready: false,
      }],
      engine: null,
      createdAt: Date.now(),
      settings: { roundCount: 6 },
    };
    this.rooms.set(code, room);
    this.socketToRoom.set(hostSocketId, code);
    this.userToSocket.set(hostUser.id, hostSocketId);
    return room;
  }

  joinRoom(socketId, user, roomCode) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.phase !== 'LOBBY') {
      // Allow reconnection
      const existing = room.players.find(p => p.id === user.id);
      if (existing) {
        existing.socketId = socketId;
        existing.connected = true;
        this.socketToRoom.set(socketId, roomCode);
        this.userToSocket.set(user.id, socketId);
        if (room.engine) room.engine.setPlayerConnected(user.id, true);
        return { room, reconnected: true };
      }
      return { error: 'Game already started' };
    }
    if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' };
    if (room.players.find(p => p.id === user.id)) return { error: 'Already in room' };

    room.players.push({ ...user, socketId, ready: false });
    this.socketToRoom.set(socketId, roomCode);
    this.userToSocket.set(user.id, socketId);
    return { room };
  }

  leaveRoom(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    if (!room) return null;

    this.socketToRoom.delete(socketId);

    if (room.phase === 'LOBBY') {
      room.players = room.players.filter(p => p.socketId !== socketId);
      if (room.players.length === 0) {
        this.rooms.delete(roomCode);
        return { roomCode, disbanded: true };
      }
      // Transfer host if needed
      if (room.hostId === this.getUserBySocket(socketId)?.id) {
        room.hostId = room.players[0].id;
      }
    } else {
      // Mark as disconnected but keep in game
      const player = room.players.find(p => p.socketId === socketId);
      if (player) {
        player.connected = false;
        if (room.engine) room.engine.setPlayerConnected(player.id, false);
      }
    }

    return { roomCode, room };
  }

  getRoomBySocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  getRoomCode(socketId) {
    return this.socketToRoom.get(socketId);
  }

  getUserBySocket(socketId) {
    return this.socketToUser.get(socketId);
  }

  registerUser(socketId, user) {
    this.socketToUser.set(socketId, user);
    this.userToSocket.set(user.id, socketId);
  }

  unregisterUser(socketId) {
    const user = this.socketToUser.get(socketId);
    if (user) this.userToSocket.delete(user.id);
    this.socketToUser.delete(socketId);
  }

  getSocketForUser(userId) {
    return this.userToSocket.get(userId);
  }

  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.players.length < MIN_PLAYERS) return { error: `Need at least ${MIN_PLAYERS} players` };

    room.engine = new GameEngine(roomCode, room.players);
    const state = room.engine.startGame();
    room.phase = 'PEEK';
    return { success: true, state };
  }

  getRoomList() {
    return Array.from(this.rooms.values())
      .filter(r => r.phase === 'LOBBY')
      .map(r => ({
        code: r.code,
        hostUsername: r.players.find(p => p.id === r.hostId)?.username,
        playerCount: r.players.length,
        maxPlayers: MAX_PLAYERS,
      }));
  }
}

module.exports = new RoomManager(); // Singleton
