// Race mode: both players get an identical board (same seed) but play on
// their own copy. First to clear all safe cells wins; hitting a mine loses
// (and the opponent wins). Progress is streamed live; the host drives
// rematches. Uses the shared Connection handed over from the lobby.

import type { Difficulty, Position } from '../game/types';
import { DIFFICULTIES } from '../game/types';
import { Game } from '../game/gameState';
import { randomSeed } from '../game/rng';
import type { Connection } from '../multiplayer/connection';
import type { Message, Role, StartMsg } from '../multiplayer/protocol';
import { renderBoard } from './render';
import { bindBoardInput } from './input';
import { t, onLocaleChange } from '../i18n';

export interface RaceOptions {
  connection: Connection;
  role: Role;
  difficulty: Difficulty;
  seed: string;
  startAt: number;
  onExit: () => void;
}

const COUNTDOWN_MS = 3000;
const PROGRESS_THROTTLE_MS = 250;

export class RaceGame {
  private readonly connection: Connection;
  private readonly role: Role;
  private difficulty: Difficulty;
  private startAt: number;

  private game!: Game;
  private started = false;
  private decided = false;
  private lastProgressSent = 0;

  private elapsed = 0;
  private timerId: number | null = null;
  private countdownId: number | null = null;
  private readonly unsubscribe: () => void;

  private readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly minesEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly resultBox: HTMLElement;
  private readonly resultText: HTMLElement;
  private readonly rematchBtn: HTMLButtonElement;
  private readonly youPct: HTMLElement;
  private readonly youFill: HTMLElement;
  private readonly oppPct: HTMLElement;
  private readonly oppFill: HTMLElement;

  constructor(root: HTMLElement, private readonly opts: RaceOptions) {
    this.connection = opts.connection;
    this.role = opts.role;
    this.difficulty = opts.difficulty;
    this.startAt = opts.startAt;
    this.root = root;

    root.innerHTML = `
      <div class="app race">
        <header>
          <h1 class="title"></h1>
          <button class="back" type="button"></button>
        </header>
        <div class="progress-panel">
          <div class="pbar">
            <span class="plabel you-label"></span>
            <div class="bar"><div class="fill you-fill"></div></div>
            <span class="ppct you-pct">0%</span>
          </div>
          <div class="pbar">
            <span class="plabel opp-label"></span>
            <div class="bar"><div class="fill opp-fill"></div></div>
            <span class="ppct opp-pct">0%</span>
          </div>
        </div>
        <div class="statusbar">
          <span class="counter mines">💣 <span class="mines-count">0</span></span>
          <span class="counter timer">⏱️ <span class="time-count">0</span></span>
        </div>
        <div class="board-area">
          <div class="board-wrap"><div class="grid"></div></div>
          <div class="race-overlay"><span class="countdown"></span></div>
        </div>
        <div class="result" hidden>
          <p class="result-text"></p>
          <button class="primary rematch" type="button"></button>
        </div>
      </div>
    `;

    this.grid = this.q('.grid');
    this.overlay = this.q('.race-overlay');
    this.countdownEl = this.q('.countdown');
    this.minesEl = this.q('.mines-count');
    this.timeEl = this.q('.time-count');
    this.resultBox = this.q('.result');
    this.resultText = this.q('.result-text');
    this.rematchBtn = this.q('.rematch');
    this.youPct = this.q('.you-pct');
    this.youFill = this.q('.you-fill');
    this.oppPct = this.q('.opp-pct');
    this.oppFill = this.q('.opp-fill');

    this.q<HTMLButtonElement>('.back').addEventListener('click', () => this.exit());
    this.rematchBtn.addEventListener('click', () => this.onRematchClick());

    bindBoardInput(this.grid, {
      onReveal: (pos) => this.handleReveal(pos),
      onFlag: (pos) => this.handleFlag(pos),
    });

    this.connection.setHandlers({
      onMessage: (msg) => this.onMessage(msg),
      onDisconnected: () => this.onDisconnected(),
      onError: () => this.onDisconnected(),
    });

    this.unsubscribe = onLocaleChange(() => this.applyTexts());
    this.applyTexts();
    this.reset(this.opts.seed, this.opts.startAt);
  }

  private q<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private applyTexts(): void {
    this.q<HTMLElement>('.title').textContent = t('appTitle');
    this.q<HTMLElement>('.back').textContent = t('back');
    this.q<HTMLElement>('.you-label').textContent = t('you');
    this.q<HTMLElement>('.opp-label').textContent = t('opponent');
    this.rematchBtn.textContent = t('rematch');
  }

  // ---- Round lifecycle ----

  private reset(seed: string, startAt: number): void {
    this.stopTimer();
    if (this.countdownId !== null) clearTimeout(this.countdownId);
    this.game = new Game(DIFFICULTIES[this.difficulty], seed);
    this.startAt = startAt;
    this.started = false;
    this.decided = false;
    this.elapsed = 0;
    this.lastProgressSent = 0;
    this.resultBox.hidden = true;
    this.setProgress(this.youPct, this.youFill, 0);
    this.setProgress(this.oppPct, this.oppFill, 0);
    this.render();
    this.overlay.classList.remove('go', 'hidden');
    this.runCountdown();
  }

