import { useState } from "react";
import type { PoolNode } from "../types";

interface Props {
  nodes: PoolNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  px: string;
  vt: string;
  acc: string;
}

function formatDuration(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function NodePool({ nodes, selectedId, onSelect, px, vt, acc }: Props) {
  const [hovId, setHovId] = useState<string | null>(null);

  // Group by arc
  const grouped = new Map<string, { arc_name: string | null; arc_color: string | null; nodes: PoolNode[] }>();
  for (const node of nodes) {
    const key = node.arc_id ?? "__none__";
    if (!grouped.has(key)) grouped.set(key, { arc_name: node.arc_name, arc_color: node.arc_color, nodes: [] });
    grouped.get(key)!.nodes.push(node);
  }
  const groups = Array.from(grouped.entries());

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: `28px ${px} 28px` }}>

      {/* Section label — mirrors the StatCard label style */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: vt,
        fontSize: "1.6rem",
        letterSpacing: "4px",
        color: "rgba(255,255,255,0.18)",
        textTransform: "uppercase",
        lineHeight: 1,
        marginBottom: 16,
        whiteSpace: "nowrap",
      }}>
        POOL
        {nodes.length > 0 && (
          <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.12)", letterSpacing: 2 }}>
            — {nodes.length} task{nodes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {nodes.length === 0 ? (
        <div style={{ fontFamily: vt, fontSize: "1rem", color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
          no tasks scheduled for this day
        </div>
      ) : (
        <div style={{ overflowX: "auto", overflowY: "hidden", display: "flex", alignItems: "stretch", flex: 1, gap: 0, paddingBottom: 4 }}>
          {groups.map(([key, { arc_name, arc_color, nodes: arcNodes }]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.06)", marginRight: 20 }}>

              {/* Arc label — vertical, like a sidebar */}
              <span style={{
                writingMode: "vertical-rl",
                fontFamily: vt,
                fontSize: "0.85rem",
                color: arc_color ?? "rgba(255,255,255,0.2)",
                letterSpacing: 2,
                textTransform: "uppercase",
                paddingRight: 10,
                flexShrink: 0,
                lineHeight: 1,
              }}>
                {arc_name ?? "—"}
              </span>

              {/* Node cards */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {arcNodes.map(node => {
                  const selected = selectedId === node.id;
                  const hov      = hovId === node.id;
                  return (
                    <div
                      key={node.id}
                      onClick={() => onSelect(node.id)}
                      onMouseEnter={() => setHovId(node.id)}
                      onMouseLeave={() => setHovId(null)}
                      style={{
                        width: 130,
                        minHeight: 52,
                        border: `1px solid ${selected ? acc : hov ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                        padding: "6px 8px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        flexShrink: 0,
                        background: selected ? `${acc}12` : hov ? "rgba(255,255,255,0.03)" : "transparent",
                        transition: "border-color 0.1s, background 0.1s",
                      }}
                    >
                      <span style={{
                        fontFamily: vt,
                        fontSize: "1rem",
                        color: selected ? "#fff" : "rgba(255,255,255,0.6)",
                        lineHeight: 1.25,
                        letterSpacing: 0.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        transition: "color 0.1s",
                      }}>
                        {node.title}
                      </span>
                      <span style={{ fontFamily: vt, fontSize: "0.85rem", color: selected ? acc : "rgba(255,255,255,0.2)", letterSpacing: 1, marginTop: 4, transition: "color 0.1s" }}>
                        {formatDuration(node.estimated_duration_minutes) || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
