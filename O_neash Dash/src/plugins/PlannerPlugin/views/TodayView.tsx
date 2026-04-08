import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckboxOn,
  PenSquare,
  SkullSharp,
  Frown,
  HumanArmsUp,
  ChevronDown,
  Tea,
  Forward,
  Undo,
  SpeedSlow,
  PartyPopper,
  Loader,
  AlarmClock,
} from "pixelarticons/react";
import { Checkbox } from "pixelarticons/react/Checkbox";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { Switch } from "pixelarticons/react/Switch";
import { Plus } from "pixelarticons/react/Plus";
import { PixelFrog } from "../components/PixelFrog";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import {
  scoreSuggestion,
  isSameDay,
  toDateString,
  computePressureScore,
  pickFrogNode,
  pickDiceNode,
  type PressureResult,
} from "../lib/logicEngine";
import {
  loadTodayDoneSummary,
  loadArcNodeCounts,
  loadTodayCompletedNodes,
  loadFrogsDoneToday,
  loadEventNodesForWeek,
  setNodeFrogPinned,
  type TodayDoneSummary,
  type ArcNodeCount,
} from "../lib/plannerDb";
import DotNode from "../components/DotNode";
import type { PlannerNode, Arc, Project } from "../types";

const SUGGESTION_LIMIT = 3;

export default function TodayView() {
  const {
    nodes,
    arcs,
    projects,
    capacity,
    subTasksByNode,
    completeNode,
    uncompleteNode,
    deleteNode,
    rescheduleNode,
    loadAll,
    loadSubTasks,
    toggleSubTask,
  } = usePlannerStore();
  const { openTaskForm, openTaskFormEdit } = useViewStore();
  const [now, setNow] = useState(() => new Date());
  const [overdueCollapsed, setOverdueCollapsed] = useState(false);
  const [doneSummary, setDoneSummary] = useState<TodayDoneSummary>({
    count: 0,
    effortMinutes: 0,
  });
  const [todayDone, setTodayDone] = useState<import("../types").PlannerNode[]>(
    [],
  );
  const [frogsDone, setFrogsDone] = useState(0);
  const [diceOpen, setDiceOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'analytics' | 'calendar'>('analytics');
  const [addTaskHovered, setAddTaskHovered] = useState(false);
  const [suggestionsOn, setSuggestionsOn] = useState(true);
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
    let lastDate = toDateString(new Date());
    const id = setInterval(() => {
      const next = new Date();
      setNow(next);
      const nextDate = toDateString(next);
      if (nextDate !== lastDate) {
        lastDate = nextDate;
        loadAll(); // rehydrate nodes so is_overdue/is_missed_schedule recompute with new date
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Reload analytics whenever nodes change (completions trigger store refresh)
  useEffect(() => {
    loadTodayDoneSummary()
      .then(setDoneSummary)
      .catch(() => {});
    loadTodayCompletedNodes()
      .then(setTodayDone)
      .catch(() => {});
    loadFrogsDoneToday()
      .then(setFrogsDone)
      .catch(() => {});
  }, [nodes]);

  const pressure = useMemo(
    () => computePressureScore(nodes, capacity?.daily_minutes ?? 480, now),
    [nodes, capacity, now],
  );

  // Auto-load subtasks for any today/overdue node that has some but hasn't been fetched yet
  useEffect(() => {
    nodes
      .filter((n) => (n.sub_total ?? 0) > 0 && !subTasksByNode[n.id])
      .forEach((n) => loadSubTasks(n.id));
  }, [nodes, subTasksByNode, loadSubTasks]);

  const today = toDateString(now);
  const weekday = now
    .toLocaleDateString("en-US", { weekday: "long" })
    .toUpperCase();
  const month = now
    .toLocaleDateString("en-US", { month: "long" })
    .toUpperCase();
  const day = now.getDate();
  const sysDateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const targetDateStr = `${weekday}, ${month} ${day}`;

  type DisplayChar = { char: string; color: string | null };
  const [displayChars, setDisplayChars] = useState<DisplayChar[]>(() =>
    targetDateStr.split("").map((ch) => ({ char: ch, color: null })),
  );
  const [chevronHovered, setChevronHovered] = useState(false);
  const scrambleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayChars(
      targetDateStr.split("").map((ch) => ({ char: ch, color: null })),
    );
  }, [targetDateStr]);

  const runScramble = useCallback(() => {
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!%";
    const RGB = ["#ff3b3b", "#4ade80", "#64c8ff"];
    let frame = 0;
    const FRAMES = 18;
    if (scrambleTimer.current) clearInterval(scrambleTimer.current);
    scrambleTimer.current = setInterval(() => {
      if (frame >= FRAMES) {
        setDisplayChars(
          targetDateStr.split("").map((ch) => ({ char: ch, color: null })),
        );
        if (scrambleTimer.current) clearInterval(scrambleTimer.current);
        return;
      }
      const resolved = Math.floor((frame / FRAMES) * targetDateStr.length);
      setDisplayChars(
        targetDateStr.split("").map((ch, i) => {
          if (ch === " " || ch === ",") return { char: ch, color: null };
          if (i < resolved) return { char: ch, color: null };
          return {
            char: CHARS[Math.floor(Math.random() * CHARS.length)],
            color: RGB[Math.floor(Math.random() * 3)],
          };
        }),
      );
      frame++;
    }, 38);
  }, [targetDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const outer = setInterval(runScramble, 10000);
    return () => {
      clearInterval(outer);
      if (scrambleTimer.current) clearInterval(scrambleTimer.current);
    };
  }, [runScramble]);

  const tomorrow = toDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );

  const overdue = useMemo(
    () =>
      nodes
        .filter(
          (n) => (n.is_overdue || n.is_missed_schedule) && !n.is_completed,
        )
        .sort((a, b) =>
          (a.due_at ?? a.planned_start_at ?? "").localeCompare(
            b.due_at ?? b.planned_start_at ?? "",
          ),
        ),
    [nodes],
  );

  const todayNodes = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.node_type !== "event" &&
          !n.is_overdue &&
          !n.is_missed_schedule &&
          !n.is_completed &&
          (isSameDay(n.planned_start_at, now) || isSameDay(n.due_at, now)),
      ),
    [nodes, now],
  );

  const todayEvents = useMemo(
    () =>
      nodes
        .filter(
          (n) =>
            n.node_type === "event" &&
            !n.is_completed &&
            isSameDay(n.planned_start_at, now),
        )
        .sort((a, b) => {
          const ta = a.planned_start_at ?? "";
          const tb = b.planned_start_at ?? "";
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        }),
    [nodes, now],
  );

  const frogNode = useMemo(() => pickFrogNode(todayNodes, today), [todayNodes, today]);

  // When completing the current frog node, pin it before completing so we can count it
  const handleCompleteNode = useCallback(
    async (node: PlannerNode) => {
      if (frogNode?.id === node.id && !node.is_frog_pinned) {
        await setNodeFrogPinned(node.id, true);
      }
      completeNode(node.id);
    },
    [frogNode, completeNode],
  );

  const suggestions = useMemo(() => {
    const candidates = nodes.filter(
      (n) =>
        n.node_type !== "event" &&
        !n.is_routine &&
        !n.is_completed &&
        !n.is_overdue &&
        !n.is_missed_schedule &&
        !isSameDay(n.planned_start_at, now) &&
        !isSameDay(n.due_at, now),
    );
    return candidates
      .map((n) => ({ node: n, score: scoreSuggestion(n, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, SUGGESTION_LIMIT)
      .map((s) => s.node);
  }, [nodes, now]);

  const cardProps = (node: PlannerNode) => ({
    node,
    now,
    isFrog: frogNode?.id === node.id,
    subTasks: subTasksByNode[node.id],
    onToggleSubTask: (subId: string, current: boolean) =>
      toggleSubTask(subId, node.id, current),
    onComplete: () => handleCompleteNode(node),
    onUncomplete: () => uncompleteNode(node.id),
    onDelete: () => deleteNode(node.id),
    onEdit: () => openTaskFormEdit(node),
  });

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          padding: "1.25rem 2rem 1rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Date + SYS_LOG block */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              lineHeight: 1,
            }}
          >
            <ChevronRight
              width={22}
              height={22}
              onClick={runScramble}
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
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              }}
            >
              {displayChars.map((c, i) => (
                <span key={i} style={{ color: c.color ?? "#fff" }}>
                  {c.char}
                </span>
              ))}
              <span className="today-cursor-blink" style={{ color: "#fff" }}>
                _
              </span>
            </span>
          </div>
          <span
            style={{
              fontSize: "1.1rem",
              letterSpacing: "2px",
              color: "#64c8ff",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              paddingLeft: "1.6rem",
            }}
          >
            [SYS_LOG --{sysDateStr} // CUR-TIME={clockStr}]
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Dice Taskmaster button */}
        <DiceButton onClick={() => setDiceOpen(true)} />

        {/* Suggestions toggle */}
        <SuggestionsToggle
          on={suggestionsOn}
          onToggle={() => setSuggestionsOn((v) => !v)}
        />

        {/* + task button */}
        <button
          onClick={() => openTaskForm({ planned_start_at: today })}
          onMouseEnter={() => setAddTaskHovered(true)}
          onMouseLeave={() => setAddTaskHovered(false)}
          style={{
            background: addTaskHovered
              ? "rgba(245,200,66,0.08)"
              : "transparent",
            border: `1px solid ${addTaskHovered ? "rgba(245,200,66,0.9)" : "rgba(245,200,66,0.5)"}`,
            color: addTaskHovered ? "#ffe566" : "#f5c842",
            padding: "0.3rem 1.1rem",
            fontSize: "0.95rem",
            letterSpacing: "2px",
            cursor: "pointer",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "background 0.15s, border-color 0.15s, color 0.15s",
          }}
        >
          <Plus width={15} height={15} /> task
        </button>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          gap: "1.5rem",
          padding: "1.25rem 1.5rem 1.25rem 0",
        }}
      >
        {/* Left: task column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          className="today-task-col"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.75rem 1.5rem 1.75rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "2.25rem",
          }}
        >
          {/* OVERDUE */}
          {overdue.length > 0 && (
            <section>
              <div
                onClick={() => setOverdueCollapsed((c) => !c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  marginBottom: "0.5rem",
                  color: "#ff3b3b",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.9,
                  }}
                >
                  <Frown size={20} />
                </span>
                <span
                  style={{
                    fontSize: "1.45rem",
                    letterSpacing: "4px",
                    textTransform: "uppercase",
                    lineHeight: 1,
                    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                  }}
                >
                  overdue · {overdue.length}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "#ff3b3b",
                    opacity: 0.4,
                  }}
                />
                <ChevronDown
                  size={16}
                  style={{
                    transition: "transform 0.18s",
                    transform: overdueCollapsed ? "rotate(-90deg)" : "none",
                    opacity: 0.5,
                  }}
                />
              </div>
              {!overdueCollapsed && (
                <CardGrid>
                  {overdue.map((node) => (
                    <OverdueCard
                      key={node.id}
                      {...cardProps(node)}
                      now={now}
                      rescheduleToday={
                        !node.due_at
                          ? () => rescheduleNode(node.id, today)
                          : undefined
                      }
                    />
                  ))}
                </CardGrid>
              )}
            </section>
          )}

          {/* EVENTS */}
          {todayEvents.length > 0 && (
            <section style={{ marginBottom: "0.5rem" }}>
              <SectionLabel
                icon={<AlarmClock size={20} />}
                label={`events · ${todayEvents.length}`}
                color="rgba(192,132,252,1)"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {todayEvents.map((node) => (
                  <EventRow
                    key={node.id}
                    node={node}
                    arcs={arcs}
                    projects={projects}
                    onComplete={() => handleCompleteNode(node)}
                    onEdit={() => openTaskFormEdit(node)}
                    onDelete={() => deleteNode(node.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* TODAY */}
          <section>
            <SectionLabel
              icon={<HumanArmsUp size={20} />}
              label={`today · ${todayNodes.length}`}
              color="#00c4a7"
            />
            {todayNodes.length === 0 &&
            !(suggestionsOn && suggestions.length > 0) ? (
              <div
                style={{
                  padding: "0.75rem 0",
                  fontSize: "1rem",
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.15)",
                }}
              >
                nothing scheduled
              </div>
            ) : (
              <CardGrid>
                {todayNodes.map((node) => (
                  <TaskCard
                    key={node.id}
                    {...cardProps(node)}
                    rescheduleTomorrow={() => rescheduleNode(node.id, tomorrow)}
                  />
                ))}
                {suggestionsOn &&
                  suggestions.map((node) => (
                    <SuggestionCard
                      key={`sug-${node.id}`}
                      {...cardProps(node)}
                      rescheduleToday={() => rescheduleNode(node.id, today)}
                    />
                  ))}
              </CardGrid>
            )}

          </section>

          {/* Empty state */}
          {overdue.length === 0 &&
            todayNodes.length === 0 &&
            todayEvents.length === 0 &&
            todayDone.length === 0 &&
            suggestions.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  gap: "0.5rem",
                  paddingTop: "6rem",
                }}
              >
                <div
                  style={{
                    fontSize: "2rem",
                    letterSpacing: "5px",
                    color: "rgba(255,255,255,0.08)",
                  }}
                >
                  nothing today
                </div>
                <div
                  style={{
                    fontSize: "0.9rem",
                    letterSpacing: "2px",
                    color: "rgba(255,255,255,0.07)",
                  }}
                >
                  press + task to add something
                </div>
              </div>
            )}
        </div>

        {/* Done strip — fixed to bottom of left column */}
        {todayDone.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.4rem",
            padding: "0.5rem 1.5rem", borderTop: "1px solid rgba(255,255,255,0.12)",
            flexShrink: 0, background: "#000", zIndex: 10,
          }}>
            <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: "1rem", letterSpacing: "2px", color: "rgba(255,255,255,0.45)", flexShrink: 0, display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <CheckboxOn size={13} /> {todayDone.length} done
            </span>
            <div style={{ width: 10, height: 1, background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />
            {todayDone.map((node) => (
              <DoneChip key={node.id} node={node} onUncomplete={() => uncompleteNode(node.id)} />
            ))}
          </div>
        )}
        </div>{/* closes left outer wrapper */}

        {/* Right: analytics / calendar panel */}
        <div
          style={{
            width: "22%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Mode toggle header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.5rem 1rem 0.4rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'VT323', monospace",
              fontSize: "0.95rem",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.45)",
              textTransform: "uppercase",
            }}>
              {panelMode === 'analytics' ? 'analytics' : 'events'}
            </span>
            <button
              onClick={() => setPanelMode(m => m === 'analytics' ? 'calendar' : 'analytics')}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 0, display: "flex", alignItems: "center" }}
            >
              <Switch width={16} height={16} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", overflowY: "auto",
              opacity: panelMode === 'analytics' ? 1 : 0,
              transform: panelMode === 'analytics' ? 'translateX(0)' : 'translateX(-12px)',
              transition: "opacity 0.18s ease, transform 0.18s ease",
              pointerEvents: panelMode === 'analytics' ? 'auto' : 'none',
            }}>
              <TodayEffortPanel todayNodes={todayNodes} doneSummary={doneSummary} />
              <PressureGaugePanel pressure={pressure} />
              <EatTheFrogPanel frogsDone={frogsDone} />
              <OngoingArcsPanel />
            </div>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              opacity: panelMode === 'calendar' ? 1 : 0,
              transform: panelMode === 'calendar' ? 'translateX(0)' : 'translateX(12px)',
              transition: "opacity 0.18s ease, transform 0.18s ease",
              pointerEvents: panelMode === 'calendar' ? 'auto' : 'none',
            }}>
              <EventCalendarPanel arcs={arcs} projects={projects} nodes={nodes} />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
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

