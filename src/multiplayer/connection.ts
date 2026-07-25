// Thin PeerJS wrapper: host a room or join one, then send/receive typed
// protocol Messages over a single reliable data channel. UI code subscribes
// via handlers; it never touches PeerJS directly.

import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Message, Role } from './protocol';

export interface ConnectionHandlers {
  /** Peer registered with the signaling server (has an ID). */
  onReady?: (role: Role, id: string) => void;
  /** Data channel to the opponent is open. */
  onPeerConnected?: () => void;
  onMessage?: (msg: Message) => void;
  /** Opponent's data channel closed. */
  onDisconnected?: () => void;
  onError?: (err: Error) => void;
}

export class Connection {
  role: Role | null = null;

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: ConnectionHandlers = {};

  /** Host: register under `roomId` and wait for a guest to connect. */
  hostRoom(roomId: string, handlers: ConnectionHandlers): void {
    this.role = 'host';
    this.handlers = handlers;
    const peer = new Peer(roomId);
    this.peer = peer;

    peer.on('open', (id) => handlers.onReady?.('host', id));
    peer.on('connection', (conn) => {
      // Only one opponent per room; reject extras.
      if (this.conn) {
        conn.close();
        return;
      }
      this.conn = conn;
      this.wire(conn);
    });
    peer.on('error', (err) => handlers.onError?.(this.toError(err)));
  }

  /** Guest: register, then dial the host's `roomId`. */
  joinRoom(roomId: string, handlers: ConnectionHandlers): void {
    this.role = 'guest';
    this.handlers = handlers;
    const peer = new Peer();
    this.peer = peer;

    peer.on('open', (id) => {
      handlers.onReady?.('guest', id);
      const conn = peer.connect(roomId, { reliable: true });
      this.conn = conn;
      this.wire(conn);
    });
    peer.on('error', (err) => handlers.onError?.(this.toError(err)));
  }

  /** Replace the event handlers — used when handing the live connection
   *  from the lobby to a gameplay view. */
  setHandlers(handlers: ConnectionHandlers): void {
    this.handlers = handlers;
  }

  send(msg: Message): void {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  isConnected(): boolean {
    return this.conn !== null && this.conn.open;
  }

  close(): void {
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.conn = null;
    this.peer = null;
  }

  private wire(conn: DataConnection): void {
    conn.on('open', () => this.handlers.onPeerConnected?.());
    conn.on('data', (data) => this.handlers.onMessage?.(data as Message));
    conn.on('close', () => this.handlers.onDisconnected?.());
    conn.on('error', (err) => this.handlers.onError?.(this.toError(err)));
  }

  private toError(err: unknown): Error {
    if (err instanceof Error) return err;
    return new Error(String(err));
  }
}
