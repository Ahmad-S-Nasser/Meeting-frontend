# coon-meeting-sdk

React SDK for integrating [Coon.Meeting](https://github.com/Ahmad-S-Nasser/Meeting-backend) calls into your own frontend.

## Critical boundary: no API keys in the browser

This package only ever calls the two endpoints that accept a **participant token**:
`GET /meetings/{id}/call-credentials` and the `/hubs/meetingCall` SignalR hub. It never holds
or sends your tenant API key.

Meeting CRUD (`POST /meetings`, etc.) is your own backend's job, calling the Coon.Meeting API
server-to-server with your API key, then minting a short-lived participant token
(`POST /meetings/{id}/participant-tokens`) and handing **only that token** down to your
frontend. If your API key ever ends up in client-side code, any caller can create, read, or
cancel meetings for your entire tenant.

```
Your backend (API key)  --creates meeting, mints participant token-->  Your frontend
Your frontend (participant token only)  --this SDK-->  Coon.Meeting call-credentials + hub
```

## Install

```bash
npm install coon-meeting-sdk
```

`react` and `react-dom` are peer dependencies - this package doesn't bundle its own copy.

## Usage

```tsx
import { CallRoom } from "coon-meeting-sdk";

function MyMeetingModal({ meetingId, participantToken }: { meetingId: string; participantToken: string }) {
  return (
    <CallRoom
      apiBaseUrl="https://meetings.example.com"
      meetingId={meetingId}
      participantToken={participantToken}
      participantName="Jamie"
      onLeave={() => console.log("left the call")}
    />
  );
}
```

`CallRoom` renders plain markup with no Radix/shadcn dependency and no modal of its own - wrap
it in your own dialog, drawer, or full-screen layout. If you want to build your own UI instead,
use the `useMeetingCall` hook directly; it returns the same local/remote stream state and
controls `CallRoom` is built on.

```tsx
import { useMeetingCall } from "coon-meeting-sdk";

const { localStream, remoteParticipants, micOn, cameraOn, toggleMic, toggleCamera, leave, joining, connectionError, mediaError } =
  useMeetingCall({ apiBaseUrl, meetingId, participantToken, participantName });
```

`apiBaseUrl`, `participantToken`, and `hubPath` are expected to stay stable for the lifetime of
one call - the token is minted per-join and isn't refreshed mid-call in this version.

## Webhook signature verification

Webhooks (`meeting.created`, `meeting.updated`, `meeting.cancelled`, `meeting.reminder`,
`participant.joined`, `participant.left`) are delivered server-to-server to the `WebhookUrl`
configured on your tenant - this is your **backend's** concern, not this SDK's, since a browser
never receives them. Documented here anyway since this is the integration guide for the whole
product, not just the call UI.

Each delivery carries three headers:

- `X-CoonMeeting-Event` - the event type, e.g. `meeting.created`.
- `X-CoonMeeting-Delivery` - a unique id for this delivery (stable across retries of the same event).
- `X-CoonMeeting-Signature` - `t=<unix seconds>,v1=<hex>`, where the hex is
  `HMAC-SHA256("{t}.{rawBody}", yourWebhookSecret)`.

Verify it against the **raw, unparsed request body** - re-serializing JSON before hashing
(different key order, whitespace, etc.) produces a different signature and every delivery will
appear invalid even though it's genuine:

```js
const crypto = require("crypto");

function verifyCoonMeetingWebhook(rawBody, signatureHeader, secret) {
  const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signatureHeader || "");
  if (!match) return false;
  const [, t, v1] = match;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");

  // Constant-time compare - a naive === leaks a timing side-channel byte by byte.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);

  // Optionally also reject if Math.abs(Date.now()/1000 - Number(t)) is too large, to bound
  // how old a captured request+signature pair can be replayed.
}
```

The envelope body is `{ id, type, createdAt, tenantId, data }`, where `data` is the resource
the event is about (a meeting for `meeting.*`, `{ meetingId, connectionId, participantId, name }`
for `participant.*`).
