// Minimal i18n core: locale detection, switching and string lookup.
// UI code must never hardcode user-facing text — always go through t().

import en from './locales/en';
import zhTW from './locales/zh-TW';
import zhCN from './locales/zh-CN';

/** Every user-facing string key. All locales must implement this shape. */
export interface Messages {
  appTitle: string;
  difficulty: string;
  beginner: string;
  intermediate: string;
  expert: string;
  newGame: string;
  win: string;
  lose: string;
  language: string;
  // Multiplayer / lobby
  singlePlayer: string;
  versus: string;
  back: string;
  mode: string;
  modeRace: string;
  modeCoop: string;
  modeClaim: string;
  createRoom: string;
  shareHint: string;
  copyLink: string;
  copied: string;
  share: string;
  connecting: string;
  waitingOpponent: string;
  opponentJoined: string;
  startGame: string;
  waitingStart: string;
  matchReady: string;
  opponentLeft: string;
  connectionError: string;
  // Race gameplay
  you: string;
  opponent: string;
  go: string;
  raceWin: string;
  raceLose: string;
  rematch: string;
  rematchWait: string;
  comingSoon: string;
  // Shared-board modes
  coopWin: string;
  coopLose: string;
  draw: string;

  // ---- Shared platform layer (see PLATFORM.md) ----
  playerName: string;
  guestNote: string;
  signInGoogle: string;
  signedInAs: string;
  signOut: string;
  signInUnavailable: string;
  boardTop: string;
  boardRecent: string;
  boardEmpty: string;
  boardLocalOnly: string;
  boardShared: string;
  justNow: string;
  minutesAgo: string;
  hoursAgo: string;
  daysAgo: string;
  backToGames: string;
  viewBoard: string;
  playAgain: string;
  finalTime: string;
  gameOver: string;
  youWin: string;
}

export type Locale = 'en' | 'zh-TW' | 'zh-CN';

/** Supported locales; `en` is the default and fallback. */
export const LOCALES: Locale[] = ['en', 'zh-TW', 'zh-CN'];

/** Native display names, shown in the language picker in their own script. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
};

const MESSAGES: Record<Locale, Messages> = {
  en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
};

const STORAGE_KEY = 'locale';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g. private mode); language just won't persist.
  }
}

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as string[]).includes(value);
}

/** Pick a starting locale: saved choice → browser language → English. */
function detectLocale(): Locale {
  const saved = safeGet(STORAGE_KEY);
  if (isLocale(saved)) return saved;

  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('zh')) {
    if (nav.includes('cn') || nav.includes('hans') || nav.includes('sg')) return 'zh-CN';
    return 'zh-TW';
  }
  return 'en';
}

let current: Locale = detectLocale();

type Listener = () => void;
const listeners: Listener[] = [];

/** Subscribe to locale changes (e.g. to re-render static labels).
 *  Returns an unsubscribe function; call it when the view is torn down. */
export function onLocaleChange(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  safeSet(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  for (const fn of listeners) fn();
}

/** Look up a string in the current locale, falling back to English. */
export function t(key: keyof Messages): string {
  return MESSAGES[current][key] ?? MESSAGES.en[key];
}

// Reflect the initial locale on the document element.
document.documentElement.lang = current;
