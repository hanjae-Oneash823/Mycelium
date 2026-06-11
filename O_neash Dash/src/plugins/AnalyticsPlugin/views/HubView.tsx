import { useState } from "react";
import PlannerPanel from "../panels/planner/PlannerPanel";
import SleepPanel from "../panels/sleep/SleepPanel";
import PlannerSleepPanel from "../panels/planner-sleep/PlannerSleepPanel";

const VT = "'VT323', 'HBIOS-SYS', monospace";

interface PluginDef {
  id: string;
  label: string;
  color: string;
}

const PLUGINS: PluginDef[] = [
  { id: "planner",  label: "Planner",          color: "#00c4a7" },
  { id: "academic", label: "Academic Planner",  color: "#818cf8" },
  { id: "sleep",    label: "Sleep Tracker",     color: "#60a5fa" },
  { id: "journal",  label: "Journal",           color: "#f472b6" },
  { id: "habits",   label: "Habits",            color: "#4ade80" },
  { id: "esra",     label: "L'ESRA",            color: "#fb923c" },
];

function PluginChip({
  plugin,
  selected,
  onToggle,
}: {
  plugin: PluginDef;
  selected: boolean;
  onToggle: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? plugin.color : "transparent",
        border: `1.5px solid ${selected ? plugin.color : hov ? plugin.color : "rgba(255,255,255,0.18)"}`,
        color: selected ? "#000" : hov ? plugin.color : "rgba(255,255,255,0.55)",
        fontFamily: VT,
        fontSize: "1rem",
        letterSpacing: "2px",
        textTransform: "uppercase",
        padding: "0.15rem 0.75rem",
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s, color 0.12s",
        lineHeight: 1.4,
        userSelect: "none",
        borderRadius: 0,
      }}
    >
      {plugin.label}
    </button>
  );
}

function GraphCard({ title, insight }: { title: string; insight: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div
        style={{
          aspectRatio: "1 / 1",
        maxWidth: "95%",
        margin: "0 auto",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <span
          style={{
            fontFamily: VT,
            fontSize: "1rem",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.1)",
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          paddingTop: "0.75rem",
          fontFamily: VT,
          fontSize: "1rem",
          letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {insight}
      </div>
    </div>
  );
}

export default function HubView() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      style={{
        height: "100%",
        background: "#000",
        color: "#fff",
        fontFamily: VT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "72px 80px 60px",
        boxSizing: "border-box",
        overflow: "hidden",
        gap: "2.5rem",
      }}
    >
      {/* Header + chips */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.2rem",
          flexShrink: 0,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "2.2rem",
              letterSpacing: "8px",
              textTransform: "uppercase",
              color: "#00c4a7",
              lineHeight: 1,
              marginBottom: "0.3rem",
            }}
          >
            analytics
          </div>
          <div
            style={{
              fontSize: "0.9rem",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
            }}
          >
            select one or more plugins
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.6rem",
            justifyContent: "center",
          }}
        >
          {PLUGINS.map((p) => (
            <PluginChip
              key={p.id}
              plugin={p}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Graph grid — appears when a plugin is selected */}
      {selected.size > 0 && (
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            flexShrink: 0,
          }}
        >
          {selected.size === 1 && selected.has("planner") ? (
            <PlannerPanel />
          ) : selected.size === 1 && selected.has("sleep") ? (
            <SleepPanel />
          ) : selected.has("planner") && selected.has("sleep") ? (
            <PlannerSleepPanel />
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <GraphCard title="graph 1" insight="coming soon" />
                <GraphCard title="graph 2" insight="coming soon" />
                <GraphCard title="graph 3" insight="coming soon" />
              </div>
              <div
                style={{
                  textAlign: "center",
                  fontFamily: VT,
                  fontSize: "1.05rem",
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.2)",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                final insight · coming soon
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
