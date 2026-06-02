import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PlayerArea } from './PlayerArea';
import { GameCard } from './GameCard';
import { TurnTimer } from './TurnTimer';
import { playSound } from '../../utils/sounds';
import './GameBoard.css';

// ── Flow states ───────────────────────────────────────────────────────────────
// New draw flow:
//   IDLE → click draw pile → HOLDING_DRAW_CARD
//   HOLDING_DRAW_CARD → click own facedown card → confirm swap
//   HOLDING_DRAW_CARD → click discard pile → confirm discard → MUST_FLIP
//   MUST_FLIP → click own facedown card → reveal it → IDLE (next turn)
const FLOW = {
  IDLE: 'idle',
  HOLDING_DRAW_CARD: 'holding',  // drew from pile, deciding what to do
  CONFIRM_SWAP: 'confirm_swap',  // chose own card to swap
  CONFIRM_DISCARD: 'confirm_discard', // chose to discard drawn card
  MUST_FLIP: 'must_flip',        // discarded drawn, must flip one own card
  CONFIRM_FLIP: 'confirm_flip',  // chose which to flip
  GROUP_SELECT: 'group_select',
  SPY_SELECT: 'spy_select',
  SWAP_MY_SELECT: 'swap_my_select',
  SWAP_THEIR_SELECT: 'swap_their_select',
  SWAP_CONFIRM: 'swap_confirm',
};

