import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingClient } from "../client/signalingClient";
import type { ChatMessage, ConnectionQuality, RemoteParticipant, TurnCredentials } from "../types";

export interface RecordingMeta {
  startedAt: Date;
  endedAt: Date;
  mimeType: string;
  includesVideo: boolean;
}

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
  /** Required, not optional - deliberately, so it's impossible to wire up recording without
      also deciding where the finished file goes. Coon.Meeting never stores or transcribes a
      recording itself (see docs/INTEGRATION.md); your app must persist this Blob to real,
      durable storage. Recording is entirely client-side - this only ever captures what the
      recording participant's own browser can see/hear, for as long as their tab stays open. */
  onRecordingAvailable: (blob: Blob, meta: RecordingMeta) => void;
}

interface PeerState {
  connection: RTCPeerConnection;
  remoteDescriptionSet: boolean;
  pendingCandidates: string[];
  /** False until this peer's initial offer/answer handshake completes - guards
      onnegotiationneeded so it can't race the manually-driven initial offer/answer below and
      send a duplicate first offer. */
  negotiationAllowed: boolean;
  /** The MediaStream.id already known to be this peer's camera+mic stream - any OTHER stream
      id arriving via ontrack afterward is their screen share, not a second camera. */
  cameraStreamId: string | null;
}

export interface KickedState {
  type: "kicked" | "blocked" | "access_denied";
  reason?: string;
}

/** RTT/loss thresholds are deliberately simple - this is a coarse "is this call struggling"
    signal for a UI indicator, not a diagnostic tool. */
function bucketConnectionQuality(rttMs: number | undefined, lossRatio: number): ConnectionQuality {
  if (rttMs == null) return "unknown";
  if (rttMs < 150 && lossRatio < 0.02) return "good";
  if (rttMs < 300 && lossRatio < 0.05) return "fair";
  return "poor";
}

/** Preference order, best first. MP4 leads because it plays in ordinary desktop players (Windows
    Media Player, QuickTime) and transcription tools and is seekable; a MediaRecorder WebM has no
    duration/seek index, so many players show it as unseekable or refuse it. WebM stays as the
    fallback for browsers that can't record MP4. */
