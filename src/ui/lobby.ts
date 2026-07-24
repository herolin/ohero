// Lobby: create/join a match, pick mode + difficulty (host), show the share
// link, wait for the opponent, and handle disconnects. Owns a Connection and
// hands off to the caller via onStart once a match begins (gameplay lands in
// stages 5–6). No game rendering happens here.

import type { Difficulty, GameMode } from '../game/types';
import { randomSeed } from '../game/rng';
import { Connection } from '../multiplayer/connection';
import type { Role, StartMsg } from '../multiplayer/protocol';
import {
  generateRoomId,
  shareLinkForRoom,
  setRoomInLocation,
} from '../multiplayer/room';
import { t, onLocaleChange } from '../i18n';

export interface StartInfo {
  role: Role;
  mode: GameMode;
  difficulty: Difficulty;
  seed: string;
  startAt: number;
}

export interface LobbyCallbacks {
  /** Return to single-player (clears the room from the URL). */
  onExit: () => void;
  /** A match has started (both peers agreed on mode/seed/startAt). */
  onStart: (info: StartInfo) => void;
}

/** Countdown lead time before a synchronised start (ms). */
const COUNTDOWN_MS = 3000;

export class Lobby {
  private readonly connection = new Connection();
  private readonly body: HTMLElement;

