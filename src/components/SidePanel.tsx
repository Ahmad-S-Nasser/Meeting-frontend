import type { ReactNode } from "react";

export type SidePanelTab = "participants" | "chat";

export interface SidePanelTabDef {
  id: SidePanelTab;
  label: string;
  /** Shown as a small count badge next to the label, e.g. unread chat messages. */
  badge?: number;
}

export interface SidePanelProps {
  activeTab: SidePanelTab;
  tabs: SidePanelTabDef[];
  onSelectTab: (tab: SidePanelTab) => void;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/** Fixed-width tabbed column. Only "participants" content exists yet - the "chat" tab (when
    present in `tabs`) is wired up so a later feature only has to supply content, not restructure
    this shell. */
export function SidePanel({ activeTab, tabs, onSelectTab, onClose, children, className }: SidePanelProps) {
  return (
    <div
      className={className}
      style={{
        width: "var(--cm-panel-width, 300px)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--cm-panel-bg, #181818)",
        borderLeft: "1px solid var(--cm-border, rgba(255,255,255,0.1))",
        color: "var(--cm-text, #fff)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--cm-border, rgba(255,255,255,0.1))" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 8px",
              border: "none",
              borderBottom: tab.id === activeTab ? "2px solid var(--cm-accent, #2563eb)" : "2px solid transparent",
              background: "transparent",
              color: tab.id === activeTab ? "var(--cm-text, #fff)" : "var(--cm-text-muted, #9ca3af)",
              fontSize: 13,
              fontWeight: tab.id === activeTab ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {tab.label}
            {!!tab.badge && (
              <span
                style={{
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
                {tab.badge}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
          style={{ border: "none", background: "transparent", color: "var(--cm-text-muted, #9ca3af)", cursor: "pointer", padding: "0 12px", fontSize: 18 }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
    </div>
  );
}
