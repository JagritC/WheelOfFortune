/**
 * gameEngine.ts — Pure functions only. No React, no DOM, no side effects.
 * Every function takes state and returns new state (or a derived value).
 * The UI layer is responsible for calling these and updating React state.
 */

import type { GameState, Player, Puzzle, TurnPhase, RoundResult } from './types';
import { getWedge, spinWheel } from './wheel';
import puzzlesRaw from '../data/puzzles.json';

const ALL_PUZZLES: Puzzle[] = puzzlesRaw as Puzzle[];

// Characters that are always visible without being guessed (punctuation + space).
const AUTO_REVEALED = new Set([' ', ',', '.', '?', ';', "'", '-', '!']);

// Extended state that includes internal fields the engine needs.
export interface EngineState extends GameState {
  _puzzles: Puzzle[];
  _spinTargetIndex: number;
}

// ─── Puzzle selection ─────────────────────────────────────────────────────────

export function pickPuzzles(count: number): Puzzle[] {
  const shuffled = [...ALL_PUZZLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── State helpers ────────────────────────────────────────────────────────────

function makePlayer(id: 1 | 2, name: string): Player {
  return { id, name, roundBalance: 0, totalBalance: 0 };
}

function otherIndex(idx: 0 | 1): 0 | 1 {
  return idx === 0 ? 1 : 0;
}

export function visibleLetters(state: GameState): Set<string> {
  const visible = new Set<string>(AUTO_REVEALED);
  state.revealedLetters.forEach(l => visible.add(l));
  return visible;
}

export function isPuzzleSolved(state: GameState): boolean {
  const visible = visibleLetters(state);
  return [...state.puzzle.puzzle].every(ch => visible.has(ch));
}

export function countOccurrences(puzzle: string, letter: string): number {
  return [...puzzle].filter(ch => ch === letter).length;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInitialState(
  player1Name: string,
  player2Name: string,
  puzzles: Puzzle[],
  totalRounds = 3,
): EngineState {
  return {
    players: [makePlayer(1, player1Name), makePlayer(2, player2Name)],
    currentPlayerIndex: 0,
    round: 1,
    totalRounds,
    puzzle: puzzles[0],
    revealedLetters: new Set<string>(),
    guessedLetters: new Set<string>(),
    phase: 'waiting-to-spin',
    lastSpinResult: null,
    roundHistory: [],
    message: `Round 1 — ${player1Name}, spin the wheel!`,
    _puzzles: puzzles,
    _spinTargetIndex: 0,
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function doSpin(state: EngineState): EngineState {
  if (state.phase !== 'waiting-to-spin') throw new Error('Cannot spin now');

  const wedgeIndex = spinWheel();
  const wedge = getWedge(wedgeIndex);
  const currentPlayer = state.players[state.currentPlayerIndex];

  return {
    ...state,
    phase: 'spinning',
    lastSpinResult: wedge,
    _spinTargetIndex: wedgeIndex,
    message: `${currentPlayer.name} is spinning…`,
  };
}

export function doResolveSpin(state: EngineState): EngineState {
  const wedge = state.lastSpinResult!;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const otherIdx = otherIndex(state.currentPlayerIndex);
  const players = [...state.players] as [Player, Player];

  if (wedge.kind === 'bankrupt') {
    players[state.currentPlayerIndex] = { ...currentPlayer, roundBalance: 0 };
    return {
      ...state,
      players,
      phase: 'waiting-to-spin',
      currentPlayerIndex: otherIdx,
      message: `BANKRUPT! ${currentPlayer.name} loses their round balance. ${players[otherIdx].name}'s turn.`,
    };
  }

  if (wedge.kind === 'lose-turn') {
    return {
      ...state,
      phase: 'waiting-to-spin',
      currentPlayerIndex: otherIdx,
      message: `LOSE A TURN! ${players[otherIdx].name}'s turn.`,
    };
  }

  return {
    ...state,
    phase: 'choose-action',
    message: `${currentPlayer.name} landed on ${wedge.label}! Guess a consonant or buy a vowel.`,
  };
}

export function doGuessConsonant(state: EngineState, letter: string): EngineState {
  if (state.phase !== 'choose-action') throw new Error('Cannot guess consonant now');
  const L = letter.toUpperCase();
  if (state.guessedLetters.has(L)) throw new Error(`${L} already guessed`);

  const wedge = state.lastSpinResult!;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const otherIdx = otherIndex(state.currentPlayerIndex);
  const count = countOccurrences(state.puzzle.puzzle, L);
  const newRevealed = new Set(state.revealedLetters);
  newRevealed.add(L);
  const newGuessed = new Set(state.guessedLetters);
  newGuessed.add(L);
  const players = [...state.players] as [Player, Player];

  let message: string;
  let nextPhase: TurnPhase;
  let nextPlayerIndex = state.currentPlayerIndex;

  if (count === 0) {
    nextPlayerIndex = otherIdx;
    nextPhase = 'waiting-to-spin';
    message = `No ${L} in the puzzle! ${players[otherIdx].name}'s turn.`;
  } else {
    const earned = wedge.value * count;
    players[state.currentPlayerIndex] = {
      ...currentPlayer,
      roundBalance: currentPlayer.roundBalance + earned,
    };
    message = `${count} ${L}${count > 1 ? "'s" : ''}! +$${earned.toLocaleString()}. Spin again or try to solve!`;
    nextPhase = 'waiting-to-spin';
  }

  const nextState: EngineState = {
    ...state,
    players,
    revealedLetters: newRevealed,
    guessedLetters: newGuessed,
    phase: nextPhase,
    currentPlayerIndex: nextPlayerIndex as 0 | 1,
    message,
  };

  if (count > 0 && isPuzzleSolved({ ...nextState, revealedLetters: newRevealed })) {
    return advanceRound(nextState, state.currentPlayerIndex);
  }

  return nextState;
}

export function doBuyVowel(state: EngineState, letter: string): EngineState {
  const VOWEL_COST = 500;
  const L = letter.toUpperCase();
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (state.guessedLetters.has(L)) throw new Error(`${L} already guessed`);
  if (currentPlayer.roundBalance < VOWEL_COST) throw new Error('Cannot afford a vowel');

  const count = countOccurrences(state.puzzle.puzzle, L);
  const newRevealed = new Set(state.revealedLetters);
  newRevealed.add(L);
  const newGuessed = new Set(state.guessedLetters);
  newGuessed.add(L);
  const players = [...state.players] as [Player, Player];

  players[state.currentPlayerIndex] = {
    ...currentPlayer,
    roundBalance: currentPlayer.roundBalance - VOWEL_COST,
  };

  const message =
    count === 0
      ? `No ${L} in the puzzle. $500 spent.`
      : `${count} ${L}${count > 1 ? "'s" : ''}! $500 spent. Spin again or try to solve!`;

  const nextState: EngineState = {
    ...state,
    players,
    revealedLetters: newRevealed,
    guessedLetters: newGuessed,
    phase: 'waiting-to-spin',
    message,
  };

  if (isPuzzleSolved({ ...nextState, revealedLetters: newRevealed })) {
    return advanceRound(nextState, state.currentPlayerIndex);
  }

  return nextState;
}

export function doSolveAttempt(state: EngineState, attempt: string): EngineState {
  const normalized = attempt.trim().toUpperCase();
  const otherIdx = otherIndex(state.currentPlayerIndex);

  if (normalized === state.puzzle.puzzle) {
    const allRevealed = new Set<string>([...state.puzzle.puzzle]);
    return advanceRound({ ...state, revealedLetters: allRevealed }, state.currentPlayerIndex);
  }

  return {
    ...state,
    phase: 'waiting-to-spin',
    currentPlayerIndex: otherIdx,
    message: `Wrong answer! ${state.players[otherIdx].name}'s turn.`,
  };
}

// ─── Round & game advancement ─────────────────────────────────────────────────

export function advanceRound(state: EngineState, winnerIndex: 0 | 1): EngineState {
  const winner = state.players[winnerIndex];
  const players = [...state.players] as [Player, Player];
  const loserIndex = otherIndex(winnerIndex);

  players[winnerIndex] = {
    ...winner,
    totalBalance: winner.totalBalance + winner.roundBalance,
    roundBalance: 0,
  };
  players[loserIndex] = { ...players[loserIndex], roundBalance: 0 };

  const roundResult: RoundResult = {
    round: state.round,
    puzzle: state.puzzle,
    winnerId: winner.id,
  };

  if (state.round >= state.totalRounds) {
    return {
      ...state,
      players,
      phase: 'game-over',
      roundHistory: [...state.roundHistory, roundResult],
      message: `${winner.name} solved it and the game is over!`,
    };
  }

  const nextRound = state.round + 1;
  const nextPuzzle = state._puzzles[nextRound - 1];

  return {
    ...state,
    players,
    round: nextRound,
    puzzle: nextPuzzle,
    revealedLetters: new Set<string>(),
    guessedLetters: new Set<string>(),
    phase: 'round-over',
    roundHistory: [...state.roundHistory, roundResult],
    lastSpinResult: null,
    message: `${winner.name} solved Round ${state.round}! +$${winner.roundBalance.toLocaleString()}`,
    currentPlayerIndex: loserIndex,
  };
}

export function doContinueToNextRound(state: EngineState): EngineState {
  if (state.phase !== 'round-over') throw new Error('Not in round-over phase');
  const current = state.players[state.currentPlayerIndex];
  return {
    ...state,
    phase: 'waiting-to-spin',
    message: `Round ${state.round} — ${current.name}, spin the wheel!`,
  };
}

export function getWinner(state: GameState): Player | null {
  const [p1, p2] = state.players;
  if (p1.totalBalance > p2.totalBalance) return p1;
  if (p2.totalBalance > p1.totalBalance) return p2;
  return null;
}
