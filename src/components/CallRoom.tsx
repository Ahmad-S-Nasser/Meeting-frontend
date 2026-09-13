import { useMeetingCall, type UseMeetingCallOptions } from "../hooks/useMeetingCall";
import { CallTile } from "./CallTile";

export interface CallRoomProps extends UseMeetingCallOptions {
  /** Called after leave() has torn down media and the connection - close your own modal/layout here. */
  onLeave?: () => void;
  className?: string;
}

/**
 * The call's video grid and controls only - no modal/dialog wrapper. Whether this renders
 * inline, in your own dialog, or full-screen is entirely up to your app; that's why this SDK
 * has no Radix/shadcn dependency of its own.
 */
export function CallRoom({ onLeave, className, ...callOptions }: CallRoomProps) {
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
  } = useMeetingCall(callOptions);

  const handleLeave = () => {
    leave();
    onLeave?.();
  };

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
              <CallTile key={p.connectionId} stream={p.stream} name={p.name} micOn={p.micOn} cameraOn={p.cameraOn} />
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
