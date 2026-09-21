import type { ConnectionQuality } from "../types";

export interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
  size?: number;
}

const COLOR_VAR: Record<ConnectionQuality, string> = {
  good: "var(--cm-quality-good, #22c55e)",
  fair: "var(--cm-quality-fair, #eab308)",
  poor: "var(--cm-quality-poor, #dc2626)",
  unknown: "var(--cm-text-muted, #9ca3af)",
};

/** Bars lit, per quality bucket: unknown/poor -> 1, fair -> 2, good -> 3. */
const LIT_BARS: Record<ConnectionQuality, number> = { unknown: 1, poor: 1, fair: 2, good: 3 };

/** Signal-bars glyph, same visual language as a phone's signal strength indicator. */
export function ConnectionQualityIndicator({ quality, size = 12 }: ConnectionQualityIndicatorProps) {
  const lit = LIT_BARS[quality];
  const color = COLOR_VAR[quality];
  const label = quality === "unknown" ? "Connection quality unknown" : `Connection quality: ${quality}`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      <rect x="1" y="15" width="5" height="8" rx="1" fill={lit >= 1 ? color : "var(--cm-text-muted, #9ca3af)"} opacity={lit >= 1 ? 1 : 0.35} />
      <rect x="9.5" y="9" width="5" height="14" rx="1" fill={lit >= 2 ? color : "var(--cm-text-muted, #9ca3af)"} opacity={lit >= 2 ? 1 : 0.35} />
      <rect x="18" y="1" width="5" height="22" rx="1" fill={lit >= 3 ? color : "var(--cm-text-muted, #9ca3af)"} opacity={lit >= 3 ? 1 : 0.35} />
    </svg>
  );
}
