// The score board, and where scores live.
//
// EVERY METHOD IS ASYNC EVEN THOUGH THE LOCAL STORE IS INSTANT. That is the
// one decision in this file that matters. A shared board — "who played, and
// when" across everyone, not just this browser — needs a server, and swapping
// the local store for a remote one must not touch a single call site. Async
// now costs a few `await`s; async later would cost rewriting every screen that
// shows a score.
//
// The interface is also deliberately game-agnostic: entries carry a `game`
// slug, so ONE backend serves the whole set and a signed-in player's scores
// add up across games (which is the point of signing in at all).
//
// WHAT THE LOCAL STORE CANNOT DO, stated plainly because it would otherwise
// look like a bug: it only ever knows about plays made in this browser. The
// "who" column will be you, every row, forever. It is a working board and a
// truthful one, but a shared leaderboard needs a backend — see PLATFORM.md.

import type { Player } from './identity';

export interface ScoreEntry {
  /** Unique per submission. */
  id: string;
  /** Game slug, e.g. 'g006-towerout'. */
  game: string;
  playerId: string;
  playerName: string;
  playerKind: Player['kind'];
  score: number;
  /** Epoch ms. */
  at: number;
  /** Free-text context, e.g. "第 7 棟 · 中級". Shown next to the score. */
  detail?: string;
}

export interface GameTotal {
  game: string;
  best: number;
  plays: number;
}

/**
 * Where scores are kept.
 *
 * Implement this against a backend and nothing else has to change.
 */
export interface ScoreStore {
  /** 'local' boards are per-device; 'cloud' boards are shared. The UI says so. */
  readonly kind: 'local' | 'cloud';
  submit(entry: Omit<ScoreEntry, 'id'>): Promise<ScoreEntry>;
  /** Highest scores first. */
  top(game: string, limit: number): Promise<ScoreEntry[]>;
  /** Most recent first. */
  recent(game: string, limit: number): Promise<ScoreEntry[]>;
  /** One player's best per game — the cross-game view a sign-in unlocks. */
  totalsFor(playerId: string): Promise<GameTotal[]>;
}

const STORAGE_KEY = 'ohero-scores';
/**
 * Cap on rows kept locally.
 *
 * localStorage is a few megabytes shared with everything else on the origin,
 * and an unbounded log of every play would eventually start throwing on write
 * — which would look like "the game stopped saving scores" long after the
 * cause. Oldest go first.
 */
const LOCAL_CAP = 500;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Scores in localStorage. Works with no setup; only ever sees this device. */
export class LocalScoreStore implements ScoreStore {
  readonly kind = 'local' as const;

  private load(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Anything malformed is dropped rather than thrown: a corrupt row must
      // not take the whole board — or the start screen — down with it.
      return parsed.filter(isEntry);
    } catch {
      return [];
    }
  }

  private save(entries: ScoreEntry[]): void {
    try {
      const trimmed = entries.slice(-LOCAL_CAP);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* full or blocked: the board is best-effort, never load-bearing */
    }
  }

  async submit(entry: Omit<ScoreEntry, 'id'>): Promise<ScoreEntry> {
    const full: ScoreEntry = { ...entry, id: newId() };
    const all = this.load();
    all.push(full);
    this.save(all);
    return full;
  }

  async top(game: string, limit: number): Promise<ScoreEntry[]> {
    return this.load()
      .filter((e) => e.game === game)
      .sort((a, b) => b.score - a.score || b.at - a.at)
      .slice(0, limit);
  }

  async recent(game: string, limit: number): Promise<ScoreEntry[]> {
    return this.load()
      .filter((e) => e.game === game)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  async totalsFor(playerId: string): Promise<GameTotal[]> {
    const byGame = new Map<string, GameTotal>();
    for (const entry of this.load()) {
      if (entry.playerId !== playerId) continue;
      const found = byGame.get(entry.game);
      if (found) {
        found.best = Math.max(found.best, entry.score);
        found.plays++;
      } else {
        byGame.set(entry.game, { game: entry.game, best: entry.score, plays: 1 });
      }
    }
    return [...byGame.values()].sort((a, b) => b.best - a.best);
  }

  /** Test seam. */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function isEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.game === 'string' &&
    typeof e.playerId === 'string' &&
    typeof e.playerName === 'string' &&
    typeof e.score === 'number' &&
    Number.isFinite(e.score) &&
    typeof e.at === 'number'
  );
}

/**
 * The store the app uses.
 *
 * A single mutable slot rather than an import, so wiring a backend in later is
 * one call at start-up instead of an edit in every screen.
 */
let store: ScoreStore = new LocalScoreStore();

export function useScoreStore(next: ScoreStore): void {
  store = next;
}

export function scoreStore(): ScoreStore {
  return store;
}

/** Record a finished run. Never throws — a lost score must not lose the game. */
export async function recordScore(args: {
  game: string;
  player: Player;
  score: number;
  detail?: string;
}): Promise<ScoreEntry | null> {
  try {
    return await store.submit({
      game: args.game,
      playerId: args.player.id,
      playerName: args.player.name,
      playerKind: args.player.kind,
      score: args.score,
      at: Date.now(),
      detail: args.detail,
    });
  } catch {
    return null;
  }
}
