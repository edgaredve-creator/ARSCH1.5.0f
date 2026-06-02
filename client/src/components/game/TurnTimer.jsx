import { useState, useEffect } from 'react';

export function TurnTimer({ turnStartedAt, timeLimit, isMyTurn }) {
  const [remaining, setRemaining] = useState(timeLimit);

  useEffect(() => {
    if (!turnStartedAt) return;
    const tick = () => {
      const elapsed = (Date.now() - turnStartedAt) / 1000;
      setRemaining(Math.max(0, timeLimit - elapsed));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnStartedAt, timeLimit]);

  const pct = remaining / timeLimit;
  const color = pct > 0.5 ? '#6bea7a' : pct > 0.25 ? '#ffd94a' : '#ff4757';
  const urgent = pct < 0.25;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: urgent && isMyTurn ? 'pulse 0.5s ease infinite' : 'none',
      }}>
        <svg width="48" height="48" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct)}`}
            style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.5s' }}
          />
        </svg>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color, zIndex: 1 }}>
          {Math.ceil(remaining)}
        </span>
      </div>
    </div>
  );
}
