// Shared-board modes: co-op and claim. Both players act on ONE board.
// The host runs the Authority (the single source of truth); the guest only
// sends intents and renders the deltas the host broadcasts. See CLAUDE.md §5.2.
//
//   Co-op : any mine → both lose; clear together → both win.
//   Claim : each cell belongs to whoever revealed it first; hitting a mine
//           loses immediately (opponent wins); a full clear compares counts
//           (higher wins, tie = draw). Cells are coloured by owner.

import type { Difficulty, PlayerId, Position } from '../game/types';
import { DIFFICULTIES } from '../game/types';
import { createRng, randomSeed } from '../game/rng';
import { Board } from '../game/board';
import { Authority } from '../multiplayer/authority';
import type { SharedMode, Resolution } from '../multiplayer/authority';
import type { Connection } from '../multiplayer/connection';
import type { Message, Role, RevealedCell, StartMsg } from '../multiplayer/protocol';
import { renderBoardCells } from './render';
import { bindBoardInput } from './input';
import { t, onLocaleChange } from '../i18n';

export interface SharedOptions {
  connection: Connection;
  role: Role;
  mode: SharedMode;
  difficulty: Difficulty;
  seed: string;
  onExit: () => void;
}

const HOST: PlayerId = 'host';
const GUEST: PlayerId = 'guest';

type ResultKind = 'win' | 'lose' | 'draw';

export class SharedGame {
  private readonly connection: Connection;
  private readonly role: Role;
  private readonly myId: PlayerId;
  private readonly otherId: PlayerId;
  private mode: SharedMode;
  private difficulty: Difficulty;

  private authority: Authority | null = null;
  private board!: Board;
  private decided = false;
  private readonly unsubscribe: () => void;

