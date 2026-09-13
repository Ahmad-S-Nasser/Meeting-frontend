import { useEffect, useRef } from "react";

export interface CallTileProps {
  stream: MediaStream | null;
  name: string;
  micOn: boolean;
  cameraOn: boolean;
  isLocal?: boolean;
  className?: string;
}

/** No shadcn/Radix here by design - this SDK ships plain markup so it drops into any design system via className. */
export function CallTile({ stream, name, micOn, cameraOn, isLocal = false, className }: CallTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

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
      {stream && cameraOn ? (
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
          }}
        />
      ) : (
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