export function GameBoard({ socket, gameState, roomCode, onToast }) {
  const { user } = useAuth();
  const [flow, setFlow] = useState(FLOW.IDLE);
  const [drawnCard, setDrawnCard] = useState(null);
  const [drawnSource, setDrawnSource] = useState(null); // 'draw' | 'discard'
  const [selectedMy, setSelectedMy] = useState(null);
  const [selectedTheir, setSelectedTheir] = useState(null);
  const [spiedCard, setSpiedCard] = useState(null);
  const [groupIndices, setGroupIndices] = useState([]);
  const [actionLog, setActionLog] = useState([]);

  // Anim states
  const [drawFlash, setDrawFlash] = useState(null);         // { source } — pile glow while card in hand
  const [swapFlash, setSwapFlash] = useState(null);         // { playerId, cardIdx } — where card landed
  const [spyAnim, setSpyAnim] = useState(null);             // { targetPlayerId, cardIndex }
  const [swapAnim, setSwapAnim] = useState(null);           // { p1Id,p1Idx,p2Id,p2Idx }
  const [discardFlash, setDiscardFlash] = useState(false);  // red flash on discard pile
  const [floatingDraw, setFloatingDraw] = useState(null);    // { source, playerName } — floating card anim for opponents

  const myPlayer = gameState?.players?.find(p => p.id === user?.id);
  const myIndex = gameState?.players?.findIndex(p => p.id === user?.id);
  const isMyTurn = gameState?.currentPlayerIndex === myIndex;
  const currentPlayer = gameState?.players?.[gameState?.currentPlayerIndex];
  const phase = gameState?.phase;

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('card_drawn', ({ card, source }) => {
      setDrawnCard(card);
      setDrawnSource(source);
      setFlow(FLOW.HOLDING_DRAW_CARD);
      playSound('cardDraw');
    });

    socket.on('must_flip_card', () => {
      setDrawnCard(null);
      setDrawnSource(null);
      setFlow(FLOW.MUST_FLIP);
    });

    socket.on('spy_result', ({ card }) => {
      setSpiedCard({ ...card, faceUp: true });
      playSound('spy');
      resetFlow();
    });

    socket.on('spy_animation', ({ targetPlayerId, cardIndex }) => {
      setSpyAnim({ targetPlayerId, cardIndex });
    });
    socket.on('spy_used', () => {
      setSpyAnim(null);
      addLog('👁 Espionaje completado');
    });

    socket.on('action_pending', ({ action, playerId }) => {
      addLog(`🎴 ${nameOf(playerId)} jugó ${action}`);
    });

    socket.on('swap_done', ({ byPlayerId, targetPlayerId, myCardIndex, theirCardIndex }) => {
      playSound('swap');
      setSwapAnim({ p1Id: byPlayerId, p1Idx: myCardIndex, p2Id: targetPlayerId, p2Idx: theirCardIndex });
      setTimeout(() => setSwapAnim(null), 3000);
      addLog(`🔄 ${nameOf(byPlayerId)} ↔ ${nameOf(targetPlayerId)}`);
    });

    socket.on('go_again', ({ byPlayerId, count }) => {
      addLog(`⚡ ${nameOf(byPlayerId)} juega de nuevo! (${count} extra)`);
    });

    socket.on('arschmallows_called', ({ username }) => {
      playSound('arschmallows');
      addLog(`🍡 ${username} cantó ARSCHMALLOWS!`);
    });

    socket.on('turn_timeout', () => {
      if (isMyTurn) onToast?.('⏱ Tiempo agotado!', 'error');
      resetFlow();
      setDrawFlash(null);
    });

    socket.on('turn_changed', () => {
      resetFlow();
      setDrawFlash(null);
      setFloatingDraw(null);
    });

    // Opponent drew — show floating card animation + pile glow while they hold the card
    socket.on('opponent_drew', ({ playerId, source }) => {
      setDrawFlash({ source, playerId });
      setFloatingDraw({ source, playerName: nameOf(playerId) });
      addLog(source === 'discard' ? `📤 ${nameOf(playerId)} tomó del descarte` : `🃏 ${nameOf(playerId)} tomó del mazo`);
    });

    // Opponent placed card — clear floating animation
    socket.on('opponent_placed_card', ({ playerId, cardIdx, action }) => {
      setDrawFlash(null);
      setFloatingDraw(null);
      if (action === 'swap') {
        setSwapFlash({ playerId, cardIdx });
        setTimeout(() => setSwapFlash(null), 2500);
      } else if (action === 'discard' || action === 'flip') {
        setDiscardFlash(true);
        setTimeout(() => setDiscardFlash(false), 1500);
      }
    });

    socket.on('group_discarded', ({ playerId }) => {
      addLog(`🃏 ${nameOf(playerId)} descartó un grupo`);
    });

    socket.on('group_discard_penalty', ({ playerId }) => {
      if (playerId === user.id) onToast?.('❌ Grupo inválido — recibiste una carta de penalización', 'error', 3500);
      else addLog(`❌ ${nameOf(playerId)} falló descarte en grupo`);
    });

    return () => {
      ['card_drawn','must_flip_card','spy_result','spy_animation','spy_used',
       'action_pending','swap_done','go_again','arschmallows_called',
       'turn_timeout','turn_changed','opponent_drew','opponent_placed_card',
       'group_discarded','group_discard_penalty'].forEach(e => socket.off(e));
    };
  }, [socket, isMyTurn, gameState]);

  useEffect(() => { if (!isMyTurn) { resetFlow(); setDrawFlash(null); } }, [isMyTurn]);

  useEffect(() => {
    if (isMyTurn && phase === 'PLAYING') {
      playSound('yourTurn');
      onToast?.('⚡ Tu turno!', 'info', 2000);
    }
  }, [gameState?.currentPlayerIndex]);

  function addLog(msg) { setActionLog(prev => [msg, ...prev].slice(0, 6)); }
  function nameOf(id) { return gameState?.players?.find(p => p.id === id)?.username || '?'; }

  function resetFlow() {
    setFlow(FLOW.IDLE);
    setDrawnCard(null);
    setDrawnSource(null);
    setSelectedMy(null);
    setSelectedTheir(null);
    setGroupIndices([]);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  // Click on draw or discard pile
  function handlePileClick(source) {
    if (!isMyTurn) return;

    // During HOLDING: clicking discard pile = wants to discard drawn card
    if (flow === FLOW.HOLDING_DRAW_CARD && source === 'discard') {
      setFlow(FLOW.CONFIRM_DISCARD);
      return;
    }

    // Idle: draw card
    if (flow === FLOW.IDLE) {
      socket?.emit('draw_card', { source });
    }
  }

  function confirmDiscard() {
    socket?.emit('discard_drawn_card');
    setFlow(FLOW.MUST_FLIP);
    setDrawnCard(null);
    setDrawnSource(null);
  }

  function confirmSwapDrawn() {
    if (selectedMy === null) return;
    socket?.emit('swap_drawn_with_own', { cardIndex: selectedMy });
    playSound('cardFlip');
    resetFlow();
  }

  function confirmFlip() {
    if (selectedMy === null) return;
    socket?.emit('flip_own_card', { cardIndex: selectedMy });
    playSound('cardFlip');
    resetFlow();
  }

  function useActionCard() {
    if (!drawnCard || drawnCard.type !== 'ACTION') return;
    socket?.emit('play_action', { action: drawnCard.action });
    const action = drawnCard.action;
    setDrawnCard(null); setDrawnSource(null);
    if (action === 'SPY') setFlow(FLOW.SPY_SELECT);
    else if (action === 'SWAP') { setSelectedMy(null); setSelectedTheir(null); setFlow(FLOW.SWAP_MY_SELECT); }
    else if (action === 'GO_AGAIN') { socket?.emit('resolve_go_again'); resetFlow(); }
  }

  function handleSpySelect(targetPlayerId, cardIdx) { setSelectedTheir({ playerId: targetPlayerId, idx: cardIdx }); }
  function confirmSpy() {
    if (!selectedTheir) return;
    socket?.emit('resolve_spy', { targetPlayerId: selectedTheir.playerId, cardIndex: selectedTheir.idx });
    setSelectedTheir(null);
  }

  function handleSwapMySelect(idx) { setSelectedMy(idx); setSelectedTheir(null); setFlow(FLOW.SWAP_THEIR_SELECT); }
  function handleSwapTheirSelect(pId, idx) { setSelectedTheir({ playerId: pId, idx }); setFlow(FLOW.SWAP_CONFIRM); }
  function confirmSwap() {
    socket?.emit('resolve_swap', { myCardIndex: selectedMy, targetPlayerId: selectedTheir.playerId, theirCardIndex: selectedTheir.idx });
    resetFlow();
  }

  function toggleGroupCard(idx) {
    setGroupIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }
  function confirmGroupDiscard() {
    if (groupIndices.length < 2) { onToast?.('Selecciona al menos 2 cartas', 'error'); return; }
    socket?.emit('group_discard', { cardIndices: groupIndices });
    resetFlow();
  }

  function callArschmallows() {
    if (!isMyTurn || flow !== FLOW.IDLE || drawnCard || gameState?.callerIndex != null) return;
    socket?.emit('call_arschmallows');
    playSound('arschmallows');
  }

  // ── Card click routing ────────────────────────────────────────────────────

  function handleMyCardClick(idx) {
    if (!isMyTurn) return;
    const card = myPlayer?.cards?.[idx];
    if (!card || card.faceUp) return;

    if (flow === FLOW.HOLDING_DRAW_CARD) { setSelectedMy(idx); setFlow(FLOW.CONFIRM_SWAP); }
    else if (flow === FLOW.CONFIRM_SWAP) { setSelectedMy(idx); } // change selection
    else if (flow === FLOW.MUST_FLIP) { setSelectedMy(idx); setFlow(FLOW.CONFIRM_FLIP); }
    else if (flow === FLOW.CONFIRM_FLIP) { setSelectedMy(idx); }
    else if (flow === FLOW.GROUP_SELECT) toggleGroupCard(idx);
    else if (flow === FLOW.SWAP_MY_SELECT || flow === FLOW.SWAP_THEIR_SELECT || flow === FLOW.SWAP_CONFIRM) handleSwapMySelect(idx);
    else if (flow === FLOW.SPY_SELECT) handleSpySelect(user.id, idx);
  }

  function handleOpponentCardClick(idx, player) {
    if (!isMyTurn) return;
    const card = player?.cards?.[idx];
    if (!card || card.faceUp) return;
    if (flow === FLOW.SPY_SELECT) handleSpySelect(player.id, idx);
    else if (flow === FLOW.SWAP_THEIR_SELECT || flow === FLOW.SWAP_CONFIRM) handleSwapTheirSelect(player.id, idx);
  }

  // ── Selectable indices ────────────────────────────────────────────────────

  function getMySelectable() {
    if (!isMyTurn || !myPlayer) return [];
    const fd = myPlayer.cards?.map((c, i) => !c.faceUp ? i : null).filter(i => i !== null) || [];
    const active = [FLOW.HOLDING_DRAW_CARD, FLOW.CONFIRM_SWAP, FLOW.MUST_FLIP, FLOW.CONFIRM_FLIP,
                    FLOW.GROUP_SELECT, FLOW.SWAP_MY_SELECT, FLOW.SWAP_THEIR_SELECT, FLOW.SWAP_CONFIRM, FLOW.SPY_SELECT];
    return active.includes(flow) ? fd : [];
  }

  function getOpponentSelectable(player) {
    if (!isMyTurn) return [];
    const fd = player.cards?.map((c, i) => !c.faceUp ? i : null).filter(i => i !== null) || [];
    return (flow === FLOW.SPY_SELECT || flow === FLOW.SWAP_THEIR_SELECT || flow === FLOW.SWAP_CONFIRM) ? fd : [];
  }

  // ── Hint text ─────────────────────────────────────────────────────────────

  function getHint() {
    if (!isMyTurn) return `Turno de ${currentPlayer?.username || '...'}`;
    const ga = gameState?.goAgainCount > 0 ? ` ⚡×${gameState.goAgainCount}` : '';
    if (flow === FLOW.IDLE) return `Toca el mazo o el descarte para robar${ga}`;
    if (flow === FLOW.HOLDING_DRAW_CARD) {
      if (drawnCard?.type === 'ACTION') return `🎴 ${drawnCard.action} — Úsala o intercámbiala con una tuya`;
      return 'Toca una carta tuya para intercambiar, o toca el descarte para descartar';
    }
    if (flow === FLOW.CONFIRM_DISCARD) return '¿Descartar esta carta? Confirma o cancela';
    if (flow === FLOW.CONFIRM_SWAP) return selectedMy !== null ? '✓ Confirma el intercambio' : 'Toca una carta tuya boca abajo';
    if (flow === FLOW.MUST_FLIP) return 'Debes revelar una carta de tu mano';
    if (flow === FLOW.CONFIRM_FLIP) return '✓ Confirma revelar esta carta';
    if (flow === FLOW.GROUP_SELECT) return `${groupIndices.length} sel. — 3+ del mismo valor o 2+ de acción`;
    if (flow === FLOW.SPY_SELECT) return selectedTheir ? '✓ Confirma espiar' : '👁 Toca cualquier carta boca abajo';
    if (flow === FLOW.SWAP_MY_SELECT) return '🔄 Toca UNA DE TUS cartas boca abajo';
    if (flow === FLOW.SWAP_THEIR_SELECT) return '🔄 Ahora toca la carta de un rival';
    if (flow === FLOW.SWAP_CONFIRM) return '✓ Confirma el intercambio';
    return '';
  }

  if (!gameState) return <div className="peek-phase"><div className="peek-title"><h2>⏳ Conectando...</h2></div></div>;
  if (phase === 'PEEK') return <PeekPhase socket={socket} gameState={gameState} myPlayer={myPlayer} />;

  const opponents = gameState?.players?.filter(p => p.id !== user?.id) || [];
  const drawPileGlowing = drawFlash?.source === 'draw';
  const discardPileGlowing = drawFlash?.source === 'discard';

  return (
    <div className="game-board">
      {/* Header */}
      <div className="game-header">
        <span className="round-badge">R {gameState?.round || 1}/6</span>
        {gameState?.callerIndex != null && phase === 'PLAYING' && (
          <span className="courtesy-badge">🍡 Cortesía</span>
        )}
        {gameState?.goAgainCount > 0 && (
          <span className="goagain-badge">⚡×{gameState.goAgainCount}</span>
        )}
        {phase === 'PLAYING' && (
          <TurnTimer turnStartedAt={gameState?.turnStartedAt} timeLimit={gameState?.turnTimeLimit || 45} isMyTurn={isMyTurn} />
        )}
        <div className="action-log">
          {actionLog[0] && <span className="log-entry">{actionLog[0]}</span>}
        </div>
      </div>

      {/* Opponents */}
      <div className={`opponents-grid opp-${opponents.length}`}>
        {opponents.map(p => (
          <PlayerArea key={p.id} player={p}
            isCurrentPlayer={gameState?.players?.[gameState?.currentPlayerIndex]?.id === p.id}
            isMe={false}
            onCardClick={(idx) => handleOpponentCardClick(idx, p)}
            selectableIndices={getOpponentSelectable(p)}
            selectedIndex={(flow === FLOW.SWAP_THEIR_SELECT || flow === FLOW.SWAP_CONFIRM) && selectedTheir?.playerId === p.id ? selectedTheir.idx : null}
            spyHighlight={spyAnim?.targetPlayerId === p.id ? spyAnim.cardIndex : null}
            swapHighlight={swapAnim ? (swapAnim.p1Id === p.id ? swapAnim.p1Idx : swapAnim.p2Id === p.id ? swapAnim.p2Idx : null) : null}
            swapLandedIdx={swapFlash?.playerId === p.id ? swapFlash.cardIdx : null}
          />
        ))}
      </div>

      {/* Center table */}
      <div className="table-center">
        {/* Draw pile */}
        <div className="pile-area" onClick={() => handlePileClick('draw')}>
          <div className={`pile draw-pile
            ${isMyTurn && flow === FLOW.IDLE ? 'pile-clickable' : ''}
            ${drawPileGlowing ? 'pile-flash-yellow' : ''}
            ${isMyTurn && flow === FLOW.HOLDING_DRAW_CARD ? 'pile-dim' : ''}`}>
            <span className="pile-emoji">🃏</span>
            <span className="pile-count">{gameState?.drawPileCount || 0}</span>
          </div>
          <span className="pile-label">Mazo</span>
        </div>

        {/* Drawn card display */}
        {drawnCard && isMyTurn && (
          <div className="drawn-card-area">
            <div className="drawn-card-glow">
              <GameCard card={drawnCard} size="lg" />
            </div>
            {drawnCard.type === 'ACTION' && (
              <button className="btn btn-primary btn-sm mt-1" onClick={useActionCard}>
                ⚡ Usar {drawnCard.action}
              </button>
            )}
          </div>
        )}

        {/* Discard pile */}
        <div className="pile-area" onClick={() => handlePileClick('discard')}>
          <div className={`pile discard-pile
            ${isMyTurn && flow === FLOW.IDLE && gameState?.topDiscard ? 'pile-clickable' : ''}
            ${isMyTurn && flow === FLOW.HOLDING_DRAW_CARD ? 'pile-clickable-discard' : ''}
            ${discardPileGlowing ? 'pile-flash-yellow' : ''}
            ${discardFlash ? 'pile-flash-red' : ''}`}>
            {gameState?.topDiscard
              ? <GameCard card={gameState.topDiscard} size="md" />
              : <span className="pile-emoji">⬜</span>}
          </div>
          <span className="pile-label">Descarte</span>
        </div>
      </div>

      {/* Floating draw animation — visible to opponents while player holds card */}
      {floatingDraw && !isMyTurn && (
        <div className={'floating-draw-anim floating-draw-' + floatingDraw.source}>
          <span className='floating-draw-card'>🃏</span>
          <span className='floating-draw-emoji'>{floatingDraw.source === 'draw' ? '📦' : '📤'}</span>
          <span className='floating-draw-text'>{floatingDraw.playerName} tiene una carta en mano</span>
        </div>
      )}

      {/* Hint */}
      <div className={`hint-bar ${isMyTurn ? 'my-turn' : ''}`}>{getHint()}</div>

      {/* My area */}
      <div className="my-area">
        <PlayerArea
          player={myPlayer || { username: user?.username, cards: [], totalScore: 0, avatar: user?.avatar }}
          isCurrentPlayer={isMyTurn}
          isMe
          onCardClick={handleMyCardClick}
          selectableIndices={getMySelectable()}
          selectedIndex={selectedMy}
          groupIndices={groupIndices}
          spyHighlight={spyAnim?.targetPlayerId === user?.id ? spyAnim.cardIndex : null}
          swapHighlight={swapAnim ? (swapAnim.p1Id === user?.id ? swapAnim.p1Idx : swapAnim.p2Id === user?.id ? swapAnim.p2Idx : null) : null}
          swapLandedIdx={swapFlash?.playerId === user?.id ? swapFlash.cardIdx : null}
        />

        {/* Context-aware action buttons */}
        <div className="my-actions">
          {isMyTurn && flow === FLOW.IDLE && (
            <>
              {gameState?.callerIndex == null && (
                <button className="btn btn-primary arschmallows-btn" onClick={callArschmallows}>🍡 ¡Arschmallows!</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { setFlow(FLOW.GROUP_SELECT); setGroupIndices([]); }}>
                🃏 Grupo
              </button>
            </>
          )}

          {flow === FLOW.CONFIRM_DISCARD && (
            <div className="confirm-bar">
              <span className="confirm-hint">¿Descartar?</span>
              <button className="btn btn-danger btn-sm" onClick={confirmDiscard}>✓ Sí, descartar</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setFlow(FLOW.HOLDING_DRAW_CARD)}>✗ No</button>
            </div>
          )}

          {flow === FLOW.CONFIRM_SWAP && selectedMy !== null && (
            <div className="confirm-bar">
              <button className="btn btn-primary btn-sm" onClick={confirmSwapDrawn}>↔ Intercambiar</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedMy(null); setFlow(FLOW.HOLDING_DRAW_CARD); }}>✗ Cambiar</button>
            </div>
          )}

          {flow === FLOW.CONFIRM_FLIP && selectedMy !== null && (
            <div className="confirm-bar">
              <button className="btn btn-primary btn-sm" onClick={confirmFlip}>👁 Revelar</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedMy(null); setFlow(FLOW.MUST_FLIP); }}>✗ Cambiar</button>
            </div>
          )}

          {flow === FLOW.GROUP_SELECT && (
            <div className="confirm-bar">
              <span className="confirm-count">{groupIndices.length}</span>
              <button className="btn btn-primary btn-sm" onClick={confirmGroupDiscard} disabled={groupIndices.length < 2}>✓ Descartar grupo</button>
              <button className="btn btn-ghost btn-sm" onClick={resetFlow}>✗ Cancelar</button>
            </div>
          )}

          {flow === FLOW.SPY_SELECT && (
            <div className="confirm-bar">
              {selectedTheir && <button className="btn btn-primary btn-sm" onClick={confirmSpy}>👁 Espiar</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedTheir(null); if (!selectedTheir) resetFlow(); }}>
                {selectedTheir ? '✗ Cambiar' : '✗ Cancelar'}
              </button>
            </div>
          )}

          {/* SWAP: no cancel button — change selection by clicking different cards */}
          {(flow === FLOW.SWAP_MY_SELECT || flow === FLOW.SWAP_THEIR_SELECT || flow === FLOW.SWAP_CONFIRM) && (
            <div className="confirm-bar">
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {selectedMy !== null ? '✓ tuya' : '…tuya'} 🔄 {selectedTheir !== null ? '✓ rival' : '…rival'}
              </span>
              {selectedMy !== null && selectedTheir !== null && (
                <button className="btn btn-primary btn-sm" onClick={confirmSwap}>🔄 ¡Confirmar!</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SPY modal — private */}
      {spiedCard && (
        <div className="spy-popup">
          <div className="spy-popup-inner">
            <p className="spy-popup-title">👁 Solo tú puedes ver esto</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '-8px' }}>Los demás esperan</p>
            <GameCard card={spiedCard} size="lg" />
            <button className="btn btn-primary btn-sm" onClick={() => { setSpiedCard(null); socket?.emit('close_spy_modal'); }}>
              ✓ Listo
            </button>
          </div>
        </div>
      )}

      <EmotePicker socket={socket} gameState={gameState} userId={user?.id} />
    </div>
  );
}

