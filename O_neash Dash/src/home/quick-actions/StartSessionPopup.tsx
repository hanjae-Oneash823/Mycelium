import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSessionStore } from "../../plugins/PlannerPlugin/store/useSessionStore";
import usePluginStore from "../../store/usePluginStore";

const VT  = "var(--font-main), var(--font-kr), monospace";
const ACC = "#f59e0b";

interface StartSessionPopupProps {
  onClose: () => void;
}

export function StartSessionPopup({ onClose }: StartSessionPopupProps) {
  const locations       = useSessionStore((s) => s.locations);
  const startUnplanned  = useSessionStore((s) => s.startUnplanned);
  const load             = useSessionStore((s) => s.load);
  const setActivePlugin  = usePluginStore((s) => s.setActivePlugin);

  useEffect(() => { load(); }, [load]);

  async function handleSelect(locationId: string) {
    await startUnplanned(locationId);
    setActivePlugin("planner");
    onClose();
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
        gap: 14,
        boxSizing: "border-box",
      }}>
        <div style={{
          fontFamily: VT, fontSize: "1.1rem", letterSpacing: 3,
          color: ACC, textTransform: "uppercase",
          borderBottom: `1px solid ${ACC}33`, paddingBottom: 5,
        }}>
          [start session at]
        </div>

        {locations.length === 0 ? (
          <div style={{ fontFamily: VT, fontSize: "0.9rem", color: "rgba(255,255,255,0.35)" }}>
            no locations — add one in the planner's on the clock view
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => handleSelect(loc.id)}
                style={{
                  all: "unset", cursor: "pointer",
                  fontFamily: VT, fontSize: "1.05rem", letterSpacing: 1.5,
                  color: "rgba(255,255,255,0.8)",
                  padding: "6px 10px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  transition: "background 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${ACC}14`;
                  e.currentTarget.style.borderColor = `${ACC}55`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                {loc.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
