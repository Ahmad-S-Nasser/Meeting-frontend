import { useEffect, useRef, useState } from "react";
import { useMeetingCall, type UseMeetingCallOptions } from "../hooks/useMeetingCall";
import { CallTile } from "./CallTile";
import { ControlBar } from "./ControlBar";
import { CallGrid, type CallGridItem } from "./CallGrid";
import { SidePanel, type SidePanelTab, type SidePanelTabDef } from "./SidePanel";
import { ParticipantListPanel } from "./ParticipantListPanel";
import { ChatPanel } from "./ChatPanel";
import { ParticipantsIcon, ScreenShareIcon, ChatIcon, RecordIcon, LinkIcon } from "./icons";

/** Clipboard API needs a secure context and a user gesture; the textarea fallback covers the
    embedded/older-browser cases where navigator.clipboard is missing or refuses. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path.
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
}

export interface CallRoomProps extends UseMeetingCallOptions {
  /** Called after leave() has torn down media and the connection - close your own modal/layout here. */
  onLeave?: () => void;
  className?: string;
  /** Whether the local viewer organizes this meeting - gates the Kick/Block buttons on
   * every remote tile. This SDK never calls your backend itself; wire these two callbacks
   * to whatever REST endpoints your own backend exposes for moderating a call. */
  isHost?: boolean;
  onKickParticipant?: (participantId: string) => void;
  onBlockParticipant?: (participantId: string) => void;
  /** Whether this participant may share their screen. Decided by your app (typically from your
   * own per-meeting settings) - the SDK only shows or hides the button, and stops a share already
   * running if this flips to false. Defaults to true (the previous behaviour: everyone). */
  canShareScreen?: boolean;
  /** Whether this participant may start a recording. Same contract as canShareScreen. Defaults to
   * `isHost` (the previous behaviour: organizer only). */
  canRecord?: boolean;
  /** Supplies the URL to copy when someone clicks "Copy invite link". The button only appears
   * when this is provided; return null to say there's nothing to copy. Like Kick/Block, the SDK
   * never calls your backend itself - your app decides what link is appropriate to hand out. */
  getInviteLink?: () => string | null | Promise<string | null>;
}

const KICKED_MESSAGES: Record<string, string> = {
  kicked: "You were removed from this call by the organizer.",
  blocked: "You were removed from this call and blocked by the organizer.",
  access_denied: "You're no longer able to join this call.",
};

