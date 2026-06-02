import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Lobby } from '../components/lobby/Lobby';
import { GameBoard } from '../components/game/GameBoard';
import { RoundEndOverlay } from '../components/game/RoundEnd';
import { GameOverScreen } from '../components/game/GameOver';
import { ToastContainer } from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import { isSoundEnabled, toggleSound } from '../utils/sounds';
import './GamePage.css';

const STORAGE_KEY = 'arschmallows_room';

export function GamePage({ onLeaderboard, onLogout }) {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const { toasts, toast } = useToast();
  const [appView, setAppView] = useState('lobby'); // lobby | game
  const [gameState, setGameState] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [roundEndData, setRoundEndData] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [reconnecting, setReconnecting] = useState(false);
  const roomDataRef = useRef(null);

  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  const reconnectAttemptedRef = useRef(false);

  // ── Auto-reconnect on mount ───────────────────────────────────────────────
  // Only attempt once per socket connection to avoid reconnect loops.
  // If the server restarted, room_not_found clears localStorage immediately.
  useEffect(() => {
    if (!socket || !connected) return;
    if (reconnectAttemptedRef.current) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { roomCode } = JSON.parse(saved);
        if (roomCode) {
          reconnectAttemptedRef.current = true;
          setReconnecting(true);
          socket.emit('join_room', { roomCode });
          // Safety timeout: if no response in 6s, give up and go to lobby
          setTimeout(() => {
            if (reconnectAttemptedRef.current) {
              localStorage.removeItem(STORAGE_KEY);
              setReconnecting(false);
              reconnectAttemptedRef.current = false;
            }
          }, 6000);
        }
      } catch (_) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [socket, connected]);

  // ── Save / clear roomCode in localStorage ────────────────────────────────
  useEffect(() => {
    if (roomData?.code) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomCode: roomData.code }));
    }
  }, [roomData?.code]);

  // ── Main socket event routing ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('game_state', (state) => {
      setGameState(state);
      setReconnecting(false);
      // Always keep the game board visible whenever we receive game state
      if (state.phase !== 'WAITING') {
        setAppView('game');
      }
      if (state.phase === 'PLAYING' || state.phase === 'PEEK') {
        setRoundEndData(null);
      }
    });

    socket.on('game_started', ({ room }) => {
      setRoomData(room);
      setAppView('game');
      setRoundEndData(null);
      setGameOverData(null);
    });

    // Reconnected to an in-progress game
    socket.on('room_joined', ({ room, reconnected }) => {
      if (reconnected && room) {
        setRoomData(room);
        setReconnecting(false);
        if (room.phase !== 'LOBBY') {
          setAppView('game');
          toast.info('🔄 Reconectado a la partida', 2500);
        }
      }
    });

    socket.on('play_started', () => {
      setRoundEndData(null);
    });

    socket.on('round_end', (data) => {
      setRoundEndData(data);
    });

    socket.on('game_over', (data) => {
      setRoundEndData(null);
      setGameOverData(data);
      localStorage.removeItem(STORAGE_KEY);
    });

    socket.on('back_to_lobby', ({ room }) => {
      setRoomData(room);
      setGameState(null);
      setRoundEndData(null);
      setGameOverData(null);
      setAppView('lobby');
    });

    socket.on('error', ({ error }) => {
      toast.error(error);
      setReconnecting(false);
      if (error.toLowerCase().includes('room') || error.toLowerCase().includes('not found') ||
          error.toLowerCase().includes('game already started')) {
        localStorage.removeItem(STORAGE_KEY);
        setAppView('lobby');
      }
    });

    // Server restarted — room no longer exists, clear stale data
    socket.on('room_not_found', ({ roomCode }) => {
      localStorage.removeItem(STORAGE_KEY);
      setReconnecting(false);
      setAppView('lobby');
      setRoomData(null);
      setGameState(null);
      reconnectAttemptedRef.current = false;
      toast.info('La partida ya no existe. Vuelve al lobby.', 4000);
    });

    socket.on('auth_error', () => {
      onLogout?.();
    });

    return () => {
      ['game_state','game_started','room_joined','play_started','round_end',
       'game_over','back_to_lobby','error','room_not_found','auth_error'].forEach(e => socket.off(e));
    };
  }, [socket, reconnecting]);

  function handleRoomJoined(room) {
    setRoomData(room);
    if (room.phase !== 'LOBBY') setAppView('game');
  }

  function handleNextRound() {
    socket?.emit('next_round');
  }

  function handlePlayAgain() {
    socket?.emit('play_again');
  }

  function handleLeaveGame() {
    socket?.emit('leave_room');
    setRoomData(null);
    setGameState(null);
    setRoundEndData(null);
    setGameOverData(null);
    setAppView('lobby');
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleToggleSound() {
    const on = toggleSound();
    setSoundOn(on);
    toast.info(on ? '🔊 Sound on' : '🔇 Sound off', 1500);
  }

  const isHost = roomData?.hostId === user?.id;
  const currentRound = gameState?.round || 1;

  return (
    <div className="game-page">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">🍡</span>
          <span className="topbar-title">Arschmallows</span>
        </div>
        <div className="topbar-right">
          {!connected && <span className="conn-indicator offline">📵 Offline</span>}
          <button className="btn btn-ghost btn-sm topbar-btn" onClick={handleToggleSound} title="Toggle sound">
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn btn-ghost btn-sm topbar-btn" onClick={onLeaderboard} title="Leaderboard">
            🏆
          </button>
          <button className="btn btn-ghost btn-sm topbar-btn" onClick={onLogout} title="Logout">
            🚪
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="game-page-content">
        {/* Reconnecting overlay */}
        {reconnecting && (
          <div className="reconnecting-overlay">
            <div className="reconnecting-box">
              <div className="reconnecting-spinner">🍡</div>
              <p>Reconectando a tu partida...</p>
            </div>
          </div>
        )}

        {appView === 'lobby' && !reconnecting && (
          <Lobby socket={socket} onRoomJoined={handleRoomJoined} />
        )}

        {appView === 'game' && (gameState || roomData?.phase === 'PEEK') && (
          <GameBoard
            socket={socket}
            gameState={gameState}
            roomCode={roomData?.code}
            onToast={(msg, type, dur) => toast[type || 'info'](msg, dur)}
          />
        )}
      </div>

      {/* Round end overlay */}
      {roundEndData && (
        <RoundEndOverlay
          roundData={roundEndData}
          players={roomData?.players || gameState?.players}
          isHost={isHost}
          onNextRound={handleNextRound}
          currentRound={currentRound}
          totalRounds={6}
        />
      )}

      {/* Game over overlay */}
      {gameOverData && (
        <GameOverScreen
          winner={gameOverData.winner}
          finalScores={gameOverData.finalScores}
          players={roomData?.players || gameState?.players}
          isHost={isHost}
          onPlayAgain={handlePlayAgain}
          onLeave={handleLeaveGame}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
