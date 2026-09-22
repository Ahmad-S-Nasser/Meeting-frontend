interface IconProps {
  size?: number;
}

export function MicOnIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function MicOffIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function CameraOnIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export function CameraOffIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function VolumeIcon({ muted, size = 12 }: { muted: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <line x1="23" y1="9" x2="17" y2="15" />
      ) : (
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      )}
      {muted && <line x1="17" y1="9" x2="23" y2="15" />}
    </svg>
  );
}

/** Classic rounded "call end" handset glyph - filled, meant for a solid-color circular button. */
export function LeaveIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 9c-2.95 0-5.72.85-8.06 2.32a1.5 1.5 0 0 0-.5 2.06l1.31 2.1a1.5 1.5 0 0 0 1.98.55l2.19-1.09a1 1 0 0 1 1.15.18c.56.53 1.2.98 1.9 1.33a1 1 0 0 1 .53 1.12l-.5 2.28a1.5 1.5 0 0 0 1.06 1.77c.61.18 1.25.28 1.94.28s1.33-.1 1.94-.28a1.5 1.5 0 0 0 1.06-1.77l-.5-2.28a1 1 0 0 1 .53-1.12c.7-.35 1.34-.8 1.9-1.33a1 1 0 0 1 1.15-.18l2.19 1.09a1.5 1.5 0 0 0 1.98-.55l1.31-2.1a1.5 1.5 0 0 0-.5-2.06C17.72 9.85 14.95 9 12 9z" />
    </svg>
  );
}

export function LinkIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function RecordIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function ChatIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ScreenShareIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="8 11 12 7 16 11" />
      <line x1="12" y1="7" x2="12" y2="14" />
    </svg>
  );
}

export function ParticipantsIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function PinIcon({ size = 14, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 0 0-5 5c0 3 2 4.5 2 7l-3 1v2h12v-2l-3-1c0-2.5 2-4 2-7a5 5 0 0 0-5-5z" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