  private mode: GameMode = 'race';
  private difficulty: Difficulty = 'intermediate';
  private roomId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: { joinRoom?: string | null },
    private readonly callbacks: LobbyCallbacks,
  ) {
    root.innerHTML = `
      <div class="app lobby">
        <header><h1 class="title"></h1></header>
        <div class="lobby-body"></div>
        <button class="back" type="button"></button>
      </div>
    `;
    this.body = this.query('.lobby-body');

    this.query<HTMLElement>('.title').textContent = t('appTitle');
    const backBtn = this.query<HTMLButtonElement>('.back');
    backBtn.textContent = t('back');
    backBtn.addEventListener('click', () => this.exit());

    onLocaleChange(() => {
      this.query<HTMLElement>('.title').textContent = t('appTitle');
      this.query<HTMLButtonElement>('.back').textContent = t('back');
    });

    if (this.opts.joinRoom) this.startGuest(this.opts.joinRoom);
    else this.renderHostSetup();
  }

  private query<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private exit(): void {
    this.connection.close();
    setRoomInLocation(null);
    this.callbacks.onExit();
  }

  // ---- Host ----

  private renderHostSetup(): void {
    this.body.innerHTML = `
      <label class="field">
        <span class="mode-label"></span>
        <select class="mode-select">
          <option value="race"></option>
          <option value="coop"></option>
          <option value="claim"></option>
        </select>
      </label>
      <label class="field">
        <span class="diff-label"></span>
        <select class="diff-select">
          <option value="beginner"></option>
          <option value="intermediate"></option>
          <option value="expert"></option>
        </select>
      </label>
      <button class="primary create-btn" type="button"></button>
    `;
    this.query<HTMLElement>('.mode-label').textContent = t('mode');
    this.query<HTMLElement>('.diff-label').textContent = t('difficulty');
    this.query<HTMLButtonElement>('.create-btn').textContent = t('createRoom');

    const modeSelect = this.query<HTMLSelectElement>('.mode-select');
    (modeSelect.querySelector('option[value="race"]') as HTMLOptionElement).textContent = t('modeRace');
    (modeSelect.querySelector('option[value="coop"]') as HTMLOptionElement).textContent = t('modeCoop');
    (modeSelect.querySelector('option[value="claim"]') as HTMLOptionElement).textContent = t('modeClaim');
    modeSelect.value = this.mode;

    const diffSelect = this.query<HTMLSelectElement>('.diff-select');
    (diffSelect.querySelector('option[value="beginner"]') as HTMLOptionElement).textContent = t('beginner');
    (diffSelect.querySelector('option[value="intermediate"]') as HTMLOptionElement).textContent = t('intermediate');
    (diffSelect.querySelector('option[value="expert"]') as HTMLOptionElement).textContent = t('expert');
    diffSelect.value = this.difficulty;

    modeSelect.addEventListener('change', () => {
      this.mode = modeSelect.value as GameMode;
    });
    diffSelect.addEventListener('change', () => {
      this.difficulty = diffSelect.value as Difficulty;
    });
    this.query<HTMLButtonElement>('.create-btn').addEventListener('click', () => this.startHost());
  }

  private startHost(): void {
    this.roomId = generateRoomId();
    setRoomInLocation(this.roomId);
    this.connection.hostRoom(this.roomId, {
      onPeerConnected: () => {
        // Tell the guest the chosen mode/difficulty, then show start controls.
        this.connection.send({ type: 'mode', mode: this.mode, difficulty: this.difficulty });
        this.renderHostReady();
      },
      onDisconnected: () => this.renderError(t('opponentLeft')),
      onError: (err) => this.renderError(`${t('connectionError')} (${err.message})`),
    });
    this.renderHostWaiting();
  }

  private renderHostWaiting(): void {
    const link = this.roomId ? shareLinkForRoom(this.roomId) : '';
    this.body.innerHTML = `
      <p class="hint"></p>
      <div class="share-row">
        <input class="share-input" type="text" readonly />
        <button class="copy-btn" type="button"></button>
      </div>
      <p class="status waiting"></p>
    `;
    this.query<HTMLElement>('.hint').textContent = t('shareHint');
    const input = this.query<HTMLInputElement>('.share-input');
    input.value = link;
    const copyBtn = this.query<HTMLButtonElement>('.copy-btn');
    copyBtn.textContent = t('copyLink');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        input.select();
      }
      copyBtn.textContent = t('copied');
    });
    this.query<HTMLElement>('.status').textContent = t('waitingOpponent');
  }

  private renderHostReady(): void {
    this.body.innerHTML = `
      <p class="status connected"></p>
      <button class="primary start-btn" type="button"></button>
    `;
    this.query<HTMLElement>('.status').textContent = t('opponentJoined');
    const startBtn = this.query<HTMLButtonElement>('.start-btn');
    startBtn.textContent = t('startGame');
    startBtn.addEventListener('click', () => this.beginMatch());
  }

  private beginMatch(): void {
    const msg: StartMsg = {
      type: 'start',
      mode: this.mode,
      difficulty: this.difficulty,
      seed: randomSeed(),
      startAt: Date.now() + COUNTDOWN_MS,
    };
    this.connection.send(msg);
    this.handleStart(msg);
  }

  // ---- Guest ----

  private startGuest(roomId: string): void {
    this.roomId = roomId;
    this.connection.joinRoom(roomId, {
      onPeerConnected: () => this.renderGuestWaiting(),
      onMessage: (msg) => {
        if (msg.type === 'mode') {
          this.mode = msg.mode;
          this.difficulty = msg.difficulty;
        } else if (msg.type === 'start') {
          this.handleStart(msg);
        }
      },
      onDisconnected: () => this.renderError(t('opponentLeft')),
      onError: (err) => this.renderError(`${t('connectionError')} (${err.message})`),
    });
    this.renderConnecting();
  }

  private renderConnecting(): void {
    this.body.innerHTML = `<p class="status waiting"></p>`;
    this.query<HTMLElement>('.status').textContent = t('connecting');
  }

  private renderGuestWaiting(): void {
    this.body.innerHTML = `<p class="status connected"></p><p class="status waiting"></p>`;
    const nodes = this.body.querySelectorAll<HTMLElement>('.status');
    nodes[0].textContent = t('opponentJoined');
    nodes[1].textContent = t('waitingStart');
  }

  // ---- Shared ----

  private handleStart(msg: StartMsg): void {
    const role: Role = this.connection.role ?? 'host';
    // Placeholder until stages 5–6 wire up actual versus play.
    this.body.innerHTML = `<p class="status ready"></p>`;
    this.query<HTMLElement>('.status').textContent = t('matchReady');
    this.callbacks.onStart({
      role,
      mode: msg.mode,
      difficulty: msg.difficulty,
      seed: msg.seed,
      startAt: msg.startAt,
    });
  }

  private renderError(message: string): void {
    this.body.innerHTML = `<p class="status error"></p>`;
    this.query<HTMLElement>('.status').textContent = message;
  }
}
