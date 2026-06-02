import { Avatar } from '../ui/Avatar';
import './RoundEnd.css';

export function RoundEndOverlay({ roundData, players, isHost, onNextRound, currentRound, totalRounds }) {
  if (!roundData) return null;
  const { scores, calledByPlayer, callerIndex } = roundData;

  const sorted = [...(scores || [])].sort((a, b) => a.roundScore - b.roundScore);

  return (
    <div className="round-end-overlay">
      <div className="round-end-panel">
        <div className="round-end-header">
          <h2 className="round-end-title">
            {calledByPlayer ? '🍡 Arschmallows!' : '🃏 Round Over!'}
          </h2>
          <p className="round-end-sub">Round {currentRound} of {totalRounds}</p>
        </div>

        <div className="round-scores">
          {sorted.map((s, i) => {
            const player = players?.find(p => p.id === s.playerId);
            const isWinner = i === 0;
            const isPenalized = s.penalized;
            return (
              <div key={s.playerId} className={`score-row ${isWinner ? 'winner-row' : ''} ${isPenalized ? 'penalized-row' : ''}`}>
                <div className="score-rank">
                  {isWinner ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </div>
                <Avatar id={player?.avatar} size={32} />
                <div className="score-name">
                  <span className="sname">{s.username}</span>
                  {isPenalized && <span className="penalty-tag">⚠️ PENALIZED ×2</span>}
                </div>
                <div className="score-values">
                  {isPenalized && (
                    <span className="original-score">{s.originalScore}</span>
                  )}
                  <span className={`round-score ${isPenalized ? 'penalized' : ''}`}>
                    +{s.roundScore}
                  </span>
                  <span className="total-score">{s.totalScore ?? player?.totalScore ?? 0} total</span>
                </div>
              </div>
            );
          })}
        </div>

        {calledByPlayer && scores?.[callerIndex]?.penalized && (
          <div className="arschmallows-fail">
            ❌ {scores[callerIndex]?.username} didn't have the lowest score — points doubled!
          </div>
        )}

        {isHost ? (
          <button className="btn btn-primary btn-lg w-full" onClick={onNextRound}>
            {currentRound >= totalRounds ? '🏆 See Final Results' : '▶ Next Round'}
          </button>
        ) : (
          <p className="waiting-host">⏳ Waiting for host to continue...</p>
        )}
      </div>
    </div>
  );
}
