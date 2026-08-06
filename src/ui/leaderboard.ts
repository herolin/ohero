// The score board on the start screen.
//
// Two tabs, because "最近十次最高分" reads two ways and both are worth having:
// TOP is the ten best ever, RECENT is the ten most recent plays. An arcade
// cabinet shows the first; a machine at a party is more interesting showing
// the second.
//
// YOUR OWN ROWS ARE MARKED WITH MORE THAN COLOUR — a highlighted background,
// a left edge, and a "· 你" tag. Same reasoning as telling two players apart
// in-game (CLAUDE.md §13): colour alone fails for anyone colour-blind, and
// fails for everyone when they are scanning rather than reading.

import { getPlayer } from '../platform/identity';
import { scoreStore } from '../platform/scores';
import type { ScoreEntry } from '../platform/scores';
import { t } from '../i18n';

export type BoardTab = 'top' | 'recent';

/** How many rows a board shows. Ten, per the request. */
export const BOARD_ROWS = 10;

function whenText(at: number): string {
  const delta = Date.now() - at;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return t('justNow');
  if (minutes < 60) return `${minutes}${t('minutesAgo')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t('hoursAgo')}`;
  const days = Math.floor(hours / 24);
  if (days < 8) return `${days}${t('daysAgo')}`;
  // Older than a week the relative form stops being useful.
  return new Date(at).toLocaleDateString();
}

export class Leaderboard {
  private tab: BoardTab = 'top';
  private readonly root: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly game: string,
  ) {
    this.root = root;
    root.innerHTML = `
      <div class="board">
        <div class="board-tabs">
          <button class="board-tab" data-tab="top" type="button"></button>
          <button class="board-tab" data-tab="recent" type="button"></button>
        </div>
        <ol class="board-rows"></ol>
        <p class="board-note"></p>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('.board-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab === 'recent' ? 'recent' : 'top';
        void this.refresh();
      });
    });
  }

  /** Re-read the store and redraw. Safe to call as often as you like. */
  async refresh(): Promise<void> {
    const store = scoreStore();
    const rows =
      this.tab === 'top'
        ? await store.top(this.game, BOARD_ROWS)
        : await store.recent(this.game, BOARD_ROWS);

    this.applyTabs();
    this.applyRows(rows);
    this.applyNote(store.kind);
  }

  private q<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private applyTabs(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.board-tab').forEach((btn) => {
      const tab = btn.dataset.tab === 'recent' ? 'recent' : 'top';
      btn.textContent = tab === 'top' ? t('boardTop') : t('boardRecent');
      btn.classList.toggle('on', tab === this.tab);
      btn.setAttribute('aria-pressed', String(tab === this.tab));
    });
  }

  private applyRows(rows: ScoreEntry[]): void {
    const list = this.q<HTMLOListElement>('.board-rows');
    list.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'board-empty';
      empty.textContent = t('boardEmpty');
      list.appendChild(empty);
      return;
    }

    const me = getPlayer().id;
    rows.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'board-row';
      const mine = entry.playerId === me;
      if (mine) li.classList.add('mine');

      const rank = document.createElement('span');
      rank.className = 'board-rank';
      rank.textContent = String(i + 1);

      const who = document.createElement('span');
      who.className = 'board-who';
      // textContent, not innerHTML: a player-chosen name is untrusted input
      // and must never be able to put markup on anyone else's screen.
      who.textContent = entry.playerName;
      if (mine) {
        const tag = document.createElement('b');
        tag.className = 'board-you';
        tag.textContent = ` · ${t('you')}`;
        who.appendChild(tag);
      }

      const score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = entry.score.toLocaleString();

      const when = document.createElement('span');
      when.className = 'board-when';
      when.textContent = whenText(entry.at);
      when.title = new Date(entry.at).toLocaleString();

      li.append(rank, who, score, when);
      if (entry.detail) {
        const detail = document.createElement('span');
        detail.className = 'board-detail';
        detail.textContent = entry.detail;
        li.appendChild(detail);
      }
      list.appendChild(li);
    });
  }

  private applyNote(kind: 'local' | 'cloud'): void {
    // Saying which kind of board this is matters. A local board that looks
    // global is a lie the player only discovers when a friend's score never
    // shows up.
    this.q<HTMLElement>('.board-note').textContent =
      kind === 'local' ? t('boardLocalOnly') : t('boardShared');
  }
}
