import { useEffect, useRef, useState } from "react";
import { MicOffIcon, CameraOffIcon, VolumeIcon, PinIcon } from "./icons";
import { ConnectionQualityIndicator } from "./ConnectionQualityIndicator";
import type { ConnectionQuality } from "../types";

export interface CallTileProps {
  stream: MediaStream | null;
  name: string;
  micOn: boolean;
  cameraOn: boolean;
  isLocal?: boolean;
  className?: string;
  /** 0..1. Remote tiles only - your own tile has nothing to attenuate. */
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  /** Whether the local viewer is this meeting's organizer - gates the Kick/Block buttons. */
  isHost?: boolean;
  onKick?: () => void;
  onBlock?: () => void;
  /** Pinning is local-only UI state (see CallRoom) - not broadcast, so every viewer can pin
      independently without affecting anyone else's view. */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Remote tiles only - your own connection to yourself has nothing to measure. */
  connectionQuality?: ConnectionQuality;
  /** "screen" suppresses the avatar-fallback/mic-camera-off/volume affordances, which don't
      mean anything for a screen share, and labels the tile as "{name}'s screen". Defaults to
      "camera". */
  variant?: "camera" | "screen";
}

/** No shadcn/Radix here by design - this SDK ships plain markup so it drops into any design system via className. */
export function CallTile({
  stream, name, micOn, cameraOn, isLocal = false, className,
  volume, onVolumeChange, isHost = false, onKick, onBlock,
  pinned = false, onTogglePin, connectionQuality, variant = "camera",
}: CallTileProps) {
  const isScreen = variant === "screen";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // React can't reliably set `volume` as a JSX attribute - it's imperative-only on
  // HTMLMediaElement, so this has to go through a ref effect like srcObject above.
  useEffect(() => {
    if (videoRef.current && !isLocal) {
      videoRef.current.volume = volume ?? 1;
    }
  }, [volume, isLocal]);

  return (
    <div
      className={className}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        aspectRatio: "16 / 9",
        background: "var(--cm-tile-bg, #1e1e1e)",
        borderRadius: "var(--cm-radius, 8px)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {onTogglePin && (hovering || pinned) && (
        <button
          type="button"
          onClick={onTogglePin}
          title={pinned ? "Unpin" : "Pin for me"}
          aria-label={pinned ? "Unpin" : "Pin for me"}
          aria-pressed={pinned}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "none",
            background: pinned ? "var(--cm-accent, #2563eb)" : "rgba(0,0,0,0.6)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          <PinIcon filled={pinned} />
        </button>
      )}
      {/* Always mounted whenever a stream exists, even with the camera off - the stream's
          audio track has no other element playing it, so hiding this on cameraOn=false would
          silence that participant entirely, not just blank their video. Visibility here is
          purely cosmetic: CSS display doesn't pause a <video> element's playback. */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{
            width: "100%",
            height: "100%",
            objectFit: isScreen ? "contain" : "cover",
            background: isScreen ? "#000" : undefined,
            transform: isLocal ? "scaleX(-1)" : undefined,
            display: isScreen || cameraOn ? "block" : "none",
          }}
        />
      )}
      {!isScreen && !(stream && cameraOn) && (
        <div
          style={{
            height: 48,
            width: 48,
            borderRadius: "50%",
            background: "var(--cm-avatar-bg, #3a3a3a)",
            color: "var(--cm-text, #fff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 500,
          }}
        >
          {name.charAt(0).toUpperCase() || "?"}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 4,
        }}
      >
        <span style={{ maxWidth: "10rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isScreen ? `${name}'s screen` : isLocal ? `${name} (You)` : name}
        </span>
        {!isScreen && !micOn && <MicOffIcon />}
        {!isScreen && !cameraOn && <CameraOffIcon />}
        {!isScreen && !isLocal && connectionQuality && <ConnectionQualityIndicator quality={connectionQuality} />}

        {!isScreen && !isLocal && onVolumeChange && (
          <span style={{ display: "flex", alignItems: "center", gap: 3 }} title="Volume">
            <VolumeIcon muted={(volume ?? 1) === 0} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume ?? 1}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume"
              style={{ width: 60, height: 14, accentColor: "#fff", cursor: "pointer" }}
            />
          </span>
        )}

        {!isScreen && isHost && !isLocal && (onKick || onBlock) && (
          <>
            {onKick && (
              <button type="button" onClick={onKick} title="Remove from call - they can rejoin" style={{ fontSize: 11, padding: "1px 6px" }}>
                Kick
              </button>
            )}
            {onBlock && (
              <button type="button" onClick={onBlock} title="Remove and block - they can't rejoin" style={{ fontSize: 11, padding: "1px 6px" }}>
                Block
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
