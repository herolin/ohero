// The start screen: your name, the difficulty and the language, all settled
// before a board appears — so the game view can be nothing but the grid, its
// status bar and a way back.
//
// It is also where the score board lives, which is the other reason this
// screen exists. A board under a running game is a board nobody reads.
//
// Choices persist, so coming back after a game remembers what you picked.

import type { Difficulty } from '../game/types';
import { GAME_SLUG } from '../platform/game';
import { getPlayer, onPlayerChange, renamePlayer, signOut } from '../platform/identity';
import { Leaderboard } from './leaderboard';
import { SINGLE_PLAYER_ONLY } from '../build';
import { LOCALES, LOCALE_NAMES, getLocale, onLocaleChange, setLocale, t } from '../i18n';
import type { Locale } from '../i18n';

export interface StartSettings {
  difficulty: Difficulty;
}

export interface StartScreenCallbacks {
  onStart: (settings: StartSettings) => void;
  onVersus: () => void;
}

const DIFFICULTY_KEYS: Difficulty[] = ['beginner', 'intermediate', 'expert'];
const DIFFICULTY_STORAGE = 'bomb-difficulty';

function isDifficulty(v: string | null): v is Difficulty {
  return v !== null && (DIFFICULTY_KEYS as string[]).includes(v);
}

export function loadSettings(): StartSettings {
  try {
    const difficulty = localStorage.getItem(DIFFICULTY_STORAGE);
    return { difficulty: isDifficulty(difficulty) ? difficulty : 'beginner' };
  } catch {
    return { difficulty: 'beginner' };
  }
}

function saveSettings(s: StartSettings): void {
  try {
    localStorage.setItem(DIFFICULTY_STORAGE, s.difficulty);
  } catch {
    /* ignore (e.g. private mode) */
  }
}

export class StartScreen {
  private settings: StartSettings;
  private readonly board: Leaderboard;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: StartScreenCallbacks,
  ) {
    this.settings = loadSettings();

    root.innerHTML = `
      <div class="app start">
        <header>
          <a class="to-hub" href="../"></a>
          <h1 class="title"></h1>
        </header>
        <div class="start-body">
          <label class="field">
            <span class="name-label"></span>
            <input class="player-name" type="text" maxlength="16" autocomplete="nickname" />
          </label>
          <p class="identity-row">
            <span class="identity-note"></span>
            <button class="identity-action" type="button"></button>
          </p>
          <label class="field">
            <span class="difficulty-label"></span>
            <select class="difficulty"></select>
          </label>
          <label class="field">
            <span class="language-label"></span>
            <select class="language"></select>
          </label>
          <button class="primary play-btn" type="button"></button>
          <button class="versus" type="button"></button>
        </div>
        <div class="board-host"></div>
      </div>
    `;

    const langSelect = this.q<HTMLSelectElement>('.language');
    for (const locale of LOCALES) {
      const opt = document.createElement('option');
      opt.value = locale;
      opt.textContent = LOCALE_NAMES[locale];
      langSelect.appendChild(opt);
    }
    langSelect.value = getLocale();
    langSelect.addEventListener('change', () => setLocale(langSelect.value as Locale));

    const diffSelect = this.q<HTMLSelectElement>('.difficulty');
    diffSelect.addEventListener('change', () => {
      this.settings.difficulty = diffSelect.value as Difficulty;
      saveSettings(this.settings);
    });

    this.q<HTMLButtonElement>('.play-btn').addEventListener('click', () => {
      saveSettings(this.settings);
      this.callbacks.onStart({ ...this.settings });
    });

    // The single-player build ships the versus code but offers no way in.
    const versus = this.q<HTMLButtonElement>('.versus');
    versus.hidden = SINGLE_PLAYER_ONLY;
    versus.addEventListener('click', () => this.callbacks.onVersus());

    const nameInput = this.q<HTMLInputElement>('.player-name');
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

    this.q<HTMLButtonElement>('.identity-action').addEventListener('click', () => {
      void this.onIdentityAction();
    });

    this.board = new Leaderboard(this.q('.board-host'), GAME_SLUG);
    this.cleanups.push(
      onLocaleChange(() => {
        this.applyTexts();
        void this.board.refresh();
      }),
      onPlayerChange(() => {
        this.applyIdentity();
        void this.board.refresh();
      }),
    );

    this.applyTexts();
    void this.board.refresh();
  }

  destroy(): void {
    for (const fn of this.cleanups) fn();
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
    const { signInWithGoogle, isAuthConfigured } = await import('../platform/auth');
    if (!isAuthConfigured()) {
      this.q<HTMLElement>('.identity-note').textContent = t('signInUnavailable');
      return;
    }
    await signInWithGoogle();
  }

  private applyIdentity(): void {
    const player = getPlayer();
    const nameInput = this.q<HTMLInputElement>('.player-name');
    nameInput.value = player.name;
    // A signed-in name belongs to the account, not to this box.
    nameInput.disabled = player.kind === 'google';
    this.q<HTMLElement>('.identity-note').textContent =
      player.kind === 'google' ? `${t('signedInAs')} ${player.name}` : t('guestNote');
    this.q<HTMLButtonElement>('.identity-action').textContent =
      player.kind === 'google' ? t('signOut') : t('signInGoogle');
  }

  private q<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private applyTexts(): void {
    this.q<HTMLElement>('.to-hub').textContent = t('backToGames');
    this.q<HTMLElement>('.title').textContent = t('appTitle');
    document.title = t('appTitle');
    this.q<HTMLElement>('.name-label').textContent = t('playerName');
    this.q<HTMLElement>('.difficulty-label').textContent = t('difficulty');
    this.q<HTMLElement>('.language-label').textContent = t('language');
    this.q<HTMLButtonElement>('.play-btn').textContent = `▶ ${t('startGame')}`;
    this.q<HTMLButtonElement>('.versus').textContent = `👥 ${t('versus')}`;

    const diffSelect = this.q<HTMLSelectElement>('.difficulty');
    diffSelect.innerHTML = '';
    for (const key of DIFFICULTY_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = t(key);
      diffSelect.appendChild(opt);
    }
    diffSelect.value = this.settings.difficulty;

    this.applyIdentity();
  }
}