// ── Peek Phase ────────────────────────────────────────────────────────────────
function PeekPhase({ socket, gameState, myPlayer }) {
  const [peekedCards, setPeekedCards] = useState({});
  const [confirmed, setConfirmed] = useState(false);

  function peekCard(idx) {
    if (Object.keys(peekedCards).length >= 2 || peekedCards[idx]) return;
    socket?.emit('peek_card', { cardIndex: idx });
    socket?.once('card_peeked', ({ card, index }) => setPeekedCards(prev => ({ ...prev, [index]: card })));
  }

  const waitingCount = gameState?.players?.filter(p => !p.peekConfirmed).length || 0;
  return (
    <div className="peek-phase">
      <div className="peek-title"><h2>👀 Mira 2 de tus cartas</h2><p>¡Recuérdalas bien!</p></div>
      <div className="peek-cards">
        {myPlayer?.cards?.map((card, i) => (
          <div key={i}
            className={`peek-card-wrap ${peekedCards[i] ? 'peeked' : ''} ${Object.keys(peekedCards).length >= 2 && !peekedCards[i] ? 'disabled' : ''}`}
            onClick={() => !confirmed && peekCard(i)}>
            <GameCard card={peekedCards[i] ? { ...peekedCards[i], faceUp: true } : card} size="lg" peeked={!!peekedCards[i]} />
          </div>
        ))}
      </div>
      {!confirmed
        ? <button className="btn btn-primary btn-lg" onClick={() => { socket?.emit('confirm_peek'); setConfirmed(true); }} disabled={Object.keys(peekedCards).length < 2}>✓ ¡Las recuerdo!</button>
        : <div className="waiting-text">⏳ Esperando a {waitingCount}...</div>}
    </div>
  );
}

