# Wheel of Fortune 🎡

A browser-based, two-player **Wheel of Fortune** game built with React 19, TypeScript, and Vite. Spin the wheel, guess letters, buy vowels, and race to solve the puzzle across three rounds.

<img width="927" height="964" alt="image" src="https://github.com/user-attachments/assets/990c0530-0ea1-4737-b7a1-8dbf8544ed7e" />

---

## Gameplay

Two players take turns at the same keyboard/screen.

| Action | Description |
|---|---|
| **Spin** | Randomly lands on a dollar amount, BANKRUPT, or LOSE A TURN |
| **Guess a consonant** | Earn the landed amount × occurrences of that letter |
| **Buy a vowel** | Costs $500, no spin required |
| **Solve** | Type the full puzzle to bank your round earnings |
| **BANKRUPT** | Lose your entire round balance; turn passes |
| **LOSE A TURN** | Turn passes with no penalty to balance |

Three rounds are played; the player with the highest **total** balance at the end wins. Results are saved to a persistent leaderboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | [React 19](https://react.dev) |
| Language | [TypeScript 5.9](https://www.typescriptlang.org) |
| Build tool | [Vite 8](https://vite.dev) |
| Linting | [ESLint 9](https://eslint.org) + typescript-eslint |
| Styling | Plain CSS (component-scoped) |
| State | Pure-function game engine — no external state library |
| Persistence | `localStorage` leaderboard |

---

## Project Structure

```
.
├── public/             # Static assets (favicon, icons)
├── src/
│   ├── components/
│   │   ├── game/       # SpinWheel, PuzzleBoard, ActionPanel, PlayerPanel
│   │   └── screens/    # MainMenu, PlayerSetup, GameScreen, LeaderboardScreen
│   ├── data/
│   │   └── puzzles.json
│   └── lib/
│       ├── gameEngine.ts   # Pure-function state machine (no React)
│       ├── wheel.ts        # Wedge definitions & spin logic
│       ├── leaderboard.ts  # localStorage persistence
│       └── types.ts        # Shared TypeScript interfaces
├── index.html
├── vite.config.ts
└── tsconfig*.json
```

### Architecture highlights

- **`gameEngine.ts`** is a pure, side-effect-free state machine. Every action (`doSpin`, `doGuessConsonant`, `doBuyVowel`, `doSolveAttempt`, …) takes the current `EngineState` and returns a new one. React is never imported here.
- **`TurnPhase`** is a discriminated union that enforces which buttons are valid at any moment, making invalid UI states structurally impossible.
- **`wheel.ts`** defines 16 wedges matching the classic TV show layout (including two BANKRUPT and one LOSE A TURN wedge).

---

## Getting Started

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the production build
npm run lint     # ESLint
```

Requires **Node 18+**.

---

## Wheel Wedges

| Wedge | Value |
|---|---|
| $200 | — |
| $300 | — |
| $350 | — |
| $400 | — |
| $450 | — |
| $500 | — |
| $600 | — |
| $700 | — |
| $800 | — |
| $900 | — |
| $1,200 | — |
| $2,500 | — |
| $10,000 | — |
| BANKRUPT ×2 | Lose round balance |
| LOSE A TURN ×1 | Skip turn |
