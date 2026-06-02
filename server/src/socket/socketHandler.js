// socket/socketHandler.js
// All game actions validated server-side. Clients only send intents.

const roomManager = require('../game/RoomManager');
const { verifyToken } = require('../middleware/auth');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const TURN_TIMER_INTERVAL = 1000; // ms

module.exports = function setupSockets(io) {
  // Turn timer intervals per room
  const timers = new Map();

  function startTurnTimer(roomCode) {
    if (timers.has(roomCode)) clearInterval(timers.get(roomCode));
    const interval = setInterval(() => {
      const room = roomManager.rooms.get(roomCode);
      if (!room?.engine) { clearInterval(interval); return; }

      const result = room.engine.checkTurnTimeout();
      if (result?.timeout) {
        io.to(roomCode).emit('turn_timeout', {
          nextPlayerIndex: result.nextPlayerIndex,
          state: room.engine.getPublicState(),
        });
        // Emit personalized state to each player
        emitPersonalizedState(io, room, roomCode);
      }
    }, TURN_TIMER_INTERVAL);
    timers.set(roomCode, interval);
  }

  function stopTurnTimer(roomCode) {
    if (timers.has(roomCode)) {
      clearInterval(timers.get(roomCode));
      timers.delete(roomCode);
    }
  }

  function emitPersonalizedState(io, room, roomCode) {
    if (!room?.engine) return;
    room.players.forEach(p => {
      const socketId = p.socketId;
      if (socketId) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('game_state', room.engine.getStateForPlayer(p.id));
        }
      }
    });
  }

  function saveGameResult(room, finalResult) {
    try {
      const gameId = uuidv4();
      const players = room.players.map(p => ({ id: p.id, username: p.username }));
      const scores = finalResult.finalScores;
      const winner = finalResult.winner;

      db.saveGameResult({
        id: gameId,
        room_code: room.code,
        winner_id: winner?.id,
        winner_username: winner?.username,
        players,
        scores,
      });
    } catch (e) {
      console.error('Failed to save game result:', e);
    }
  }

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ── Auth ────────────────────────────────────────────────────────────────
    socket.on('auth', ({ token }) => {
      const user = verifyToken(token);
      if (!user) { socket.emit('auth_error', { error: 'Invalid token' }); return; }
      roomManager.registerUser(socket.id, user);
      socket.emit('auth_ok', { user });
    });

    // ── Room Management ──────────────────────────────────────────────────────
    socket.on('create_room', () => {
      const user = roomManager.getUserBySocket(socket.id);
      if (!user) { socket.emit('error', { error: 'Not authenticated' }); return; }

      const room = roomManager.createRoom(socket.id, user);
      socket.join(room.code);
      socket.emit('room_created', {
        roomCode: room.code,
        room: sanitizeRoom(room),
      });
    });

    socket.on('join_room', ({ roomCode }) => {
      const user = roomManager.getUserBySocket(socket.id);
      if (!user) { socket.emit('error', { error: 'Not authenticated' }); return; }

      const result = roomManager.joinRoom(socket.id, user, roomCode);
      if (result.error) {
        // Emit specific event for 'room not found' so clients can clear stale localStorage
        if (result.error === 'Room not found') {
          socket.emit('room_not_found', { roomCode });
        } else {
          socket.emit('error', { error: result.error });
        }
        return;
      }

      socket.join(result.room.code);
      socket.emit('room_joined', {
        roomCode: result.room.code,
        room: sanitizeRoom(result.room),
        reconnected: result.reconnected || false,
      });
      socket.to(result.room.code).emit('player_joined', {
        player: { id: user.id, username: user.username, avatar: user.avatar },
        room: sanitizeRoom(result.room),
      });

      // If reconnecting during game, send current game state
      if (result.reconnected && result.room.engine) {
        socket.emit('game_state', result.room.engine.getStateForPlayer(user.id));
      }
    });

    socket.on('leave_room', () => {
      handleDisconnect(socket);
    });

    socket.on('get_rooms', () => {
      socket.emit('room_list', { rooms: roomManager.getRoomList() });
    });

    // ── Lobby ────────────────────────────────────────────────────────────────
    socket.on('set_ready', ({ ready }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      if (!room || room.phase !== 'LOBBY') return;
      const user = roomManager.getUserBySocket(socket.id);
      const player = room.players.find(p => p.id === user?.id);
      if (!player) return;
      player.ready = ready;
      io.to(room.code).emit('lobby_update', { room: sanitizeRoom(room) });
    });

    socket.on('start_game', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room || !user) return;
      if (room.hostId !== user.id) { socket.emit('error', { error: 'Only host can start' }); return; }
      if (room.phase !== 'LOBBY') { socket.emit('error', { error: 'Game already started' }); return; }

      const result = roomManager.startGame(room.code);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      room.phase = 'PEEK';
      io.to(room.code).emit('game_started', { room: sanitizeRoom(room) });
      emitPersonalizedState(io, room, room.code);
    });

    // ── Peek Phase ──────────────────────────────────────────────────────────
    socket.on('peek_card', ({ cardIndex }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.peekCard(user.id, cardIndex);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // Send peeked card only to this player
      socket.emit('card_peeked', { card: result.card, index: result.index });
    });

    socket.on('confirm_peek', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.confirmPeek(user.id);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      io.to(room.code).emit('peek_confirmed', { playerId: user.id });

      if (result.startGame) {
        room.phase = 'PLAYING';
        io.to(room.code).emit('play_started', {});
        emitPersonalizedState(io, room, room.code);
        startTurnTimer(room.code);
      }
    });

    // ── Gameplay ────────────────────────────────────────────────────────────
    socket.on('draw_card', ({ source }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.drawFromPile(user.id, source || 'draw');
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // The drawn card is visible to the drawing player
      socket.emit('card_drawn', { card: result.card, source });
      // Other players see that a card was drawn but not its value (unless from discard)
      socket.to(room.code).emit('opponent_drew', {
        playerId: user.id,
        source,
        card: source === 'discard' ? result.card : { faceUp: false },
      });
      emitPersonalizedState(io, room, room.code);
    });

    socket.on('swap_drawn_with_own', ({ cardIndex }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.swapDrawnWithOwn(user.id, cardIndex);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // Notify others which slot the opponent placed their card in
      socket.to(room.code).emit('opponent_placed_card', {
        playerId: user.id,
        cardIdx: cardIndex,
        action: 'swap',
      });

      handleTurnResult(io, room, result);
    });

    socket.on('discard_drawn_card', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.discardDrawnCard(user.id);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      socket.emit('must_flip_card', {});
      io.to(room.code).emit('card_discarded', { playerId: user.id });
      emitPersonalizedState(io, room, room.code);
    });

    socket.on('flip_own_card', ({ cardIndex }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.flipOwnCard(user.id, cardIndex);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // Notify others that opponent flipped/revealed a card at this index
      socket.to(room.code).emit('opponent_placed_card', {
        playerId: user.id,
        cardIdx: cardIndex,
        action: 'flip',
      });

      handleTurnResult(io, room, result);
    });

    socket.on('play_action', ({ action }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.playActionCard(user.id, action);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      io.to(room.code).emit('action_pending', {
        playerId: user.id,
        action,
        pendingAction: result.pendingAction,
      });
      emitPersonalizedState(io, room, room.code);
    });

    // SPY step 1: peek — turn does NOT advance until player closes modal
    socket.on('resolve_spy', ({ targetPlayerId, cardIndex }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.resolveSpyAction(user.id, targetPlayerId, cardIndex);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // Only the spy sees the card content
      socket.emit('spy_result', { card: result.spiedCard, targetPlayerId, cardIndex });
      // Everyone else sees an animation: which player/card was targeted (position only, no content)
      socket.to(room.code).emit('spy_animation', {
        byPlayerId: user.id,
        byUsername: user.username,
        targetPlayerId,
        cardIndex,
      });
      // Do NOT advance turn yet — wait for close_spy_modal
    });

    // SPY step 2: player closed modal — advance turn now
    socket.on('close_spy_modal', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.closeSpyModal(user.id);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      io.to(room.code).emit('spy_used', { byPlayerId: user.id });
      handleTurnResult(io, room, result);
    });

    socket.on('resolve_swap', ({ myCardIndex, targetPlayerId, theirCardIndex }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.resolveSwapAction(user.id, myCardIndex, targetPlayerId, theirCardIndex);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      io.to(room.code).emit('swap_done', { byPlayerId: user.id, targetPlayerId, myCardIndex, theirCardIndex });
      handleTurnResult(io, room, result);
    });

    socket.on('resolve_go_again', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.resolveGoAgainAction(user.id);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      io.to(room.code).emit('go_again', { byPlayerId: user.id, count: result.goAgainCount });
      emitPersonalizedState(io, room, room.code);
    });

    socket.on('group_discard', ({ cardIndices }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.attemptGroupDiscard(user.id, cardIndices);
      if (result.error && !result.groupInvalid) { socket.emit('error', { error: result.error }); return; }

      if (result.groupInvalid) {
        // Penalty applied + turn ended server-side
        io.to(room.code).emit('group_discard_penalty', { playerId: user.id });
        handleTurnResult(io, room, result);
        return;
      }

      io.to(room.code).emit('group_discarded', { playerId: user.id, cardIndices });
      socket.emit('group_discard_ok', { newCard: result.drawnCard, newCardIndex: result.newCardIndex });
      handleTurnResult(io, room, result);
    });

    socket.on('call_arschmallows', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;

      const result = room.engine.callArschmallows(user.id);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      // Broadcast that Arschmallows was called — courtesy round starts
      io.to(room.code).emit('arschmallows_called', {
        byPlayerId: user.id,
        username: user.username,
        courtesyRound: true,
        callerIndex: result.callerIndex,
      });

      // Don't stop timer — courtesy round continues, handleTurnResult advances turns
      handleTurnResult(io, room, result);
    });

    socket.on('next_round', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room?.engine || !user) return;
      if (room.hostId !== user.id) return;

      const lastResult = room._lastRoundResult;
      const result = room.engine.startNextRound(lastResult?.nextStartIndex ?? 0);
      if (result.error) { socket.emit('error', { error: result.error }); return; }

      if (result.gameOver) {
        stopTurnTimer(room.code);
        saveGameResult(room, result);
        room.phase = 'GAME_OVER';
        io.to(room.code).emit('game_over', {
          winner: result.winner,
          finalScores: result.finalScores,
        });
        return;
      }

      room.phase = 'PEEK';
      io.to(room.code).emit('round_started', { round: result.round });
      emitPersonalizedState(io, room, room.code);
    });

    socket.on('play_again', () => {
      const room = roomManager.getRoomBySocket(socket.id);
      if (!room) return;
      room.phase = 'LOBBY';
      room.players.forEach(p => { p.ready = false; });
      room.engine = null;
      io.to(room.code).emit('back_to_lobby', { room: sanitizeRoom(room) });
    });

    // ── Emotes ──────────────────────────────────────────────────────────────
    socket.on('emote', ({ emoteId }) => {
      const room = roomManager.getRoomBySocket(socket.id);
      const user = roomManager.getUserBySocket(socket.id);
      if (!room || !user) return;

      const VALID_EMOTES = ['laugh','wow','sad','angry','wink','kiss','cool','fire','gg','think','skull','marshmallow'];
      if (!VALID_EMOTES.includes(emoteId)) return;

      // Broadcast to everyone in the room (including sender so they see it too)
      io.to(room.code).emit('emote', {
        playerId: user.id,
        username: user.username,
        emoteId,
      });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      handleDisconnect(socket);
    });

    function handleDisconnect(socket) {
      const result = roomManager.leaveRoom(socket.id);
      roomManager.unregisterUser(socket.id);

      if (!result) return;
      if (result.disbanded) {
        // Room is gone
        return;
      }
      const room = result.room;
      if (!room) return;

      const user = roomManager.getUserBySocket(socket.id) || {};
      io.to(result.roomCode).emit('player_disconnected', {
        playerId: user.id,
        username: user.username,
        room: sanitizeRoom(room),
      });
    }

    function handleTurnResult(io, room, result) {
      if (result.roundEnd) {
        room.phase = 'ROUND_END';
        room._lastRoundResult = result;
        stopTurnTimer(room.code);
        // Always send fresh game state first so board stays visible before overlay
        emitPersonalizedState(io, room, room.code);
        io.to(room.code).emit('round_end', {
          round: result.round,
          scores: result.scores,
          callerIndex: result.callerIndex,
          calledByPlayer: result.calledByPlayer,
          nextStartIndex: result.nextStartIndex,
        });
      } else if (result.gameOver) {
        stopTurnTimer(room.code);
        saveGameResult(room, result);
        room.phase = 'GAME_OVER';
        emitPersonalizedState(io, room, room.code);
        io.to(room.code).emit('game_over', {
          winner: result.winner,
          finalScores: result.finalScores,
        });
      } else {
        emitPersonalizedState(io, room, room.code);
        io.to(room.code).emit('turn_changed', {
          currentPlayerIndex: room.engine.state.currentPlayerIndex,
          turnStartedAt: room.engine.state.turnStartedAt,
        });
      }
    }
  });
};

function sanitizeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      ready: p.ready,
      connected: p.connected !== false,
    })),
  };
}
