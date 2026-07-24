// Core domain types shared across game logic, UI and multiplayer.

/** Preset difficulty levels (classic Windows Minesweeper). */
export type Difficulty = 'beginner' | 'intermediate' | 'expert';

export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
}

export const DIFFICULTIES: Record<Difficulty, BoardConfig> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

/** Game modes. `single` is offline; the rest are WebRTC versus modes. */
export type GameMode = 'single' | 'race' | 'coop' | 'claim';

/** High-level status of a game/round. */
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/** Identifies which player revealed a cell (used by claim/coop modes). */
export type PlayerId = string;

export interface Position {
  row: number;
  col: number;
}

export interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  /** Number of mines in the 8 surrounding cells (0–8). */
  adjacentMines: number;
  /** Who first revealed this cell; null in single-player. */
  owner: PlayerId | null;
}

/** Result of a reveal action — the primitive used to build multiplayer deltas. */
export interface RevealResult {
  revealed: Position[];
  hitMine: boolean;
}
