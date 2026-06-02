import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { AuthPage } from './pages/AuthPage';
import { GamePage } from './pages/GamePage';
import { LeaderboardPage } from './pages/LeaderboardPage';

function AppInner() {
  const { user, logout, loading } = useAuth();
  const [page, setPage] = useState('game'); // game | leaderboard

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: '3rem', animation: 'bounce 0.8s ease infinite' }}>🍡</div>
        <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Loading...</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <SocketProvider>
      {page === 'leaderboard' ? (
        <LeaderboardPage onBack={() => setPage('game')} />
      ) : (
        <GamePage
          onLeaderboard={() => setPage('leaderboard')}
          onLogout={logout}
        />
      )}
    </SocketProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