// ── Emote Picker ──────────────────────────────────────────────────────────────
const EMOTES = [
  { id: 'laugh', emoji: '😂' }, { id: 'wow', emoji: '😮' }, { id: 'sad', emoji: '😢' },
  { id: 'angry', emoji: '😡' }, { id: 'cool', emoji: '😎' }, { id: 'fire', emoji: '🔥' },
  { id: 'gg', emoji: '🏆' }, { id: 'skull', emoji: '💀' }, { id: 'marshmallow', emoji: '🍡' },
];
const EMOTE_COOLDOWN = 3000;

function EmotePicker({ socket, gameState, userId }) {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState([]);
  const [cooldown, setCooldown] = useState(false);
  const cdRef = useRef(false);

  useEffect(() => {
    if (!socket) return;
    socket.on('emote', ({ playerId, username, emoteId }) => {
      const e = EMOTES.find(x => x.id === emoteId);
      if (!e) return;
      const id = `${playerId}_${Date.now()}`;
      setBubbles(prev => [...prev, { id, playerId, username, emoji: e.emoji }]);
      setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== id)), 3500);
    });
    return () => socket.off('emote');
  }, [socket]);

  function sendEmote(emoteId) {
    if (cdRef.current) return;
    socket?.emit('emote', { emoteId });
    setOpen(false);
    cdRef.current = true; setCooldown(true);
    setTimeout(() => { cdRef.current = false; setCooldown(false); }, EMOTE_COOLDOWN);
  }

  return (
    <>
      {bubbles.map((b, i) => (
        <div key={b.id} className="emote-bubble" style={b.playerId === userId ? { bottom: '160px', right: `${80 + i * 60}px` } : { top: `${100 + i * 10}px`, left: `${30 + (i % 3) * 70}px` }}>
          <span className="emote-bubble-emoji">{b.emoji}</span>
          <span className="emote-bubble-name">{b.username}</span>
        </div>
      ))}
      <button className={`emote-trigger-btn ${cooldown ? 'cooldown' : ''}`} onClick={() => setOpen(o => !o)}>{cooldown ? '⏳' : '😄'}</button>
      {open && (
        <div className="emote-panel">
          {EMOTES.map(e => <button key={e.id} className="emote-option" onClick={() => sendEmote(e.id)}>{e.emoji}</button>)}
        </div>
      )}
    </>
  );
}