export function CallRoom({
  onLeave, className, isHost, onKickParticipant, onBlockParticipant,
  canShareScreen, canRecord, getInviteLink,
  ...callOptions
}: CallRoomProps) {
  const {
    localStream,
    localParticipantName,
    remoteParticipants,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    connectionError,
    mediaError,
    joining,
    kicked,
    availableDevices,
    selectedCameraId,
    selectedMicId,
    switchCamera,
    switchMicrophone,
    isScreenSharing,
    localScreenShareStream,
    startScreenShare,
    stopScreenShare,
    chatMessages,
    sendChatMessage,
    isRecording,
    recordingParticipantId,
    startRecording,
    stopRecording,
  } = useMeetingCall(callOptions);

  const [volumes, setVolumes] = useState<Record<string, number>>({});
  // Local-only UI state - never broadcast, so pinning is each viewer's own choice and has no
  // effect on what anyone else sees.
  const [pinnedConnectionId, setPinnedConnectionId] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<SidePanelTab | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const seenChatCountRef = useRef(0);

  // Counts only messages that arrived while the chat tab wasn't the one open - a message sent
  // from this same tile (isLocal) never counts as "unread" for its own sender.
  useEffect(() => {
    const newMessages = chatMessages.slice(seenChatCountRef.current);
    seenChatCountRef.current = chatMessages.length;
    if (openPanel !== "chat") {
      const incoming = newMessages.filter((m) => !m.isLocal).length;
      if (incoming > 0) setUnreadChatCount((c) => c + incoming);
    }
  }, [chatMessages, openPanel]);

  useEffect(() => {
    if (openPanel === "chat") setUnreadChatCount(0);
  }, [openPanel]);

  const shareAllowed = canShareScreen ?? true;
  const recordAllowed = canRecord ?? !!isHost;

  // Permission can be taken away mid-call (the host app re-checks and flips these props) - an
  // already-running share or recording must stop, not just lose its button. Stopping a recording
  // still delivers whatever was captured so far through onRecordingAvailable.
  useEffect(() => {
    if (!shareAllowed && isScreenSharing) stopScreenShare();
  }, [shareAllowed, isScreenSharing, stopScreenShare]);

  useEffect(() => {
    if (!recordAllowed && isRecording && recordingParticipantId === "local") stopRecording();
  }, [recordAllowed, isRecording, recordingParticipantId, stopRecording]);

  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const inviteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashInviteToast = (message: string) => {
    setInviteToast(message);
    if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current);
    inviteToastTimerRef.current = setTimeout(() => setInviteToast(null), 2500);
  };

  useEffect(() => () => {
    if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current);
  }, []);

  const handleCopyInvite = async () => {
    try {
      const link = await getInviteLink?.();
      if (!link) {
        flashInviteToast("No invite link available");
        return;
      }
      await copyText(link);
      flashInviteToast("Invite link copied");
    } catch {
      flashInviteToast("Couldn't copy the link");
    }
  };

  const handleLeave = () => {
    leave();
    onLeave?.();
  };

  // The hook has already torn everything down by the time `kicked` is set - this just
  // notifies the host app so it can close its own modal/layout, same as a normal leave.
  useEffect(() => {
    if (kicked) onLeave?.();
  }, [kicked, onLeave]);

  if (kicked) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#888", maxWidth: 320 }}>{KICKED_MESSAGES[kicked.type]}</p>
        {onLeave && <button onClick={onLeave}>Close</button>}
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#888", maxWidth: 320 }}>{connectionError}</p>
        {onLeave && <button onClick={onLeave}>Close</button>}
      </div>
    );
  }

  // Only one sharer at a time, by design - a screen share always takes the focus slot over a
  // manual pin, and the pin is left untouched (not cleared) so it's restored automatically once
  // sharing ends, per the confirmed decision.
  const remoteSharer = remoteParticipants.find((p) => p.screenShareStream);
  const anySharing = isScreenSharing || !!remoteSharer;

  const gridItems: CallGridItem[] = [];

  if (isScreenSharing && localScreenShareStream) {
    gridItems.push({
      key: "local-screen",
      focused: true,
      content: <CallTile stream={localScreenShareStream} name={localParticipantName} micOn cameraOn isLocal variant="screen" />,
    });
  }

  gridItems.push({
    key: "local",
    focused: false,
    content: <CallTile stream={localStream} name={localParticipantName} micOn={micOn} cameraOn={cameraOn} isLocal />,
  });

  remoteParticipants.forEach((p) => {
    if (p.screenShareStream) {
      gridItems.push({
        key: `${p.connectionId}-screen`,
        focused: true,
        content: <CallTile stream={p.screenShareStream} name={p.name} micOn cameraOn variant="screen" />,
      });
    }
    gridItems.push({
      key: p.connectionId,
      focused: !anySharing && p.connectionId === pinnedConnectionId,
      content: (
        <CallTile
          stream={p.stream}
          name={p.name}
          micOn={p.micOn}
          cameraOn={p.cameraOn}
          volume={volumes[p.connectionId]}
          onVolumeChange={(v: number) => setVolumes((prev) => ({ ...prev, [p.connectionId]: v }))}
          isHost={isHost}
          onKick={onKickParticipant ? () => onKickParticipant(p.participantId) : undefined}
          onBlock={onBlockParticipant ? () => onBlockParticipant(p.participantId) : undefined}
          pinned={p.connectionId === pinnedConnectionId}
          onTogglePin={() => setPinnedConnectionId((id) => (id === p.connectionId ? null : p.connectionId))}
          connectionQuality={p.connectionQuality}
        />
      ),
    });
  });

  const recordingParticipantName = recordingParticipantId === "local"
    ? localParticipantName
    : remoteParticipants.find((p) => p.connectionId === recordingParticipantId)?.name ?? "Someone";

  const panelTabs: SidePanelTabDef[] = [
    { id: "participants", label: "Participants" },
    { id: "chat", label: "Chat", badge: unreadChatCount },
  ];

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 16, overflowY: "auto" }}>
          {/* Shown to every participant, not just whoever's recording - this is the actual
              consent notice, not a convenience for the recorder's own screen. */}
          {isRecording && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                alignSelf: "center",
                marginBottom: 12,
                padding: "4px 12px",
                borderRadius: 999,
                background: "var(--cm-danger, #dc2626)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <RecordIcon size={10} />
              {recordingParticipantId === "local" ? "You're recording this call" : `${recordingParticipantName} is recording this call`}
            </div>
          )}
          {mediaError && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#b45309" }}>{mediaError}</div>
          )}

          {joining ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
              Joining call…
            </div>
          ) : (
            <CallGrid items={gridItems} />
          )}
        </div>

        {openPanel && (
          <SidePanel activeTab={openPanel} tabs={panelTabs} onSelectTab={setOpenPanel} onClose={() => setOpenPanel(null)}>
            {openPanel === "participants" && (
              <ParticipantListPanel
                localName={localParticipantName}
                localMicOn={micOn}
                localCameraOn={cameraOn}
                participants={remoteParticipants}
                isHost={isHost}
                onKick={onKickParticipant}
                onBlock={onBlockParticipant}
                pinnedConnectionId={pinnedConnectionId}
                onTogglePin={(id) => setPinnedConnectionId((cur) => (cur === id ? null : id))}
              />
            )}
            {openPanel === "chat" && <ChatPanel messages={chatMessages} onSend={sendChatMessage} />}
          </SidePanel>
        )}
      </div>

      <div style={{ position: "relative", padding: 16, borderTop: "1px solid var(--cm-border, #333)" }}>
        {inviteToast && (
          <div
            role="status"
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "var(--cm-controlbar-bg, rgba(32,32,32,0.95))",
              color: "var(--cm-text, #fff)",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {inviteToast}
          </div>
        )}
        <ControlBar
          micOn={micOn}
          cameraOn={cameraOn}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onLeave={handleLeave}
          availableDevices={availableDevices}
          selectedCameraId={selectedCameraId}
          selectedMicId={selectedMicId}
          onSelectCamera={switchCamera}
          onSelectMicrophone={switchMicrophone}
        >
          {getInviteLink && (
            <button
              type="button"
              onClick={handleCopyInvite}
              title="Copy invite link"
              aria-label="Copy invite link"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                color: "var(--cm-text, #fff)",
                cursor: "pointer",
              }}
            >
              <LinkIcon />
            </button>
          )}
          {recordAllowed && (
            <button
              type="button"
              onClick={() => (isRecording ? stopRecording() : startRecording({ includeVideo: true }))}
              title={isRecording ? "Stop recording" : "Start recording"}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              aria-pressed={isRecording}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                background: isRecording ? "var(--cm-danger, #dc2626)" : "transparent",
                color: "var(--cm-text, #fff)",
                cursor: "pointer",
              }}
            >
              <RecordIcon />
            </button>
          )}
          {shareAllowed && (
          <button
            type="button"
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            disabled={!isScreenSharing && !!remoteSharer}
            title={isScreenSharing ? "Stop sharing your screen" : remoteSharer ? `${remoteSharer.name} is already sharing` : "Share your screen"}
            aria-label={isScreenSharing ? "Stop sharing your screen" : "Share your screen"}
            aria-pressed={isScreenSharing}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: isScreenSharing ? "var(--cm-accent, #2563eb)" : "transparent",
              color: "var(--cm-text, #fff)",
              cursor: !isScreenSharing && remoteSharer ? "not-allowed" : "pointer",
              opacity: !isScreenSharing && remoteSharer ? 0.4 : 1,
            }}
          >
            <ScreenShareIcon />
          </button>
          )}
          <button
            type="button"
            onClick={() => setOpenPanel((p) => (p === "chat" ? null : "chat"))}
            title="Chat"
            aria-label="Chat"
            aria-pressed={openPanel === "chat"}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: openPanel === "chat" ? "var(--cm-control-active-bg, rgba(255,255,255,0.15))" : "transparent",
              color: "var(--cm-text, #fff)",
              cursor: "pointer",
            }}
          >
            <ChatIcon />
            {unreadChatCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "var(--cm-accent, #2563eb)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadChatCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpenPanel((p) => (p === "participants" ? null : "participants"))}
            title="Participants"
            aria-label="Participants"
            aria-pressed={openPanel === "participants"}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: openPanel === "participants" ? "var(--cm-control-active-bg, rgba(255,255,255,0.15))" : "transparent",
              color: "var(--cm-text, #fff)",
              cursor: "pointer",
            }}
          >
            <ParticipantsIcon />
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: 999,
                background: "var(--cm-accent, #2563eb)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {remoteParticipants.length + 1}
            </span>
          </button>
        </ControlBar>
      </div>
    </div>
  );
}
