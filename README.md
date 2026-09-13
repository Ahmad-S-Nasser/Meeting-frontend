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

Coming with Phase (c) - webhooks aren't implemented yet.
