/** One participant already in the call room when this connection joined. */
export interface CallParticipantInfo {
  connectionId: string;
  participantId: string;
  name: string;
}

/** A remote participant as rendered locally - identity plus whatever media has arrived so far. */
export interface RemoteParticipant {
  connectionId: string;
  participantId: string;
  name: string;
  stream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  urls: string[];
  ttl: number;
}
