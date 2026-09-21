import type { ReactNode } from "react";

export interface CallGridItem {
  key: string;
  /** At most one item should be focused at a time - if several are, the first wins. */
  focused: boolean;
  /** Caller builds this, typically a <CallTile ... />, so CallGrid stays presentation-only
      and has no coupling to what a "participant" or "screen share" actually is. */
  content: ReactNode;
}

export interface CallGridProps {
  items: CallGridItem[];
  className?: string;
}

/** Count-aware column sizing so a 1:1 call and a 9-person call don't share one fixed tile size. */
function gridTemplateColumnsFor(count: number): string {
  if (count <= 1) return "repeat(auto-fit, minmax(480px, 1fr))";
  if (count === 2) return "repeat(auto-fit, minmax(360px, 1fr))";
  if (count <= 4) return "repeat(auto-fit, minmax(280px, 1fr))";
  if (count <= 9) return "repeat(auto-fit, minmax(200px, 1fr))";
  return "repeat(auto-fit, minmax(140px, 1fr))";
}

/** No shadcn/Radix here by design, same as CallTile/ControlBar - plain markup only. */
export function CallGrid({ items, className }: CallGridProps) {
  const focusedItem = items.find((item) => item.focused);

  if (!focusedItem) {
    return (
      <div
        className={className}
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 12,
          gridTemplateColumns: gridTemplateColumnsFor(items.length),
          alignContent: "center",
        }}
      >
        {items.map((item) => (
          <div key={item.key}>{item.content}</div>
        ))}
      </div>
    );
  }

  const rest = items.filter((item) => item.key !== focusedItem.key);

  return (
    <div className={className} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ flex: 1, minHeight: 0 }}>{focusedItem.content}</div>
      {rest.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", flexShrink: 0 }}>
          {rest.map((item) => (
            <div key={item.key} style={{ flex: "0 0 160px" }}>
              {item.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
