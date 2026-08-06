// Who is playing.
//
// A player is either a GUEST or a SIGNED-IN account. The difference that
// matters is not the name — it is whether the identity survives leaving this
// browser. A guest is a name attached to one device; an account is a name
// attached to a person, which is what makes scores from several games add up
// to one player.
//
// The `id` is what the score store keys on, never the name. Two people can
// both call themselves 來賓042, and one person can rename themselves halfway
// through the evening; neither should merge or split their history.
//
// SHARED ACROSS GAMES ON PURPOSE. This module is meant to be copied verbatim
// into every game in the set, the way `ownership.ts` was. The storage keys are
// deliberately NOT namespaced per game — a guest who plays three games should
// be the same 來賓042 in all three, on that device.

export type PlayerKind = 'guest' | 'google';

export interface Player {
  /** Stable identity. Guests get a local id; accounts use the provider's. */
  id: string;
  name: string;
  kind: PlayerKind;
}

const ID_KEY = 'ohero-player-id';
const NAME_KEY = 'ohero-player-name';
const KIND_KEY = 'ohero-player-kind';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: identity lasts the session and no longer */
  }
}

/**
 * A guest number.
 *
 * Three digits, so it reads as a label rather than an id — 來賓042 is
 * something you can say out loud to the person next to you. Math.random is
 * fine here: this is not simulation randomness (CLAUDE.md §11), and two
 * devices colliding on a number is harmless because the `id` is what counts.
 */
function makeGuestNumber(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

function makeId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `g-${Date.now().toString(36)}-${random}`;
}

let current: Player = load();

function load(): Player {
  const id = read(ID_KEY);
  const name = read(NAME_KEY);
  const kind = read(KIND_KEY);

  if (id && name && (kind === 'guest' || kind === 'google')) {
    return { id, name, kind };
  }
  const guest: Player = {
    id: makeId(),
    name: `來賓${makeGuestNumber()}`,
    kind: 'guest',
  };
  persist(guest);
  return guest;
}

function persist(player: Player): void {
  write(ID_KEY, player.id);
  write(NAME_KEY, player.name);
  write(KIND_KEY, player.kind);
}

type Listener = (player: Player) => void;
const listeners: Listener[] = [];

export function onPlayerChange(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function announce(): void {
  for (const fn of listeners) fn(current);
}

export function getPlayer(): Player {
  return { ...current };
}

/**
 * Rename the current player.
 *
 * Allowed for guests only. A signed-in name comes from the account, and
 * letting it be edited locally would mean the same person appeared under two
 * names on a shared board.
 */
export function renamePlayer(name: string): Player {
  const trimmed = name.trim().slice(0, 16);
  if (current.kind !== 'guest' || trimmed === '' || trimmed === current.name) {
    return getPlayer();
  }
  current = { ...current, name: trimmed };
  persist(current);
  announce();
  return getPlayer();
}

/**
 * Adopt a signed-in account.
 *
 * Called by whichever auth provider is wired up. Kept provider-agnostic on
 * purpose: this module should not know or care whether the token came from
 * Google, and swapping providers should not touch anything that reads
 * `getPlayer()`.
 */
export function signIn(account: { id: string; name: string }): Player {
  current = {
    id: account.id,
    name: account.name.trim().slice(0, 24) || 'Player',
    kind: 'google',
  };
  persist(current);
  announce();
  return getPlayer();
}

/** Drop back to a fresh guest. */
export function signOut(): Player {
  current = { id: makeId(), name: `來賓${makeGuestNumber()}`, kind: 'guest' };
  persist(current);
  announce();
  return getPlayer();
}

/** Test seam: forget everything and re-derive. */
export function reloadPlayer(): Player {
  current = load();
  announce();
  return getPlayer();
}
