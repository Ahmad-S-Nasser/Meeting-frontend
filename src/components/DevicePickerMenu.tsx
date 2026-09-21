export interface DevicePickerMenuProps {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId?: string;
  selectedMicId?: string;
  onSelectCamera: (deviceId: string) => void;
  onSelectMicrophone: (deviceId: string) => void;
  className?: string;
}

/** Plain native <select> elements, not a custom dropdown - matches the SDK's no-framework
    stance and gets working keyboard/screen-reader support for free, with no popover
    positioning logic to write. */
export function DevicePickerMenu({
  cameras, microphones, selectedCameraId, selectedMicId, onSelectCamera, onSelectMicrophone, className,
}: DevicePickerMenuProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        background: "var(--cm-panel-bg, #181818)",
        border: "1px solid var(--cm-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--cm-radius, 8px)",
        color: "var(--cm-text, #fff)",
        fontSize: 13,
        minWidth: 220,
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ color: "var(--cm-text-muted, #9ca3af)", fontSize: 11 }}>Camera</span>
        <select
          value={selectedCameraId ?? ""}
          onChange={(e) => onSelectCamera(e.target.value)}
          disabled={cameras.length === 0}
        >
          {cameras.length === 0 && <option value="">No camera found</option>}
          {cameras.map((cam) => (
            <option key={cam.deviceId} value={cam.deviceId}>
              {cam.label || "Camera"}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ color: "var(--cm-text-muted, #9ca3af)", fontSize: 11 }}>Microphone</span>
        <select
          value={selectedMicId ?? ""}
          onChange={(e) => onSelectMicrophone(e.target.value)}
          disabled={microphones.length === 0}
        >
          {microphones.length === 0 && <option value="">No microphone found</option>}
          {microphones.map((mic) => (
            <option key={mic.deviceId} value={mic.deviceId}>
              {mic.label || "Microphone"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