  private readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly minesEl: HTMLElement;
  private readonly modeBadge: HTMLElement;
  private readonly scorePanel: HTMLElement;
  private readonly youScore: HTMLElement;
  private readonly oppScore: HTMLElement;
  private readonly resultBox: HTMLElement;
  private readonly resultText: HTMLElement;
  private readonly rematchBtn: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly opts: SharedOptions) {
    this.connection = opts.connection;
    this.role = opts.role;
    this.myId = opts.role === 'host' ? HOST : GUEST;
    this.otherId = opts.role === 'host' ? GUEST : HOST;
    this.mode = opts.mode;
    this.difficulty = opts.difficulty;
    this.root = root;

    root.innerHTML = `
      <div class="app shared">
        <header>
          <h1 class="title"></h1>
          <button class="back" type="button"></button>
        </header>
        <div class="score-panel" hidden>
          <span class="chip you"><span class="you-label"></span> <span class="you-score">0</span></span>
          <span class="chip opp"><span class="opp-label"></span> <span class="opp-score">0</span></span>
        </div>
        <div class="statusbar">
          <span class="counter mines">💣 <span class="mines-count">0</span></span>
          <span class="mode-badge"></span>
        </div>
        <div class="board-wrap"><div class="grid"></div></div>
        <div class="result" hidden>
          <p class="result-text"></p>
          <button class="primary rematch" type="button"></button>
        </div>
      </div>
    `;

    this.grid = this.q('.grid');
    this.minesEl = this.q('.mines-count');
    this.modeBadge = this.q('.mode-badge');
    this.scorePanel = this.q('.score-panel');
    this.youScore = this.q('.you-score');
    this.oppScore = this.q('.opp-score');
    this.resultBox = this.q('.result');
    this.resultText = this.q('.result-text');
    this.rematchBtn = this.q('.rematch');

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
    this.setup(opts.seed);
    this.applyTexts();
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
    this.modeBadge.textContent = this.mode === 'coop' ? t('modeCoop') : t('modeClaim');
    this.rematchBtn.textContent = t('rematch');
  }

  private setup(seed: string): void {
    const config = DIFFICULTIES[this.difficulty];
    if (this.role === 'host') {
      this.authority = new Authority(config, seed, this.mode);
      this.board = this.authority.board;
    } else {
      // Guest mirror: never runs game logic, only applies broadcast deltas.
      this.board = new Board(config, createRng(seed));
      this.authority = null;
    }
    this.decided = false;
    this.resultBox.hidden = true;
    this.scorePanel.hidden = this.mode !== 'claim';
    this.applyTexts();
    this.render();
  }

  // ---- Input ----

  private handleReveal(pos: Position): void {
    if (this.decided) return;
    if (this.role === 'host') this.hostReveal(pos, HOST);
    else this.connection.send({ type: 'intent', action: 'reveal', pos });
  }

  private handleFlag(pos: Position): void {
    if (this.decided) return;
    if (this.role === 'host') {
      const f = this.authority!.flag(pos);
      this.connection.send({ type: 'flag', pos: f.pos, flagged: f.flagged });
      this.render();
    } else {
      this.connection.send({ type: 'intent', action: 'flag', pos });
    }
  }

  // ---- Host authority ----

  private hostReveal(pos: Position, by: PlayerId): void {
    if (this.decided || !this.authority) return;
    const out = this.authority.reveal(pos, by);
    if (out.cells.length === 0 && !out.hitMine && !out.resolution) return;
    this.connection.send({ type: 'reveal', cells: out.cells, hitMine: out.hitMine, by });
    this.render();
    if (out.resolution) this.resolveHost(out.resolution);
  }

  private resolveHost(res: Resolution): void {
    this.decided = true;
    let mine: ResultKind;
    let theirs: ResultKind;
    if (res.mode === 'coop') {
      mine = theirs = res.win ? 'win' : 'lose';
    } else if (res.result === 'draw') {
      mine = theirs = 'draw';
    } else {
      mine = res.result === this.myId ? 'win' : 'lose';
      theirs = res.result === this.otherId ? 'win' : 'lose';
    }
    this.connection.send({ type: 'gameover', result: theirs });
    this.showResult(mine);
  }

  // ---- Networking ----

  private onMessage(msg: Message): void {
    switch (msg.type) {
      case 'intent':
        // Guest asked the host to act.
        if (this.role !== 'host') break;
        if (msg.action === 'reveal') this.hostReveal(msg.pos, GUEST);
        else this.handleFlagFromGuest(msg.pos);
        break;
      case 'reveal':
        if (this.role === 'guest') this.applyReveal(msg.cells);
        break;
      case 'flag':
        if (this.role === 'guest') {
          this.board.cells[msg.pos.row][msg.pos.col].isFlagged = msg.flagged;
          this.render();
        }
        break;
      case 'gameover':
        if (!this.decided) {
          this.decided = true;
          this.showResult(msg.result as ResultKind);
        }
        break;
      case 'rematch':
        if (this.role === 'host') this.startNewRound();
        break;
      case 'start':
        if (this.role === 'guest' && (msg.mode === 'coop' || msg.mode === 'claim')) {
          this.mode = msg.mode;
          this.difficulty = msg.difficulty;
          this.setup(msg.seed);
        }
        break;
      default:
        break;
    }
  }

  private handleFlagFromGuest(pos: Position): void {
    if (this.decided || !this.authority) return;
    const f = this.authority.flag(pos);
    this.connection.send({ type: 'flag', pos: f.pos, flagged: f.flagged });
    this.render();
  }

  private applyReveal(cells: RevealedCell[]): void {
    for (const c of cells) {
      const cell = this.board.cells[c.pos.row][c.pos.col];
      cell.isRevealed = true;
      cell.isMine = c.isMine;
      cell.adjacentMines = c.adjacentMines;
      cell.owner = c.owner;
    }
    this.render();
  }

  private onDisconnected(): void {
    if (this.decided) return;
    this.decided = true;
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
      mode: this.mode,
      difficulty: this.difficulty,
      seed: randomSeed(),
      startAt: 0,
    };
    this.connection.send(msg);
    this.setup(msg.seed);
  }

  // ---- Rendering ----

  private render(): void {
    renderBoardCells(this.grid, this.board, {
      myId: this.mode === 'claim' ? this.myId : undefined,
    });
    this.minesEl.textContent = String(DIFFICULTIES[this.difficulty].mines - this.board.flagCount());
    if (this.mode === 'claim') {
      this.youScore.textContent = String(this.board.ownedCount(this.myId));
      this.oppScore.textContent = String(this.board.ownedCount(this.otherId));
    }
  }

  private showResult(kind: ResultKind): void {
    let text: string;
    if (this.mode === 'coop') {
      text = kind === 'win' ? t('coopWin') : t('coopLose');
    } else if (kind === 'draw') {
      text = t('draw');
    } else {
      text = kind === 'win' ? t('raceWin') : t('raceLose');
    }
    this.resultText.textContent = text;
    this.rematchBtn.hidden = false;
    this.resultBox.hidden = false;
    this.render();
  }

  private exit(): void {
    this.connection.close();
    this.opts.onExit();
  }

  destroy(): void {
    this.unsubscribe();
  }
}