function recorderMimeCandidates(includeVideo: boolean): string[] {
  if (typeof MediaRecorder === "undefined") return [];
  const candidates = includeVideo
    ? [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
    : ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.filter((type) => MediaRecorder.isTypeSupported?.(type));
}

/** isTypeSupported can say yes and the constructor/encoder still fail on a given machine (no
    H.264 encoder, say), so try each supported type in turn before giving up to MediaRecorder's own
    default. */
function createRecorder(stream: MediaStream, includeVideo: boolean): MediaRecorder {
  for (const mimeType of recorderMimeCandidates(includeVideo)) {
    try {
      return new MediaRecorder(stream, { mimeType });
    } catch {
      // Try the next candidate.
    }
  }
  return new MediaRecorder(stream);
}

/** Draws `el` into the box, scaled to fill it ("cover", cropping the overflow - right for a
    camera) or to fit inside it ("contain", letterboxed - right for a screen share, where
    cropping would cut off content). */
function drawVideoInBox(
  ctx: CanvasRenderingContext2D, el: HTMLVideoElement,
  x: number, y: number, w: number, h: number, fit: "cover" | "contain",
) {
  const vw = el.videoWidth;
  const vh = el.videoHeight;
  if (!vw || !vh) return;
  const scale = fit === "cover" ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Name tag and, for a tile with no live video, an initial-in-a-circle so the recording shows
    who is speaking even when their camera is off (a disabled track otherwise records as black). */
function drawTileChrome(
  ctx: CanvasRenderingContext2D, name: string, showAvatar: boolean,
  x: number, y: number, w: number, h: number,
) {
  if (showAvatar) {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(x, y, w, h);
    const r = Math.min(w, h) * 0.18;
    ctx.fillStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(r)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.charAt(0).toUpperCase() || "?", x + w / 2, y + h / 2);
  }
  const fontPx = Math.max(12, Math.round(h * 0.06));
  ctx.font = `${fontPx}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const label = name.length > 28 ? `${name.slice(0, 27)}…` : name;
  const pad = fontPx * 0.5;
  const tagW = ctx.measureText(label).width + pad * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x + 8, y + h - fontPx - pad * 2 - 8, tagW, fontPx + pad * 2);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 8 + pad, y + h - 8 - pad - fontPx / 2);
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
  const { apiBaseUrl, meetingId, participantToken, participantName, hubPath, onRecordingAvailable } = options;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);
  const [kicked, setKicked] = useState<KickedState | null>(null);
  const [availableDevices, setAvailableDevices] = useState<{ cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] }>({ cameras: [], microphones: [] });
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>(undefined);
  const [localConnectionQuality, setLocalConnectionQuality] = useState<ConnectionQuality>("unknown");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenShareStream, setLocalScreenShareStream] = useState<MediaStream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  // "local" sentinel for a recording this side started, same convention as ChatMessage.connectionId
  // - otherwise the connectionId of whichever remote participant is recording.
  const [recordingParticipantId, setRecordingParticipantId] = useState<string | null>(null);

  const clientRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const remoteInfoRef = useRef<Map<string, { participantId: string; name: string }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const cleanedUpRef = useRef(false);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The source of truth for "am I sharing right now" - a ref, not state, so it can be read
  // synchronously inside long-lived event handlers (onParticipantJoined) set up once at mount
  // without falling into React's stale-closure trap.
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Recording internals - all populated only between startRecording() and stopRecording().
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<Date | null>(null);
  const recordingIncludesVideoRef = useRef(false);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  // Keyed like remoteInfoRef - "local" for this side's own mic, else connectionId - so a
  // participant joining or leaving mid-recording can be added/removed from the mix live.
  const recordingAudioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  // Offscreen <video> elements this hook owns and feeds itself, independent of whatever
  // CallTile happens to be rendering - the canvas compositor below draws from these directly.
  const recordingVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingDrawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // "Latest remoteParticipants" mirror, readable from the draw-interval closure below without
  // the stale-closure trap a plain captured `remoteParticipants` would have inside a long-lived
  // setInterval created once at startRecording() time.
  const latestRemoteParticipantsRef = useRef<RemoteParticipant[]>([]);
  const onRecordingAvailableRef = useRef(onRecordingAvailable);
  const recordingParticipantIdRef = useRef<string | null>(null);
  // teardownPeersAndMedia (leave/kicked/blocked) is defined before stopRecording exists, and
  // needs to call whatever the latest one is without going stale across renders - same "ref
  // mirroring a useCallback" pattern as onRecordingAvailableRef above.
  const stopRecordingRef = useRef<() => void>(() => {});

  useEffect(() => {
    latestRemoteParticipantsRef.current = remoteParticipants;
  }, [remoteParticipants]);

  useEffect(() => {
    recordingParticipantIdRef.current = recordingParticipantId;
  }, [recordingParticipantId]);

  useEffect(() => {
    onRecordingAvailableRef.current = onRecordingAvailable;
  }, [onRecordingAvailable]);

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
          connectionQuality: "unknown" as ConnectionQuality,
          screenShareStream: null,
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

  // Shared by leave() and the kicked/blocked/access-denied handlers below - every one of
  // them needs to close every peer and release local media, they just differ in whether
  // they also tell the server (leaveCall) or set a takeover UI state afterward.
  const teardownPeersAndMedia = useCallback(() => {
    // Finalize and deliver whatever was captured so far rather than silently discarding it -
    // letting the MediaRecorder object just get garbage-collected would never fire its own
    // onstop/final ondataavailable flush.
    stopRecordingRef.current();
    peersRef.current.forEach(peer => peer.connection.close());
    peersRef.current.clear();
    remoteInfoRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setLocalStream(null);
    setLocalScreenShareStream(null);
    setIsScreenSharing(false);
    setRemoteParticipants([]);
  }, []);

  const getOrCreatePeer = useCallback((connectionId: string): PeerState => {
    const existing = peersRef.current.get(connectionId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const state: PeerState = {
      connection, remoteDescriptionSet: false, pendingCandidates: [],
      negotiationAllowed: false, cameraStreamId: null,
    };
    peersRef.current.set(connectionId, state);

    localStreamRef.current?.getTracks().forEach(track => {
      connection.addTrack(track, localStreamRef.current!);
    });
    // A peer created (or re-created after a reconnect) while a screen share is already active
    // must include it from the start, same as the camera/mic tracks above - this is what makes
    // reconnect-while-sharing and a late joiner's own connection both "just work" with no
    // special-casing beyond the ParticipantJoined re-broadcast below.
    if (screenStreamRef.current) {
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      if (screenTrack) connection.addTrack(screenTrack, screenStreamRef.current);
    }

    connection.onicecandidate = (e) => {
      if (e.candidate) {
        clientRef.current?.sendIceCandidate(meetingId, connectionId, JSON.stringify(e.candidate));
      }
    };

    connection.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      // The first distinct MediaStream id seen for this peer is their camera+mic stream -
      // WebRTC preserves the sender's stream identity across the wire, so a screen share
      // (added via a separate addTrack(track, screenStream) call on their side) always
      // arrives as a genuinely different stream id, never merged into the first one.
      if (!state.cameraStreamId) {
        state.cameraStreamId = stream.id;
        upsertParticipant(connectionId, { stream });
      } else if (stream.id === state.cameraStreamId) {
        upsertParticipant(connectionId, { stream });
      } else {
        upsertParticipant(connectionId, { screenShareStream: stream });
      }
    };

    connection.onnegotiationneeded = async () => {
      if (!state.negotiationAllowed) return;
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await clientRef.current?.sendOffer(meetingId, connectionId, JSON.stringify(offer));
      } catch {
        // Best-effort - a failed renegotiation attempt (e.g. mid-teardown) isn't fatal, and
        // the platform fires negotiationneeded again if tracks are still out of sync.
      }
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        closePeer(connectionId);
      }
    };

    return state;
  }, [meetingId, upsertParticipant, closePeer]);

  // Keeps the recording's audio mix in sync with who's actually in the call - a participant
  // joining mid-recording gets added, one leaving gets its now-dead source disconnected.
  useEffect(() => {
    if (!isRecording) return;
    const audioContext = recordingAudioContextRef.current;
    const dest = recordingDestRef.current;
    if (!audioContext || !dest) return;
    const sources = recordingAudioSourcesRef.current;

    const activeKeys = new Set<string>(["local"]);
    remoteParticipants.forEach((p) => activeKeys.add(p.connectionId));

    sources.forEach((source, key) => {
      if (!activeKeys.has(key)) {
        source.disconnect();
        sources.delete(key);
      }
    });

    if (!sources.has("local") && localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(localStreamRef.current);
      source.connect(dest);
      sources.set("local", source);
    }
    remoteParticipants.forEach((p) => {
      if (!sources.has(p.connectionId) && p.stream && p.stream.getAudioTracks().length > 0) {
        const source = audioContext.createMediaStreamSource(p.stream);
        source.connect(dest);
        sources.set(p.connectionId, source);
      }
    });
  }, [isRecording, remoteParticipants]);

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

        // Device labels only populate once permission has been granted - this must run after
        // the getUserMedia call above succeeds, not before.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setAvailableDevices({
            cameras: devices.filter((d) => d.kind === "videoinput"),
            microphones: devices.filter((d) => d.kind === "audioinput"),
          });
          setSelectedCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId);
          setSelectedMicId(stream.getAudioTracks()[0]?.getSettings().deviceId);
        } catch {
          // enumerateDevices failing shouldn't break the call - the device picker just stays empty.
        }
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

      // Polls every peer connection's stats and buckets each into good/fair/poor so CallTile
      // can show a live connection-quality indicator - purely local, never sent over the wire.
      statsIntervalRef.current = setInterval(async () => {
        let worstLocal: ConnectionQuality = "good";
        let anyPeers = false;
        for (const [connectionId, peer] of peersRef.current.entries()) {
          anyPeers = true;
          try {
            const stats = await peer.connection.getStats();
            let rttMs: number | undefined;
            let packetsLost = 0;
            let packetsReceived = 0;
            stats.forEach((report) => {
              if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) {
                rttMs = report.currentRoundTripTime * 1000;
              }
              if (report.type === "inbound-rtp" && !report.isRemote) {
                packetsLost += report.packetsLost ?? 0;
                packetsReceived += report.packetsReceived ?? 0;
              }
            });
            const total = packetsLost + packetsReceived;
            const lossRatio = total > 0 ? packetsLost / total : 0;
            const quality = bucketConnectionQuality(rttMs, lossRatio);
            upsertParticipant(connectionId, { connectionQuality: quality });
            if (quality === "poor") worstLocal = "poor";
            else if (quality === "fair" && worstLocal !== "poor") worstLocal = "fair";
          } catch {
            // getStats can throw on a connection that's mid-teardown - just skip this tick for it.
          }
        }
        setLocalConnectionQuality(anyPeers ? worstLocal : "unknown");
      }, 3000);

      unsubscribers.push(client.onExistingParticipants(async (participants) => {
        for (const p of participants) {
          remoteInfoRef.current.set(p.connectionId, { participantId: p.participantId, name: p.name });
          upsertParticipant(p.connectionId, { participantId: p.participantId, name: p.name });

          const peer = getOrCreatePeer(p.connectionId);
          const offer = await peer.connection.createOffer();
          await peer.connection.setLocalDescription(offer);
          await client.sendOffer(meetingId, p.connectionId, JSON.stringify(offer));
          peer.negotiationAllowed = true;
        }
        setJoining(false);
      }));

      unsubscribers.push(client.onParticipantJoined((connectionId, participantId, name) => {
        remoteInfoRef.current.set(connectionId, { participantId, name });
        upsertParticipant(connectionId, { participantId, name });
        // The joiner initiates the offer to us - nothing to do here but track identity ahead
        // of ReceiveOffer, so the tile shows a name before video arrives.

        // ExistingParticipants (sent to the joiner, not us) carries no screen-share flag, so a
        // participant joining mid-share won't know until the next broadcast - this re-fires one
        // for them specifically. screenStreamRef is read directly (not React state) since this
        // handler is set up once at mount and would otherwise see a stale value.
        if (screenStreamRef.current) {
          client.updateScreenShareState(meetingId, true);
        }
      }));

      unsubscribers.push(client.onParticipantLeft((connectionId) => {
        closePeer(connectionId);
        // No RecordingStateChanged(false) ever arrives if the recorder's tab crashed or lost
        // its connection rather than clicking Stop - clear the stuck indicator ourselves rather
        // than leaving every other participant thinking a recording is still running forever.
        if (recordingParticipantIdRef.current === connectionId) {
          setIsRecording(false);
          setRecordingParticipantId(null);
        }
      }));

      unsubscribers.push(client.onOffer(async (fromConnectionId, sdp) => {
        await applyRemoteDescription(fromConnectionId, JSON.parse(sdp));
        const peer = peersRef.current.get(fromConnectionId);
        if (!peer) return;
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        await client.sendAnswer(meetingId, fromConnectionId, JSON.stringify(answer));
        peer.negotiationAllowed = true;
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

      // isSharing=true needs no action here - screenShareStream itself is populated by ontrack
      // once the renegotiated track actually arrives. isSharing=false is the reliable signal to
      // clear it, since there's no equivalent "track removed" event wired up on the stream.
      unsubscribers.push(client.onScreenShareStateChanged((connectionId, isSharing) => {
        if (!isSharing) upsertParticipant(connectionId, { screenShareStream: null });
      }));

      // The hub's Clients.OthersInGroup broadcast never echoes back to the sender - the
      // sender's own copy of a message it sends is added locally in sendChatMessage below, not
      // here, so this only ever handles messages from everyone else.
      // A remote broadcast, never our own (startRecording/stopRecording set local state
      // directly) - this is what makes the indicator visible to every OTHER participant too,
      // which is the actual consent notice, not just a nicety for the recorder's own screen.
      unsubscribers.push(client.onRecordingStateChanged((connectionId, isRecordingNow) => {
        setIsRecording(isRecordingNow);
        setRecordingParticipantId(isRecordingNow ? connectionId : null);
      }));

      unsubscribers.push(client.onChatMessage((fromConnectionId, participantId, name, text, sentAt) => {
        setChatMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          connectionId: fromConnectionId,
          participantId,
          name,
          text,
          sentAt,
          isLocal: false,
        }]);
      }));

      // AccessDenied/Kicked/Blocked all end the call the same way from this side - close
      // every peer, release local media, disconnect - and differ only in which takeover
      // message the host app should show. cleanedUpRef is set first so the disconnect()
      // below doesn't also trigger the generic onClose->connectionError path.
      unsubscribers.push(client.onAccessDenied(({ reason }) => {
        cleanedUpRef.current = true;
        teardownPeersAndMedia();
        client.disconnect();
        setKicked({ type: "access_denied", reason });
      }));

      unsubscribers.push(client.onKicked(({ reason }) => {
        cleanedUpRef.current = true;
        teardownPeersAndMedia();
        client.disconnect();
        setKicked({ type: "kicked", reason: reason ?? undefined });
      }));

      unsubscribers.push(client.onBlocked(({ reason }) => {
        cleanedUpRef.current = true;
        teardownPeersAndMedia();
        client.disconnect();
        setKicked({ type: "blocked", reason: reason ?? undefined });
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

        client.joinCall(meetingId)
          .then(() => {
            // getOrCreatePeer already re-adds the screen track to each freshly-rebuilt peer
            // above - this just re-announces it, since the new room has no memory of the old
            // connection's sharing state.
            if (screenStreamRef.current) client.updateScreenShareState(meetingId, true);
          })
          .catch(() => {
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

    const handleDeviceChange = () => {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          setAvailableDevices({
            cameras: devices.filter((d) => d.kind === "videoinput"),
            microphones: devices.filter((d) => d.kind === "audioinput"),
          });
        })
        .catch(() => { /* ignore - device list just stays stale until the next change event */ });
    };
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    setup();

    return () => {
      cleanedUpRef.current = true;
      stopRecordingRef.current();
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      unsubscribers.forEach(unsub => unsub());
      client.leaveCall(meetingId);
      client.disconnect();
      peersRef.current.forEach(peer => peer.connection.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
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
    teardownPeersAndMedia();
  }, [meetingId, teardownPeersAndMedia]);

  // Swaps the outgoing track on every existing peer via replaceTrack - no renegotiation, no new
  // offer/answer round trip, unlike adding a brand-new track (see screen share). The same
  // MediaStream object stays assigned to <video ref>.srcObject in CallTile, so mutating its
  // tracks in place is enough for the new video to appear with no re-render required.
  const switchCamera = useCallback(async (deviceId: string) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      peersRef.current.forEach((peer) => {
        peer.connection.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(newTrack);
      });

      newTrack.enabled = cameraOn;
      if (localStreamRef.current) {
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(newTrack);
      }
      setSelectedCameraId(deviceId);
    } catch {
      // The chosen device may have disappeared mid-call - keep the existing track running
      // rather than leaving the call with no video at all.
    }
  }, [cameraOn]);

  const switchMicrophone = useCallback(async (deviceId: string) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;

      const oldTrack = localStreamRef.current?.getAudioTracks()[0];
      peersRef.current.forEach((peer) => {
        peer.connection.getSenders().find((s) => s.track?.kind === "audio")?.replaceTrack(newTrack);
      });

      newTrack.enabled = micOn;
      if (localStreamRef.current) {
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(newTrack);
      }
      setSelectedMicId(deviceId);
    } catch {
      // Same reasoning as switchCamera - a disappeared device shouldn't drop the call's audio.
    }
  }, [micOn]);

  // Renegotiates every existing peer to drop the screen track - removeTrack() is enough to
  // trigger onnegotiationneeded on each, same path as adding it in startScreenShare below.
  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      peersRef.current.forEach((peer) => {
        const sender = peer.connection.getSenders().find((s) => s.track === track);
        if (sender) peer.connection.removeTrack(sender);
      });
      track.stop();
    }
    screenStreamRef.current = null;
    setLocalScreenShareStream(null);
    setIsScreenSharing(false);
    clientRef.current?.updateScreenShareState(meetingId, false);
  }, [meetingId]);

  const startScreenShare = useCallback(async () => {
    if (screenStreamRef.current) return; // already sharing
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) return;

      screenStreamRef.current = stream;
      peersRef.current.forEach((peer) => {
        peer.connection.addTrack(track, stream);
      });
      // The browser's own "Stop sharing" bar ends the track directly - this is the only way
      // to hear about that and tear things down the same way our own Stop button would.
      track.onended = () => stopScreenShare();

      setLocalScreenShareStream(stream);
      setIsScreenSharing(true);
      clientRef.current?.updateScreenShareState(meetingId, true);
    } catch {
      // The picker was cancelled, or getDisplayMedia isn't available/permitted - no-op.
    }
  }, [meetingId, stopScreenShare]);

  const sendChatMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const sentAt = new Date().toISOString();
    // Echoed locally right away, since the hub never sends a broadcast back to its own caller -
    // this is the only place the sender's own copy of the message comes from.
    setChatMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      connectionId: "local",
      participantId: "",
      name: participantName,
      text,
      sentAt,
      isLocal: true,
    }]);
    clientRef.current?.sendChatMessage(meetingId, text).catch(() => {
      // Best-effort, same as the other broadcasts here - a dropped message just never reaches
      // the recipients this time; there's no delivery receipt to react to either way.
    });
  }, [meetingId, participantName]);

  // Tears down every piece of recording state - shared by a normal stopRecording() call and
  // MediaRecorder's own onstop handler, since both need to end up in the same clean state.
  const cleanupRecordingResources = useCallback(() => {
    recordingAudioSourcesRef.current.forEach((source) => source.disconnect());
    recordingAudioSourcesRef.current.clear();
    recordingDestRef.current = null;
    recordingAudioContextRef.current?.close().catch(() => { /* already closed - fine */ });
    recordingAudioContextRef.current = null;
    if (recordingDrawIntervalRef.current) clearInterval(recordingDrawIntervalRef.current);
    recordingDrawIntervalRef.current = null;
    recordingVideoElsRef.current.forEach((el) => { el.srcObject = null; el.remove(); });
    recordingVideoElsRef.current.clear();
    recordingCanvasRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const startedAt = recordingStartedAtRef.current ?? new Date();
    const includesVideo = recordingIncludesVideoRef.current;

    recorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || (includesVideo ? "video/webm" : "audio/webm") });
      cleanupRecordingResources();
      onRecordingAvailableRef.current(blob, { startedAt, endedAt: new Date(), mimeType: blob.type, includesVideo });
    };
    recorder.stop();

    setIsRecording(false);
    setRecordingParticipantId(null);
    clientRef.current?.updateRecordingState(meetingId, false);
  }, [meetingId, cleanupRecordingResources]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const startRecording = useCallback((recordingOptions?: { includeVideo?: boolean }) => {
    if (mediaRecorderRef.current) return; // already recording
    // Video by default - it used to default to audio-only, which is why recordings had sound but
    // no picture. Pass { includeVideo: false } explicitly for a smaller audio-only file.
    const includeVideo = recordingOptions?.includeVideo ?? true;

    const audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    recordingAudioContextRef.current = audioContext;
    recordingDestRef.current = dest;
    recordingAudioSourcesRef.current = new Map();

    if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(localStreamRef.current);
      source.connect(dest);
      recordingAudioSourcesRef.current.set("local", source);
    }
    latestRemoteParticipantsRef.current.forEach((p) => {
      if (p.stream && p.stream.getAudioTracks().length > 0) {
        const source = audioContext.createMediaStreamSource(p.stream);
        source.connect(dest);
        recordingAudioSourcesRef.current.set(p.connectionId, source);
      }
    });

    const recordedTracks: MediaStreamTrack[] = [...dest.stream.getAudioTracks()];

    if (includeVideo) {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      recordingCanvasRef.current = canvas;

      // Offscreen <video> elements this hook owns, one per stream being composited. Attached to
      // the page (invisible) and explicitly play()ed - relying on autoplay of a detached element
      // is exactly the kind of thing that works in one browser and silently stays black in another.
      const getOrCreateVideoEl = (key: string, stream: MediaStream): HTMLVideoElement => {
        let el = recordingVideoElsRef.current.get(key);
        if (!el) {
          el = document.createElement("video");
          el.muted = true;
          el.playsInline = true;
          el.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
          document.body.appendChild(el);
          recordingVideoElsRef.current.set(key, el);
        }
        if (el.srcObject !== stream) {
          el.srcObject = stream;
          el.play().catch(() => { /* retried on the next draw tick */ });
        } else if (el.paused) {
          el.play().catch(() => { /* still not allowed to - nothing more to do */ });
        }
        return el;
      };

      interface Tile { key: string; name: string; el: HTMLVideoElement; showAvatar: boolean }

      // ~15fps: smooth enough to follow a conversation and a shared screen without the encoder
      // work of a full 30fps composite. Doesn't need to look like the live grid, just be watchable.
      recordingDrawIntervalRef.current = setInterval(() => {
        if (!ctx) return;

        const tiles: Tile[] = [];
        const localStream = localStreamRef.current;
        if (localStream) {
          const track = localStream.getVideoTracks()[0];
          tiles.push({
            key: "local",
            name: participantName,
            el: getOrCreateVideoEl("local", localStream),
            showAvatar: !track || !track.enabled,
          });
        }
        const screens: Tile[] = [];
        if (screenStreamRef.current) {
          screens.push({ key: "local-screen", name: `${participantName}'s screen`, el: getOrCreateVideoEl("local-screen", screenStreamRef.current), showAvatar: false });
        }
        latestRemoteParticipantsRef.current.forEach((p) => {
          if (p.stream) tiles.push({ key: p.connectionId, name: p.name, el: getOrCreateVideoEl(p.connectionId, p.stream), showAvatar: !p.cameraOn });
          if (p.screenShareStream) screens.push({ key: `${p.connectionId}-screen`, name: `${p.name}'s screen`, el: getOrCreateVideoEl(`${p.connectionId}-screen`, p.screenShareStream), showAvatar: false });
        });

        const W = canvas.width;
        const H = canvas.height;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);

        const drawTile = (t: Tile, x: number, y: number, w: number, h: number, fit: "cover" | "contain") => {
          if (!t.showAvatar && t.el.readyState >= 2) drawVideoInBox(ctx, t.el, x, y, w, h, fit);
          drawTileChrome(ctx, t.name, t.showAvatar, x, y, w, h);
        };

        if (screens.length > 0) {
          // A screen share is what everyone is looking at - give it most of the frame and put
          // the people in a strip beside it, like the live call does.
          const stripW = tiles.length > 0 ? Math.round(W * 0.22) : 0;
          drawTile(screens[0], 0, 0, W - stripW, H, "contain");
          if (tiles.length > 0) {
            const cellH = Math.min(Math.round(stripW * 9 / 16), Math.floor(H / tiles.length));
            tiles.forEach((t, i) => drawTile(t, W - stripW, i * cellH, stripW, cellH, "cover"));
          }
        } else {
          const cols = Math.ceil(Math.sqrt(tiles.length || 1));
          const rows = Math.ceil((tiles.length || 1) / cols);
          const cellW = W / cols;
          const cellH = H / rows;
          tiles.forEach((t, i) => drawTile(t, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH, "cover"));
        }
      }, 66);

      recordedTracks.push(...canvas.captureStream(15).getVideoTracks());
    }

    const compositeStream = new MediaStream(recordedTracks);
    const recorder = createRecorder(compositeStream, includeVideo);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorderRef.current = recorder;
    recordingChunksRef.current = chunks;
    recordingStartedAtRef.current = new Date();
    recordingIncludesVideoRef.current = includeVideo;
    recorder.start(1000); // gather data every second, not just once at the very end

    setIsRecording(true);
    setRecordingParticipantId("local");
    clientRef.current?.updateRecordingState(meetingId, true);
  }, [meetingId, participantName]);

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
    kicked,
    availableDevices,
    selectedCameraId,
    selectedMicId,
    switchCamera,
    switchMicrophone,
    localConnectionQuality,
    isScreenSharing,
    localScreenShareStream,
    startScreenShare,
    stopScreenShare,
    chatMessages,
    sendChatMessage,
    isRecording,
    recordingParticipantId,
    startRecording,
    stopRecording,
  };
}
