// Wire protocol for WebRTC data-channel messages. See CLAUDE.md §5.4.
// Kept as a discriminated union so handlers can switch on `type`.

import type { Difficulty, GameMode, Position, PlayerId } from '../game/types';

export type Role = 'host' | 'guest';

// ---- Common (all modes) ----

export interface JoinMsg {
  type: 'join';
  name?: string;
}

export interface ModeMsg {
  type: 'mode';
  mode: GameMode;
  difficulty: Difficulty;
}

export interface StartMsg {
  type: 'start';
  mode: GameMode;
  difficulty: Difficulty;
  /** Shared seed so both peers generate the identical board. */
  seed: string;
  /** Epoch ms at which both sides should begin (synchronised countdown). */
  startAt: number;
}

export interface RematchMsg {
  type: 'rematch';
}

export interface DisconnectMsg {
  type: 'disconnect';
}

// ---- Race (independent boards) ----

export interface ProgressMsg {
  type: 'progress';
  revealed: number;
  total: number;
}

// ---- Shared board (co-op / claim), Host-authoritative ----

export interface IntentMsg {
  type: 'intent';
  action: 'reveal' | 'flag';
  pos: Position;
}

export interface RevealedCell {
  pos: Position;
  isMine: boolean;
  adjacentMines: number;
  owner: PlayerId | null;
}

export interface RevealMsg {
  type: 'reveal';
  cells: RevealedCell[];
  hitMine: boolean;
  by: PlayerId;
}

/** Host broadcast: a flag was toggled on the shared board. */
export interface FlagMsg {
  type: 'flag';
  pos: Position;
  flagged: boolean;
}

export interface ScoreMsg {
  type: 'score';
  scores: Record<PlayerId, number>;
}

export interface GameOverMsg {
  type: 'gameover';
  /** From the receiver's perspective the host resolves the outcome. */
  result: 'win' | 'lose' | 'draw';
  by?: PlayerId;
}

export type Message =
  | JoinMsg
  | ModeMsg
  | StartMsg
  | RematchMsg
  | DisconnectMsg
  | ProgressMsg
  | IntentMsg
  | RevealMsg
  | FlagMsg
  | ScoreMsg
  | GameOverMsg;
