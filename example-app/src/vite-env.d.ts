/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Dashboard API's own base URL - this example resolves a join link through its
   * already-public /api/v1/guest endpoints rather than needing its own backend. */
  readonly VITE_DASHBOARD_API_URL: string;
  /** Coon.Meeting's own base URL - the SDK's <CallRoom> talks to this directly, cross-origin. */
  readonly VITE_COON_MEETING_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
