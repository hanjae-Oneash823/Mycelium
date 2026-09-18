import { useRef } from "react";
import { Terminal as TerminalIcon, Plus } from "pixelarticons/react";
import useTerminalStore from "../../store/useTerminalStore";
import { useXtermSession } from "./lib/useXtermSession";

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = "#f59e0b";

function TerminalPane({ id, active }: { id: string; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useXtermSession(id, containerRef);
  return (
    <div
      ref={containerRef}
      style={{ display: active ? "block" : "none", width: "100%", height: "100%", padding: "8px 12px" }}
    />
  );
}

function EmptyState({ onSpawn }: { onSpawn: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "rgba(255,255,255,0.15)",
      }}
    >
      <TerminalIcon width={32} height={32} style={{ color: "rgba(255,255,255,0.08)" }} />
      <div style={{ fontFamily: VT, fontSize: "1.4rem", letterSpacing: 4, color: "rgba(255,255,255,0.12)" }}>
        TERMINAL
      </div>
      <div style={{ fontFamily: VT, fontSize: "1.1rem", color: "rgba(255,255,255,0.25)", letterSpacing: 0.5 }}>
        no terminals running
      </div>
      <button
        onClick={onSpawn}
        style={{
          fontFamily: VT, fontSize: "0.95rem", letterSpacing: 1,
          background: `${ACC}18`, border: `1px solid ${ACC}55`,
          color: ACC, padding: "6px 16px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Plus width={16} height={16} /> spawn a terminal
      </button>
    </div>
  );
}

export default function TerminalPlugin() {
  const { terminals, activeTabId, spawnTerminal, closeTerminal, setActiveTab } = useTerminalStore();

  return (
    <div
      style={{
        width: "100%", height: "100%", background: "#000",
        display: "flex", flexDirection: "column", color: "#fff", overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <TerminalIcon width={20} height={20} style={{ color: ACC }} />
          <span style={{ fontFamily: VT, fontSize: "1.3rem", letterSpacing: 4, color: "#fff" }}>TERMINAL</span>
        </div>

        {terminals.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
            {terminals.map((t) => {
              const active = t.id === activeTabId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontFamily: VT, fontSize: "0.9rem", letterSpacing: 0.5,
                    padding: "6px 12px",
                    background: active ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? ACC : "rgba(255,255,255,0.1)"}`,
                    color: active ? ACC : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                  <span
                    onClick={(e) => { e.stopPropagation(); closeTerminal(t.id); }}
                    style={{ color: "rgba(255,255,255,0.3)", cursor: "pointer" }}
                  >
                    ×
                  </span>
                </div>
              );
            })}
            <button
              onClick={() => spawnTerminal()}
              title="new terminal"
              style={{
                background: "none", border: "1px dashed rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.4)", padding: "6px 10px", cursor: "pointer",
                display: "flex", alignItems: "center",
              }}
            >
              <Plus width={14} height={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: "0 32px 24px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {terminals.length === 0 ? (
          <EmptyState onSpawn={() => spawnTerminal()} />
        ) : (
          <div style={{ flex: 1, border: "1px solid rgba(255,255,255,0.1)", background: "#080808" }}>
            {terminals.map((t) => (
              <TerminalPane key={t.id} id={t.id} active={t.id === activeTabId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
