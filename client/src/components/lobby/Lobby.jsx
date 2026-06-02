import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Avatar, AVATARS } from '../ui/Avatar';
import './Lobby.css';

export function Lobby({ socket, onRoomJoined }) {
  const { user } = useAuth();
  const [view, setView] = useState('home'); // home | create | join | room | browse
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isHost = room?.hostId === user?.id;

  useEffect(() => {
    if (!socket) return;

    socket.on('room_created', ({ roomCode, room }) => {
      setRoom(room);
      setView('room');
      setLoading(false);
    });

    socket.on('room_joined', ({ room, reconnected }) => {
      setRoom(room);
      setView('room');
      setLoading(false);
      if (reconnected) onRoomJoined?.(room);
    });

    socket.on('lobby_update', ({ room }) => {
      setRoom(room);
    });

    socket.on('player_joined', ({ room }) => setRoom(room));
    socket.on('player_disconnected', ({ room }) => setRoom(room));

    socket.on('game_started', ({ room }) => {
      setRoom(room);
      onRoomJoined?.(room);
    });

    socket.on('room_list', ({ rooms }) => setRooms(rooms));

    socket.on('error', ({ error }) => {
      setError(error);
      setLoading(false);
    });

    return () => {
      ['room_created','room_joined','lobby_update','player_joined',
       'player_disconnected','game_started','room_list','error'].forEach(e => socket.off(e));
    };
  }, [socket]);

  function createRoom() {
    setLoading(true);
    setError('');
    socket?.emit('create_room');
  }

  function joinRoom() {
    if (!joinCode.trim()) { setError('Enter a room code'); return; }
    setLoading(true);
    setError('');
    socket?.emit('join_room', { roomCode: joinCode.trim().toUpperCase() });
  }

  function browseRooms() {
    socket?.emit('get_rooms');
    setView('browse');
  }

  function joinFromBrowse(code) {
    setLoading(true);
    socket?.emit('join_room', { roomCode: code });
  }

  function toggleReady() {
    const me = room?.players?.find(p => p.id === user?.id);
    socket?.emit('set_ready', { ready: !me?.ready });
  }

  function startGame() {
    socket?.emit('start_game');
  }

  function leaveRoom() {
    socket?.emit('leave_room');
    setRoom(null);
    setView('home');
  }

  const allReady = room?.players?.length >= 2 && room?.players?.every(p => p.ready || p.id === room.hostId);
  const myReady = room?.players?.find(p => p.id === user?.id)?.ready;

  // ── Room waiting screen ────────────────────────────────────────────────────
  if (view === 'room' && room) {
    return (
      <div className="lobby-screen">
        <div className="lobby-panel">
          <div className="room-header">
            <div>
              <h2 className="lobby-title">Room Code</h2>
              <div className="room-code-display">{room.code}</div>
              <p className="room-hint">Share this code with friends!</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={leaveRoom}>Leave</button>
          </div>

          <div className="player-list">
            <h3 className="section-label">Players ({room.players.length}/6)</h3>
            {room.players.map(p => (
              <div key={p.id} className={`player-row ${p.id === room.hostId ? 'host' : ''}`}>
                <Avatar id={p.avatar} size={36} />
                <span className="player-row-name">{p.username}</span>
                {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                {!p.connected && <span className="dc-badge">📵</span>}
                {p.id !== room.hostId && (
                  <span className={`ready-badge ${p.ready ? 'ready' : 'not-ready'}`}>
                    {p.ready ? '✓ Ready' : '...'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {error && <div className="lobby-error">{error}</div>}

          <div className="room-actions">
            {isHost ? (
              <button
                className="btn btn-primary btn-lg w-full"
                onClick={startGame}
                disabled={room.players.length < 2}
              >
                {room.players.length < 2 ? 'Need 2+ players' : '🎮 Start Game'}
              </button>
            ) : (
              <button
                className={`btn btn-lg w-full ${myReady ? 'btn-secondary' : 'btn-primary'}`}
                onClick={toggleReady}
              >
                {myReady ? '✓ Ready! (click to unready)' : 'Ready Up!'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Browse rooms ───────────────────────────────────────────────────────────
  if (view === 'browse') {
    return (
      <div className="lobby-screen">
        <div className="lobby-panel">
          <button className="btn btn-ghost btn-sm" onClick={() => setView('home')}>← Back</button>
          <h2 className="lobby-title">Open Rooms</h2>
          {rooms.length === 0 ? (
            <p className="text-muted text-center mt-2">No open rooms found. Create one!</p>
          ) : (
            <div className="room-browse-list">
              {rooms.map(r => (
                <div key={r.code} className="browse-row">
                  <div>
                    <span className="browse-code">{r.code}</span>
                    <span className="browse-host">by {r.hostUsername}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="browse-count">{r.playerCount}/{r.maxPlayers}</span>
                    <button className="btn btn-primary btn-sm" onClick={() => joinFromBrowse(r.code)} disabled={loading}>
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <div className="lobby-error">{error}</div>}
        </div>
      </div>
    );
  }

  // ── Join room ──────────────────────────────────────────────────────────────
  if (view === 'join') {
    return (
      <div className="lobby-screen">
        <div className="lobby-panel">
          <button className="btn btn-ghost btn-sm" onClick={() => { setView('home'); setError(''); }}>← Back</button>
          <h2 className="lobby-title">Join a Room</h2>
          <input
            className="input room-code-input"
            placeholder="Enter room code (e.g. ABC123)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            autoFocus
            maxLength={6}
          />
          {error && <div className="lobby-error">{error}</div>}
          <button className="btn btn-primary btn-lg w-full" onClick={joinRoom} disabled={loading || !joinCode.trim()}>
            {loading ? '⏳ Joining...' : 'Join Room'}
          </button>
        </div>
      </div>
    );
  }

  // ── Home ──────────────────────────────────────────────────────────────────
  return (
    <div className="lobby-screen">
      <div className="lobby-panel">
        <div className="lobby-hero">
          <div className="lobby-logo">🍡</div>
          <h1 className="lobby-game-title">Arschmallows</h1>
          <p className="lobby-subtitle">The card game where memories matter!</p>
        </div>

        <div className="lobby-user-info">
          <Avatar id={user?.avatar} size={40} />
          <span className="lobby-username">{user?.username}</span>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        <div className="lobby-buttons">
          <button className="btn btn-primary btn-lg w-full" onClick={createRoom} disabled={loading}>
            {loading ? '⏳ Creating...' : '➕ Create Room'}
          </button>
          <button className="btn btn-secondary btn-lg w-full" onClick={() => { setView('join'); setError(''); }}>
            🔑 Join with Code
          </button>
          <button className="btn btn-ghost w-full" onClick={browseRooms}>
            🔍 Browse Rooms
          </button>
        </div>
      </div>
    </div>
  );
}
