import type { RemoteParticipant } from "../types";
import { MicOffIcon, CameraOffIcon, PinIcon } from "./icons";
import { ConnectionQualityIndicator } from "./ConnectionQualityIndicator";

export interface ParticipantListPanelProps {
  localName: string;
  localMicOn: boolean;
  localCameraOn: boolean;
  participants: RemoteParticipant[];
  isHost?: boolean;
  onKick?: (participantId: string) => void;
  onBlock?: (participantId: string) => void;
  pinnedConnectionId?: string | null;
  onTogglePin?: (connectionId: string) => void;
}

/** Presentational only - every field here already exists on RemoteParticipant, no new
    hook/hub work needed. Kick/Block/pin are the exact same callbacks CallTile already uses. */
export function ParticipantListPanel({
  localName, localMicOn, localCameraOn, participants, isHost = false, onKick, onBlock, pinnedConnectionId, onTogglePin,
}: ParticipantListPanelProps) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 8 }}>
      <ParticipantRow name={`${localName} (You)`} micOn={localMicOn} cameraOn={localCameraOn} />
      {participants.map((p) => (
        <ParticipantRow
          key={p.connectionId}
          name={p.name}
          micOn={p.micOn}
          cameraOn={p.cameraOn}
          connectionQuality={p.connectionQuality}
          pinned={p.connectionId === pinnedConnectionId}
          onTogglePin={onTogglePin ? () => onTogglePin(p.connectionId) : undefined}
          onKick={onKick ? () => onKick(p.participantId) : undefined}
          onBlock={onBlock ? () => onBlock(p.participantId) : undefined}
          isHost={isHost}
        />
      ))}
    </ul>
  );
}

function ParticipantRow({
  name, micOn, cameraOn, connectionQuality, pinned, onTogglePin, onKick, onBlock, isHost,
}: {
  name: string;
  micOn: boolean;
  cameraOn: boolean;
  connectionQuality?: RemoteParticipant["connectionQuality"];
  pinned?: boolean;
  onTogglePin?: () => void;
  onKick?: () => void;
  onBlock?: () => void;
  isHost?: boolean;
}) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderBottom: "1px solid var(--cm-border, rgba(255,255,255,0.06))" }}>
      <div
        style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: "var(--cm-avatar-bg, #3a3a3a)", color: "var(--cm-text, #fff)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
        }}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </div>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
        {name}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {!micOn && <MicOffIcon />}
        {!cameraOn && <CameraOffIcon />}
        {connectionQuality && <ConnectionQualityIndicator quality={connectionQuality} />}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? "Unpin" : "Pin for me"}
            aria-label={pinned ? "Unpin" : "Pin for me"}
            style={{ border: "none", background: "transparent", color: pinned ? "var(--cm-accent, #2563eb)" : "var(--cm-text-muted, #9ca3af)", cursor: "pointer", padding: 2, display: "flex" }}
          >
            <PinIcon filled={pinned} />
          </button>
        )}
        {isHost && onKick && (
          <button type="button" onClick={onKick} title="Remove from call - they can rejoin" style={{ fontSize: 10, padding: "1px 5px" }}>
            Kick
          </button>
        )}
        {isHost && onBlock && (
          <button type="button" onClick={onBlock} title="Remove and block - they can't rejoin" style={{ fontSize: 10, padding: "1px 5px" }}>
            Block
          </button>
        )}
      </div>
    </li>
  );
}
