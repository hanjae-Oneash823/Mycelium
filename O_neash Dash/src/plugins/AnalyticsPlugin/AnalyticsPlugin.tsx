import { useState, useEffect } from "react";
import HubView from "./views/HubView";

const VT = "'VT323', 'HBIOS-SYS', monospace";

const BOOT_LINES = [
  "initializing analytics engine...",
  "loading data sources...",
  "cross-referencing plugins...",
  "building index...",
  "ready.",
];

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines < BOOT_LINES.length) {
      const t = setTimeout(
        () => setVisibleLines((n) => n + 1),
        visibleLines === BOOT_LINES.length - 1 ? 300 : 260,
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, 520);
    return () => clearTimeout(t);
  }, [visibleLines, onDone]);

  return (
    <div
      style={{
        height: "100%",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 100px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontFamily: VT,
          fontSize: "1rem",
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.22)",
          textTransform: "uppercase",
          marginBottom: "1.8rem",
        }}
      >
        analytics v1.0
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: VT,
              fontSize: "1.1rem",
              letterSpacing: "2px",
              color:
                i === visibleLines - 1
                  ? "rgba(255,255,255,0.85)"
                  : "rgba(255,255,255,0.28)",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <span style={{ color: i === visibleLines - 1 ? "#00c4a7" : "rgba(255,255,255,0.15)" }}>
              {i === visibleLines - 1 ? "▸" : "·"}
            </span>
            {line}
            {i === visibleLines - 1 && visibleLines < BOOT_LINES.length && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: "1em",
                  background: "#00c4a7",
                  animation: "analytics-cursor 0.8s step-end infinite",
                  verticalAlign: "text-bottom",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPlugin() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={{ height: "100%", background: "#000", overflow: "hidden" }}>
      <style>{`
        @keyframes analytics-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
      {loaded ? (
        <HubView />
      ) : (
        <LoadingScreen onDone={() => setLoaded(true)} />
      )}
    </div>
  );
}
