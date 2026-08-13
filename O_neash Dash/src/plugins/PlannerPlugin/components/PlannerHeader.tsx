import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { Plus } from "pixelarticons/react/Plus";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import {
  toDateString,
  pickDiceNode,
  getTodayNodes,
  getOverdueNodes,
} from "../lib/logicEngine";
import { loadTodayDoneSummary, type TodayDoneSummary } from "../lib/plannerDb";
import QuickAddInput from "./QuickAddInput";
import type { PlannerNode } from "../types";

export default function PlannerHeader() {
  const { nodes, rescheduleNode, createNode } = usePlannerStore();
  const { openTaskForm, suggestionsOn, setSuggestionsOn } = useViewStore();

  const [now, setNow] = useState(() => new Date());
  const [chevronHovered, setChevronHovered] = useState(false);
  const [addTaskHovered, setAddTaskHovered] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [doneSummary, setDoneSummary] = useState<TodayDoneSummary>({
    count: 0,
    effortMinutes: 0,
  });
  const [clockStr, setClockStr] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setClockStr(
        `${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadTodayDoneSummary()
      .then(setDoneSummary)
      .catch(() => {});
  }, [nodes]);

  const today = toDateString(now);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const month = now.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const day = now.getDate();
  const sysDateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const targetDateStr = `${weekday}, ${month} ${day}`;

  const todayNodes = useMemo(() => getTodayNodes(nodes, now), [nodes, now]);
  const overdue = useMemo(() => getOverdueNodes(nodes), [nodes]);

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "0.8rem 1.4rem 0.7rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        border: "0.5px solid rgba(255,255,255,0.35)",
      }}
    >
      {/* Date + SYS_LOG block */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", lineHeight: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-main), var(--font-kr), monospace",
              fontSize: "2rem",
              letterSpacing: 5,
              color: "var(--teal)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            planner
          </span>
          <ChevronRight
            width={22}
            height={22}
            onMouseEnter={() => setChevronHovered(true)}
            onMouseLeave={() => setChevronHovered(false)}
            style={{
              color: chevronHovered ? "#f5c842" : "#fff",
              flexShrink: 0,
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          />
          <span
            style={{
              fontSize: "2.1rem",
              letterSpacing: "4px",
              lineHeight: 1,
              fontFamily: "var(--font-main), var(--font-kr), monospace",
            }}
          >
            {targetDateStr}
            <span className="today-cursor-blink" style={{ color: "#fff" }}>
              _
            </span>
          </span>
        </div>
        <span
          style={{
            fontSize: "1.1rem",
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.25)",
            fontFamily: "var(--font-main), var(--font-kr), monospace",
            lineHeight: 1,
          }}
        >
          [{sysDateStr} // CUR-TIME={clockStr}]
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Compact progress tracker */}
      <HeaderProgressTracker todayNodes={todayNodes} doneSummary={doneSummary} />

      {/* Quick add input */}
      <div style={{ width: 297 }}>
        <QuickAddInput
          onCommit={async (title, arcId, projectId, groupIds) => {
            await createNode({
              title,
              node_type: "task",
              planned_start_at: today,
              estimated_duration_minutes: 30,
              arc_id: arcId,
              project_id: projectId,
              group_ids: groupIds,
            });
          }}
        />
      </div>

      {/* + button */}
      <button
        onClick={() => openTaskForm({ planned_start_at: today })}
        onMouseEnter={() => setAddTaskHovered(true)}
        onMouseLeave={() => setAddTaskHovered(false)}
        style={{
          background: addTaskHovered ? "#00dfc0" : "var(--teal)",
          border: "none",
          color: "#000",
          padding: "0.3rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
        }}
      >
        <Plus width={15} height={15} />
      </button>

      {/* Dice + Suggestions stacked */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", alignItems: "flex-end" }}>
        <DiceButton onClick={() => setDiceOpen(true)} />
        <SuggestionsToggle on={suggestionsOn} onToggle={() => setSuggestionsOn(!suggestionsOn)} />
      </div>

      {diceOpen && (
        <DiceModal
          pool={[...overdue, ...todayNodes]}
          onClose={() => setDiceOpen(false)}
          onReschedule={(id) => {
            rescheduleNode(id, today);
            setDiceOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Progress tracker ─────────────────────────────────────────────────────────

function HeaderProgressTracker({
  todayNodes,
  doneSummary,
}: {
  todayNodes: PlannerNode[];
  doneSummary: TodayDoneSummary;
}) {
  const totalCount = todayNodes.length + doneSummary.count;
  const pct = totalCount > 0 ? Math.round((doneSummary.count / totalCount) * 100) : 0;
  const barColor = "var(--teal)";

  if (totalCount === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110, maxWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <div
          style={{
            border: `1px solid ${pct > 0 ? barColor + "66" : "rgba(255,255,255,0.12)"}`,
            padding: "0 0.35rem",
            lineHeight: 1,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-main), var(--font-kr), monospace",
              fontSize: "1.3rem",
              lineHeight: 1,
              color: pct > 0 ? barColor : "rgba(255,255,255,0.2)",
              textShadow: pct > 0 ? `0 0 12px ${barColor}66` : "none",
            }}
          >
            {pct}%
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-main), var(--font-kr), monospace",
            fontSize: "1rem",
            letterSpacing: "1.5px",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--teal)" }}>{doneSummary.count}</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>/</span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>{totalCount}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 2, height: 8 }}>
        {Array.from({ length: totalCount }).map((_, i) => {
          const filled = i < doneSummary.count;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: "100%",
                background: filled ? barColor : "rgba(255,255,255,0.1)",
                boxShadow: filled ? `0 0 6px ${barColor}55` : "none",
                transition: "background 0.3s ease, box-shadow 0.3s ease",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Dice + Suggestions toggle buttons ─────────────────────────────────────────

const FATE_LABEL = "[ ROLL YOUR FATE ]";

function DiceButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const chars = FATE_LABEL.split("");
  const nonSpaceCount = chars.filter((c) => c !== " ").length;
  let nonSpaceIdx = 0;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        lineHeight: 1,
        fontSize: "1.05rem",
        letterSpacing: "3px",
        cursor: "pointer",
        fontFamily: "var(--font-main), var(--font-kr), monospace",
        color: "inherit",
      }}
    >
      {chars.map((ch, i) => {
        if (ch === " ") return <span key={i}>&nbsp;</span>;
        const idx = nonSpaceIdx++;
        const delay = `${((idx / nonSpaceCount) * 2.4).toFixed(2)}s`;
        return (
          <span
            key={i}
            style={{
              color: hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
              animation: hovered ? "none" : `fatePulse 2.4s ease-in-out ${delay} infinite both`,
              transition: "color 0.15s",
              display: "inline-block",
            }}
          >
            {ch}
          </span>
        );
      })}
    </button>
  );
}

function SuggestionsToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  const label = on ? "[ SUGGESTIONS: ON ]" : "[ SUGGESTIONS: OFF ]";
  const chars = label.split("");
  const nonSpaceCount = chars.filter((c) => c !== " ").length;
  let nsIdx = 0;

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        lineHeight: 1,
        fontSize: "1.05rem",
        letterSpacing: "2px",
        cursor: "pointer",
        fontFamily: "var(--font-main), var(--font-kr), monospace",
        color: "inherit",
      }}
    >
      {chars.map((ch, i) => {
        if (ch === " ") return <span key={i}>&nbsp;</span>;
        const delay = `${((nsIdx++ / nonSpaceCount) * 2.4).toFixed(2)}s`;
        return (
          <span
            key={i}
            style={{
              color: on ? "var(--teal)" : hovered ? "rgba(255,255,255,0.9)" : undefined,
              animation: hovered || on ? "none" : `suggPulse 2.4s ease-in-out ${delay} infinite both`,
              transition: "color 0.15s",
              display: "inline-block",
            }}
          >
            {ch}
          </span>
        );
      })}
    </button>
  );
}

// ─── Dice Taskmaster Modal ────────────────────────────────────────────────────

// Row-major 3×3 dot patterns for faces 1–6
const T = true,
  F = false;
const DOT_PATTERNS: boolean[][] = [
  [F, F, F, F, T, F, F, F, F], // 1
  [T, F, F, F, F, F, F, F, T], // 2
  [T, F, F, F, T, F, F, F, T], // 3
  [T, F, T, F, F, F, T, F, T], // 4
  [T, F, T, F, T, F, T, F, T], // 5
  [T, F, T, T, F, T, T, F, T], // 6
];

// Die: 44px, border + dots. CELL=8, GAP=4, PAD=6 → 6+8+4+8+4+8+6 = 44px
function DieFace({ idx }: { idx: number }) {
  const pattern = DOT_PATTERNS[idx] ?? DOT_PATTERNS[0];
  return (
    <div
      style={{
        width: 44,
        height: 44,
        boxSizing: "border-box",
        border: "2px solid rgba(192,132,252,0.6)",
        background: "#000",
        display: "grid",
        gridTemplateColumns: "repeat(3, 8px)",
        gridTemplateRows: "repeat(3, 8px)",
        gap: 2,
        padding: 6,
      }}
    >
      {pattern.map((on, i) => (
        <div key={i} style={{ background: on ? "#c084fc" : "transparent" }} />
      ))}
    </div>
  );
}

type DicePhase = "idle" | "rolling" | "fading" | "result";

function DiceModal({
  pool,
  onClose,
  onReschedule,
}: {
  pool: PlannerNode[];
  onClose: () => void;
  onReschedule: (id: string) => void;
}) {
  const [phase, setPhase] = useState<DicePhase>("idle");
  const [faceIdx, setFaceIdx] = useState(0);
  const [rollKey, setRollKey] = useState(0);
  const [picked, setPicked] = useState<PlannerNode | null>(null);
  const [closing, setClosing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mono: React.CSSProperties = {
    fontFamily: "var(--font-main), var(--font-kr), monospace",
  };

  const tasks = pool.filter((n) => n.node_type !== "event" && !n.is_completed);
  const purple = "#c084fc";
  const purpleDim = "rgba(192,132,252,0.4)";
  const dim = "rgba(255,255,255,0.22)";

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  // Auto-roll on open
  useEffect(() => {
    startRoll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 170);
  };

  const startRoll = () => {
    if (phase === "rolling" || phase === "fading") return;
    setPicked(null);
    setFaceIdx(Math.floor(Math.random() * 6));
    setRollKey((k) => k + 1);
    setPhase("rolling");

    // Cycle face during animation
    intervalRef.current = setInterval(() => {
      setFaceIdx(Math.floor(Math.random() * 6));
    }, 130);

    // Animation is 1.8s; after that fade die out, then show result
    setTimeout(() => {
      clearInterval(intervalRef.current!);
      const result = pickDiceNode(pool);
      setPicked(result);
      setPhase("fading");
      setTimeout(() => setPhase("result"), 320);
    }, 1800);
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 950,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={closing ? "dice-modal-out" : "dice-modal-in"}
        style={{
          background: "#000",
          border: "1px solid rgba(255,255,255,0.18)",
          padding: "2rem",
          width: 400,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
          <span style={{ ...mono, fontSize: "1.5rem", letterSpacing: "4px", color: purple, textTransform: "uppercase" }}>
            dice taskmaster
          </span>
          <span style={{ ...mono, fontSize: "1.2rem", letterSpacing: "2px", color: "rgba(255,255,255,0.65)" }}>
            {tasks.length} tasks
          </span>
        </div>

        {/* Tagline */}
        <div style={{ ...mono, fontSize: "1.35rem", color: "rgba(255,255,255,0.62)", lineHeight: 1.4, marginBottom: "1.25rem" }}>
          the gods have assembled your tasks.
          <br />
          roll — and <span style={{ color: "#ff3b3b" }}>OBEY</span>.
        </div>

        {/* Stage */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            height: 180,
            width: "100%",
            marginBottom: "1.25rem",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Die — enters on roll, fades out after */}
          {(phase === "rolling" || phase === "fading") && (
            <div
              key={rollKey}
              className={phase === "fading" ? "dice-fade-out" : "dice-rolling-entry"}
              style={{ position: "absolute", left: "calc(50% - 22px)", bottom: 8 }}
            >
              <DieFace idx={faceIdx} />
            </div>
          )}

          {/* Result — fades in after die exits */}
          {phase === "result" && (
            <div
              className="dice-result-in"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 1rem",
              }}
            >
              {picked ? (
                <>
                  <div style={{ ...mono, fontSize: "1.1rem", letterSpacing: "3px", color: "rgba(192,132,252,0.85)", marginBottom: "0.5rem" }}>
                    FATE HAS SPOKEN
                  </div>
                  <div style={{ ...mono, fontSize: "2rem", color: "#fff", textAlign: "center", lineHeight: 1.25 }}>
                    {picked.title}
                  </div>
                  {!picked.planned_start_at?.startsWith(toDateString(new Date())) && (
                    <button
                      onClick={() => onReschedule(picked.id)}
                      style={{
                        marginTop: "0.75rem",
                        background: "transparent",
                        border: `1px solid ${purpleDim}`,
                        color: purple,
                        padding: "0.2rem 0.8rem",
                        cursor: "pointer",
                        ...mono,
                        fontSize: "1rem",
                        letterSpacing: "2px",
                      }}
                    >
                      + today
                    </button>
                  )}
                </>
              ) : (
                <div style={{ ...mono, fontSize: "1rem", color: dim }}>no tasks in pool</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {tasks.length > 0 && (phase === "idle" || phase === "result") ? (
            <span onClick={startRoll} style={{ ...mono, fontSize: "1.2rem", letterSpacing: "2px", color: purple, cursor: "pointer" }}>
              {phase === "result" ? "[ re-roll ]" : "[ press to roll ]"}
            </span>
          ) : (
            <span />
          )}
          <span onClick={handleClose} style={{ ...mono, fontSize: "1rem", letterSpacing: "2px", color: dim, cursor: "pointer" }}>
            [ close ]
          </span>
        </div>
      </div>
    </div>
  );
}
