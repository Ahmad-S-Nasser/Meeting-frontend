/**
 * CSS custom properties this SDK reads for theming. Set any of these on a wrapping element
 * (or globally) to override the defaults below - the SDK never ships or requires a stylesheet,
 * so there's nothing to import, just plain CSS custom properties a host app already controls.
 *
 * Example:
 *   .my-app-call-container { --cm-accent: #7c3aed; --cm-tile-bg: #111; }
 */
export const CM_CSS_VARS = {
  "--cm-accent": "#2563eb",
  "--cm-danger": "#dc2626",
  "--cm-tile-bg": "#1e1e1e",
  "--cm-avatar-bg": "#3a3a3a",
  "--cm-panel-bg": "#181818",
  "--cm-controlbar-bg": "rgba(32, 32, 32, 0.9)",
  "--cm-control-active-bg": "rgba(255, 255, 255, 0.15)",
  "--cm-text": "#ffffff",
  "--cm-text-muted": "#9ca3af",
  "--cm-border": "rgba(255, 255, 255, 0.1)",
  "--cm-radius": "8px",
  "--cm-quality-good": "#22c55e",
  "--cm-quality-fair": "#eab308",
  "--cm-quality-poor": "#dc2626",
} as const;