// ─── Card grid ────────────────────────────────────────────────────────────────

function CardGrid({ children }: { children: React.ReactNode }) {
  const NUM_COLS = 3;
  const items = React.Children.toArray(children);
  const n = items.length;
  const [colOf, setColOf] = useState<number[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const heights = Array.from(
      { length: n },
      (_, i) => refs.current[i]?.offsetHeight ?? 0,
    );
    if (n > 0 && heights.some((h) => h === 0)) return;
    const colHeights = new Array(NUM_COLS).fill(0);
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = colHeights.indexOf(Math.min(...colHeights));
      next.push(c);
      colHeights[c] += heights[i];
    }
    setColOf((prev) =>
      prev.length === next.length && prev.every((v, i) => v === next[i])
        ? prev
        : next,
    );
  }, [n]);

  // Fall back to round-robin until heights are measured
  const assignment =
    colOf.length === n ? colOf : items.map((_, i) => i % NUM_COLS);
  const cols: number[][] = Array.from({ length: NUM_COLS }, () => []);
  assignment.forEach((c, i) => cols[c].push(i));

  return (
    <div
      style={{
        display: "flex",
        gap: "0.65rem",
        marginTop: "0.55rem",
        alignItems: "flex-start",
      }}
    >
      {cols.map((col, ci) => (
        <div key={ci} style={{ flex: 1, minWidth: 0 }}>
          {col.map((i) => (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
            >
              {items[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

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
        padding: "0.3rem 0",
        fontSize: "1.05rem",
        letterSpacing: "3px",
        cursor: "pointer",
        fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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
              color: hovered ? "#ff3b3b" : undefined,
              animation: hovered
                ? "none"
                : `fatePulse 2.4s ease-in-out ${delay} infinite both`,
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

function SuggestionsToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
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
        padding: "0.3rem 0",
        fontSize: "1.05rem",
        letterSpacing: "2px",
        cursor: "pointer",
        fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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
              color: hovered || on ? "#64c8ff" : undefined,
              animation:
                hovered || on
                  ? "none"
                  : `suggPulse 2.4s ease-in-out ${delay} infinite both`,
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

// ─── EventRow ─────────────────────────────────────────────────────────────────
function EventRow({
  node, arcs, projects, onComplete, onEdit, onDelete,
}: {
  node: PlannerNode;
  arcs: Arc[];
  projects: Project[];
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);

  const arc  = node.arc_id     ? arcs.find(a => a.id === node.arc_id)         : null;
  const proj = node.project_id ? projects.find(p => p.id === node.project_id) : null;

  const timeRange = (() => {
    if (!node.planned_start_at || node.planned_start_at.length <= 10) return null;
    const start = node.planned_start_at.slice(11, 16);
    if (!(node.estimated_duration_minutes ?? 0)) return `${start} ~ --:--`;
    const [h, m] = start.split(":").map(Number);
    const endTotal = h * 60 + m + node.estimated_duration_minutes!;
    const end = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
    return `${start} ~ ${end}`;
  })();

  const VT = "'VT323', 'HBIOS-SYS', monospace";
  const PURPLE = "rgba(192,132,252,1)";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.65rem",
        padding: "0.3rem 0.5rem",
        background: hov ? "rgba(192,132,252,0.06)" : "transparent",
        border: `1px solid ${hov ? "rgba(192,132,252,0.18)" : "rgba(192,132,252,0.08)"}`,
        transition: "background 0.1s, border-color 0.1s",
        fontFamily: VT,
        fontSize: "1.05rem",
        letterSpacing: "1px",
        minHeight: "2rem",
      }}
    >
      {/* Time — black on white chip */}
      {timeRange && (
        <span style={{
          background: "rgba(255,255,255,0.75)", color: "#000",
          padding: "0 6px", lineHeight: 1.5,
          flexShrink: 0, fontSize: "0.95rem", letterSpacing: "0.5px",
        }}>
          {timeRange}
        </span>
      )}

      {/* Name */}
      <span style={{ color: "#fff", flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.title}
      </span>

      {/* Arc */}
      {arc && (
        <span style={{
          color: arc.color_hex, flexShrink: 0,
          fontSize: "0.82rem", letterSpacing: "1.5px", opacity: 0.85,
          border: `1px solid ${arc.color_hex}44`, padding: "0 5px", lineHeight: 1.5,
        }}>
          {arc.name}
        </span>
      )}

      {/* Project */}
      {proj && (
        <span style={{
          color: "rgba(255,255,255,0.45)", flexShrink: 0,
          fontSize: "0.82rem", letterSpacing: "1.5px",
        }}>
          {proj.name}
        </span>
      )}

      {/* Groups */}
      {node.groups && node.groups.length > 0 && (
        <span style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          {node.groups.map(g => (
            <span key={g.id} style={{
              fontSize: "0.72rem", letterSpacing: "1px",
              color: g.color_hex, border: `1px solid ${g.color_hex}55`,
              padding: "0 4px", lineHeight: 1.5,
            }}>
              {g.name}
            </span>
          ))}
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Actions */}
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
        <IconAction icon={<CheckboxOn size={14} />} color="#4ade80"             title="complete" onClick={onComplete} />
        <IconAction icon={<PenSquare   size={14} />} color="rgba(255,255,255,0.7)" title="edit"     onClick={onEdit}     />
        <IconAction icon={<SkullSharp  size={14} />} color="#ef4444"               title="delete"   onClick={onDelete}   />
      </span>
    </div>
  );
}

function IconAction({ icon, color, title, onClick }: { icon: React.ReactNode; color: string; title: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset", cursor: "pointer",
        color: hov ? color : "rgba(255,255,255,0.28)",
        display: "flex", alignItems: "center",
        transition: "color 0.1s",
      }}
    >
      {icon}
    </button>
  );
}

function SectionLabel({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.65rem",
        marginBottom: "0.5rem",
        color,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", opacity: 0.9 }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: "1.45rem",
          letterSpacing: "4px",
          textTransform: "uppercase",
          lineHeight: 1,
          fontFamily: "'VT323', 'HBIOS-SYS', monospace",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: color, opacity: 0.4 }} />
    </div>
  );
}

// ─── Mini card (shared by OverdueCard + SuggestionCard) ───────────────────────

function MiniCard({
  node,
  isFrog,
  onComplete,
  onDelete,
  onEdit,
  badge,
  primaryAction,
  suggestion,
}: {
  node: PlannerNode;
  isFrog?: boolean;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit: () => void;
  badge: { label: string; color: string };
  primaryAction?: { label: string; onClick: () => void };
  suggestion?: boolean;
}) {
  const { arcs, projects } = usePlannerStore();
  const [hovered, setHovered] = useState(false);

  const arc = node.arc_id ? arcs.find((a) => a.id === node.arc_id) : null;
  const proj = node.project_id
    ? projects.find((p) => p.id === node.project_id)
    : null;
  const isEvent = node.node_type === "event";
  const eventStart =
    isEvent && node.planned_start_at && node.planned_start_at.length > 10
      ? node.planned_start_at.slice(11, 16)
      : null;
  const eventEnd = (() => {
    if (!eventStart || !(node.estimated_duration_minutes ?? 0)) return null;
    const [hStr, mStr] = eventStart.split(":");
    const totalMins =
      Number(hStr) * 60 + Number(mStr) + node.estimated_duration_minutes!;
    return `${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
  })();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        padding: "1.35rem 0.75rem 2.75rem",
        background: hovered
          ? "rgba(255,255,255,0.08)"
          : suggestion
            ? "rgba(255,255,255,0.03)"
            : "rgba(255,255,255,0.06)",
        border: suggestion
          ? `1px dashed ${hovered ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)"}`
          : `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
        opacity: suggestion && !hovered ? 0.72 : 1,
        transition: "background 0.12s, border-color 0.12s, opacity 0.12s",
        breakInside: "avoid",
        marginBottom: "0.65rem",
      }}
    >
      {/* Suggestion label */}
      {suggestion && (
        <span
          style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: "0.72rem",
            letterSpacing: "3px",
            color: "rgba(255,255,255,0.25)",
          }}
        >
          SUGGESTION
        </span>
      )}

      {/* Event header */}
      {isEvent && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "0.72rem",
              letterSpacing: "3px",
              color: "rgba(192,132,252,0.75)",
              border: "1px solid rgba(192,132,252,0.3)",
              padding: "0.02rem 0.4rem",
              lineHeight: 1.4,
            }}
          >
            EVENT
          </span>
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "0.95rem",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            {eventStart
              ? `${eventStart}${eventEnd ? ` → ${eventEnd}` : ""}`
              : "all day"}
          </span>
        </div>
      )}

      {/* Frog badge */}
      {isFrog && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: "0.15rem 0.35rem",
            alignSelf: "flex-start",
          }}
        >
          <PixelFrog px={2} />
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "0.78rem",
              letterSpacing: "2px",
              color: "#4ade80",
              lineHeight: 1.4,
            }}
          >
            FROG
          </span>
        </span>
      )}

      {/* Title + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            fontSize: "1.35rem",
            lineHeight: 1.15,
            letterSpacing: "0.5px",
            color: isEvent ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            wordBreak: "break-word",
            flex: 1,
          }}
        >
          {node.title}
        </span>
        {!isEvent && (
          <span
            style={{
              fontSize: "0.95rem",
              letterSpacing: "1px",
              flexShrink: 0,
              color: `${badge.color}88`,
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              paddingTop: "0.1rem",
            }}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Arc / project */}
      {(arc || proj) && (
        <div
          style={{
            fontSize: "0.82rem",
            letterSpacing: "0.3px",
            color: "rgba(255,255,255,0.25)",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          }}
        >
          {"> "}
          {arc && <span style={{ color: arc.color_hex }}>{arc.name}</span>}
          {arc && proj && (
            <span style={{ color: "rgba(255,255,255,0.2)" }}>{" > "}</span>
          )}
          {proj && (
            <span style={{ color: arc?.color_hex ?? "#00c4a7" }}>
              {proj.name}
            </span>
          )}
        </div>
      )}

      {/* Actions — absolute bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 6,
          display: "flex",
          alignItems: "center",
          gap: "0.1rem",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.55)",
              padding: "0.05rem 0.5rem",
              fontSize: "0.9rem",
              letterSpacing: "1px",
              cursor: "pointer",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              marginRight: "0.15rem",
            }}
          >
            {primaryAction.label}
          </button>
        )}
        {onComplete && (() => {
          const subTotal = node.sub_total ?? 0;
          const subDone  = node.sub_done  ?? 0;
          const blocked  = subTotal > 0 && subDone < subTotal;
          return (
            <button
              onClick={blocked ? undefined : onComplete}
              title={blocked ? `finish subtasks first (${subDone}/${subTotal})` : "done"}
              style={{ ...actionBtn("#4ade80"), opacity: blocked ? 0.35 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}
            >
              <CheckboxOn size={11} />
            </button>
          );
        })()}
        <button
          onClick={onEdit}
          title="edit"
          style={actionBtn("rgba(255,255,255,0.7)")}
        >
          <PenSquare size={11} />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="delete"
            style={actionBtn("#ef4444")}
          >
            <SkullSharp size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function DoneChip({
  node,
  onUncomplete,
}: {
  node: PlannerNode;
  onUncomplete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.15rem 0.5rem 0.15rem 0.6rem",
        background: hovered
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.14)",
        transition: "background 0.12s",
        maxWidth: 220,
      }}
    >
      <span
        style={{
          ...mono,
          fontSize: "1rem",
          letterSpacing: "0.5px",
          color: "rgba(255,255,255,0.5)",
          textDecoration: "line-through",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {node.title}
      </span>
      <button
        onClick={onUncomplete}
        title="undo"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: hovered ? "#f5c842" : "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          transition: "color 0.12s",
        }}
      >
        <Undo size={12} />
      </button>
    </div>
  );
}

function OverdueCard({
  node,
  now,
  isFrog,
  onComplete,
  onDelete,
  onEdit,
  rescheduleToday,
}: {
  node: PlannerNode;
  now: Date;
  isFrog?: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  rescheduleToday?: () => void;
}) {
  const badge = (() => {
    if (node.is_missed_schedule) return { label: "missed", color: "#f5c842" };
    const days = node.due_at
      ? Math.round(
          (now.getTime() - new Date(node.due_at + "T12:00:00").getTime()) /
            86400000,
        )
      : null;
    return { label: days ? `${days}d ago` : "overdue", color: "#ff3b3b" };
  })();
  const primaryAction =
    !node.due_at && rescheduleToday
      ? { label: "to today", onClick: rescheduleToday }
      : undefined;
  return (
    <MiniCard
      node={node}
      isFrog={isFrog}
      onComplete={onComplete}
      onDelete={onDelete}
      onEdit={onEdit}
      badge={badge}
      primaryAction={primaryAction}
    />
  );
}

function SuggestionCard({
  node,
  now,
  onEdit,
  rescheduleToday,
}: {
  node: PlannerNode;
  now: Date;
  onEdit: () => void;
  rescheduleToday: () => void;
}) {
  const badge = (() => {
    if (!node.due_at) return { label: "", color: "rgba(255,255,255,0.3)" };
    const daysUntil = Math.round(
      (new Date(node.due_at + "T12:00:00").getTime() - now.getTime()) /
        86400000,
    );
    if (daysUntil <= 1) return { label: "due soon", color: "#ff6b35" };
    if (daysUntil <= 3)
      return { label: `due in ${daysUntil}d`, color: "#f5a623" };
    return { label: `due in ${daysUntil}d`, color: "rgba(255,255,255,0.3)" };
  })();
  return (
    <MiniCard
      node={node}
      onEdit={onEdit}
      badge={badge}
      primaryAction={{ label: "+ today", onClick: rescheduleToday }}
      suggestion
    />
  );
}

// ─── Task card (today section) ────────────────────────────────────────────────

function TaskCard({
  node,
  now,
  isFrog,
  subTasks,
  onToggleSubTask,
  onComplete,
  onUncomplete,
  onDelete,
  onEdit,
  rescheduleTomorrow,
  isDone,
}: {
  node: PlannerNode;
  now: Date;
  isFrog?: boolean;
  subTasks?: import("../types").SubTask[];
  onToggleSubTask?: (subId: string, current: boolean) => void;
  onComplete: () => void;
  onUncomplete?: () => void;
  onDelete: () => void;
  onEdit: () => void;
  rescheduleTomorrow?: () => void;
  isDone?: boolean;
}) {
  const { arcs, projects } = usePlannerStore();
  const [hovered, setHovered] = useState(false);
  const [hoveredSubId, setHoveredSubId] = useState<string | null>(null);
  const [subAnchor, setSubAnchor] = useState({ x: 0, y: 0 });

  const arc = node.arc_id ? arcs.find((a) => a.id === node.arc_id) : null;
  const proj = node.project_id
    ? projects.find((p) => p.id === node.project_id)
    : null;
  const isEvent = node.node_type === "event";
  const isAssignment = !isEvent && !!node.due_at;
  const namedGroups = (node.groups ?? []).filter((g) => !g.is_ungrouped);

  const eventStart =
    isEvent && node.planned_start_at && node.planned_start_at.length > 10
      ? node.planned_start_at.slice(11, 16)
      : null;
  const eventEnd = (() => {
    if (!eventStart || !(node.estimated_duration_minutes ?? 0)) return null;
    const [hStr, mStr] = eventStart.split(":");
    const totalMins =
      Number(hStr) * 60 + Number(mStr) + node.estimated_duration_minutes!;
    return `${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
  })();

  // D-XX: days until planned_start_at (D-0 = today)
  const dCountdown = (() => {
    if (!node.planned_start_at) return null;
    const ref = new Date(node.planned_start_at.slice(0, 10) + "T12:00:00");
    return Math.round((ref.getTime() - now.getTime()) / 86400000);
  })();

  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };

  // ── Mini card for completed tasks ──
  if (isDone)
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          padding: "0.25rem 0.7rem",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          minHeight: 80,
          gap: "0.5rem",
          breakInside: "avoid",
          marginBottom: "0.65rem",
        }}
      >
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1="0"
            x2="100%"
            y2="100%"
            stroke="rgba(255,59,59,0.3)"
            strokeWidth="1"
          />
          <line
            x1="100%"
            y1="0"
            x2="0"
            y2="100%"
            stroke="rgba(255,59,59,0.3)"
            strokeWidth="1"
          />
        </svg>
        <span
          style={{
            ...mono,
            fontSize: "0.95rem",
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.3)",
            textDecoration: "line-through",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.title}
        </span>
        <button
          onClick={onUncomplete}
          title="undo"
          style={{
            background: "transparent",
            border: "none",
            color: hovered ? "#f5c842" : "rgba(245,200,66,0.25)",
            cursor: "pointer",
            padding: "0.15rem",
            display: "flex",
            alignItems: "center",
            transition: "color 0.12s",
            flexShrink: 0,
          }}
        >
          <Undo size={16} />
        </button>
      </div>
    );

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered
          ? "rgba(255,255,255,0.1)"
          : "rgba(255,255,255,0.06)",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}`,
        transition: "background 0.12s, border-color 0.12s",
        breakInside: "avoid",
        marginBottom: "0.65rem",
      }}
    >
      {/* ── Content ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "1.2rem 0.9rem 2.5rem",
          gap: "0.55rem",
        }}
      >
        {/* ── Top bar: type info (left) | dot centered | D-XX (right) ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          {/* Left: type label + sub-info — fixed height = 2 lines */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.1,
              height: "2rem",
              justifyContent: "center",
            }}
          >
            {isEvent ? (
              <>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.78rem",
                    letterSpacing: "3px",
                    color: "#803d99",
                  }}
                >
                  EVENT
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "1rem",
                    letterSpacing: "1.5px",
                    color: "#b784ce",
                  }}
                >
                  {eventStart
                    ? `${eventStart}${eventEnd ? `~${eventEnd}` : ""}`
                    : "all day"}
                </span>
              </>
            ) : isAssignment ? (
              <>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.78rem",
                    letterSpacing: "3px",
                    color: "#b79c1a",
                  }}
                >
                  ASSIGNMENT
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.9rem",
                    letterSpacing: "1.5px",
                    color: "#d1cbb4",
                  }}
                >
                  {node.is_overdue
                    ? "OVERDUE"
                    : node.due_at
                      ? `DUE IN ${Math.max(0, Math.round((new Date(node.due_at + "T12:00:00").getTime() - now.getTime()) / 86400000))}d`
                      : ""}
                </span>
              </>
            ) : (
              <span
                style={{
                  ...mono,
                  fontSize: "0.78rem",
                  letterSpacing: "3px",
                  color: "#2c99bf",
                }}
              >
                TASK
              </span>
            )}
          </div>

          {/* Center: dot (truly centered), frog overlaid to its right */}
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <DotNode
              node={node}
              scale={1.6}
              noPopups
              onComplete={onComplete}
              onDelete={onDelete}
              onEdit={onEdit}
            />
            {isFrog && (
              <div
                style={{
                  position: "absolute",
                  left: "100%",
                  top: "50%",
                  paddingLeft: 12,
                  animation: "frogWiggle 1.8s ease-in-out infinite",
                }}
              >
                <PixelFrog px={2} />
              </div>
            )}
          </div>

          {/* Right: D-XX (hidden when D-0 — redundant in today view) */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {dCountdown !== null && dCountdown !== 0 && (
              <span
                style={{
                  ...mono,
                  fontSize: "1.1rem",
                  letterSpacing: "1.5px",
                  color: "#a03333",
                }}
              >
                D-{dCountdown < 0 ? `+${Math.abs(dCountdown)}` : dCountdown}
              </span>
            )}
          </div>
        </div>

        {/* ── Title — max 2 lines ── */}
        <div
          style={{
            ...mono,
            fontSize: "1.65rem",
            lineHeight: 1.15,
            letterSpacing: "0.5px",
            color: isEvent ? "rgba(255,255,255,0.5)" : "#fff",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            padding: "0.5rem 0",
          }}
        >
          {node.title}
        </div>

        {/* ── Arc / project ── */}
        {(arc || proj) && (
          <div
            style={{
              ...mono,
              fontSize: "0.88rem",
              letterSpacing: "0.3px",
              color: "rgba(255,255,255,0.25)",
            }}
          >
            {"> "}
            {arc && <span style={{ color: arc.color_hex }}>{arc.name}</span>}
            {arc && proj && (
              <span style={{ color: "rgba(255,255,255,0.2)" }}>{" > "}</span>
            )}
            {proj && (
              <span style={{ color: arc?.color_hex ?? "#00c4a7" }}>
                {proj.name}
              </span>
            )}
          </div>
        )}

        {/* ── Group badges ── */}
        {namedGroups.length > 0 && (
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {namedGroups.map((g) => (
              <span
                key={g.id}
                style={{
                  ...mono,
                  fontSize: "0.82rem",
                  letterSpacing: "0.5px",
                  padding: "0.1rem 0.45rem",
                  background: g.color_hex,
                  color: "#fff",
                }}
              >
                {g.name}
              </span>
            ))}
          </div>
        )}

        {/* ── Subtask icon row — bottom of stack ── */}
        {!isEvent && (subTasks?.length ?? 0) > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.2rem",
              flexWrap: "wrap",
            }}
          >
            {subTasks!.map((s) => (
              <div
                key={s.id}
                style={{ position: "relative", display: "inline-flex" }}
                onMouseEnter={(e) => {
                  const r = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  setSubAnchor({ x: r.left + r.width / 2, y: r.top });
                  setHoveredSubId(s.id);
                }}
                onMouseLeave={() => setHoveredSubId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubTask?.(s.id, s.is_completed);
                }}
              >
                {s.is_completed ? (
                  <CheckboxOn
                    width={18}
                    height={18}
                    style={{ color: "#4ade80", cursor: "pointer" }}
                  />
                ) : (
                  <Checkbox
                    width={18}
                    height={18}
                    style={{
                      color: "rgba(255,255,255,0.35)",
                      cursor: "pointer",
                    }}
                  />
                )}
              </div>
            ))}
            <span
              style={{
                ...mono,
                fontSize: "1.1rem",
                letterSpacing: "1px",
                color: "rgba(255,255,255,0.4)",
                marginLeft: "0.2rem",
              }}
            >
              [{subTasks!.filter((s) => s.is_completed).length}/
              {subTasks!.length}]
            </span>
          </div>
        )}
      </div>

      {/* ── Actions: hover only, bottom-right ── */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {rescheduleTomorrow && !isEvent && (
          <button
            onClick={rescheduleTomorrow}
            style={{
              ...mono,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.45)",
              padding: "0.1rem 0.5rem",
              fontSize: "0.9rem",
              letterSpacing: "1px",
              cursor: "pointer",
              marginRight: "0.15rem",
            }}
          >
            tmrw →
          </button>
        )}
        <button onClick={onComplete} title="done" style={actionBtn("#4ade80")}>
          <CheckboxOn size={13} />
        </button>
        <button
          onClick={onEdit}
          title="edit"
          style={actionBtn("rgba(255,255,255,0.7)")}
        >
          <PenSquare size={13} />
        </button>
        <button onClick={onDelete} title="delete" style={actionBtn("#ef4444")}>
          <SkullSharp size={13} />
        </button>
      </div>

      {/* ── Subtask name tooltip (portal-less, absolute) ── */}
      {hoveredSubId &&
        (() => {
          const sub = subTasks?.find((s) => s.id === hoveredSubId);
          if (!sub) return null;
          return createPortal(
            <div
              style={{
                position: "fixed",
                left: subAnchor.x,
                top: subAnchor.y - 8,
                transform: "translate(-50%, -100%)",
                background: "#0c0c0c",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "3px 8px",
                zIndex: 9500,
                pointerEvents: "none",
                fontFamily: "'VT323', monospace",
                fontSize: "1rem",
                letterSpacing: "0.5px",
                color: "rgba(255,255,255,0.85)",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 12px rgba(0,0,0,0.8)",
              }}
            >
              {sub.title}
            </div>,
            document.body,
          );
        })()}
    </div>
  );
}

function actionBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: "none",
    color,
    cursor: "pointer",
    padding: "0.2rem 0.25rem",
    display: "flex",
    alignItems: "center",
    lineHeight: 1,
    opacity: 0.65,
  };
}

// ─── Event Calendar Panel ─────────────────────────────────────────────────────

const CAL_MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CAL_DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function calToDS(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function calAddDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function calGetWeekMon(offset: number): Date {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay();
  return calAddDays(today, (dow === 0 ? -6 : 1 - dow) + offset * 7);
}
function calAddMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function calNormTime(t: string): string {
  if (t.includes(':')) return t;
  if (t.length === 4) return `${t.slice(0,2)}:${t.slice(2)}`;
  return t;
}
function getArcColorCal(n: PlannerNode, arcs: Arc[], projects: Project[]): string {
  if (n.arc_id) return arcs.find(a => a.id === n.arc_id)?.color_hex ?? '#c084fc';
  if (n.project_id) {
    const proj = projects.find(p => p.id === n.project_id);
    if (proj?.arc_id) return arcs.find(a => a.id === proj.arc_id)?.color_hex ?? '#c084fc';
  }
  return '#c084fc';
}

function EventCalendarPanel({ arcs, projects, nodes: storeNodes }: { arcs: Arc[]; projects: Project[]; nodes: PlannerNode[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [eventNodes, setEventNodes] = useState<PlannerNode[]>([]);
  const [nowCal, setNowCal] = useState(new Date());
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hourH, setHourH] = useState(28);

  const END_HOUR = 24;

  useEffect(() => {
    const id = setInterval(() => setNowCal(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const mon  = calGetWeekMon(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => calAddDays(mon, i));
  const today = calToDS(new Date());

  useEffect(() => {
    const from = calToDS(mon);
    const to   = calToDS(calAddDays(mon, 6));
    loadEventNodesForWeek(from, to).then(setEventNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, storeNodes]);

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerNode[]>();
    for (const d of days) map.set(calToDS(d), []);
    for (const n of eventNodes) {
      const k = (n.planned_start_at ?? '').slice(0, 10);
      if (map.has(k)) map.get(k)!.push(n);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventNodes, weekOffset]);

  // Dynamically lower START_HOUR if any event this week starts before 9AM
  const START_HOUR = useMemo(() => {
    let earliest = 9;
    for (const n of eventNodes) {
      const t = n.planned_start_at;
      if (t && t.length > 10) {
        const h = parseInt(t.slice(11, 13), 10);
        if (!isNaN(h) && h < earliest) earliest = h;
      }
    }
    return earliest;
  }, [eventNodes]);

  const TOTAL_HRS = END_HOUR - START_HOUR;

  useEffect(() => {
    if (!gridRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setHourH(Math.max(16, entry.contentRect.height / TOTAL_HRS));
    });
    obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, [TOTAL_HRS]);

  const LABEL_W = 26;
  const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.75rem 1rem', minHeight: 0, border: '1px solid rgba(255,255,255,0.18)', margin: '0.5rem' }}>
      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexShrink: 0, gap: 6 }}>
        <button onClick={() => setWeekOffset(0)}
          style={{ ...mono, background: weekOffset === 0 ? 'rgba(0,196,167,0.12)' : 'none',
            border: `1px solid ${weekOffset === 0 ? 'rgba(0,196,167,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: weekOffset === 0 ? 'var(--teal)' : 'rgba(255,255,255,0.4)',
            fontSize: '0.85rem', padding: '1px 8px', cursor: 'pointer', letterSpacing: 1 }}>
          this week
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <button onClick={() => setWeekOffset(weekOffset - 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 0 }}>
            <ChevronLeft width={14} height={14} />
          </button>
          <span style={{ ...mono, fontSize: '0.88rem', color: 'rgba(255,255,255,0.55)', letterSpacing: 1 }}>
            {CAL_MONTH_SHORT[mon.getMonth()]} {mon.getDate()} – {calAddDays(mon, 6).getDate()}
          </span>
          <button onClick={() => setWeekOffset(weekOffset + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 0 }}>
            <ChevronRight width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'flex', paddingLeft: LABEL_W, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4, marginBottom: 2 }}>
        {days.map(d => {
          const key = calToDS(d);
          const isToday = key === today;
          return (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ ...mono, fontSize: '0.7rem', color: isToday ? 'var(--teal)' : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
                {CAL_DAY_SHORT[d.getDay()].slice(0,2).toUpperCase()}
              </div>
              <div style={{ ...mono, fontSize: '1rem', color: isToday ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={gridRef} style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {/* Hour labels */}
          <div style={{ width: LABEL_W, flexShrink: 0, position: 'relative' }}>
            {Array.from({ length: TOTAL_HRS }, (_, i) => (
              <div key={i} style={{ position: 'absolute', top: i * hourH - 6, right: 3,
                ...mono, fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)', lineHeight: 1, userSelect: 'none' }}>
                {String(i + START_HOUR).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Grid + day columns */}
          <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
            {/* Hour lines */}
            {Array.from({ length: TOTAL_HRS }, (_, i) => {
              const h = i + START_HOUR;
              return (
                <div key={h} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0,
                  height: h % 3 === 0 ? 2 : 1,
                  background: h % 3 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)',
                  pointerEvents: 'none' }} />
              );
            })}

            {days.map((d, di) => {
              const key = calToDS(d);
              const isToday = key === today;
              const dayNodes = byDay.get(key) ?? [];

              return (
                <div key={key} style={{ flex: 1, position: 'relative',
                  borderLeft: di === 0 ? 'none' : '1px solid rgba(255,255,255,0.18)',
                  background: isToday ? 'rgba(255,255,255,0.02)' : 'transparent' }}>

                  {/* Current-time line */}
                  {isToday && (() => {
                    const topPct = (nowCal.getHours() * 60 + nowCal.getMinutes()) / 60 - START_HOUR;
                    if (topPct < 0 || topPct > TOTAL_HRS) return null;
                    return (
                      <div style={{ position: 'absolute', top: topPct * hourH, left: 0, right: 0,
                        height: 2, background: '#ff3b3b', zIndex: 5, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', left: -3, top: -3,
                          width: 6, height: 6, borderRadius: '50%', background: '#ff3b3b' }} />
                      </div>
                    );
                  })()}

                  {dayNodes.map(n => {
                    const timeStr = n.planned_start_at && n.planned_start_at.length > 10
                      ? n.planned_start_at.slice(11, 16) : null;
                    if (!timeStr) return null;
                    const [h, m] = timeStr.split(':').map(Number);
                    const topPx = (h + m / 60 - START_HOUR) * hourH;
                    if (topPx < 0) return null;
                    const dur = n.estimated_duration_minutes ?? 30;
                    const heightPx = Math.max(4, dur / 60 * hourH);
                    const color = getArcColorCal(n, arcs, projects);
                    const normTime = calNormTime(timeStr);
                    const endTime = dur ? calAddMins(normTime, dur) : null;
                    const label = endTime ? `${normTime}–${endTime}` : normTime;

                    return (
                      <div key={n.id}
                        onMouseEnter={e => setTooltip({ title: `${n.title} · ${label}`, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                        onMouseLeave={() => setTooltip(null)}
                        style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx,
                          background: color, opacity: n.is_completed ? 0.3 : 0.85,
                          zIndex: 2, cursor: 'default', transition: 'opacity 0.1s' }} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip && createPortal(
        <div style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 28,
          background: '#111', border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
          ...mono, fontSize: '0.95rem', letterSpacing: '0.5px', padding: '2px 10px',
          pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap' }}>
          {tooltip.title}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Analytics sidebar ────────────────────────────────────────────────────────

function SidebarPanel({
  title,
  icon: Icon,
  titleRight,
  children,
}: {
  title: string;
  icon?: React.FC<{ size?: number; style?: React.CSSProperties }>;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "0.65rem 1.1rem 0.6rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        {Icon && <Icon size={15} style={{ color: "#f5c842", flexShrink: 0 }} />}
        <span
          style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: "1.05rem",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "#f5c842",
          }}
        >
          {title}
        </span>
        {titleRight && <span style={{ marginLeft: "auto" }}>{titleRight}</span>}
      </div>
      {children}
    </div>
  );
}

// Panel 1 — Today's Effort
function TodayEffortPanel({
  todayNodes,
  doneSummary,
}: {
  todayNodes: PlannerNode[];
  doneSummary: TodayDoneSummary;
}) {
  const remainingMins = todayNodes.reduce(
    (s, n) => s + (n.estimated_duration_minutes ?? 0),
    0,
  );
  const doneMins = doneSummary.effortMinutes;
  const scheduledMins = remainingMins + doneMins;
  const totalCount = todayNodes.length + doneSummary.count;

  const fmtMins = (m: number) => (m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`);

  const pct =
    scheduledMins > 0 ? Math.round((doneMins / scheduledMins) * 100) : 0;
  const barColor =
    pct <= 25
      ? "#ff3b3b"
      : pct <= 50
        ? "#ff6b35"
        : pct <= 75
          ? "#4ade80"
          : "#64c8ff";

  const noTasks = totalCount === 0;
  const allDone =
    totalCount > 0 && todayNodes.length === 0 && doneSummary.count > 0;

  if (noTasks)
    return (
      <SidebarPanel title="today's effort" icon={Tea}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            padding: "0.25rem 0 0.25rem 1.5rem",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "#00c4a7",
            }}
          >
            <Loader size={16} />
            <span
              style={{
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "1.15rem",
                letterSpacing: "2px",
                lineHeight: 1.3,
              }}
            >
              nothing scheduled.
            </span>
          </span>
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "1rem",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.3)",
              lineHeight: 1.4,
            }}
          >
            a rare 여유로운 day.
            <br />
            enjoy it — or get ahead
            <br />
            on what's coming.
          </span>
        </div>
      </SidebarPanel>
    );

  if (allDone)
    return (
      <SidebarPanel title="today's effort" icon={Tea}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            padding: "0.25rem 0 0.25rem 1.5rem",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "#4ade80",
            }}
          >
            <PartyPopper size={16} />
            <span
              style={{
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "1.15rem",
                letterSpacing: "2px",
                lineHeight: 1.3,
                textShadow: "0 0 14px #4ade8055",
              }}
            >
              all done.
            </span>
          </span>
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "1rem",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.3)",
              lineHeight: 1.4,
            }}
          >
            go crack open a beer,
            <br />
            put on netflix, and
            <br />
            do absolutely nothing.
          </span>
        </div>
      </SidebarPanel>
    );

  return (
    <SidebarPanel title="today's effort" icon={Tea}>
      {/* big percentage + task count */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <div
          style={{
            border: `2px solid ${pct > 0 ? barColor + "66" : "rgba(255,255,255,0.12)"}`,
            padding: "0.05rem 0.55rem 0.1rem",
            lineHeight: 1,
          }}
        >
          <span
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "1.8rem",
              lineHeight: 1,
              color: pct > 0 ? barColor : "rgba(255,255,255,0.2)",
              textShadow: pct > 0 ? `0 0 18px ${barColor}66` : "none",
              letterSpacing: "1px",
            }}
          >
            {pct}%
          </span>
        </div>
        <span
          style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: "1.1rem",
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.25)",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.4)" }}>[ </span>
          <span style={{ color: "#4ade80" }}>{doneSummary.count}</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}> / </span>
          <span style={{ color: "#fff" }}>{totalCount}</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}> tasks ]</span>
        </span>
      </div>

      {/* stacked bar */}
      <div
        style={{
          display: "flex",
          height: 14,
          marginBottom: "0.5rem",
          background: "rgba(255,255,255,0.07)",
          overflow: "hidden",
        }}
      >
        {pct > 0 && (
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background:
                pct <= 25
                  ? "#ff3b3b"
                  : pct <= 50
                    ? "#ff6b35"
                    : pct <= 75
                      ? "#4ade80"
                      : "#64c8ff",
              boxShadow: `0 0 10px ${pct <= 25 ? "#ff3b3b" : pct <= 50 ? "#ff6b35" : pct <= 75 ? "#4ade80" : "#64c8ff"}66`,
              transition: "width 0.4s ease, background 0.4s ease",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {[
              { duration: "2.1s", delay: "0s", top: 2 },
              { duration: "3.0s", delay: "-0.8s", top: 7 },
              { duration: "1.7s", delay: "-1.5s", top: 4 },
              { duration: "2.6s", delay: "-0.3s", top: 10 },
              { duration: "1.4s", delay: "-1.1s", top: 6 },
              { duration: "3.4s", delay: "-2.0s", top: 1 },
              { duration: "2.3s", delay: "-0.6s", top: 9 },
              { duration: "1.9s", delay: "-1.8s", top: 3 },
              { duration: "2.8s", delay: "-1.3s", top: 11 },
              { duration: "1.6s", delay: "-0.4s", top: 5 },
            ].map((p, i) => (
              <div
                key={i}
                className="effort-particle"
                style={{
                  animationDuration: p.duration,
                  animationDelay: p.delay,
                  top: p.top,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* legend row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          fontSize: "1rem",
          letterSpacing: "1.5px",
        }}
      >
        <span
          style={{
            color: "#4ade8066",
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
          }}
        >
          <CheckboxOn size={14} />
          {doneMins > 0 ? fmtMins(doneMins) : "—"}
        </span>
        <span style={{ color: "rgba(255,255,255,0.55)" }}>
          {remainingMins > 0 ? fmtMins(remainingMins) : "—"} left
        </span>
      </div>
    </SidebarPanel>
  );
}

// Panel 2 — Ongoing Arcs
function OngoingArcsPanel() {
  const { arcs, nodes } = usePlannerStore();
  const { setActiveView } = useViewStore();
  const latestNodeUpdate = (arcId: string) =>
    nodes
      .filter((n) => n.arc_id === arcId)
      .reduce((max, n) => (n.updated_at > max ? n.updated_at : max), "");
  const activeArcs = arcs
    .sort((a, b) =>
      latestNodeUpdate(b.id).localeCompare(latestNodeUpdate(a.id)),
    )
    .slice(0, 3);
  const totalArcs = arcs.length;
  const [arcCounts, setArcCounts] = useState<ArcNodeCount[]>([]);
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };

  useEffect(() => {
    loadArcNodeCounts().then(setArcCounts);
  }, [nodes]);

  if (activeArcs.length === 0) return null;

  return (
    <SidebarPanel title="ongoing arcs" icon={Forward}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {activeArcs.map((arc) => {
          const counts = arcCounts.find((c) => c.arc_id === arc.id);
          const done = counts?.done ?? 0;
          const total = counts?.total ?? 0;
          return (
            <div key={arc.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  lineHeight: 1.15,
                }}
              >
                <span
                  style={{
                    color: arc.color_hex,
                    opacity: 0.5,
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    marginLeft: "1rem",
                  }}
                >
                  ›
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "1.05rem",
                    letterSpacing: "1px",
                    color: arc.color_hex,
                    flex: 1,
                  }}
                >
                  {arc.name}
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.85rem",
                    letterSpacing: "1px",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {done}/{total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {totalArcs > 3 && (
        <div
          onClick={() => setActiveView("focus")}
          style={{
            ...mono,
            fontSize: "0.9rem",
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.65)",
            cursor: "pointer",
            marginTop: "0.55rem",
            textAlign: "right",
          }}
        >
          [ see more ]
        </div>
      )}
    </SidebarPanel>
  );
}

// Panel 3 — Pressure Gauge
const PRESSURE_LEVELS = [
  { key: "safe", label: "SAFE", color: "#4ade80", min: 0, max: 25 },
  { key: "loaded", label: "LOADED", color: "#f5c842", min: 26, max: 50 },
  { key: "heavy", label: "HEAVY", color: "#ff6b35", min: 51, max: 75 },
  {
    key: "critical",
    label: "CRITICAL",
    shortLabel: "CRIT.",
    color: "#ff3b3b",
    min: 76,
    max: 100,
  },
] as const;

function PressureSummaryPopup({
  pressure,
  onClose,
}: {
  pressure: PressureResult;
  onClose: () => void;
}) {
  const { score, level, breakdown } = pressure;
  const levelData = PRESSURE_LEVELS.find((l) => l.key === level)!;
  const {
    todayScore,
    overdueScore,
    horizonScore,
    todayItems,
    overdueItems,
    horizonItems,
    todayMins,
    capacityMins,
    effortBonus,
  } = breakdown;

  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };
  const dim = "rgba(255,255,255,0.35)";
  const mid = "rgba(255,255,255,0.6)";
  const trunc = (s: string) => (s.length > 24 ? s.slice(0, 23) + "…" : s);
  const fmtPts = (n: number) => `+${Math.round(n * 10) / 10}`;
  const urgColor: Record<number, string> = {
    0: "#c084fc",
    1: "#00c4a7",
    2: "#64c8ff",
    3: "#ff6b35",
    4: "#ff3b3b",
  };

  const Row = ({
    left,
    right,
    color = mid,
  }: {
    left: string;
    right?: string;
    color?: string;
  }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "1rem",
        color,
        ...mono,
        fontSize: "1.05rem",
        letterSpacing: "1px",
      }}
    >
      <span>{left}</span>
      {right && (
        <span style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
          {right}
        </span>
      )}
    </div>
  );
  const Divider = () => (
    <div
      style={{ color: dim, ...mono, fontSize: "1rem", letterSpacing: "1px" }}
    >
      {"─".repeat(36)}
    </div>
  );
  const SectionHead = ({
    label,
    sub,
    score: s,
    cap,
  }: {
    label: string;
    sub?: string;
    score: number;
    cap: number;
  }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        ...mono,
      }}
    >
      <span
        style={{
          fontSize: "1.15rem",
          letterSpacing: "3px",
          color: "rgba(255,255,255,0.75)",
          textTransform: "uppercase",
        }}
      >
        {label}
        {sub && (
          <span
            style={{ fontSize: "0.9rem", color: dim, marginLeft: "0.4rem" }}
          >
            {sub}
          </span>
        )}
      </span>
      <span style={{ fontSize: "1rem", color: dim, letterSpacing: "1px" }}>
        [ <span style={{ color: levelData.color }}>{Math.round(s)}</span> /{" "}
        {cap} ]
      </span>
    </div>
  );

  return (
    <div
      onClick={onClose}
      className="pressure-popup-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 950,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pressure-popup-inner"
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.14)",
          padding: "1.5rem 1.75rem",
          width: 420,
          maxHeight: "80vh",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          overflowY: "auto",
          scrollbarWidth: "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            ...mono,
            fontSize: "1.3rem",
            letterSpacing: "4px",
            color: levelData.color,
            textTransform: "uppercase",
            marginBottom: "0.25rem",
          }}
        >
          pressure breakdown
        </div>
        <Divider />

        {/* TODAY */}
        <SectionHead label="today" score={todayScore} cap={45} />
        {todayItems.length === 0 ? (
          <Row left="  (none scheduled today)" color={dim} />
        ) : (
          todayItems.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                ...mono,
                fontSize: "1.05rem",
                letterSpacing: "1px",
              }}
            >
              <span style={{ color: mid }}>
                {"> "}
                <span style={{ color: urgColor[item.urgencyLevel] }}>
                  L{item.urgencyLevel}
                </span>{" "}
                {trunc(item.title)}
              </span>
              <span style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                {fmtPts(item.urgPts)}
              </span>
            </div>
          ))
        )}
        {effortBonus > 0 && (
          <Row
            left={`  effort  ${(todayMins / 60).toFixed(1)}h / ${(capacityMins / 60).toFixed(0)}h`}
            right={fmtPts(effortBonus)}
            color={dim}
          />
        )}

        {/* OVERDUE */}
        <div style={{ marginTop: "0.4rem" }} />
        <SectionHead label="overdue" score={overdueScore} cap={25} />
        {overdueItems.length === 0 ? (
          <Row left="  (no overdue tasks)" color={dim} />
        ) : (
          overdueItems.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                ...mono,
                fontSize: "1.05rem",
                letterSpacing: "1px",
              }}
            >
              <span style={{ color: mid }}>
                {"> "}
                <span style={{ color: urgColor[item.urgencyLevel] }}>
                  L{item.urgencyLevel}
                </span>{" "}
                {trunc(item.title)}
                <span style={{ color: dim }}>
                  {" "}
                  · {Math.round(item.daysAgo * 10) / 10}d ago
                </span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                {fmtPts(item.pts)}
              </span>
            </div>
          ))
        )}

        {/* HORIZON */}
        <div style={{ marginTop: "0.4rem" }} />
        <SectionHead
          label="horizon"
          sub="(next 7d)"
          score={horizonScore}
          cap={30}
        />
        {horizonItems.length === 0 ? (
          <Row left="  (nothing in the next 7d)" color={dim} />
        ) : (
          horizonItems.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                ...mono,
                fontSize: "1.05rem",
                letterSpacing: "1px",
              }}
            >
              <span style={{ color: mid }}>
                {"> "}
                <span style={{ color: urgColor[item.urgencyLevel] }}>
                  L{item.urgencyLevel}
                </span>{" "}
                {trunc(item.title)}
                <span style={{ color: dim }}>
                  {" "}
                  · in {Math.round(item.daysAway * 10) / 10}d
                </span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                {fmtPts(item.pts)}
              </span>
            </div>
          ))
        )}

        {/* Total */}
        <div style={{ marginTop: "0.4rem" }} />
        <Divider />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            ...mono,
          }}
        >
          <span
            style={{
              fontSize: "1.2rem",
              letterSpacing: "3px",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontSize: "1.4rem",
              letterSpacing: "2px",
              color: levelData.color,
            }}
          >
            {score} pts · [ {levelData.label} ]
          </span>
        </div>

        {/* Close */}
        <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
          <span
            onClick={onClose}
            style={{
              ...mono,
              fontSize: "1.05rem",
              letterSpacing: "2px",
              color: dim,
              cursor: "pointer",
            }}
          >
            [ close ]
          </span>
        </div>
      </div>
    </div>
  );
}

function PressureGaugePanel({ pressure }: { pressure: PressureResult }) {
  const { score, level } = pressure;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHovered, setSummaryHovered] = useState(false);
  const levelData = PRESSURE_LEVELS.find((l) => l.key === level)!;

  // SVG geometry — cx=80, cy=90 matches .gauge-needle CSS transform-origin
  const W = 160,
    H = 90;
  const cx = 80,
    cy = 90;
  const r = 55,
    labelR = 65,
    needleLen = r - 6;

  const toRad = (d: number) => (d * Math.PI) / 180;
  const px = (radius: number, d: number) => cx + radius * Math.cos(toRad(d));
  const py = (radius: number, d: number) => cy - radius * Math.sin(toRad(d));

  const wedge = (s: number, e: number) =>
    `M ${cx} ${cy} L ${px(r, s)} ${py(r, s)} A ${r} ${r} 0 0 1 ${px(r, e)} ${py(r, e)} Z`;

  const segments: Array<
    (typeof PRESSURE_LEVELS)[number] & {
      startDeg: number;
      endDeg: number;
      midDeg: number;
      anchor: "end" | "start";
    }
  > = [
    {
      startDeg: 179,
      endDeg: 137,
      midDeg: 158,
      anchor: "end",
      ...PRESSURE_LEVELS[0],
    },
    {
      startDeg: 134,
      endDeg: 92,
      midDeg: 113,
      anchor: "end",
      ...PRESSURE_LEVELS[1],
    },
    {
      startDeg: 89,
      endDeg: 47,
      midDeg: 68,
      anchor: "start",
      ...PRESSURE_LEVELS[2],
    },
    {
      startDeg: 44,
      endDeg: 1,
      midDeg: 23,
      anchor: "start",
      ...PRESSURE_LEVELS[3],
    },
  ];

  const needleAngle = 180 - (score / 100) * 180;
  const needleRad = toRad(needleAngle);
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy - needleLen * Math.sin(needleRad);

  return (
    <SidebarPanel title="pressure gauge" icon={SpeedSlow}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "44px",
        }}
      >
        {/* Gauge SVG */}
        <svg
          width={W}
          height={H}
          style={{ display: "block", overflow: "visible", flexShrink: 0 }}
        >
          {segments.map((seg) => (
            <path
              key={seg.key}
              d={wedge(seg.startDeg, seg.endDeg)}
              fill={seg.key === level ? seg.color : seg.color + "22"}
            />
          ))}
          {segments.map((seg) => (
            <text
              key={`lbl-${seg.key}`}
              x={px(labelR, seg.midDeg)}
              y={py(labelR, seg.midDeg) + 4}
              textAnchor={seg.anchor}
              fill={seg.key === level ? seg.color : "rgba(255,255,255,0.2)"}
              fontSize={16}
              letterSpacing={1}
              fontFamily="'VT323', 'HBIOS-SYS', monospace"
            >
              {"shortLabel" in seg ? seg.shortLabel : seg.label}
            </text>
          ))}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="#fff"
            strokeWidth={1.5}
            strokeOpacity={0.9}
            strokeLinecap="square"
            className={`gauge-needle gauge-needle-${level}`}
          />
          <circle cx={cx} cy={cy} r={3} fill="#fff" opacity={0.45} />
        </svg>

        {/* Score + level box + summary */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.15rem",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              border: "0.7px solid rgba(255,255,255,0.35)",
              padding: "0.35rem 0.65rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.05rem",
            }}
          >
            <span
              style={{
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "1.8rem",
                letterSpacing: "1px",
                color: levelData.color,
                lineHeight: 1,
                filter: `drop-shadow(0 0 6px ${levelData.color}88)`,
              }}
            >
              {score}
              <span style={{ fontSize: "0.9rem", marginLeft: "2px" }}>
                pts.
              </span>
            </span>
            <span
              className="pressure-level-blink"
              style={{
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "0.85rem",
                letterSpacing: "2px",
                color: levelData.color,
                opacity: 0.8,
                lineHeight: 1,
              }}
            >
              [ {levelData.label} ]
            </span>
          </div>
          <span
            onClick={() => setSummaryOpen(true)}
            onMouseEnter={() => setSummaryHovered(true)}
            onMouseLeave={() => setSummaryHovered(false)}
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "0.9rem",
              letterSpacing: "2px",
              color: summaryHovered ? levelData.color : "rgba(255,255,255,0.3)",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            [ summary ]
          </span>
        </div>
      </div>

      {summaryOpen && createPortal(
        <PressureSummaryPopup
          pressure={pressure}
          onClose={() => setSummaryOpen(false)}
        />,
        document.body,
      )}
    </SidebarPanel>
  );
}

// ─── Panel 5 — Eat the Frog ───────────────────────────────────────────────────

const FROG_GOAL = 3;

function EatTheFrogPanel({ frogsDone }: { frogsDone: number }) {
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };
  const done = Math.min(frogsDone, FROG_GOAL);
  const allDone = done >= FROG_GOAL;

  const counter = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
      {Array.from({ length: FROG_GOAL }).map((_, i) => (
        <PixelFrog key={i} px={2} dim={i >= done} />
      ))}
      {allDone && (
        <span
          style={{
            ...mono,
            fontSize: "0.8rem",
            letterSpacing: "1.5px",
            color: "#4ade80",
            marginLeft: "0.2rem",
          }}
        >
          ✓
        </span>
      )}
    </div>
  );

  return (
    <SidebarPanel title="eat the frog" icon={Frown} titleRight={counter}>
      <div
        style={{
          ...mono,
          fontSize: "0.92rem",
          letterSpacing: "0.5px",
          color: "rgba(74,222,128,0.78)",
          lineHeight: 1.5,
          marginBottom: "0.75rem",
          paddingLeft: "0.6rem",
        }}
      >
        {allDone ? (
          <>
            so... more... frogs... ughhh....
            <br />i think i'm gonna puke... good job though....
          </>
        ) : (
          <>
            tackle the hardest tasks first.
            <br />
            close your eyes. swallow it whole.
          </>
        )}
      </div>
    </SidebarPanel>
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
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.6rem",
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: "1.5rem",
              letterSpacing: "4px",
              color: purple,
              textTransform: "uppercase",
            }}
          >
            dice taskmaster
          </span>
          <span
            style={{
              ...mono,
              fontSize: "1.2rem",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            {tasks.length} tasks
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            ...mono,
            fontSize: "1.35rem",
            color: "rgba(255,255,255,0.62)",
            lineHeight: 1.4,
            marginBottom: "1.25rem",
          }}
        >
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
              className={
                phase === "fading" ? "dice-fade-out" : "dice-rolling-entry"
              }
              style={{
                position: "absolute",
                left: "calc(50% - 22px)",
                bottom: 8,
              }}
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
                  <div
                    style={{
                      ...mono,
                      fontSize: "1.1rem",
                      letterSpacing: "3px",
                      color: "rgba(192,132,252,0.85)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    FATE HAS SPOKEN
                  </div>
                  <div
                    style={{
                      ...mono,
                      fontSize: "2rem",
                      color: "#fff",
                      textAlign: "center",
                      lineHeight: 1.25,
                    }}
                  >
                    {picked.title}
                  </div>
                  {!picked.planned_start_at?.startsWith(
                    toDateString(new Date()),
                  ) && (
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
                <div style={{ ...mono, fontSize: "1rem", color: dim }}>
                  no tasks in pool
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {tasks.length > 0 && (phase === "idle" || phase === "result") ? (
            <span
              onClick={startRoll}
              style={{
                ...mono,
                fontSize: "1.2rem",
                letterSpacing: "2px",
                color: purple,
                cursor: "pointer",
              }}
            >
              {phase === "result" ? "[ re-roll ]" : "[ press to roll ]"}
            </span>
          ) : (
            <span />
          )}
          <span
            onClick={handleClose}
            style={{
              ...mono,
              fontSize: "1rem",
              letterSpacing: "2px",
              color: dim,
              cursor: "pointer",
            }}
          >
            [ close ]
          </span>
        </div>
      </div>
    </div>
  );
}
