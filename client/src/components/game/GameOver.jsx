import { Avatar } from '../ui/Avatar';
import './GameOver.css';

export function GameOverScreen({ winner, finalScores, players, isHost, onPlayAgain, onLeave }) {
  const sorted = [...(finalScores || [])].sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="gameover-overlay">
      <div className="gameover-panel">
        <div className="confetti-row">🎉🍡🎊🍡🎉</div>
        <h1 className="gameover-title">Game Over!</h1>

        <div className="winner-highlight">
          <Avatar id={winner?.avatar} size={72} />
          <div className="winner-info">
            <span className="winner-label">🏆 Winner</span>
            <span className="winner-name">{winner?.username}</span>
            <span className="winner-score">{winner?.totalScore ?? sorted[0]?.totalScore} points</span>
          </div>
        </div>

        <div className="final-scores">
          <h3 className="final-title">Final Standings</h3>
          {sorted.map((s, i) => (
            <div key={s.id} className={`final-row ${i === 0 ? 'champion' : ''}`}>
              <span className="final-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
              <Avatar id={players?.find(p => p.id === s.id)?.avatar || s.avatar} size={28} />
              <span className="final-name">{s.username}</span>
              <div className="final-rounds">
                {s.roundScores?.map((rs, ri) => (
                  <span key={ri} className="round-chip">{rs}</span>
                ))}
              </div>
              <span className="final-total">{s.totalScore}</span>
            </div>
          ))}
        </div>

        <div className="gameover-actions">
          {isHost && (
            <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
              🔄 Play Again
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            🚪 Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
