// Room ID generation and share-link (?room=XXXX) handling.
// Pure helpers accept an explicit URL string so they can be unit-tested;
// the *FromLocation / *ForRoom wrappers use window.location in the browser.

export const ROOM_PARAM = 'room';

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_RE = /^[a-z0-9]{4,32}$/i;

/**
 * Generate a room ID. Doubles as the host's PeerJS peer ID, so the guest can
 * connect to it directly. Uses Math.random — this is room setup, not game
 * logic, so determinism is not required.
 */
export function generateRoomId(length = 8): string {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

/** Extract and validate a room ID from a URL, or null if absent/invalid. */
export function parseRoomId(url: string): string | null {
  try {
    const value = new URL(url).searchParams.get(ROOM_PARAM);
    return value && ID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Build a share link for a room, based on the given URL. */
export function buildShareLink(roomId: string, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}

// ---- Browser convenience wrappers ----

export function getRoomFromLocation(): string | null {
  return parseRoomId(window.location.href);
}

export function shareLinkForRoom(roomId: string): string {
  return buildShareLink(roomId, window.location.href);
}

/** Reflect (or clear) the room ID in the address bar without navigating. */
export function setRoomInLocation(roomId: string | null): void {
  const url = new URL(window.location.href);
  if (roomId) url.searchParams.set(ROOM_PARAM, roomId);
  else url.searchParams.delete(ROOM_PARAM);
  window.history.replaceState({}, '', url.toString());
}
