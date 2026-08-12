// The playing view: the grid, its status bar, and a way back.
//
// Everything you set before a game — name, difficulty, language — lives on the
// start screen (`startScreen.ts`), and so does the score board. Split out of
// main.ts so it can be mounted in a test without pulling in the top-level
// routing, which installs global handlers on import.

import { DIFFICULTIES } from '../game/types';
import type { Position } from '../game/types';
import { Game } from '../game/gameState';
import { randomSeed } from '../game/rng';
import { renderBoard, statusFace } from '../ui/render';
import { bindBoardInput } from '../ui/input';
import { onLocaleChange, t } from '../i18n';
import { GAME_SLUG } from '../platform/game';
import { getPlayer } from '../platform/identity';
import { recordScore } from '../platform/scores';
import { maybeShowInterstitial, recordPlay } from '../platform/ads';
import { winScore } from '../game/score';
import type { StartSettings } from './startScreen';

export class GameView {
  private game: Game;
  /** Guard so one won game files one score, however often render() runs. */
  private recorded = false;
  /** Guard for the ad counter, which unlike the board counts losses too. */
  private counted = false;
  private elapsed = 0;
  private timerId: number | null = null;
  private readonly settings: StartSettings;
  private readonly cleanups: (() => void)[] = [];

  private readonly grid: HTMLElement;
  private readonly minesEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly messageEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    settings: StartSettings,
    private readonly onBackToStart: () => void,
  ) {
    this.settings = settings;

    root.innerHTML = `
      <div class="app game">
        <header class="game-head"><h1 class="title"></h1></header>
        <div class="statusbar">
          <button class="to-start" type="button">↩</button>
          <span class="counter mines">💣 <span class="mines-count">0</span></span>
          <button class="reset" type="button">🙂</button>
          <span class="counter timer">⏱️ <span class="time-count">0</span></span>
        </div>
        <div class="board-wrap"><div class="grid"></div></div>
        <p class="message" role="status" aria-live="polite"></p>
        <div class="overlay gameover hidden">
          <div class="panel">
            <h2 class="over-title"></h2>
            <p class="over-score"></p>
            <p class="over-detail"></p>
            <button class="primary over-again" type="button"></button>
            <button class="over-board" type="button"></button>
          </div>
        </div>
      </div>
    `;

    this.grid = this.must('.grid');
    this.minesEl = this.must('.mines-count');
    this.timeEl = this.must('.time-count');
    this.resetBtn = this.must('.reset');
    this.messageEl = this.must('.message');

    this.game = new Game(DIFFICULTIES[this.settings.difficulty], randomSeed());

    this.resetBtn.addEventListener('click', () => this.newGame());
    this.must<HTMLButtonElement>('.to-start').addEventListener('click', () => this.onBackToStart());
    this.must<HTMLButtonElement>('.over-again').addEventListener('click', () => {
      void this.playAgain();
    });
    this.must<HTMLButtonElement>('.over-board').addEventListener('click', () => this.onBackToStart());

    bindBoardInput(this.grid, {
      onReveal: (pos) => this.handleReveal(pos),
      onFlag: (pos) => this.handleFlag(pos),
    });

    this.cleanups.push(onLocaleChange(() => this.applyTexts()));
    this.applyTexts();
    this.newGame();
  }

  destroy(): void {
    this.stopTimer();
    for (const fn of this.cleanups) fn();
  }

  private must<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  /** Re-apply all translated static text (called on locale change). */
  private applyTexts(): void {
    this.must<HTMLElement>('.title').textContent = t('appTitle');
    document.title = t('appTitle');
    const back = this.must<HTMLButtonElement>('.to-start');
    back.title = t('back');
    back.setAttribute('aria-label', t('back'));
    this.applyOverlayTexts();
    this.renderMessage();
  }

  /**
   * The end-of-game panel.
   *
   * The score board lives on the start screen, so a finished game has to offer
   * a way back to it — otherwise the board is somewhere nobody returns to.
   */
  private applyOverlayTexts(): void {
    const won = this.game.status === 'won';
    const title = this.must<HTMLElement>('.over-title');
    title.textContent = won ? t('youWin') : t('gameOver');
    title.classList.toggle('won', won);
    this.must<HTMLElement>('.over-score').textContent = `${t('finalTime')} ${this.elapsed}s`;
    this.must<HTMLElement>('.over-detail').textContent = t(this.settings.difficulty);
    this.must<HTMLButtonElement>('.over-again').textContent = `↻ ${t('playAgain')}`;
    this.must<HTMLButtonElement>('.over-board').textContent = `🏆 ${t('viewBoard')}`;
  }

  private newGame(): void {
    this.game = new Game(DIFFICULTIES[this.settings.difficulty], randomSeed());
    this.stopTimer();
    this.elapsed = 0;
    this.recorded = false;
    this.counted = false;
    this.render();
  }

  private isPlayable(): boolean {
    return this.game.status === 'ready' || this.game.status === 'playing';
  }

  private syncTimer(): void {
    const status = this.game.status;
    if (status === 'playing') this.startTimer();
    else if (status === 'won' || status === 'lost') this.stopTimer();
  }

  private handleReveal(pos: Position): void {
    if (!this.isPlayable()) return;
    this.game.reveal(pos);
    this.syncTimer();
    this.render();
  }

  private handleFlag(pos: Position): void {
    if (!this.isPlayable()) return;
    this.game.toggleFlag(pos);
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

  private render(): void {
    renderBoard(this.grid, this.game);
    this.minesEl.textContent = String(this.game.minesRemaining());
    this.timeEl.textContent = String(this.elapsed);
    this.resetBtn.textContent = statusFace(this.game);
    this.renderMessage();
    const over = this.game.status === 'won' || this.game.status === 'lost';
    this.must<HTMLElement>('.overlay.gameover').classList.toggle('hidden', !over);
    if (over) this.applyOverlayTexts();
    // Losing is still a game played, so this counts both — unlike the board,
    // which only records wins. render() runs on every reveal, hence the guard.
    if (over && !this.counted) {
      this.counted = true;
      recordPlay(GAME_SLUG);
    }
  }

  /**
   * Start another game, with an ad in front of it if one is due.
   *
   * Awaited, so the break finishes before the next board appears rather than
   * landing on top of one already in play. `maybeShowInterstitial` returns
   * immediately when ads are unconfigured or blocked, and gives up on one that
   * hangs — this button always ends up starting a game.
   */
  private async playAgain(): Promise<void> {
    await maybeShowInterstitial(GAME_SLUG);
    this.newGame();
  }

  /**
   * File a won game on the board.
   *
   * MINESWEEPER HAS NO SCORE, IT HAS A CLOCK, and the shared store ranks
   * highest-first — so the clock becomes points (`game/score.ts`) while the
   * board shows the seconds via `display`, because seconds are what one
   * minesweeper player says to another. Losses are not filed; there is nothing
   * to rank about the moment you hit a mine.
   */
  private recordWin(): void {
    if (this.recorded || this.game.status !== 'won') return;
    this.recorded = true;
    void recordScore({
      game: GAME_SLUG,
      player: getPlayer(),
      score: winScore(this.elapsed),
      display: `${this.elapsed}s`,
      detail: t(this.settings.difficulty),
    });
  }

  private renderMessage(): void {
    if (this.game.status === 'won') {
      this.recordWin();
      this.messageEl.textContent = t('win');
    } else if (this.game.status === 'lost') {
      this.messageEl.textContent = t('lose');
    } else {
      this.messageEl.textContent = '';
    }
  }
}
