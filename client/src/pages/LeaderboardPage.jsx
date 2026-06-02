import { useState, useEffect } from 'react';
import { Avatar } from '../components/ui/Avatar';
import './LeaderboardPage.css';

export function LeaderboardPage({ onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/game/leaderboard')
      .then(r => r.json())
      .then(d => { setData(d.leaderboard || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="lb-screen">
      <div className="lb-panel">
        <div className="lb-header">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h2 className="lb-title">🏆 Leaderboard</h2>
          <div style={{ width: 60 }} />
        </div>

        {loading ? (
          <div className="lb-loading">Loading...</div>
        ) : data.length === 0 ? (
          <p className="text-muted text-center">No games played yet. Be the first!</p>
        ) : (
          <div className="lb-list">
            {data.map((row, i) => (
              <div key={row.id} className={`lb-row ${i < 3 ? `top-${i+1}` : ''}`}>
                <span className="lb-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
                </span>
                <Avatar id={row.avatar} size={36} />
                <div className="lb-info">
                  <span className="lb-username">{row.username}</span>
                  <span className="lb-stats">{row.total_games} games · {row.win_rate}% win rate</span>
                </div>
                <div className="lb-wins">
                  <span className="lb-win-count">{row.total_wins}</span>
                  <span className="lb-win-label">wins</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