  private runCountdown(): void {
    const tick = (): void => {
      const remain = this.startAt - Date.now();
      if (remain <= 0) {
        this.beginPlay();
        return;
      }
      this.countdownEl.textContent = String(Math.ceil(remain / 1000));
      this.countdownId = window.setTimeout(tick, 100);
    };
    tick();
  }

  private beginPlay(): void {
    this.started = true;
    this.countdownEl.textContent = t('go');
    this.overlay.classList.add('go');
    this.countdownId = window.setTimeout(() => {
      this.overlay.classList.add('hidden');
    }, 600);
    this.startTimer();
  }

  // ---- Input ----

  private handleReveal(pos: Position): void {
    if (!this.started || this.decided) return;
    this.game.reveal(pos);
    this.render();
    this.reportProgress();
    if (this.game.status === 'won') this.finish('win');
    else if (this.game.status === 'lost') this.finish('lose');
  }

  private handleFlag(pos: Position): void {
    if (!this.started || this.decided) return;
    this.game.toggleFlag(pos);
    this.render();
  }

  private finish(outcome: 'win' | 'lose'): void {
    if (this.decided) return;
    this.decided = true;
    this.stopTimer();
    // Send the opponent THEIR result (the inverse of ours).
    this.connection.send({ type: 'gameover', result: outcome === 'win' ? 'lose' : 'win' });
    this.reportProgress(true);
    this.showResult(outcome);
  }

  // ---- Networking ----

  private onMessage(msg: Message): void {
    switch (msg.type) {
      case 'progress':
        this.setProgress(
          this.oppPct,
          this.oppFill,
          msg.total > 0 ? msg.revealed / msg.total : 0,
        );
        break;
      case 'gameover':
        if (!this.decided) {
          this.decided = true;
          this.stopTimer();
          this.showResult(msg.result === 'win' ? 'win' : 'lose');
        }
        break;
      case 'rematch':
        // Only the host acts on a rematch request.
        if (this.role === 'host') this.startNewRound();
        break;
      case 'start':
        // Guest receives the host's fresh round.
        if (this.role === 'guest') {
          this.difficulty = msg.difficulty;
          this.reset(msg.seed, msg.startAt);
        }
        break;
      default:
        break;
    }
  }

  private reportProgress(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastProgressSent < PROGRESS_THROTTLE_MS) return;
    this.lastProgressSent = now;
    this.connection.send({
      type: 'progress',
      revealed: this.game.board.revealedSafeCount(),
      total: this.game.board.safeCount(),
    });
  }

  private onDisconnected(): void {
    if (this.decided) return;
    this.decided = true;
    this.stopTimer();
    this.resultText.textContent = t('opponentLeft');
    this.resultBox.hidden = false;
    this.rematchBtn.hidden = true;
  }

  // ---- Rematch ----

  private onRematchClick(): void {
    if (this.role === 'host') {
      this.startNewRound();
    } else {
      this.connection.send({ type: 'rematch' });
      this.resultText.textContent = t('rematchWait');
      this.rematchBtn.hidden = true;
    }
  }

  private startNewRound(): void {
    const msg: StartMsg = {
      type: 'start',
      mode: 'race',
      difficulty: this.difficulty,
      seed: randomSeed(),
      startAt: Date.now() + COUNTDOWN_MS,
    };
    this.connection.send(msg);
    this.reset(msg.seed, msg.startAt);
  }

  // ---- Rendering ----

  private render(): void {
    renderBoard(this.grid, this.game);
    this.minesEl.textContent = String(this.game.minesRemaining());
    this.updateMyProgress();
  }

  private updateMyProgress(): void {
    const total = this.game.board.safeCount();
    const ratio = total > 0 ? this.game.board.revealedSafeCount() / total : 0;
    this.setProgress(this.youPct, this.youFill, ratio);
  }

  private setProgress(pctEl: HTMLElement, fillEl: HTMLElement, ratio: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
    pctEl.textContent = `${pct}%`;
    fillEl.style.width = `${pct}%`;
  }

  private showResult(outcome: 'win' | 'lose'): void {
    this.resultText.textContent = outcome === 'win' ? t('raceWin') : t('raceLose');
    this.rematchBtn.hidden = false;
    this.resultBox.hidden = false;
    this.render();
  }

  private startTimer(): void {
    if (this.timerId !== null) return;
    this.timerId = window.setInterval(() => {
      this.elapsed += 1;
      this.timeEl.textContent = String(this.elapsed);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private exit(): void {
    this.connection.close();
    this.onExitInternal();
  }

  private onExitInternal(): void {
    this.opts.onExit();
  }

  /** Tear down timers and listeners (does not close the connection). */
  destroy(): void {
    this.stopTimer();
    if (this.countdownId !== null) clearTimeout(this.countdownId);
    this.unsubscribe();
  }
}
