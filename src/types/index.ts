/** One participant already in the call room when this connection joined. */
export interface CallParticipantInfo {
  connectionId: string;
  participantId: string;
  name: string;
}

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

/** A remote participant as rendered locally - identity plus whatever media has arrived so far. */
export interface RemoteParticipant {
  connectionId: string;
  participantId: string;
  name: string;
  stream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  connectionQuality: ConnectionQuality;
  /** Set while this participant is sharing their screen - a second video track on the same
      peer connection as `stream`, not a separate call. */
  screenShareStream: MediaStream | null;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  urls: string[];
  ttl: number;
}

/** Call-scoped and ephemeral - see MeetingCallHub's SendChatMessage doc comment. `id` is
    client-generated (the server never assigns one, since it never persists a message). */
export interface ChatMessage {
  id: string;
  connectionId: string;
  participantId: string;
  name: string;
  text: string;
  sentAt: string;
  isLocal: boolean;
}
