// Entry point: routes between the start screen, the single-player game and the
// multiplayer lobby.
//
// Only one view is mounted at a time and the outgoing one is destroyed, so
// there is never a stale timer or key handler running behind what you can see.

import { GameView } from './ui/gameView';
import { StartScreen } from './ui/startScreen';
import { Lobby } from './ui/lobby';
import type { StartInfo } from './ui/lobby';
import { RaceGame } from './ui/raceGame';
import { SharedGame } from './ui/sharedGame';
import type { Connection } from './multiplayer/connection';
import { getRoomFromLocation, setRoomInLocation } from './multiplayer/room';
import { SINGLE_PLAYER_ONLY } from './build';
import { installOwnership } from './ownership';

// ---- Top-level routing ----

interface View {
  destroy(): void;
}

let current: View | null = null;

function mount(view: View): void {
  current?.destroy();
  current = view;
}

/** The setup screen — where a game is configured and the board is shown. */
function openStart(root: HTMLElement): void {
  mount(
    new StartScreen(root, {
      onStart: (settings) => mount(new GameView(root, settings, () => openStart(root))),
      onVersus: () => openLobby(root, null),
    }),
  );
}

function openLobby(root: HTMLElement, joinRoom: string | null): void {
  mount(
    new Lobby(
      root,
      { joinRoom },
      {
        onExit: () => openStart(root),
        onStart: (info, connection) => openGame(root, info, connection),
      },
    ),
  );
}

function openGame(root: HTMLElement, info: StartInfo, connection: Connection): void {
  const backToStart = (): void => {
    setRoomInLocation(null);
    openStart(root);
  };

  if (info.mode === 'race') {
    mount(
      new RaceGame(root, {
        connection,
        role: info.role,
        difficulty: info.difficulty,
        seed: info.seed,
        startAt: info.startAt,
        onExit: backToStart,
      }),
    );
  } else {
    // Shared board: co-op / claim.
    mount(
      new SharedGame(root, {
        connection,
        role: info.role,
        mode: info.mode === 'coop' ? 'coop' : 'claim',
        difficulty: info.difficulty,
        seed: info.seed,
        onExit: backToStart,
      }),
    );
  }
}

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  // A shared ?room= link goes straight to the lobby — except on the
  // single-player build, which has no versus mode to join.
  const room = SINGLE_PLAYER_ONLY ? null : getRoomFromLocation();
  if (room) openLobby(root, room);
  else openStart(root);
}

installOwnership();
