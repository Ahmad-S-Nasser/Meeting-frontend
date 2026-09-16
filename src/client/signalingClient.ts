import * as signalR from "@microsoft/signalr";
import type { CallParticipantInfo } from "../types";

export interface SignalingClientOptions {
  /** Base URL of the Coon.Meeting API, e.g. "https://meetings.example.com". */
  apiBaseUrl: string;
  /** The short-lived, meeting-scoped participant token minted by your own backend. */
  participantToken: string;
  /** Defaults to "/hubs/meetingCall" - only override this if you're proxying the hub elsewhere. */
  hubPath?: string;
}

type ExistingParticipantsHandler = (participants: CallParticipantInfo[]) => void;
type ParticipantJoinedHandler = (connectionId: string, participantId: string, name: string) => void;
type ParticipantLeftHandler = (connectionId: string) => void;
type OfferHandler = (fromConnectionId: string, sdp: string) => void;
type AnswerHandler = (fromConnectionId: string, sdp: string) => void;
type IceCandidateHandler = (fromConnectionId: string, candidate: string) => void;
type MediaStateChangedHandler = (connectionId: string, micOn: boolean, cameraOn: boolean) => void;
type AccessDeniedHandler = (payload: { reason: string }) => void;
type KickedHandler = (payload: { reason?: string | null }) => void;
type BlockedHandler = (payload: { reason?: string | null }) => void;

/**
 * A thin, typed wrapper around the one SignalR hub this SDK talks to - MeetingCallHub. Unlike
 * SquadSpace's own signalRService (which multiplexes half a dozen unrelated hubs behind one
 * class), there is only ever one hub here, so this stays a single connection with no
 * connect-if-needed bookkeeping for hubs that don't exist in this product.
 */
export class SignalingClient {
  private connection: signalR.HubConnection;

  constructor(options: SignalingClientOptions) {
    const hubPath = options.hubPath ?? "/hubs/meetingCall";

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${options.apiBaseUrl}${hubPath}`, {
        accessTokenFactory: () => options.participantToken,
        // This SDK is meant to be called cross-origin from an integrator's own frontend -
        // credentialed (cookie-based) requests don't make sense for a bearer-token API and
        // would need CORS wildcard origins to be locked down even further than they already are.
        withCredentials: false,
      })
      .withAutomaticReconnect()
      .build();
  }

  async connect(): Promise<void> {
    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      await this.connection.start();
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.stop();
  }

  isConnected(): boolean {
    return this.connection.state === signalR.HubConnectionState.Connected;
  }

  async joinCall(meetingId: string): Promise<void> {
    await this.connection.invoke("JoinCall", meetingId);
  }

  async leaveCall(meetingId: string): Promise<void> {
    try {
      await this.connection.invoke("LeaveCall", meetingId);
    } catch {
      // Best effort on the way out - the server also cleans up on disconnect.
    }
  }

  async sendOffer(meetingId: string, toConnectionId: string, sdp: string): Promise<void> {
    await this.connection.invoke("SendOffer", meetingId, toConnectionId, sdp);
  }

  async sendAnswer(meetingId: string, toConnectionId: string, sdp: string): Promise<void> {
    await this.connection.invoke("SendAnswer", meetingId, toConnectionId, sdp);
  }

  async sendIceCandidate(meetingId: string, toConnectionId: string, candidate: string): Promise<void> {
    await this.connection.invoke("SendIceCandidate", meetingId, toConnectionId, candidate);
  }

  async updateMediaState(meetingId: string, micOn: boolean, cameraOn: boolean): Promise<void> {
    try {
      await this.connection.invoke("UpdateMediaState", meetingId, micOn, cameraOn);
    } catch {
      // Liveness only - a missed broadcast just means a peer's mic icon is briefly stale.
    }
  }

  onExistingParticipants(handler: ExistingParticipantsHandler): () => void {
    this.connection.on("ExistingParticipants", handler);
    return () => this.connection.off("ExistingParticipants", handler);
  }

  onParticipantJoined(handler: ParticipantJoinedHandler): () => void {
    this.connection.on("ParticipantJoined", handler);
    return () => this.connection.off("ParticipantJoined", handler);
  }

  onParticipantLeft(handler: ParticipantLeftHandler): () => void {
    this.connection.on("ParticipantLeft", handler);
    return () => this.connection.off("ParticipantLeft", handler);
  }

  onOffer(handler: OfferHandler): () => void {
    this.connection.on("ReceiveOffer", handler);
    return () => this.connection.off("ReceiveOffer", handler);
  }

  onAnswer(handler: AnswerHandler): () => void {
    this.connection.on("ReceiveAnswer", handler);
    return () => this.connection.off("ReceiveAnswer", handler);
  }

  onIceCandidate(handler: IceCandidateHandler): () => void {
    this.connection.on("ReceiveIceCandidate", handler);
    return () => this.connection.off("ReceiveIceCandidate", handler);
  }

  onMediaStateChanged(handler: MediaStateChangedHandler): () => void {
    this.connection.on("MediaStateChanged", handler);
    return () => this.connection.off("MediaStateChanged", handler);
  }

  /** JoinCall re-checks access every time (not just at token-mint time), so a token minted
   * before a block/removal but presented after it lands here instead of silently joining. */
  onAccessDenied(handler: AccessDeniedHandler): () => void {
    this.connection.on("AccessDenied", handler);
    return () => this.connection.off("AccessDenied", handler);
  }

  /** Pushed by the organizer's kick action - disconnects now, but this participant CAN
   * rejoin (kick isn't persisted, unlike block). */
  onKicked(handler: KickedHandler): () => void {
    this.connection.on("Kicked", handler);
    return () => this.connection.off("Kicked", handler);
  }

  /** Pushed by the organizer's block action - disconnects now AND this participant can
   * never rejoin this meeting again. */
  onBlocked(handler: BlockedHandler): () => void {
    this.connection.on("Blocked", handler);
    return () => this.connection.off("Blocked", handler);
  }

  /** Fires after withAutomaticReconnect() re-establishes the connection - with a NEW
   * connectionId, since the server already dropped the old one and told the room this
   * participant left. The caller must rejoin the room, not just resume. */
  onReconnected(handler: (connectionId?: string) => void): void {
    this.connection.onreconnected(handler);
  }

  /** Fires once automatic reconnection gives up (or on a connection that never reconnects) -
   * not on a deliberate disconnect(), which also triggers this, so callers should ignore it
   * during their own intentional teardown. */
  onClose(handler: (error?: Error) => void): void {
    this.connection.onclose(handler);
  }
}
