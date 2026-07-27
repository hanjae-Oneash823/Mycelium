import { useState } from "react";
import { createPortal } from "react-dom";
import { getHabits, getLogsForMonth, setNumericLog } from "../../plugins/HabitsPlugin/lib/habitsDb";

const VT  = "var(--font-main), var(--font-kr), monospace";
const ACC = "#40c4c4";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RunKmPopupProps {
  onClose: () => void;
}

export function RunKmPopup({ onClose }: RunKmPopupProps) {
  const [km, setKm]         = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    const value = parseFloat(km);
    if (!Number.isFinite(value) || value <= 0) return;

    setSaving(true);
    setError(null);
    try {
      const habits   = await getHabits();
      const runHabit = habits.find((h) => h.name.trim().toLowerCase() === "running");
      if (!runHabit) {
        setError("no 'running' habit found in habits & health");
        setSaving(false);
        return;
      }

      const today = todayStr();
      const now   = new Date();
      const logs  = await getLogsForMonth(now.getFullYear(), now.getMonth() + 1);
      const existing  = logs.find((l) => l.habit_id === runHabit.id && l.date === today);
      const nextValue = (existing?.value ?? 0) + value;

      await setNumericLog(runHabit.id, today, nextValue);
      onClose();
    } catch {
      setError("failed to save");
      setSaving(false);
    }
  }

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "#06060f",
        border: `1px solid ${ACC}55`,
        padding: "28px 32px",
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        boxSizing: "border-box",
      }}>
        <div style={{
          fontFamily: VT, fontSize: "1.1rem", letterSpacing: 3,
          color: ACC, textTransform: "uppercase",
          borderBottom: `1px solid ${ACC}33`, paddingBottom: 5,
        }}>
          [today's run]
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <input
            type="number"
            step="0.1"
            min="0"
            autoFocus
            value={km}
            onChange={(e) => setKm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
            placeholder="0.0"
            style={{
              background: `${ACC}0d`,
              border: `1px solid ${ACC}44`,
              color: "#fff",
              fontFamily: VT,
              fontSize: "1.6rem",
              letterSpacing: 1,
              padding: "5px 10px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontFamily: VT, fontSize: "1.1rem", color: "rgba(255,255,255,0.4)" }}>km</span>
        </div>

        {error && (
          <div style={{ fontFamily: VT, fontSize: "0.85rem", color: "#f87171" }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 24 }}>
          <button
            onClick={onClose}
            style={{
              all: "unset", cursor: "pointer", fontFamily: VT,
              fontSize: "1rem", letterSpacing: 2, color: "rgba(255,255,255,0.28)",
              textTransform: "uppercase",
            }}
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !km}
            style={{
              all: "unset",
              cursor: saving || !km ? "default" : "pointer",
              fontFamily: VT, fontSize: "1rem", letterSpacing: 2,
              color: saving || !km ? `${ACC}44` : ACC,
              textTransform: "uppercase",
            }}
          >
            save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
