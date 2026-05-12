import { useState, useEffect, useRef } from "react";
import type { Habit, HabitType } from "../types";

const VT = "'VT323', 'HBIOS-SYS', monospace";

const PRESET_COLORS = [
  "#4a8c6e", "#4a6a8c", "#7a6a9a", "#8c6a4a",
  "#8c4a6a", "#6a8c4a", "#8c7a4a", "#4a8c8c",
  "#9a5a4a", "#5a4a8c",
];

interface Props {
  initial?: Habit;
  onSave: (name: string, color: string, type: HabitType, n: number | null) => void;
  onCancel: () => void;
}

export default function HabitForm({ initial, onSave, onCancel }: Props) {
  const [name, setName]       = useState(initial?.name ?? "");
  const [color, setColor]     = useState(initial?.color ?? PRESET_COLORS[0]);
  const [type, setType]       = useState<HabitType>(initial?.type ?? "daily");
  const [times, setTimes]     = useState(initial?.times_per_week ?? 3);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, color, type, type === "times_per_week" ? times : null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div style={{
      padding: "14px 0 10px",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>

      {/* Name */}
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="habit name..."
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.18)",
          color: "#fff",
          fontFamily: VT,
          fontSize: "1.1rem",
          letterSpacing: 2,
          textTransform: "uppercase",
          outline: "none",
          padding: "2px 0",
          width: "100%",
        }}
      />

      {/* Type + N */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {(["daily", "weekly", "times_per_week"] as HabitType[]).map(t => {
          const label = t === "daily" ? "daily" : t === "weekly" ? "weekly" : "n × /wk";
          const active = type === t;
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                all: "unset",
                fontFamily: VT,
                fontSize: "0.9rem",
                letterSpacing: 1.5,
                padding: "2px 10px",
                border: `1px solid ${active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: active ? "#fff" : "rgba(255,255,255,0.3)",
                cursor: "pointer",
                transition: "color 0.1s, border-color 0.1s",
              }}
            >
              {label}
            </button>
          );
        })}
        {type === "times_per_week" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setTimes(t => Math.max(1, t - 1))}
              style={{ all: "unset", cursor: "pointer", fontFamily: VT, fontSize: "1rem", color: "rgba(255,255,255,0.4)", padding: "0 4px" }}
            >−</button>
            <span style={{ fontFamily: VT, fontSize: "1rem", color: "#fff", minWidth: 16, textAlign: "center" }}>
              {times}
            </span>
            <button
              onClick={() => setTimes(t => Math.min(7, t + 1))}
              style={{ all: "unset", cursor: "pointer", fontFamily: VT, fontSize: "1rem", color: "rgba(255,255,255,0.4)", padding: "0 4px" }}
            >+</button>
          </div>
        )}
      </div>

      {/* Color swatches */}
      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              all: "unset",
              width: 14, height: 14,
              background: c,
              cursor: "pointer",
              outline: color === c ? "2px solid rgba(255,255,255,0.7)" : "none",
              outlineOffset: 2,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={handleSave}
          style={{
            all: "unset",
            fontFamily: VT,
            fontSize: "0.95rem",
            letterSpacing: 2,
            padding: "3px 14px",
            border: "1px solid rgba(255,255,255,0.35)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {initial ? "save" : "add"}
        </button>
        <button
          onClick={onCancel}
          style={{
            all: "unset",
            fontFamily: VT,
            fontSize: "0.95rem",
            letterSpacing: 2,
            color: "rgba(255,255,255,0.25)",
            cursor: "pointer",
          }}
        >
          cancel
        </button>
      </div>
    </div>
  );
}
