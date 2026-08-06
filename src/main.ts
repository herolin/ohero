// Entry point: builds the single-player UI, wires input, i18n and the timer,
// and drives the Game state machine. Multiplayer is added in later stages.

import { DIFFICULTIES } from './game/types';
import type { Difficulty, Position } from './game/types';
import { Game } from './game/gameState';
import { randomSeed } from './game/rng';
import { renderBoard, statusFace } from './ui/render';
import { bindBoardInput } from './ui/input';
import { Lobby } from './ui/lobby';
import { getRoomFromLocation } from './multiplayer/room';
import { GAME_SLUG } from './platform/game';
import { getPlayer, onPlayerChange, renamePlayer, signOut } from './platform/identity';
import { recordScore } from './platform/scores';
import { Leaderboard } from './ui/leaderboard';
import { winScore } from './game/score';
import {
  t,
  getLocale,
  setLocale,
  onLocaleChange,
  LOCALES,
  LOCALE_NAMES,
  type Locale,
} from './i18n';

const DIFFICULTY_KEYS = ['beginner', 'intermediate', 'expert'] as const;

class MinesweeperApp {
  private game: Game;
  private difficulty: Difficulty = 'beginner';
  /** Guard so one won game files one score, however often render() runs. */
  private recorded = false;
  private readonly board: Leaderboard;

  private elapsed = 0;
  private timerId: number | null = null;

