import { WebSocket } from 'ws';
import { ParticipantInfo } from '../types';

export interface ManagedConnection {
  ws: WebSocket;
  info: ParticipantInfo;
}

class ConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  /** meetingId → Set<connectionId> */
  private meetingMembers = new Map<string, Set<string>>();

  generateId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  add(connectionId: string, ws: WebSocket, info: ParticipantInfo): void {
    // Enforce 2-person limit
    const existing = this.meetingMembers.get(info.meetingId);
    if (existing && existing.size >= 2) {
      throw new Error('Meeting is full (2 participants maximum)');
    }

    this.connections.set(connectionId, { ws, info });

    if (!this.meetingMembers.has(info.meetingId)) {
      this.meetingMembers.set(info.meetingId, new Set());
    }
    this.meetingMembers.get(info.meetingId)!.add(connectionId);

    console.log(
      `[ConnMgr] + ${info.attendeeName} (${connectionId}) → meeting ${info.meetingId}  ` +
        `[${this.meetingMembers.get(info.meetingId)!.size} in room]`,
    );
  }

  remove(connectionId: string): ParticipantInfo | null {
    const conn = this.connections.get(connectionId);
    if (!conn) return null;

    const { info } = conn;
    this.connections.delete(connectionId);

    const members = this.meetingMembers.get(info.meetingId);
    if (members) {
      members.delete(connectionId);
      if (members.size === 0) this.meetingMembers.delete(info.meetingId);
    }

    console.log(
      `[ConnMgr] - ${info.attendeeName} (${connectionId}) ← meeting ${info.meetingId}`,
    );
    return info;
  }

  get(connectionId: string): ManagedConnection | undefined {
    return this.connections.get(connectionId);
  }

  /** Return the OTHER open connection in a 2-person meeting. */
  getPartner(meetingId: string, myConnectionId: string): ManagedConnection | null {
    const members = this.meetingMembers.get(meetingId);
    if (!members) return null;
    for (const id of members) {
      if (id === myConnectionId) continue;
      const conn = this.connections.get(id);
      if (conn && conn.ws.readyState === WebSocket.OPEN) return conn;
    }
    return null;
  }

  /** Return all open connections in a meeting. */
  getMeetingParticipants(meetingId: string): ManagedConnection[] {
    const members = this.meetingMembers.get(meetingId);
    if (!members) return [];

    const out: ManagedConnection[] = [];
    for (const id of members) {
      const conn = this.connections.get(id);
      if (conn && conn.ws.readyState === WebSocket.OPEN) out.push(conn);
    }
    return out;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

export const connectionManager = new ConnectionManager();
