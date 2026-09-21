import { useState, type ReactNode } from "react";
import { MicOnIcon, MicOffIcon, CameraOnIcon, CameraOffIcon, LeaveIcon, ChevronUpIcon } from "./icons";
import { DevicePickerMenu } from "./DevicePickerMenu";

export interface ControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  className?: string;
  /** Slot for screen-share/participants/chat/record buttons added by later features, so this
      component's own prop signature never has to change again as capabilities are added. */
  children?: ReactNode;
  /** Omit all five of these to hide the device-picker chevron entirely - it's presentational-
      only, "is the picker open" state lives here, not in useMeetingCall. */
  availableDevices?: { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] };
  selectedCameraId?: string;
  selectedMicId?: string;
  onSelectCamera?: (deviceId: string) => void;
  onSelectMicrophone?: (deviceId: string) => void;
}

/** No shadcn/Radix here by design, same as CallTile - plain markup, themeable via var(--cm-*). */
export function ControlBar({
  micOn, cameraOn, onToggleMic, onToggleCamera, onLeave, className, children,
  availableDevices, selectedCameraId, selectedMicId, onSelectCamera, onSelectMicrophone,
}: ControlBarProps) {
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const showDevicePicker = availableDevices && onSelectCamera && onSelectMicrophone;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 999,
        background: "var(--cm-controlbar-bg, rgba(32,32,32,0.9))",
        width: "fit-content",
        margin: "0 auto",
      }}
    >
      {showDevicePicker && devicePickerOpen && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 10 }}>
          <DevicePickerMenu
            cameras={availableDevices!.cameras}
            microphones={availableDevices!.microphones}
            selectedCameraId={selectedCameraId}
            selectedMicId={selectedMicId}
            onSelectCamera={onSelectCamera!}
            onSelectMicrophone={onSelectMicrophone!}
          />
        </div>
      )}

      <ControlButton
        active={micOn}
        onClick={onToggleMic}
        title={micOn ? "Mute" : "Unmute"}
        icon={micOn ? <MicOnIcon /> : <MicOffIcon size={20} />}
      />
      <ControlButton
        active={cameraOn}
        onClick={onToggleCamera}
        title={cameraOn ? "Turn camera off" : "Turn camera on"}
        icon={cameraOn ? <CameraOnIcon /> : <CameraOffIcon size={20} />}
      />
      {showDevicePicker && (
        <button
          type="button"
          onClick={() => setDevicePickerOpen((open) => !open)}
          title="Choose camera/microphone"
          aria-label="Choose camera/microphone"
          aria-expanded={devicePickerOpen}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 40,
            borderRadius: 8,
            border: "none",
            background: devicePickerOpen ? "var(--cm-control-active-bg, rgba(255,255,255,0.15))" : "transparent",
            color: "var(--cm-text, #fff)",
            cursor: "pointer",
            transform: devicePickerOpen ? undefined : "rotate(180deg)",
          }}
        >
          <ChevronUpIcon />
        </button>
      )}
      {children}
      <button
        type="button"
        onClick={onLeave}
        title="Leave call"
        aria-label="Leave call"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "none",
          background: "var(--cm-danger, #dc2626)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        <LeaveIcon />
      </button>
    </div>
  );
}

function ControlButton({
  active, onClick, title, icon,
}: { active: boolean; onClick: () => void; title: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={!active}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "none",
        background: active ? "var(--cm-control-active-bg, rgba(255,255,255,0.15))" : "var(--cm-danger, #dc2626)",
        color: "var(--cm-text, #fff)",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}
