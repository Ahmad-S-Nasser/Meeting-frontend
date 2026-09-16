import { useEffect, useState } from "react";
import { useMeetingCall, type UseMeetingCallOptions } from "../hooks/useMeetingCall";
import { CallTile } from "./CallTile";

export interface CallRoomProps extends UseMeetingCallOptions {
  /** Called after leave() has torn down media and the connection - close your own modal/layout here. */
  onLeave?: () => void;
  className?: string;
  /** Whether the local viewer organizes this meeting - gates the Kick/Block buttons on
   * every remote tile. This SDK never calls your backend itself; wire these two callbacks
   * to whatever REST endpoints your own backend exposes for moderating a call. */
  isHost?: boolean;
  onKickParticipant?: (participantId: string) => void;
  onBlockParticipant?: (participantId: string) => void;
}

const KICKED_MESSAGES: Record<string, string> = {
  kicked: "You were removed from this call by the organizer.",
  blocked: "You were removed from this call and blocked by the organizer.",
  access_denied: "You're no longer able to join this call.",
};

export function CallRoom({ onLeave, className, isHost, onKickParticipant, onBlockParticipant, ...callOptions }: CallRoomProps) {
  const {
    localStream,
    localParticipantName,
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
  } = useMeetingCall(callOptions);

  const [volumes, setVolumes] = useState<Record<string, number>>({});

  const handleLeave = () => {
    leave();
    onLeave?.();
  };

  // The hook has already torn everything down by the time `kicked` is set - this just
  // notifies the host app so it can close its own modal/layout, same as a normal leave.
  useEffect(() => {
    if (kicked) onLeave?.();
  }, [kicked, onLeave]);

  if (kicked) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#888", maxWidth: 320 }}>{KICKED_MESSAGES[kicked.type]}</p>
        {onLeave && <button onClick={onLeave}>Close</button>}
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#888", maxWidth: 320 }}>{connectionError}</p>
        {onLeave && <button onClick={onLeave}>Close</button>}
      </div>
    );
  }

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {mediaError && (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#b45309" }}>{mediaError}</div>
        )}

        {joining ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
            Joining call…
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            <CallTile stream={localStream} name={localParticipantName} micOn={micOn} cameraOn={cameraOn} isLocal />
            {remoteParticipants.map((p) => (
              <CallTile
                key={p.connectionId}
                stream={p.stream}
                name={p.name}
                micOn={p.micOn}
                cameraOn={p.cameraOn}
                volume={volumes[p.connectionId]}
                onVolumeChange={(v) => setVolumes((prev) => ({ ...prev, [p.connectionId]: v }))}
                isHost={isHost}
                onKick={onKickParticipant ? () => onKickParticipant(p.participantId) : undefined}
                onBlock={onBlockParticipant ? () => onBlockParticipant(p.participantId) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: 16, borderTop: "1px solid #333" }}>
        <button onClick={toggleMic} title={micOn ? "Mute" : "Unmute"}>{micOn ? "Mic on" : "Mic off"}</button>
        <button onClick={toggleCamera} title={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? "Camera on" : "Camera off"}</button>
        <button onClick={handleLeave} title="Leave call">Leave</button>
      </div>
    </div>
  );
}
