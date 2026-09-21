import { useEffect, useState, type FormEvent } from "react";
import { CallRoom } from "coon-meeting-sdk";
import { guestApi, ApiError, type JoinLinkPreview } from "./api";

const COON_MEETING_API_BASE_URL = import.meta.env.VITE_COON_MEETING_API_BASE_URL;

// One route, no router: whatever's served at /join/<token> (or just /<token>) is this app's
// entire surface. That's the whole point of this example - the smallest possible product that
// still does something real with the SDK.
function tokenFromUrl(): string {
  return window.location.pathname.split("/").filter(Boolean).pop() ?? "";
}

export default function App() {
  const [token] = useState(tokenFromUrl);
  const [preview, setPreview] = useState<JoinLinkPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [participantToken, setParticipantToken] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("No invite link provided.");
      return;
    }
    guestApi
      .preview(token)
      .then((p) => {
        setPreview(p);
        if (p.prefilledName) setName(p.prefilledName);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 410) setLoadError("This invite has expired.");
        else if (err instanceof ApiError && err.status === 403) setLoadError("This meeting is no longer open to anyone with the link.");
        else setLoadError("This link isn't valid.");
      });
  }, [token]);

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await guestApi.mintToken(token, name);
      setParticipantToken(result.token);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't join this call.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Centered>
        <p>{loadError}</p>
      </Centered>
    );
  }

  if (participantToken && preview) {
    return (
      <div style={{ height: "100vh", background: "var(--bg-dark)", color: "var(--text-main)" }}>
        <CallRoom
          apiBaseUrl={COON_MEETING_API_BASE_URL}
          meetingId={preview.meetingId}
          participantToken={participantToken}
          participantName={name}
          onRecordingAvailable={(blob, meta) => {
            // Minimal demo behavior - a real integration decides its own storage; this SDK
            // never does it for you. Triggering a download is the simplest real persistence
            // path available with no backend at all, which is all this example app has.
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `meeting-recording-${meta.startedAt.toISOString().replace(/[:.]/g, "-")}.webm`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      </div>
    );
  }

  if (!preview) {
    return (
      <Centered>
        <p className="text-muted">Loading…</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="auth-card" style={{ textAlign: "left" }}>
        <h1 style={{ fontSize: 22 }}>{preview.meetingTitle}</h1>
        <p className="text-small text-muted">You're joining as a guest.</p>
        <form onSubmit={handleJoin} className="stack" style={{ marginTop: 20 }}>
          <input
            className="input-field"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {submitError && <p className="text-error">{submitError}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Joining…" : "Join call"}
          </button>
        </form>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        textAlign: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}
