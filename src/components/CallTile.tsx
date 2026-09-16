import { useEffect, useRef } from "react";

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
}

/** No shadcn/Radix here by design - this SDK ships plain markup so it drops into any design system via className. */
export function CallTile({
  stream, name, micOn, cameraOn, isLocal = false, className,
  volume, onVolumeChange, isHost = false, onKick, onBlock,
}: CallTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
      style={{
        position: "relative",
        aspectRatio: "16 / 9",
        background: "#1e1e1e",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
            objectFit: "cover",
            transform: isLocal ? "scaleX(-1)" : undefined,
            display: cameraOn ? "block" : "none",
          }}
        />
      )}
      {!(stream && cameraOn) && (
        <div
          style={{
            height: 48,
            width: 48,
            borderRadius: "50%",
            background: "#3a3a3a",
            color: "#fff",
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
          {isLocal ? `${name} (You)` : name}
        </span>
        {!micOn && <MicOffIcon />}
        {!cameraOn && <VideoOffIcon />}

        {!isLocal && onVolumeChange && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume ?? 1}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            title="Volume"
            style={{ width: 48, height: 12 }}
          />
        )}

        {isHost && !isLocal && (onKick || onBlock) && (
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

function MicOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function VideoOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
