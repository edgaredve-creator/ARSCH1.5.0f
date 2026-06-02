// game/GameEngine.js
// All game state validation happens SERVER-SIDE only.
// Clients send intents; server validates and broadcasts authoritative state.

const { v4: uuidv4 } = require('uuid');

// ─── Card Definitions ────────────────────────────────────────────────────────
// Roast Rating cards: values 0–12, multiple copies
// Action cards: SPY, GO_AGAIN, SWAP
// Special cards: FRESH (negative points: -1, -2)

// Card name themes by temperature
const ROAST_NAMES = {
  0: 'Permafrost',
  1: 'Glacial',
  2: 'Helado',
  3: 'Frío',
  4: 'Templado',
  5: 'Tibio',
  6: 'Caliente',
  7: 'Ardiente',
  8: 'Infernal',
};

const FRESH_NAMES = {
  '-2': 'Ultra Fresh',
  '-4': 'Mega Fresh',
};

function buildDeck() {
  const cards = [];

  // Normal cards: values 0–7 (4 copies each), value 8 (8 copies)
  const normalDist = [
    { value: 0, count: 4 },
    { value: 1, count: 4 },
    { value: 2, count: 4 },
    { value: 3, count: 4 },
    { value: 4, count: 4 },
    { value: 5, count: 4 },
    { value: 6, count: 4 },
    { value: 7, count: 4 },
    { value: 8, count: 8 },
  ];

  normalDist.forEach(({ value, count }) => {
    for (let i = 0; i < count; i++) {
      cards.push({ id: uuidv4(), type: 'ROAST', value, label: ROAST_NAMES[value] || String(value) });
    }
  });

  // Negative value cards
  cards.push({ id: uuidv4(), type: 'FRESH', value: -2, label: FRESH_NAMES['-2'] });
  cards.push({ id: uuidv4(), type: 'FRESH', value: -4, label: FRESH_NAMES['-4'] });

  // Action cards: SPY=9 (8 copies), SWAP=10 (8 copies), GO_AGAIN=11 (4 copies)
  const actionDist = [
    { action: 'SPY',      value: 9,  count: 8 },
    { action: 'SWAP',     value: 10, count: 8 },
    { action: 'GO_AGAIN', value: 11, count: 4 },
  ];

  actionDist.forEach(({ action, value, count }) => {
    for (let i = 0; i < count; i++) {
      cards.push({ id: uuidv4(), type: 'ACTION', action, value, label: action });
    }
  });

  return cards;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Game State ───────────────────────────────────────────────────────────────

const CARDS_PER_PLAYER = 6;
const TOTAL_ROUNDS = 6;
const TURN_TIME_LIMIT = 45; // seconds

class GameEngine {
  constructor(roomCode, players) {
    this.roomCode = roomCode;
    this.state = this.initState(players);
  }

  initState(players) {
    return {
      phase: 'WAITING',       // WAITING | PEEK | PLAYING | ROUND_END | GAME_OVER
      round: 1,
      currentPlayerIndex: 0,
      players: players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar || 'marshmallow1',
        cards: [],            // { id, type, value, action, label, faceUp }
        roundScores: [],      // score per round
        totalScore: 0,
        connected: true,
        peekedIndices: [],    // indices player has peeked at this setup phase
      })),
      drawPile: [],
      discardPile: [],
      callerIndex: null,      // who called "Arschmallows!"
      turnTimer: null,
      turnStartedAt: null,
      pendingAction: null,    // { type, fromPlayerIndex, data }
      goAgainCount: 0,        // remaining bonus turns from GO_AGAIN
      winner: null,
    };
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  setupRound() {
    const deck = shuffle(buildDeck());
    const { players } = this.state;

    // Deal CARDS_PER_PLAYER facedown to each player
    players.forEach(p => {
      p.cards = deck.splice(0, CARDS_PER_PLAYER).map(card => ({
        ...card,
        faceUp: false,
      }));
      p.peekedIndices = [];
    });

    // Remaining deck + first discard
    this.state.drawPile = deck;
    const firstDiscard = this.state.drawPile.shift();
    this.state.discardPile = [{ ...firstDiscard, faceUp: true }];
    this.state.callerIndex = null;
    this.state.pendingAction = null;
    this.state.goAgainCount = 0;
    this.state.courtesyRound = false;
    this.state.phase = 'PEEK';
    this.state.turnStartedAt = Date.now();
  }

  startGame() {
    this.state.phase = 'PLAYING';
    this.state.round = 1;
    this.state.players.forEach(p => { p.totalScore = 0; p.roundScores = []; });
    this.setupRound();
    return this.getPublicState();
  }

  // Player peeks at 2 of their own cards during setup phase
  peekCard(playerId, cardIndex) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'Player not found' };
    if (this.state.phase !== 'PEEK') return { error: 'Not in peek phase' };
    if (player.peekedIndices.length >= 2) return { error: 'Already peeked at 2 cards' };
    if (player.peekedIndices.includes(cardIndex)) return { error: 'Already peeked at this card' };
    if (cardIndex < 0 || cardIndex >= player.cards.length) return { error: 'Invalid card index' };

    player.peekedIndices.push(cardIndex);
    // Return the actual card only to the requesting player
    return { success: true, card: player.cards[cardIndex], index: cardIndex };
  }

  confirmPeek(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'Player not found' };
    player.peekConfirmed = true;

    // If all players confirmed, start playing
    const allConfirmed = this.state.players.every(p => p.peekConfirmed);
    if (allConfirmed) {
      this.state.phase = 'PLAYING';
      this.state.currentPlayerIndex = 0;
      this.state.turnStartedAt = Date.now();
      return { success: true, startGame: true };
    }
    return { success: true, startGame: false };
  }

  // ─── Turn Logic ──────────────────────────────────────────────────────────

  getCurrentPlayer() {
    return this.state.players[this.state.currentPlayerIndex];
  }

  isCurrentPlayer(playerId) {
    return this.getCurrentPlayer()?.id === playerId;
  }

  drawFromPile(playerId, source) {
    // source: 'draw' | 'discard'
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (this.state.phase !== 'PLAYING') return { error: 'Game not in play phase' };
    if (this.state.pendingAction) return { error: 'Must resolve pending action first' };
    if (this.state.drawnCard) return { error: 'Already drew a card this turn' };

    let drawnCard;
    if (source === 'discard') {
      if (this.state.discardPile.length === 0) return { error: 'Discard pile is empty' };
      const top = this.state.discardPile[this.state.discardPile.length - 1];
      // Action cards from discard pile cannot be played — prevents infinite loops
      if (top.type === 'ACTION') return { error: 'No puedes tomar cartas de acción del descarte' };
      drawnCard = this.state.discardPile.pop();
    } else {
      if (this.state.drawPile.length === 0) {
        // Reshuffle discard pile except top
        const top = this.state.discardPile.pop();
        this.state.drawPile = shuffle(this.state.discardPile);
        this.state.discardPile = top ? [top] : [];
      }
      if (this.state.drawPile.length === 0) return { error: 'No cards left' };
      drawnCard = this.state.drawPile.shift();
    }

    drawnCard = { ...drawnCard, faceUp: true };
    this.state.drawnCard = drawnCard;
    this.state.turnStartedAt = Date.now();
    return { success: true, card: drawnCard };
  }

  // Player keeps drawn card and swaps with a face-down card
  swapDrawnWithOwn(playerId, cardIndex) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.drawnCard) return { error: 'No drawn card' };

    const player = this.getPlayer(playerId);
    if (cardIndex < 0 || cardIndex >= player.cards.length) return { error: 'Invalid card index' };
    if (player.cards[cardIndex].faceUp) return { error: 'Can only swap with facedown card' };

    const discarded = player.cards[cardIndex];
    player.cards[cardIndex] = { ...this.state.drawnCard, faceUp: false };
    this.state.discardPile.push({ ...discarded, faceUp: true });
    this.state.drawnCard = null;

    return this.afterTurnAction(playerId);
  }

  // Player discards drawn card and must flip one of their own facedown cards
  discardDrawnCard(playerId) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.drawnCard) return { error: 'No drawn card' };

    this.state.discardPile.push({ ...this.state.drawnCard, faceUp: true });
    this.state.drawnCard = null;
    this.state.mustFlipCard = true;

    return { success: true, mustFlip: true };
  }

  // After discarding drawn card, player must flip one of their facedown cards
  flipOwnCard(playerId, cardIndex) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.mustFlipCard) return { error: 'No flip required' };

    const player = this.getPlayer(playerId);
    if (cardIndex < 0 || cardIndex >= player.cards.length) return { error: 'Invalid card index' };
    if (player.cards[cardIndex].faceUp) return { error: 'Card already face up' };

    player.cards[cardIndex] = { ...player.cards[cardIndex], faceUp: true };
    this.state.mustFlipCard = false;

    return this.afterTurnAction(playerId);
  }

  // Play action card from draw pile
  playActionCard(playerId, action) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.drawnCard) return { error: 'No drawn card' };
    if (this.state.drawnCard.type !== 'ACTION') return { error: 'Drawn card is not an action card' };
    if (this.state.drawnCard.action !== action) return { error: 'Action mismatch' };

    this.state.pendingAction = { type: action, fromPlayerIndex: this.state.currentPlayerIndex };
    this.state.discardPile.push({ ...this.state.drawnCard, faceUp: true });
    this.state.drawnCard = null;

    return { success: true, pendingAction: this.state.pendingAction };
  }

  // SPY step 1: peek — reveal card to spy player, notify others of position only
  // Turn does NOT advance yet; spy must close the modal first
  resolveSpyAction(playerId, targetPlayerId, cardIndex) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.pendingAction || this.state.pendingAction.type !== 'SPY') return { error: 'No SPY action pending' };

    const target = this.getPlayer(targetPlayerId);
    if (!target) return { error: 'Target player not found' };
    if (cardIndex < 0 || cardIndex >= target.cards.length) return { error: 'Invalid card index' };
    if (target.cards[cardIndex].faceUp) return { error: 'Can only spy on facedown cards' };

    const card = target.cards[cardIndex];
    // Mark spy as resolved but do NOT advance turn yet
    this.state.pendingAction = null;
    this.state.spyViewed = false; // waiting for player to close modal

    // Return card only to the spying player; targetPlayerId+cardIndex go to everyone (position only)
    return { success: true, spiedCard: card, targetPlayerId, cardIndex, waitingClose: true };
  }

  // SPY step 2: player closed the modal — now advance turn
  closeSpyModal(playerId) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    return this.afterTurnAction(playerId);
  }

  // SWAP: exchange one facedown card with another player's facedown card
  resolveSwapAction(playerId, myCardIndex, targetPlayerId, theirCardIndex) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.pendingAction || this.state.pendingAction.type !== 'SWAP') return { error: 'No SWAP action pending' };

    const myPlayer = this.getPlayer(playerId);
    const targetPlayer = this.getPlayer(targetPlayerId);
    if (!targetPlayer) return { error: 'Target player not found' };
    if (targetPlayer.id === playerId) return { error: 'Cannot swap with yourself' };

    if (myCardIndex < 0 || myCardIndex >= myPlayer.cards.length) return { error: 'Invalid own card index' };
    if (theirCardIndex < 0 || theirCardIndex >= targetPlayer.cards.length) return { error: 'Invalid target card index' };
    if (myPlayer.cards[myCardIndex].faceUp) return { error: 'Can only swap facedown card' };
    if (targetPlayer.cards[theirCardIndex].faceUp) return { error: 'Target card must be facedown' };

    // Swap without looking
    const temp = myPlayer.cards[myCardIndex];
    myPlayer.cards[myCardIndex] = targetPlayer.cards[theirCardIndex];
    targetPlayer.cards[theirCardIndex] = temp;

    this.state.pendingAction = null;
    return this.afterTurnAction(playerId);
  }

  // GO_AGAIN: take 2 more turns
  resolveGoAgainAction(playerId) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (!this.state.pendingAction || this.state.pendingAction.type !== 'GO_AGAIN') return { error: 'No GO_AGAIN action pending' };

    this.state.pendingAction = null;
    this.state.goAgainCount += 1; // +1 bonus turn (current turn already counts as 1)
    return { success: true, goAgainCount: this.state.goAgainCount };
  }

  // Group discard: 3+ same ROAST value cards, or 2+ ACTION cards
  attemptGroupDiscard(playerId, cardIndices) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (this.state.drawnCard) return { error: 'Must resolve drawn card first' };
    if (this.state.phase !== 'PLAYING') return { error: 'Game not in play phase' };

    const player = this.getPlayer(playerId);
    if (!cardIndices || cardIndices.length < 2) return { error: 'Need at least 2 cards to group discard' };

    const selectedCards = cardIndices.map(i => player.cards[i]);
    if (selectedCards.some(c => c.faceUp)) return { error: 'Can only group-discard facedown cards' };
    if (selectedCards.some(c => !c)) return { error: 'Invalid card index' };

    const types = selectedCards.map(c => c.type);
    const allAction = types.every(t => t === 'ACTION');
    const allSameRoast = types.every(t => t === 'ROAST') && 
      selectedCards.every(c => c.value === selectedCards[0].value) &&
      cardIndices.length >= 3;

    if (!allAction && !allSameRoast) {
      // Penalty: draw 1 card from pile and add it facedown to hand, then end turn
      if (this.state.drawPile.length === 0) {
        const top = this.state.discardPile.pop();
        this.state.drawPile = shuffle(this.state.discardPile);
        this.state.discardPile = top ? [top] : [];
      }
      if (this.state.drawPile.length > 0) {
        const penaltyCard = this.state.drawPile.shift();
        player.cards.push({ ...penaltyCard, faceUp: false });
      }
      const turnResult = this.afterTurnAction(playerId);
      return { ...turnResult, groupInvalid: true, penalized: true };
    }

    // Draw a replacement card
    if (this.state.drawPile.length === 0) {
      const top = this.state.discardPile.pop();
      this.state.drawPile = shuffle(this.state.discardPile);
      this.state.discardPile = top ? [top] : [];
    }
    const newCard = this.state.drawPile.shift();

    // Discard the group (sorted descending to avoid index shifting)
    const sortedIndices = [...cardIndices].sort((a, b) => b - a);
    sortedIndices.forEach(i => {
      const [removed] = player.cards.splice(i, 1);
      this.state.discardPile.push({ ...removed, faceUp: true });
    });

    // Place new card facedown at end
    player.cards.push({ ...newCard, faceUp: false });

    // Group discard ends the turn immediately
    const turnResult = this.afterTurnAction(playerId);
    return { ...turnResult, groupDiscard: true, drawnCard: newCard, newCardIndex: player.cards.length - 1 };
  }

  afterTurnAction(playerId) {
    const player = this.getPlayer(playerId);
    this.state.mustFlipCard = false;

    this.advanceTurn();

    // Courtesy round: end when turn returns to the caller
    if (this.state.courtesyRound && this.state.currentPlayerIndex === this.state.callerIndex) {
      this.state.courtesyRound = false;
      return this.endRound(true);
    }

    // Natural end: current player has all cards face up (only if no courtesy round active)
    if (!this.state.courtesyRound && player.cards.every(c => c.faceUp)) {
      return this.endRound(false);
    }

    return { success: true, nextPlayerIndex: this.state.currentPlayerIndex };
  }

  advanceTurn() {
    if (this.state.goAgainCount > 0) {
      this.state.goAgainCount--;
    } else {
      this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
    }
    this.state.drawnCard = null;
    this.state.mustFlipCard = false;
    this.state.turnStartedAt = Date.now();
  }

  // ─── Call "Arschmallows!" ──────────────────────────────────────────────────

  callArschmallows(playerId) {
    if (!this.isCurrentPlayer(playerId)) return { error: 'Not your turn' };
    if (this.state.phase !== 'PLAYING') return { error: 'Game not in play phase' };
    if (this.state.drawnCard) return { error: 'Must resolve drawn card before calling' };

    // Store caller index and start courtesy round:
    // all other players get one more turn before the round ends.
    this.state.callerIndex = this.state.currentPlayerIndex;
    this.state.courtesyRound = true;
    // Advance to next player — round ends when turn returns to caller
    this.advanceTurn();
    return { success: true, courtesyRound: true, callerIndex: this.state.callerIndex, nextPlayerIndex: this.state.currentPlayerIndex };
  }

  // ─── Round End ────────────────────────────────────────────────────────────

  endRound(calledByPlayer) {
    this.state.phase = 'ROUND_END';

    // Reveal all cards
    this.state.players.forEach(p => {
      p.cards = p.cards.map(c => ({ ...c, faceUp: true }));
    });

    // Calculate scores
    const scores = this.state.players.map(p => ({
      playerId: p.id,
      username: p.username,
      cardTotal: p.cards.reduce((sum, c) => sum + c.value, 0),
      cards: p.cards,
    }));

    const minScore = Math.min(...scores.map(s => s.cardTotal));
    const callerScore = calledByPlayer ? scores[this.state.callerIndex]?.cardTotal : null;

    scores.forEach((s, i) => {
      const player = this.state.players[i];
      let roundScore = s.cardTotal;

      // Penalty: if caller's score is NOT the lowest, double their points
      if (calledByPlayer && i === this.state.callerIndex && s.cardTotal !== minScore) {
        roundScore = s.cardTotal * 2;
        s.penalized = true;
        s.originalScore = s.cardTotal;
      }

      s.roundScore = roundScore;
      player.roundScores.push(roundScore);
      player.totalScore += roundScore;
    });

    // Who starts next round: player with most points
    const maxScore = Math.max(...this.state.players.map(p => p.totalScore));
    const nextStartIndex = this.state.players.findIndex(p => p.totalScore === maxScore);

    return {
      success: true,
      roundEnd: true,
      round: this.state.round,
      scores,
      callerIndex: this.state.callerIndex,
      calledByPlayer,
      nextStartIndex,
    };
  }

  startNextRound(nextStartIndex) {
    if (this.state.round >= TOTAL_ROUNDS) {
      return this.endGame();
    }

    this.state.round++;
    this.state.currentPlayerIndex = nextStartIndex ?? 0;
    this.state.players.forEach(p => { p.peekConfirmed = false; p.peekedIndices = []; });
    this.setupRound();
    return { success: true, round: this.state.round };
  }

  endGame() {
    this.state.phase = 'GAME_OVER';
    const sorted = [...this.state.players].sort((a, b) => a.totalScore - b.totalScore);
    this.state.winner = sorted[0];

    return {
      success: true,
      gameOver: true,
      winner: this.state.winner,
      finalScores: this.state.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        totalScore: p.totalScore,
        roundScores: p.roundScores,
      })),
    };
  }

  // ─── Turn Timer ──────────────────────────────────────────────────────────

  checkTurnTimeout() {
    if (this.state.phase !== 'PLAYING') return null;
    if (!this.state.turnStartedAt) return null;
    const elapsed = (Date.now() - this.state.turnStartedAt) / 1000;
    if (elapsed >= TURN_TIME_LIMIT) {
      // Auto-skip: discard any drawn card, flip a random facedown card if needed
      const player = this.getCurrentPlayer();
      if (this.state.drawnCard) {
        this.state.discardPile.push({ ...this.state.drawnCard, faceUp: true });
        this.state.drawnCard = null;
        // Must flip a facedown card
        const faceDownIndices = player.cards.map((c, i) => c.faceUp ? null : i).filter(i => i !== null);
        if (faceDownIndices.length > 0) {
          const randIdx = faceDownIndices[Math.floor(Math.random() * faceDownIndices.length)];
          player.cards[randIdx] = { ...player.cards[randIdx], faceUp: true };
        }
      } else if (this.state.mustFlipCard) {
        const faceDownIndices = player.cards.map((c, i) => c.faceUp ? null : i).filter(i => i !== null);
        if (faceDownIndices.length > 0) {
          const randIdx = faceDownIndices[Math.floor(Math.random() * faceDownIndices.length)];
          player.cards[randIdx] = { ...player.cards[randIdx], faceUp: true };
        }
        this.state.mustFlipCard = false;
      }
      this.state.pendingAction = null;
      this.state.goAgainCount = 0; // clear bonus turns on timeout
      this.advanceTurn();
      return { timeout: true, nextPlayerIndex: this.state.currentPlayerIndex };
    }
    return null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  getPlayer(playerId) {
    return this.state.players.find(p => p.id === playerId);
  }

  getPlayerIndex(playerId) {
    return this.state.players.findIndex(p => p.id === playerId);
  }

  // Public state (hides facedown card values from non-owners)
  getPublicState(requestingPlayerId = null) {
    return {
      phase: this.state.phase,
      round: this.state.round,
      currentPlayerIndex: this.state.currentPlayerIndex,
      callerIndex: this.state.callerIndex,
      courtesyRound: this.state.courtesyRound || false,
      goAgainCount: this.state.goAgainCount,
      pendingAction: this.state.pendingAction,
      mustFlipCard: this.state.mustFlipCard,
      turnStartedAt: this.state.turnStartedAt,
      turnTimeLimit: TURN_TIME_LIMIT,
      drawPileCount: this.state.drawPile.length,
      topDiscard: this.state.discardPile[this.state.discardPile.length - 1] || null,
      drawnCard: this.state.drawnCard || null,
      players: this.state.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        connected: p.connected,
        peekConfirmed: p.peekConfirmed,
        totalScore: p.totalScore,
        roundScores: p.roundScores,
        cardCount: p.cards.length,
        // Only show card values if faceUp OR if it's the requesting player's own peek (PEEK phase only)
        cards: p.cards.map((c, i) => {
          if (c.faceUp) return c;
          // Only show peeked cards during the PEEK phase, never during PLAYING
          if (this.state.phase === 'PEEK' && p.id === requestingPlayerId && p.peekedIndices?.includes(i)) {
            return { ...c, peeked: true }; // Temporarily visible only during peek phase
          }
          return { id: c.id, faceUp: false }; // Hidden
        }),
      })),
      winner: this.state.winner,
    };
  }

  // State for a specific player (includes their own peeked cards)
  getStateForPlayer(playerId) {
    return this.getPublicState(playerId);
  }

  setPlayerConnected(playerId, connected) {
    const player = this.getPlayer(playerId);
    if (player) player.connected = connected;
  }
}

module.exports = { GameEngine, TOTAL_ROUNDS, TURN_TIME_LIMIT };
