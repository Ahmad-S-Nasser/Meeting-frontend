import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingClient } from "../client/signalingClient";
import type { RemoteParticipant, TurnCredentials } from "../types";

export interface UseMeetingCallOptions {
  /** Base URL of the Coon.Meeting API, e.g. "https://meetings.example.com". */
  apiBaseUrl: string;
  meetingId: string;
  /** The short-lived, meeting-scoped participant token your backend minted for this participant. */
  participantToken: string;
  /** Shown to other participants as this connection's display name. */
  participantName: string;
  /** Defaults to "/hubs/meetingCall". */
  hubPath?: string;
}

interface PeerState {
  connection: RTCPeerConnection;
  remoteDescriptionSet: boolean;
  pendingCandidates: string[];
}

/**
 * Owns the WebRTC mesh for one meeting call: local media, one RTCPeerConnection per remote
 * participant, and the signaling wiring over MeetingCallHub.
 *
 * Protocol convention (must match MeetingCallHub.cs): a newly-joining peer always initiates the
 * offer to each existing participant, never the reverse - this avoids a double-offer glare
 * condition between two peers negotiating at once, with no tie-breaker needed.
 */
export function useMeetingCall(options: UseMeetingCallOptions) {
  const { apiBaseUrl, meetingId, participantToken, participantName, hubPath } = options;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);

  const clientRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const remoteInfoRef = useRef<Map<string, { participantId: string; name: string }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const cleanedUpRef = useRef(false);

  const upsertParticipant = useCallback((connectionId: string, patch: Partial<RemoteParticipant>) => {
    setRemoteParticipants(prev => {
      const idx = prev.findIndex(p => p.connectionId === connectionId);
      if (idx === -1) {
        const info = remoteInfoRef.current.get(connectionId);
        return [...prev, {
          connectionId,
          participantId: info?.participantId ?? "",
          name: info?.name ?? "Participant",
          stream: null,
          micOn: true,
          cameraOn: true,
          ...patch,
        }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const closePeer = useCallback((connectionId: string) => {
    const peer = peersRef.current.get(connectionId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(connectionId);
    }
    remoteInfoRef.current.delete(connectionId);
    setRemoteParticipants(prev => prev.filter(p => p.connectionId !== connectionId));
  }, []);

  const getOrCreatePeer = useCallback((connectionId: string): PeerState => {
    const existing = peersRef.current.get(connectionId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const state: PeerState = { connection, remoteDescriptionSet: false, pendingCandidates: [] };
    peersRef.current.set(connectionId, state);

    localStreamRef.current?.getTracks().forEach(track => {
      connection.addTrack(track, localStreamRef.current!);
    });

    connection.onicecandidate = (e) => {
      if (e.candidate) {
        clientRef.current?.sendIceCandidate(meetingId, connectionId, JSON.stringify(e.candidate));
      }
    };

    connection.ontrack = (e) => {
      const [stream] = e.streams;
      upsertParticipant(connectionId, { stream });
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        closePeer(connectionId);
      }
    };

    return state;
  }, [meetingId, upsertParticipant, closePeer]);

  const applyRemoteDescription = useCallback(async (connectionId: string, description: RTCSessionDescriptionInit) => {
    const peer = getOrCreatePeer(connectionId);
    await peer.connection.setRemoteDescription(description);
    peer.remoteDescriptionSet = true;

    for (const candidate of peer.pendingCandidates) {
      try {
        await peer.connection.addIceCandidate(JSON.parse(candidate));
      } catch { /* a stale/invalid buffered candidate should not break the call */ }
    }
    peer.pendingCandidates = [];
  }, [getOrCreatePeer]);

  useEffect(() => {
    cleanedUpRef.current = false;

    const unsubscribers: (() => void)[] = [];
    const client = new SignalingClient({ apiBaseUrl, participantToken, hubPath });
    clientRef.current = client;

    const setup = async () => {
      // Camera/mic permission denial degrades to view-only rather than failing the whole call -
      // a peer connection with no local tracks still receives everyone else's video.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cleanedUpRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        const name = (err as DOMException)?.name;
        setMediaError(
          name === "NotAllowedError"
            ? "Camera/microphone access was denied. You can still see and hear others."
            : "No camera or microphone was found. You can still see and hear others."
        );
      }

      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/meetings/${meetingId}/call-credentials`, {
          headers: { Authorization: `Bearer ${participantToken}` },
        });
        if (res.ok) {
          const creds: TurnCredentials = await res.json();
          iceServersRef.current = [
            { urls: "stun:stun.l.google.com:19302" },
            ...(creds.urls.length > 0
              ? [{ urls: creds.urls, username: creds.username, credential: creds.credential }]
              : []),
          ];
        }
      } catch {
        // No TURN configured yet (or the request failed) - fall back to STUN-only. Calls
        // between peers that can reach each other directly still work; calls across a
        // restrictive NAT may not until TURN is set up server-side.
      }

      if (cleanedUpRef.current) return;

      try {
        await client.connect();
      } catch {
        // handled by the isConnected() check below
      }

      if (cleanedUpRef.current) return;

      if (!client.isConnected()) {
        setConnectionError("Couldn't connect to the call server. Check your connection and try again.");
        setJoining(false);
        return;
      }

      unsubscribers.push(client.onExistingParticipants(async (participants) => {
        for (const p of participants) {
          remoteInfoRef.current.set(p.connectionId, { participantId: p.participantId, name: p.name });
          upsertParticipant(p.connectionId, { participantId: p.participantId, name: p.name });

          const peer = getOrCreatePeer(p.connectionId);
          const offer = await peer.connection.createOffer();
          await peer.connection.setLocalDescription(offer);
          await client.sendOffer(meetingId, p.connectionId, JSON.stringify(offer));
        }
        setJoining(false);
      }));

      unsubscribers.push(client.onParticipantJoined((connectionId, participantId, name) => {
        remoteInfoRef.current.set(connectionId, { participantId, name });
        upsertParticipant(connectionId, { participantId, name });
        // The joiner initiates the offer to us - nothing to do here but track identity ahead
        // of ReceiveOffer, so the tile shows a name before video arrives.
      }));

      unsubscribers.push(client.onParticipantLeft((connectionId) => {
        closePeer(connectionId);
      }));

      unsubscribers.push(client.onOffer(async (fromConnectionId, sdp) => {
        await applyRemoteDescription(fromConnectionId, JSON.parse(sdp));
        const peer = peersRef.current.get(fromConnectionId);
        if (!peer) return;
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        await client.sendAnswer(meetingId, fromConnectionId, JSON.stringify(answer));
      }));

      unsubscribers.push(client.onAnswer(async (fromConnectionId, sdp) => {
        await applyRemoteDescription(fromConnectionId, JSON.parse(sdp));
      }));

      unsubscribers.push(client.onIceCandidate(async (fromConnectionId, candidate) => {
        const peer = peersRef.current.get(fromConnectionId);
        if (!peer) return;
        if (peer.remoteDescriptionSet) {
          try { await peer.connection.addIceCandidate(JSON.parse(candidate)); } catch { /* ignore */ }
        } else {
          peer.pendingCandidates.push(candidate);
        }
      }));

      unsubscribers.push(client.onMediaStateChanged((connectionId, remoteMicOn, remoteCameraOn) => {
        upsertParticipant(connectionId, { micOn: remoteMicOn, cameraOn: remoteCameraOn });
      }));

      // withAutomaticReconnect() gets the transport back, but the server already dropped this
      // connection from the room and told everyone else this participant left the moment the
      // old connection died (Hub.OnDisconnectedAsync) - resuming isn't enough, this has to
      // rejoin as if new. Our own peer connections to others are now one-sided (they already
      // closed theirs) and will fail ICE eventually on their own, but there's no reason to wait
      // for that - tear them down now and let a fresh JoinCall rebuild everything.
      client.onReconnected(() => {
        if (cleanedUpRef.current) return;

        peersRef.current.forEach(peer => peer.connection.close());
        peersRef.current.clear();
        remoteInfoRef.current.clear();
        setRemoteParticipants([]);
        setJoining(true);

        client.joinCall(meetingId).catch(() => {
          setConnectionError("Reconnected, but couldn't rejoin the call. Please refresh.");
        });
      });

      // Fires once automatic reconnection gives up, or on any connection that never recovers -
      // NOT on our own deliberate leave()/unmount, which sets cleanedUpRef first.
      client.onClose(() => {
        if (cleanedUpRef.current) return;
        setConnectionError("Lost connection to the call server.");
      });

      await client.joinCall(meetingId);
      // If there turn out to be no existing participants, ExistingParticipants still fires
      // (with an empty list), which is what clears `joining` above.
    };

    setup();

    return () => {
      cleanedUpRef.current = true;
      unsubscribers.forEach(unsub => unsub());
      client.leaveCall(meetingId);
      client.disconnect();
      peersRef.current.forEach(peer => peer.connection.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    };
    // apiBaseUrl/hubPath/participantToken are expected to stay stable for the lifetime of one
    // call - the token is minted per-join and isn't refreshed mid-call in this version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, apiBaseUrl, participantToken, hubPath]);

  const toggleMic = useCallback(() => {
    setMicOn(prev => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
      clientRef.current?.updateMediaState(meetingId, next, cameraOn);
      return next;
    });
  }, [meetingId, cameraOn]);

  const toggleCamera = useCallback(() => {
    setCameraOn(prev => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = next; });
      clientRef.current?.updateMediaState(meetingId, micOn, next);
      return next;
    });
  }, [meetingId, micOn]);

  const leave = useCallback(() => {
    cleanedUpRef.current = true;
    clientRef.current?.leaveCall(meetingId);
    clientRef.current?.disconnect();
    peersRef.current.forEach(peer => peer.connection.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteParticipants([]);
  }, [meetingId]);

  return {
    localStream,
    localParticipantName: participantName,
    remoteParticipants,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    connectionError,
    mediaError,
    joining,
  };
}