  private readonly grid: HTMLElement;
  private readonly minesEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly messageEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly difficultySelect: HTMLSelectElement;
  private readonly difficultyLabel: HTMLElement;
  private readonly languageSelect: HTMLSelectElement;
  private readonly languageLabel: HTMLElement;
  private readonly versusBtn: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly onVersus: () => void,
  ) {
    root.innerHTML = `
      <div class="app">
        <header>
          <h1 class="title"></h1>
          <div class="controls">
            <label>
              <span class="difficulty-label"></span>
              <select class="difficulty"></select>
            </label>
            <label>
              <span class="language-label"></span>
              <select class="language"></select>
            </label>
            <label>
              <span class="name-label"></span>
              <input class="player-name" type="text" maxlength="16" autocomplete="nickname" />
            </label>
            <button class="versus" type="button"></button>
          </div>
        </header>
        <div class="statusbar">
          <span class="counter mines">💣 <span class="mines-count">0</span></span>
          <button class="reset" type="button">🙂</button>
          <span class="counter timer">⏱️ <span class="time-count">0</span></span>
        </div>
        <div class="board-wrap"><div class="grid"></div></div>
        <p class="message" role="status" aria-live="polite"></p>
        <p class="identity-row">
          <span class="identity-note"></span>
          <button class="identity-action" type="button"></button>
        </p>
        <div class="board-host"></div>
      </div>
    `;

    this.grid = this.must('.grid');
    this.minesEl = this.must('.mines-count');
    this.timeEl = this.must('.time-count');
    this.resetBtn = this.must('.reset');
    this.messageEl = this.must('.message');
    this.titleEl = this.must('.title');
    this.difficultySelect = this.must('.difficulty');
    this.difficultyLabel = this.must('.difficulty-label');
    this.languageSelect = this.must('.language');
    this.languageLabel = this.must('.language-label');
    this.versusBtn = this.must('.versus');

    this.game = new Game(DIFFICULTIES[this.difficulty], randomSeed());

    this.buildLanguageOptions();
    this.buildDifficultyOptions();
    this.bindControls();
    bindBoardInput(this.grid, {
      onReveal: (pos) => this.handleReveal(pos),
      onFlag: (pos) => this.handleFlag(pos),
    });

    const nameInput = this.must<HTMLInputElement>('.player-name');
    // Commit on blur and on Enter rather than per keystroke: renaming on every
    // character would rewrite storage a dozen times for one edit.
    const commitName = (): void => {
      const player = renamePlayer(nameInput.value);
      nameInput.value = player.name;
    };
    nameInput.addEventListener('blur', commitName);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitName();
        nameInput.blur();
      }
    });
    this.must<HTMLButtonElement>('.identity-action').addEventListener('click', () => {
      void this.onIdentityAction();
    });

    this.board = new Leaderboard(this.must('.board-host'), GAME_SLUG);
    onLocaleChange(() => {
      this.applyTexts();
      void this.board.refresh();
    });
    onPlayerChange(() => {
      this.applyIdentity();
      void this.board.refresh();
    });
    this.applyTexts();
    void this.board.refresh();
    this.newGame();
  }

  private must<T extends HTMLElement>(selector: string): T {
    const el = document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private buildDifficultyOptions(): void {
    this.difficultySelect.innerHTML = '';
    for (const key of DIFFICULTY_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = t(key);
      this.difficultySelect.appendChild(opt);
    }
    this.difficultySelect.value = this.difficulty;
  }

  private buildLanguageOptions(): void {
    this.languageSelect.innerHTML = '';
    for (const locale of LOCALES) {
      const opt = document.createElement('option');
      opt.value = locale;
      opt.textContent = LOCALE_NAMES[locale];
      this.languageSelect.appendChild(opt);
    }
    this.languageSelect.value = getLocale();
  }

  private bindControls(): void {
    this.difficultySelect.addEventListener('change', () => {
      this.difficulty = this.difficultySelect.value as Difficulty;
      this.newGame();
    });
    this.languageSelect.addEventListener('change', () => {
      setLocale(this.languageSelect.value as Locale);
    });
    this.resetBtn.addEventListener('click', () => this.newGame());
    this.versusBtn.addEventListener('click', () => this.onVersus());
  }

  /** Re-apply all translated static text (called on locale change). */
  private applyTexts(): void {
    this.titleEl.textContent = t('appTitle');
    this.difficultyLabel.textContent = t('difficulty');
    this.languageLabel.textContent = t('language');
    this.versusBtn.textContent = t('versus');
    this.must<HTMLElement>('.name-label').textContent = t('playerName');
    this.applyIdentity();
    document.title = t('appTitle');
    // Difficulty option labels are locale-dependent; rebuild them.
    this.buildDifficultyOptions();
    this.renderMessage();
  }

  private newGame(): void {
    this.game = new Game(DIFFICULTIES[this.difficulty], randomSeed());
    this.stopTimer();
    this.elapsed = 0;
    this.recorded = false;
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
  }

  /**
   * Sign in, or sign out again.
   *
   * Sign-in needs a backend to be worth anything — an account whose scores go
   * nowhere shared is just a longer way to type a name — so until one is
   * configured this says so rather than pretending.
   */
  private async onIdentityAction(): Promise<void> {
    if (getPlayer().kind === 'google') {
      signOut();
      return;
    }
    const { signInWithGoogle, isAuthConfigured } = await import('./platform/auth');
    if (!isAuthConfigured()) {
      this.must<HTMLElement>('.identity-note').textContent = t('signInUnavailable');
      return;
    }
    await signInWithGoogle();
  }

  private applyIdentity(): void {
    const player = getPlayer();
    const nameInput = this.must<HTMLInputElement>('.player-name');
    nameInput.value = player.name;
    // A signed-in name belongs to the account, not to this box.
    nameInput.disabled = player.kind === 'google';
    this.must<HTMLElement>('.identity-note').textContent =
      player.kind === 'google' ? `${t('signedInAs')} ${player.name}` : t('guestNote');
    this.must<HTMLButtonElement>('.identity-action').textContent =
      player.kind === 'google' ? t('signOut') : t('signInGoogle');
  }

  /**
   * File a won game on the board.
   *
   * The clock becomes points in `game/score.ts` — a rule, not a rendering
   * decision. The time itself goes in the detail line, because that is the
   * number a minesweeper player actually compares. Losses are not filed;
   * there is nothing to rank about the moment you hit a mine.
   */
  private recordWin(): void {
    if (this.recorded || this.game.status !== 'won') return;
    this.recorded = true;
    void recordScore({
      game: GAME_SLUG,
      player: getPlayer(),
      score: winScore(this.difficulty, this.elapsed),
      detail: `${t(this.difficulty)} · ${this.elapsed}s`,
    });
    void this.board.refresh();
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

// ---- Top-level routing: single-player vs. multiplayer lobby ----

function openSinglePlayer(root: HTMLElement): void {
  new MinesweeperApp(root, () => openLobby(root, null));
}

function openLobby(root: HTMLElement, joinRoom: string | null): void {
  new Lobby(
    root,
    { joinRoom },
    {
      onExit: () => openSinglePlayer(root),
      onStart: () => {
        // Stage 5–6 will hand off to the versus game view here.
      },
    },
  );
}

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  const room = getRoomFromLocation();
  if (room) openLobby(root, room);
  else openSinglePlayer(root);
}
