import { describe, it, expect } from 'vitest';
import {
  generateRoomId,
  parseRoomId,
  buildShareLink,
  ROOM_PARAM,
} from '../src/multiplayer/room';

describe('generateRoomId', () => {
  it('produces an id of the requested length using the id charset', () => {
    const id = generateRoomId(8);
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('is round-trippable through a share link', () => {
    const id = generateRoomId();
    const link = buildShareLink(id, 'https://example.com/game/');
    expect(parseRoomId(link)).toBe(id);
  });
});

describe('parseRoomId', () => {
  it('extracts a valid room id', () => {
    expect(parseRoomId('https://example.com/?room=abc123')).toBe('abc123');
  });

  it('returns null when the param is absent', () => {
    expect(parseRoomId('https://example.com/')).toBeNull();
  });

  it('rejects invalid room ids', () => {
    expect(parseRoomId('https://example.com/?room=has spaces')).toBeNull();
    expect(parseRoomId('https://example.com/?room=' + 'x'.repeat(40))).toBeNull();
  });

  it('returns null for a malformed url', () => {
    expect(parseRoomId('not-a-url')).toBeNull();
  });
});

describe('buildShareLink', () => {
  it('adds the room param onto the base url', () => {
    const link = buildShareLink('room42', 'https://example.com/game/');
    const url = new URL(link);
    expect(url.searchParams.get(ROOM_PARAM)).toBe('room42');
  });

  it('overwrites an existing room param', () => {
    const link = buildShareLink('newroom', 'https://example.com/?room=oldroom');
    expect(parseRoomId(link)).toBe('newroom');
  });
});
