import { Avatar } from '../ui/Avatar';
import { GameCard } from './GameCard';
import './PlayerArea.css';

export function PlayerArea({
  player, isCurrentPlayer, isMe, onCardClick,
  selectableIndices = [], selectedIndex, groupIndices = [],
  spyHighlight = null, swapHighlight = null, swapLandedIdx = null
}) {
  return (
    <div className={`player-area ${isCurrentPlayer ? 'active' : ''} ${isMe ? 'me' : ''}`}>
      <div className="player-info">
        <div className="player-avatar-wrap">
          <Avatar id={player.avatar} size={isMe ? 38 : 28} />
          {isCurrentPlayer && <div className="active-indicator">⚡</div>}
          {!player.connected && <div className="disconnected-indicator">📵</div>}
        </div>
        <div className="player-name-score">
          <span className="player-name">{player.username}{isMe ? ' (tú)' : ''}</span>
          <span className="player-score">{player.totalScore ?? 0} pts</span>
        </div>
      </div>
      <div className="player-cards">
        {player.cards?.map((card, i) => {
          const isSelected  = selectedIndex === i || groupIndices.includes(i);
          const isSpy       = spyHighlight === i;
          const isSwap      = swapHighlight === i;
          const isLanded    = swapLandedIdx === i;

          let wrapClass = 'card-wrap';
          let overlayIcon = null;

          if (isSpy)       { wrapClass += ' card-spy-glow';      overlayIcon = <div className="card-overlay-icon spy-eye">👁</div>; }
          else if (isSwap) { wrapClass += ' card-swap-glow';     overlayIcon = <div className="card-overlay-icon swap-label">SWAP</div>; }
          else if (isLanded){ wrapClass += ' card-swap-landed';  overlayIcon = <div className="card-overlay-icon swap-landed-label">↓ aquí</div>; }
          else if (isSelected){ wrapClass += ' card-selected-glow'; }

          return (
            <div key={card.id || i} className={wrapClass}>
              {overlayIcon}
              <GameCard
                card={card}
                size={isMe ? 'md' : 'sm'}
                peeked={card.peeked}
                selectable={selectableIndices.includes(i)}
                onClick={() => onCardClick && onCardClick(i, player)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
