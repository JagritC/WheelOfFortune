import { afterEach, describe, expect, it, vi } from 'vitest';

import puzzlesRaw from '../data/puzzles.json';
import type { Puzzle } from './types';
import { getWedge } from './wheel';
import {
  advanceRound,
  countOccurrences,
  createInitialState,
  doBuyVowel,
  doContinueToNextRound,
  doGuessConsonant,
  doResolveSpin,
  doSolveAttempt,
  doSpin,
  getWinner,
  isPuzzleSolved,
  pickPuzzles,
  visibleLetters,
  type EngineState,
} from './gameEngine';

const TEST_PUZZLES: Puzzle[] = [
  { puzzle: 'BANANA', category: 'Food', hint: 'Yellow fruit' },
  { puzzle: 'APPLE PIE', category: 'Dessert', hint: 'Classic dessert' },
  { puzzle: 'QUIZ', category: 'Game', hint: 'Trivia challenge' },
];

function makeState(overrides: Partial<EngineState> = {}): EngineState {
  const base = createInitialState('Alice', 'Bob', TEST_PUZZLES, 3);
  return {
    ...base,
    ...overrides,
    players: overrides.players ?? base.players,
    puzzle: overrides.puzzle ?? base.puzzle,
    revealedLetters: overrides.revealedLetters ?? base.revealedLetters,
    guessedLetters: overrides.guessedLetters ?? base.guessedLetters,
    roundHistory: overrides.roundHistory ?? base.roundHistory,
    _puzzles: overrides._puzzles ?? base._puzzles,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gameEngine', () => {
  it('createInitialState builds round 1 with two empty players and waiting-to-spin phase', () => {
    const state = createInitialState('Alice', 'Bob', TEST_PUZZLES, 3);

    expect(state).toEqual({
      players: [
        { id: 1, name: 'Alice', roundBalance: 0, totalBalance: 0 },
        { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 0 },
      ],
      currentPlayerIndex: 0,
      round: 1,
      totalRounds: 3,
      puzzle: TEST_PUZZLES[0],
      revealedLetters: new Set<string>(),
      guessedLetters: new Set<string>(),
      phase: 'waiting-to-spin',
      lastSpinResult: null,
      roundHistory: [],
      message: 'Round 1 — Alice, spin the wheel!',
      _puzzles: TEST_PUZZLES,
      _spinTargetIndex: 0,
    });
  });

  it('doSpin and doResolveSpin move from money spin to choose-action deterministically', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const spun = doSpin(makeState());
    const resolved = doResolveSpin(spun);

    expect(spun.phase).toBe('spinning');
    expect(spun.lastSpinResult).toEqual(getWedge(0));
    expect(spun._spinTargetIndex).toBe(0);
    expect(resolved.phase).toBe('choose-action');
    expect(resolved.currentPlayerIndex).toBe(0);
    expect(resolved.message).toContain('landed on $500');
  });

  it('doResolveSpin zeroes roundBalance on bankrupt and passes the turn', () => {
    const resolved = doResolveSpin(
      makeState({
        phase: 'spinning',
        lastSpinResult: getWedge(4),
        players: [
          { id: 1, name: 'Alice', roundBalance: 1200, totalBalance: 500 },
          { id: 2, name: 'Bob', roundBalance: 300, totalBalance: 800 },
        ],
      }),
    );

    expect(resolved.players[0].roundBalance).toBe(0);
    expect(resolved.players[0].totalBalance).toBe(500);
    expect(resolved.currentPlayerIndex).toBe(1);
    expect(resolved.phase).toBe('waiting-to-spin');
  });

  it('doResolveSpin passes the turn on lose-turn without changing balances', () => {
    const resolved = doResolveSpin(
      makeState({
        phase: 'spinning',
        lastSpinResult: getWedge(8),
        players: [
          { id: 1, name: 'Alice', roundBalance: 1200, totalBalance: 500 },
          { id: 2, name: 'Bob', roundBalance: 300, totalBalance: 800 },
        ],
      }),
    );

    expect(resolved.players).toEqual([
      { id: 1, name: 'Alice', roundBalance: 1200, totalBalance: 500 },
      { id: 2, name: 'Bob', roundBalance: 300, totalBalance: 800 },
    ]);
    expect(resolved.currentPlayerIndex).toBe(1);
    expect(resolved.phase).toBe('waiting-to-spin');
  });

  it('doGuessConsonant adds wedge value times occurrences, reveals letters, and keeps the turn', () => {
    const next = doGuessConsonant(
      makeState({
        phase: 'choose-action',
        lastSpinResult: getWedge(0),
      }),
      'n',
    );

    expect(next.players[0].roundBalance).toBe(1000);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.phase).toBe('waiting-to-spin');
    expect(next.revealedLetters).toEqual(new Set(['N']));
    expect(next.guessedLetters).toEqual(new Set(['N']));
  });

  it('doGuessConsonant passes the turn when the consonant is absent', () => {
    const next = doGuessConsonant(
      makeState({
        phase: 'choose-action',
        lastSpinResult: getWedge(1),
      }),
      'z',
    );

    expect(next.players[0].roundBalance).toBe(0);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe('waiting-to-spin');
    expect(next.guessedLetters).toEqual(new Set(['Z']));
  });

  it('doGuessConsonant rejects a previously used letter', () => {
    const state = makeState({
      phase: 'choose-action',
      lastSpinResult: getWedge(0),
      guessedLetters: new Set(['N']),
    });

    expect(() => doGuessConsonant(state, 'n')).toThrow('N already guessed');
  });

  it('doBuyVowel spends 500, reveals vowels, and keeps the same player', () => {
    const next = doBuyVowel(
      makeState({
        players: [
          { id: 1, name: 'Alice', roundBalance: 1200, totalBalance: 0 },
          { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 0 },
        ],
      }),
      'a',
    );

    expect(next.players[0].roundBalance).toBe(700);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.phase).toBe('waiting-to-spin');
    expect(next.revealedLetters).toEqual(new Set(['A']));
    expect(next.guessedLetters).toEqual(new Set(['A']));
  });

  it('doBuyVowel throws when the player cannot afford the cost', () => {
    const state = makeState({
      players: [
        { id: 1, name: 'Alice', roundBalance: 400, totalBalance: 0 },
        { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 0 },
      ],
    });

    expect(() => doBuyVowel(state, 'a')).toThrow('Cannot afford a vowel');
  });

  it('doSolveAttempt on a correct solve banks roundBalance and advances to the next round', () => {
    const next = doSolveAttempt(
      makeState({
        players: [
          { id: 1, name: 'Alice', roundBalance: 1600, totalBalance: 900 },
          { id: 2, name: 'Bob', roundBalance: 200, totalBalance: 700 },
        ],
      }),
      'banana',
    );

    expect(next.round).toBe(2);
    expect(next.phase).toBe('round-over');
    expect(next.players).toEqual([
      { id: 1, name: 'Alice', roundBalance: 0, totalBalance: 2500 },
      { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 700 },
    ]);
    expect(next.puzzle).toEqual(TEST_PUZZLES[1]);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('doSolveAttempt passes the turn on a wrong solve without changing balances', () => {
    const next = doSolveAttempt(
      makeState({
        players: [
          { id: 1, name: 'Alice', roundBalance: 1600, totalBalance: 900 },
          { id: 2, name: 'Bob', roundBalance: 200, totalBalance: 700 },
        ],
      }),
      'not it',
    );

    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe('waiting-to-spin');
    expect(next.players).toEqual([
      { id: 1, name: 'Alice', roundBalance: 1600, totalBalance: 900 },
      { id: 2, name: 'Bob', roundBalance: 200, totalBalance: 700 },
    ]);
  });

  it('advanceRound ends round 3 with game-over and getWinner returns the highest total balance', () => {
    const gameOver = advanceRound(
      makeState({
        round: 3,
        players: [
          { id: 1, name: 'Alice', roundBalance: 500, totalBalance: 1000 },
          { id: 2, name: 'Bob', roundBalance: 100, totalBalance: 2000 },
        ],
      }),
      0,
    );

    expect(gameOver.phase).toBe('game-over');
    expect(gameOver.players).toEqual([
      { id: 1, name: 'Alice', roundBalance: 0, totalBalance: 1500 },
      { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 2000 },
    ]);
    expect(getWinner(gameOver)?.name).toBe('Bob');
  });

  it('doContinueToNextRound returns the engine to waiting-to-spin for the next player', () => {
    const continued = doContinueToNextRound(
      makeState({
        round: 2,
        phase: 'round-over',
        currentPlayerIndex: 1,
      }),
    );

    expect(continued.phase).toBe('waiting-to-spin');
    expect(continued.message).toBe('Round 2 — Bob, spin the wheel!');
  });

  it('countOccurrences counts repeated exact matches', () => {
    expect(countOccurrences('BANANA', 'A')).toBe(3);
    expect(countOccurrences('BANANA', 'Z')).toBe(0);
  });

  it('visibleLetters combines guessed letters with always-visible punctuation', () => {
    const visible = visibleLetters(
      makeState({
        revealedLetters: new Set(['A', 'N']),
      }),
    );

    expect(visible.has('A')).toBe(true);
    expect(visible.has('N')).toBe(true);
    expect(visible.has(' ')).toBe(true);
    expect(visible.has('-')).toBe(true);
    expect(visible.has('!')).toBe(true);
  });

  it('isPuzzleSolved reports when every puzzle character is visible', () => {
    expect(
      isPuzzleSolved(
        makeState({
          puzzle: { puzzle: 'A-B!', category: 'Phrase', hint: 'Test' },
          revealedLetters: new Set(['A', 'B']),
        }),
      ),
    ).toBe(true);

    expect(
      isPuzzleSolved(
        makeState({
          puzzle: { puzzle: 'BANANA', category: 'Food', hint: 'Yellow fruit' },
          revealedLetters: new Set(['B', 'N']),
        }),
      ),
    ).toBe(false);
  });

  it('pickPuzzles returns a deterministic slice when Math.random is stubbed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(pickPuzzles(3)).toEqual((puzzlesRaw as Puzzle[]).slice(-3).reverse());
  });

  it('getWinner returns null on a total-balance tie', () => {
    expect(
      getWinner(
        makeState({
          players: [
            { id: 1, name: 'Alice', roundBalance: 0, totalBalance: 1200 },
            { id: 2, name: 'Bob', roundBalance: 0, totalBalance: 1200 },
          ],
        }),
      ),
    ).toBeNull();
  });
});
