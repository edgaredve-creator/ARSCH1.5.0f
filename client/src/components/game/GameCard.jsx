import './Card.css';

// Temperature-themed names per value (matches server ROAST_NAMES)
const ROAST_COLORS = {
  0: { bg: '#5de8f0', text: '#0a3a3d', label: '🧊 Permafrost' },
  1: { bg: '#7be0f5', text: '#0a3545', label: '❄️ Glacial' },
  2: { bg: '#80e8b0', text: '#0d4028', label: '🌨 Helado' },
  3: { bg: '#b8f070', text: '#2a4008', label: '🌿 Frío' },
  4: { bg: '#f0e060', text: '#4a3a00', label: '☀️ Templado' },
  5: { bg: '#ffc020', text: '#5a2a00', label: '🌤 Tibio' },
  6: { bg: '#ff9040', text: '#4a1500', label: '🌶 Caliente' },
  7: { bg: '#ff5030', text: '#fff',    label: '🔥 Ardiente' },
  8: { bg: '#dd1010', text: '#fff',    label: '💥 Infernal' },
};

const ACTION_STYLES = {
  SPY:      { bg: '#9b7fe8', emoji: '👁',  label: 'SPY',      desc: 'Espía una carta', pts: 9  },
  SWAP:     { bg: '#ff9240', emoji: '🔄',  label: 'SWAP',     desc: 'Intercambia 2 cartas', pts: 10 },
  GO_AGAIN: { bg: '#40e0d0', emoji: '⚡',  label: 'GO AGAIN', desc: 'Juega otra vez', pts: 11 },
};

const FRESH_COLORS = {
  '-2': { bg: '#1a9c5a', glow: '#6bea7a', label: '✨ Ultra Fresh', text: '#fff' },
  '-4': { bg: '#0d6a3e', glow: '#40e09a', label: '💎 Mega Fresh',  text: '#afffce' },
};

export function GameCard({ card, size = 'md', selected, selectable, onClick, peeked, myCard, className = '' }) {
  const sizeMap = { sm: 'card-sm', md: 'card-md', lg: 'card-lg' };

  if (!card || (!card.faceUp && !peeked)) {
    return (
      <div
        className={`game-card card-back ${sizeMap[size]} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${className}`}
        onClick={onClick}
      >
        <div className="card-back-inner">
          <span className="card-marshmallow">🍡</span>
          {peeked && <div className="peeked-indicator">👁</div>}
        </div>
      </div>
    );
  }

  if (card.type === 'ACTION') {
    const style = ACTION_STYLES[card.action] || ACTION_STYLES.SPY;
    return (
      <div
        className={`game-card card-action ${sizeMap[size]} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${className}`}
        onClick={onClick}
        style={{ '--card-bg': style.bg }}
      >
        <div className="action-value-badge top">{style.pts}pts</div>
        <div className="card-action-emoji">{style.emoji}</div>
        <div className="card-action-label">{style.label}</div>
        <div className="card-action-desc">{style.desc}</div>
        <div className="action-value-badge bottom">{style.pts}pts</div>
      </div>
    );
  }

  if (card.type === 'FRESH') {
    const key = String(card.value);
    const style = FRESH_COLORS[key] || FRESH_COLORS['-2'];
    return (
      <div
        className={`game-card card-fresh ${sizeMap[size]} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${className}`}
        onClick={onClick}
        style={{ background: style.bg, '--fresh-glow': style.glow }}
      >
        <div className="fresh-value-badge top">{card.value}</div>
        <div className="card-fresh-emoji">✨</div>
        <div className="card-fresh-label" style={{ color: style.glow }}>{style.label}</div>
        <div className="fresh-value-badge bottom">{card.value}</div>
      </div>
    );
  }

  // ROAST card
  const roast = ROAST_COLORS[card.value] || ROAST_COLORS[8];
  const emoji = card.value <= 1 ? '🧊' : card.value <= 3 ? '😊' : card.value <= 5 ? '😅' : card.value <= 6 ? '😰' : card.value <= 7 ? '🥵' : '🔥';
  return (
    <div
      className={`game-card card-roast ${sizeMap[size]} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${className}`}
      onClick={onClick}
      style={{ '--card-bg': roast.bg, '--card-text': roast.text }}
    >
      <div className="card-value-top">{card.value}</div>
      <div className="card-marshmallow-art">{emoji}</div>
      <div className="card-roast-label">{roast.label}</div>
      <div className="card-value-bottom">{card.value}</div>
    </div>
  );
}
