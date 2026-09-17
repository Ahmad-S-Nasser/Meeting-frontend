// The two calls a "join a call" experience actually needs. Both are unauthenticated - no
// session, no API key - because they hit the Dashboard API's already-public /api/v1/guest
// endpoints, the same ones behind its own GuestJoinPage. A real product wouldn't necessarily
// reuse someone else's guest-link system like this; it's done here only because the point of
// this example is "the smallest possible thing built on the SDK," not "a second implementation
// of link-based guest access."

const DASHBOARD_API_URL = import.meta.env.VITE_DASHBOARD_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DASHBOARD_API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // Body wasn't JSON - keep the status text.
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export interface JoinLinkPreview {
  meetingId: string;
  meetingTitle: string;
  scope: "Any" | "Attendee";
  prefilledName?: string;
}

export interface JoinToken {
  token: string;
  expiresAt: string;
  meetingId: string;
  participantName: string;
}

export const guestApi = {
  preview: (joinToken: string) => request<JoinLinkPreview>(`/api/v1/guest/join-links/${joinToken}`),
  mintToken: (joinToken: string, name: string) =>
    request<JoinToken>(`/api/v1/guest/join-links/${joinToken}/token`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
};
