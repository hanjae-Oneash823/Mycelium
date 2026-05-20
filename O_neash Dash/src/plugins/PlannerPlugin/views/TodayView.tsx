import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  motion,
  AnimatePresence,
  useAnimationControls,
  type Variants,
} from "framer-motion";
import {
  CheckboxOn,
  PenSquare,
  SkullSharp,
  Frown,
  HumanArmsUp,
  ChevronDown,
  Forward,
  Undo,
  AlarmClock,
} from "pixelarticons/react";
import { Checkbox } from "pixelarticons/react/Checkbox";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { Plus } from "pixelarticons/react/Plus";
import { Calendar } from "pixelarticons/react/Calendar";
import { Chart } from "pixelarticons/react/Chart";
import { Wind } from "pixelarticons/react/Wind";
import { AspectRatio } from "pixelarticons/react/AspectRatio";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import {
  scoreSuggestion,
  isSameDay,
  toDateString,
  pickDiceNode,
} from "../lib/logicEngine";
import {
  loadTodayDoneSummary,
  loadTodayCompletedNodes,
  loadEventNodesForWeek,
  loadMonthCompletions,
  type TodayDoneSummary,
  type CalendarDayData,
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
    createNode,
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
  const [diceOpen, setDiceOpen] = useState(false);
  const [addTaskHovered, setAddTaskHovered] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const suggestionsOn = useViewStore((s) => s.suggestionsOn);
  const setSuggestionsOn = useViewStore((s) => s.setSuggestionsOn);
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
  }, [nodes]);

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
    subTasks: subTasksByNode[node.id],
    onToggleSubTask: (subId: string, current: boolean) =>
      toggleSubTask(subId, node.id, current),
    onComplete: () => completeNode(node.id),
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
          padding: "0.8rem 1.4rem 0.7rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          border: "0.5px solid rgba(255,255,255,0.35)",
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
              color: "rgba(255,255,255,0.25)",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              paddingLeft: "1.6rem",
            }}
          >
            [SYS_LOG --{sysDateStr} // CUR-TIME={clockStr}]
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Compact progress tracker */}
        <HeaderProgressTracker
          todayNodes={todayNodes}
          doneSummary={doneSummary}
        />

        {/* Quick add input */}
        <div style={{ width: 330 }}>
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

        {/* + task button */}
        <button
          onClick={() => openTaskForm({ planned_start_at: today })}
          onMouseEnter={() => setAddTaskHovered(true)}
          onMouseLeave={() => setAddTaskHovered(false)}
          style={{
            background: addTaskHovered ? "#00dfc0" : "var(--teal)",
            border: "none",
            color: "#000",
            padding: "0.3rem 1.1rem",
            fontSize: "1.05rem",
            letterSpacing: "2px",
            cursor: "pointer",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "background 0.15s",
          }}
        >
          <Plus width={15} height={15} /> task
        </button>

        {/* Dice + Suggestions stacked */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            alignItems: "flex-end",
          }}
        >
          <DiceButton onClick={() => setDiceOpen(true)} />
          <SuggestionsToggle
            on={suggestionsOn}
            onToggle={() => setSuggestionsOn(!suggestionsOn)}
          />
        </div>
      </div>

      {/* ── Three-column body ───────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Weekly timetable — left */}
        <div
          style={{
            flex: "0 0 22%",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <EventCalendarPanel
            arcs={arcs}
            projects={projects}
            nodes={nodes}
            highlightNodeId={hoveredNodeId}
          />
        </div>

        {/* Task column — middle */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            className="today-task-col"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem 1rem",
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.2rem",
                      marginTop: "0.4rem",
                    }}
                  >
                    {overdue.map((node) => (
                      <TaskRow
                        key={node.id}
                        {...cardProps(node)}
                        variant="overdue"
                        rescheduleAction={
                          !node.due_at
                            ? {
                                onClick: () => rescheduleNode(node.id, today),
                                title: "→ today",
                                color: "#f5c842",
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                  }}
                >
                  {todayEvents.map((node) => (
                    <EventRow
                      key={node.id}
                      node={node}
                      arcs={arcs}
                      projects={projects}
                      onComplete={() => completeNode(node.id)}
                      onEdit={() => openTaskFormEdit(node)}
                      onDelete={() => deleteNode(node.id)}
                      onHover={setHoveredNodeId}
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                }}
              >
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
                  <>
                    {todayNodes.map((node) => (
                      <TaskRow
                        key={node.id}
                        {...cardProps(node)}
                        variant="today"
                        rescheduleAction={{
                          onClick: () => rescheduleNode(node.id, tomorrow),
                          title: "→ tmrw",
                          color: "rgba(255,255,255,0.5)",
                        }}
                      />
                    ))}
                    {suggestionsOn &&
                      suggestions.map((node) => (
                        <TaskRow
                          key={`sug-${node.id}`}
                          node={node}
                          now={now}
                          subTasks={subTasksByNode[node.id]}
                          onToggleSubTask={(subId, current) =>
                            toggleSubTask(subId, node.id, current)
                          }
                          onEdit={() => openTaskFormEdit(node)}
                          variant="suggestion"
                          rescheduleAction={{
                            onClick: () => rescheduleNode(node.id, today),
                            title: "+ today",
                            color: "#00c4a7",
                          }}
                        />
                      ))}
                  </>
                )}
              </div>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.4rem",
                padding: "0.5rem 1.5rem",
                borderTop: "1px solid rgba(255,255,255,0.12)",
                flexShrink: 0,
                background: "#000",
                zIndex: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                  fontSize: "1rem",
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.45)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                }}
              >
                <CheckboxOn size={13} /> {todayDone.length} done
              </span>
              <div
                style={{
                  width: 10,
                  height: 1,
                  background: "rgba(255,255,255,0.18)",
                  flexShrink: 0,
                }}
              />
              {todayDone.map((node) => (
                <DoneChip
                  key={node.id}
                  node={node}
                  onUncomplete={() => uncompleteNode(node.id)}
                />
              ))}
            </div>
          )}
        </div>
        {/* closes task column */}

        {/* Analytics — right */}
        <div
          style={{
            flex: "0 0 22%",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <MiniCalendarPanel />
          <StreakPanel />
          <TaskVelocityPanel nodes={nodes} />
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
        padding: 0,
        lineHeight: 1,
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
              color: hovered
                ? "rgba(255,255,255,0.9)"
                : "rgba(255,255,255,0.35)",
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
        padding: 0,
        lineHeight: 1,
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
              color: on
                ? "var(--teal)"
                : hovered
                  ? "rgba(255,255,255,0.9)"
                  : undefined,
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
  node,
  arcs,
  projects,
  onComplete,
  onEdit,
  onDelete,
  onHover,
}: {
  node: PlannerNode;
  arcs: Arc[];
  projects: Project[];
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHover?: (id: string | null) => void;
}) {
  const [hov, setHov] = useState(false);
  const [completing, setCompleting] = useState(false);
  const collapseCtrl = useAnimationControls();
  const innerRef = useRef<HTMLDivElement>(null);

  async function handleComplete() {
    setCompleting(true);
    await new Promise((r) => setTimeout(r, 480));
    await collapseCtrl.start({
      height: 0,
      opacity: 0,
      transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
    });
    onComplete();
  }

  const arc = node.arc_id ? arcs.find((a) => a.id === node.arc_id) : null;
  const proj = node.project_id
    ? projects.find((p) => p.id === node.project_id)
    : null;

  const timeRange = (() => {
    if (!node.planned_start_at || node.planned_start_at.length <= 10)
      return null;
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
    <motion.div animate={collapseCtrl} style={{ overflow: "hidden" }}>
      <div ref={innerRef}>
        <div
          onMouseEnter={() => {
            setHov(true);
            onHover?.(node.id);
          }}
          onMouseLeave={() => {
            setHov(false);
            onHover?.(null);
          }}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            padding: "0.3rem 0.5rem",
            background: completing
              ? "rgba(74,222,128,0.08)"
              : hov
                ? "rgba(192,132,252,0.06)"
                : "transparent",
            border: `1px solid ${hov ? "rgba(192,132,252,0.18)" : "rgba(192,132,252,0.08)"}`,
            transition: "background 0.2s, border-color 0.1s",
            fontFamily: VT,
            fontSize: "1.05rem",
            letterSpacing: "1px",
            minHeight: "2rem",
          }}
        >
          {/* Scanline */}
          {completing && (
            <motion.div
              initial={{ width: "0%", opacity: 1 }}
              animate={{ width: "100%", opacity: [1, 1, 0] }}
              transition={{ duration: 0.38, ease: "easeInOut" }}
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                height: 2,
                background:
                  "linear-gradient(to right, transparent, #4ade80, transparent)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          )}

          {/* Time — black on white chip */}
          {timeRange && (
            <span
              style={{
                background: "rgba(255,255,255,0.75)",
                color: "#000",
                padding: "0 6px",
                lineHeight: 1.5,
                flexShrink: 0,
                fontSize: "0.95rem",
                letterSpacing: "0.5px",
              }}
            >
              {timeRange}
            </span>
          )}

          {/* Name */}
          <span
            style={{
              color: completing ? "rgba(255,255,255,0.22)" : "#fff",
              textDecoration: completing ? "line-through" : "none",
              transition: "color 0.3s",
              flex: "0 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.title}
          </span>

          {/* Arc */}
          {arc && (
            <span
              style={{
                color: arc.color_hex,
                flexShrink: 0,
                fontSize: "0.82rem",
                letterSpacing: "1.5px",
                opacity: 0.85,
                border: `1px solid ${arc.color_hex}44`,
                padding: "0 5px",
                lineHeight: 1.5,
              }}
            >
              {arc.name}
            </span>
          )}

          {/* Project */}
          {proj && (
            <span
              style={{
                color: "rgba(255,255,255,0.45)",
                flexShrink: 0,
                fontSize: "0.82rem",
                letterSpacing: "1.5px",
              }}
            >
              {proj.name}
            </span>
          )}

          {/* Groups */}
          {node.groups && node.groups.length > 0 && (
            <span style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
              {node.groups.map((g) => (
                <span
                  key={g.id}
                  style={{
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    color: g.color_hex,
                    border: `1px solid ${g.color_hex}55`,
                    padding: "0 4px",
                    lineHeight: 1.5,
                  }}
                >
                  {g.name}
                </span>
              ))}
            </span>
          )}

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Actions */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexShrink: 0,
            }}
          >
            <IconAction
              icon={<CheckboxOn size={14} />}
              color="#4ade80"
              title="complete"
              onClick={handleComplete}
            />
            <IconAction
              icon={<PenSquare size={14} />}
              color="rgba(255,255,255,0.7)"
              title="edit"
              onClick={onEdit}
            />
            <IconAction
              icon={<SkullSharp size={14} />}
              color="#ef4444"
              title="delete"
              onClick={onDelete}
            />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function IconAction({
  icon,
  color,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseEnter={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAnchor({ x: r.left + r.width / 2, y: r.top });
          setHov(true);
        }}
        onMouseLeave={() => setHov(false)}
        style={{
          all: "unset",
          cursor: "pointer",
          color: hov ? color : "rgba(255,255,255,0.28)",
          display: "flex",
          alignItems: "center",
          transition: "color 0.1s",
        }}
      >
        {icon}
      </button>
      {hov &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: anchor.x,
              top: anchor.y - 8,
              transform: "translate(-50%, -100%)",
              background: "#0c0c0c",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "2px 8px",
              zIndex: 9500,
              pointerEvents: "none",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "0.95rem",
              letterSpacing: "1.5px",
              color: color,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {title}
          </div>,
          document.body,
        )}
    </>
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

// ─── Quick add ────────────────────────────────────────────────────────────────

const BADGE_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.6, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 460, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    y: -8,
    transition: { duration: 0.15, ease: "easeIn" as const },
  },
};

function QuickAddButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset",
        cursor: "pointer",
        fontFamily: "'VT323', 'HBIOS-SYS', monospace",
        fontSize: "1rem",
        letterSpacing: "2px",
        color: active
          ? "#00c4a7"
          : hov
            ? "rgba(255,255,255,0.7)"
            : "rgba(255,255,255,0.3)",
        transition: "color 0.12s",
        flexShrink: 0,
        paddingLeft: "0.75rem",
      }}
    >
      {active ? "[ × ]" : "[ + ]"}
    </button>
  );
}

const QA_PLACEHOLDER = "enter quick task".split("");
const QA_STAGGER = 0.045;
const QA_CHAR_DUR = 0.22;
const QA_STAGGER_TOTAL =
  QA_PLACEHOLDER.length * QA_STAGGER + QA_CHAR_DUR + 0.05;

function QAPlaceholder({ visible }: { visible: boolean }) {
  const [waving, setWaving] = useState(false);
  useEffect(() => {
    if (!visible) {
      setWaving(false);
      return;
    }
    const t = setTimeout(() => setWaving(true), QA_STAGGER_TOTAL * 1000);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            pointerEvents: "none",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: "1rem",
            letterSpacing: 1,
          }}
        >
          {QA_PLACEHOLDER.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={
                waving
                  ? {
                      y: [0, -3, 0],
                      opacity: ch === " " ? 0 : [0.5, 0.8, 0.5],
                    }
                  : {
                      opacity: ch === " " ? 0 : 0.55,
                      y: 0,
                    }
              }
              transition={
                waving
                  ? {
                      y: {
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.09,
                        repeatDelay: 2,
                      },
                      opacity: {
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.09,
                        repeatDelay: 2,
                      },
                    }
                  : {
                      delay: i * QA_STAGGER,
                      duration: QA_CHAR_DUR,
                      ease: "easeOut",
                    }
              }
              style={{
                display: "inline-block",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function QuickAddInput({
  onCommit,
}: {
  onCommit: (
    title: string,
    arcId?: string,
    projectId?: string,
    groupIds?: string[],
  ) => Promise<void>;
}) {
  const { arcs, projects, groups } = usePlannerStore();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [launchItem, setLaunchItem] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropPos, setDropPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [badgePos, setBadgePos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropListRef = useRef<HTMLDivElement>(null);
  const squishCtrl = useAnimationControls();

  useEffect(() => {
    if (!dropListRef.current) return;
    const item = dropListRef.current.children[activeIdx] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Options depend on what's already selected:
  // - arcs: always shown (max 1)
  // - projects: only shown when an arc is selected, filtered to that arc (max 1)
  // - groups: always shown, multiple allowed
  const slug = (s: string) => s.replace(/\s+/g, "_");

  const allOptions = useMemo(() => {
    const opts: {
      id: string;
      label: string;
      display: string;
      color: string;
      type: "arc" | "project" | "group";
    }[] = [];
    arcs.forEach((a) =>
      opts.push({
        id: a.id,
        label: `arc-${slug(a.name)}`,
        display: a.name,
        color: a.color_hex,
        type: "arc",
      }),
    );
    if (selectedArcId) {
      projects
        .filter((p) => p.arc_id === selectedArcId)
        .forEach((p) =>
          opts.push({
            id: p.id,
            label: `project-${slug(p.name)}`,
            display: p.name,
            color: "rgba(255,255,255,0.5)",
            type: "project",
          }),
        );
    }
    groups
      .filter((g) => !g.is_ungrouped)
      .forEach((g) =>
        opts.push({
          id: g.id,
          label: `group-${slug(g.name)}`,
          display: g.name,
          color: g.color_hex,
          type: "group",
        }),
      );
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs, projects, groups, selectedArcId]);

  const filteredOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [mentionQuery, allOptions]);

  useEffect(() => {
    if (mentionQuery !== null && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropPos(null);
    }
  }, [mentionQuery]);

  useEffect(() => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setBadgePos({ top: rect.top, left: rect.left, width: rect.width });
  }, [selectedArcId, selectedProjectId, selectedGroupIds]);

  useEffect(() => {
    const update = () => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      setBadgePos({ top: rect.top, left: rect.left, width: rect.width });
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function detectMention(v: string, cursor: number) {
    const before = v.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(" ")) {
        setMentionQuery(query);
        setActiveIdx(0);
        return;
      }
    }
    setMentionQuery(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    setPulseKey((k) => k + 1);
    detectMention(v, e.target.selectionStart ?? v.length);
  }

  function selectOption(opt: (typeof allOptions)[0]) {
    // Strip the @query from the input — selection is shown as a badge instead
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    const newVal = (before.slice(0, atIdx) + after).trimStart();
    setValue(newVal);

    if (opt.type === "arc") {
      setSelectedArcId(opt.id);
      setSelectedProjectId(null);
    } else if (opt.type === "project") {
      setSelectedProjectId(opt.id);
    } else {
      setSelectedGroupIds((ids) =>
        ids.includes(opt.id)
          ? ids.filter((id) => id !== opt.id)
          : [...ids, opt.id],
      );
    }

    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleCommit() {
    const title = value.trim();
    if (!title) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const lx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const ly = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    squishCtrl.start({
      scaleY: [1, 0.78, 1.07, 1],
      scaleX: [1, 1.05, 0.97, 1],
      transition: {
        duration: 0.42,
        times: [0, 0.28, 0.65, 1],
        ease: "easeOut",
      },
    });
    setLaunchItem({ text: title, x: lx, y: ly });
    setValue("");
    setSelectedArcId(null);
    setSelectedProjectId(null);
    setSelectedGroupIds([]);
    await onCommit(
      title,
      selectedArcId ?? undefined,
      selectedProjectId ?? undefined,
      selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    );
  }

  return (
    <div
      style={{ width: "100%", fontFamily: "'VT323', 'HBIOS-SYS', monospace" }}
    >
      {launchItem &&
        createPortal(
          <motion.div
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={{ opacity: 0, scale: 0.55, y: -200 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setLaunchItem(null)}
            style={{
              position: "fixed",
              left: launchItem.x,
              top: launchItem.y,
              translateX: "-50%",
              translateY: "-50%",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "1.1rem",
              letterSpacing: 1,
              color: "#00c4a7",
              textShadow: "0 0 18px rgba(0,196,167,0.7)",
              pointerEvents: "none",
              zIndex: 9999,
              whiteSpace: "nowrap",
            }}
          >
            {launchItem.text}
          </motion.div>,
          document.body,
        )}

      <motion.div ref={boxRef} animate={squishCtrl} style={{ width: "100%" }}>
        <motion.div
          animate={{
            borderColor: focused
              ? "rgba(0,196,167,0.55)"
              : "rgba(255,255,255,0.18)",
            backgroundColor: focused
              ? "rgba(0,12,10,0.96)"
              : "rgba(0,0,0,0.88)",
          }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: "flex",
            alignItems: "stretch",
            border: "1px solid rgba(255,255,255,0.18)",
            overflow: "hidden",
            width: "100%",
            position: "relative",
          }}
        >
          <AnimatePresence>
            <motion.div
              key={pulseKey}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: -1,
                border: "2px solid rgba(0,196,167,1)",
                boxShadow:
                  "0 0 14px rgba(0,196,167,0.5), inset 0 0 10px rgba(0,196,167,0.12)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          </AnimatePresence>

          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <QAPlaceholder visible={!focused && !value} />
            <input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (mentionQuery !== null && filteredOptions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIdx((i) =>
                      Math.min(i + 1, filteredOptions.length - 1),
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    selectOption(filteredOptions[activeIdx]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCommit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setValue("");
                }
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setTimeout(() => {
                  setMentionQuery(null);
                  setSelectedArcId(null);
                  setSelectedProjectId(null);
                  setSelectedGroupIds([]);
                }, 150);
              }}
              placeholder=""
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.82)",
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "1rem",
                padding: "6px 10px",
                letterSpacing: 1,
                outline: "none",
                width: "100%",
              }}
            />
            {dropPos &&
              filteredOptions.length > 0 &&
              createPortal(
                <div
                  ref={dropListRef}
                  className="quick-add-dropdown"
                  style={{
                    position: "fixed",
                    top: dropPos.top,
                    left: dropPos.left,
                    width: dropPos.width,
                    background: "#0d0d0d",
                    border: "1px solid rgba(255,255,255,0.18)",
                    zIndex: 99999,
                    fontFamily: "'VT323','HBIOS-SYS',monospace",
                    fontSize: "1rem",
                    letterSpacing: "1px",
                    maxHeight: Math.min(
                      220,
                      window.innerHeight - dropPos.top - 8,
                    ),
                    overflowY: "auto",
                  }}
                >
                  {filteredOptions.map((opt, i) => {
                    const isGroupSelected =
                      opt.type === "group" && selectedGroupIds.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectOption(opt);
                        }}
                        style={{
                          padding: "5px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background:
                            i === activeIdx
                              ? "rgba(255,255,255,0.07)"
                              : "transparent",
                          color:
                            i === activeIdx
                              ? "#fff"
                              : isGroupSelected
                                ? "var(--teal)"
                                : "rgba(255,255,255,0.55)",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            background: opt.color,
                            flexShrink: 0,
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            color: "rgba(255,255,255,0.25)",
                            fontSize: "0.8rem",
                            marginRight: 2,
                          }}
                        >
                          {opt.type}
                        </span>
                        {opt.display}
                        {isGroupSelected && (
                          <span
                            style={{
                              marginLeft: "auto",
                              color: "var(--teal)",
                              fontSize: "0.8rem",
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>,
                document.documentElement,
              )}
          </div>

          <button
            onClick={handleCommit}
            style={{
              background: "none",
              border: "none",
              borderLeft: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.35)",
              padding: "0 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "#fff")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "rgba(255,255,255,0.35)")
            }
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ display: "flex", alignItems: "center" }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 13V3M3 8l5-5 5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </motion.div>
          </button>
        </motion.div>
      </motion.div>

      {/* Floating badges — portaled above the input box */}
      {badgePos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: badgePos.top - 10,
              left: badgePos.left,
              width: badgePos.width,
              transform: "translateY(-100%)",
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              zIndex: 99999,
              pointerEvents: "auto",
            }}
          >
            <AnimatePresence mode="popLayout">
              {selectedArcId &&
                (() => {
                  const arc = arcs.find((a) => a.id === selectedArcId);
                  return arc ? (
                    <motion.span
                      key={arc.id}
                      layout
                      variants={BADGE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{ display: "inline-flex" }}
                    >
                      <motion.span
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                          duration: 2.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className="badge-idle-pulse"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedArcId(null);
                          setSelectedProjectId(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          background: arc.color_hex,
                          border: `1px solid ${arc.color_hex}`,
                          color: "#000",
                          fontFamily: "'VT323','HBIOS-SYS',monospace",
                          fontSize: "0.85rem",
                          letterSpacing: "1px",
                          cursor: "pointer",
                        }}
                      >
                        arc · {arc.name}
                      </motion.span>
                    </motion.span>
                  ) : null;
                })()}
              {selectedProjectId &&
                (() => {
                  const proj = projects.find((p) => p.id === selectedProjectId);
                  return proj ? (
                    <motion.span
                      key={proj.id}
                      layout
                      variants={BADGE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{ display: "inline-flex" }}
                    >
                      <motion.span
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                          duration: 3.0,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: 0.5,
                        }}
                        className="badge-idle-pulse"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedProjectId(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          background: "#b0b0a8",
                          border: "1px solid #b0b0a8",
                          color: "#000",
                          fontFamily: "'VT323','HBIOS-SYS',monospace",
                          fontSize: "0.85rem",
                          letterSpacing: "1px",
                          cursor: "pointer",
                        }}
                      >
                        project · {proj.name}
                      </motion.span>
                    </motion.span>
                  ) : null;
                })()}
              {selectedGroupIds.map((gid, gi) => {
                const grp = groups.find((g) => g.id === gid);
                return grp ? (
                  <motion.span
                    key={gid}
                    layout
                    variants={BADGE_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ display: "inline-flex" }}
                  >
                    <motion.span
                      animate={{ y: [0, -3, 0] }}
                      transition={{
                        duration: 2.4 + gi * 0.28,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: gi * 0.45,
                      }}
                      className="badge-idle-pulse"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedGroupIds((ids) =>
                          ids.filter((id) => id !== gid),
                        );
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        background: grp.color_hex,
                        border: `1px solid ${grp.color_hex}`,
                        color: "#000",
                        fontFamily: "'VT323','HBIOS-SYS',monospace",
                        fontSize: "0.85rem",
                        letterSpacing: "1px",
                        cursor: "pointer",
                      }}
                    >
                      group · {grp.name}
                    </motion.span>
                  </motion.span>
                ) : null;
              })}
            </AnimatePresence>
          </div>,
          document.documentElement,
        )}
    </div>
  );
}

// ─── Task row (today / overdue / suggestion) ──────────────────────────────────

function TaskRow({
  node,
  now,
  subTasks,
  onToggleSubTask,
  onComplete,
  onDelete,
  onEdit,
  variant,
  rescheduleAction,
  onHover,
}: {
  node: PlannerNode;
  now: Date;
  subTasks?: import("../types").SubTask[];
  onToggleSubTask?: (subId: string, current: boolean) => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit: () => void;
  variant: "today" | "overdue" | "suggestion";
  rescheduleAction?: { onClick: () => void; title: string; color: string };
  onHover?: (id: string | null) => void;
}) {
  const { arcs, projects } = usePlannerStore();
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const [exitAnim, setExitAnim] = useState<
    null | "complete" | "reschedule" | "delete"
  >(null);
  const collapseCtrl = useAnimationControls();
  const innerRef = useRef<HTMLDivElement>(null);

  async function collapse(delay: number, duration = 0.18) {
    await new Promise((r) => setTimeout(r, delay));
    await collapseCtrl.start({
      height: 0,
      opacity: 0,
      transition: { duration, ease: [0.4, 0, 1, 1] },
    });
  }

  async function handleComplete() {
    if (!onComplete) return;
    setExitAnim("complete");
    await collapse(480);
    onComplete();
  }

  async function handleReschedule() {
    if (!rescheduleAction) return;
    setExitAnim("reschedule");
    await collapse(360);
    rescheduleAction.onClick();
  }

  async function handleDelete() {
    if (!onDelete) return;
    setExitAnim("delete");
    await collapse(300, 0.14);
    onDelete();
  }

  const arc = node.arc_id ? arcs.find((a) => a.id === node.arc_id) : null;
  const proj = node.project_id ? projects.find((p) => p.id === node.project_id) : null;

  const leftBorderColor = variant === "overdue" ? "#ff3b3b" : null;

  const rowStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
    padding: "0.3rem 0.5rem",
    background:
      exitAnim === "complete"
        ? "rgba(74,222,128,0.08)"
        : exitAnim === "delete"
          ? "rgba(239,68,68,0.10)"
          : exitAnim === "reschedule"
            ? "rgba(245,200,66,0.07)"
            : variant === "overdue"
              ? hov
                ? "rgba(255,59,59,0.09)"
                : "rgba(255,59,59,0.04)"
              : variant === "suggestion"
                ? hov
                  ? "rgba(255,255,255,0.04)"
                  : "transparent"
                : hov
                  ? "rgba(255,255,255,0.05)"
                  : "transparent",
    border:
      variant === "suggestion"
        ? `1px dashed ${hov ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)"}`
        : variant === "overdue"
          ? `1px solid ${hov ? "rgba(255,59,59,0.45)" : "rgba(255,59,59,0.25)"}`
          : `1px solid ${hov ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)"}`,
    borderLeft: leftBorderColor
      ? `3px solid ${leftBorderColor}`
      : variant === "suggestion"
        ? `1px dashed ${hov ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)"}`
        : variant === "overdue"
          ? `3px solid ${hov ? "rgba(255,59,59,0.45)" : "rgba(255,59,59,0.25)"}`
          : `1px solid ${hov ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)"}`,
    opacity: variant === "suggestion" ? (hov ? 1 : 0.78) : 1,
    transition: "background 0.1s, border-color 0.1s, opacity 0.1s",
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
    fontSize: "1.05rem",
    letterSpacing: "1px",
    minHeight: "2rem",
  };

  const badge = (() => {
    if (variant === "overdue") {
      if (node.is_missed_schedule) return { label: "missed", color: "#f5c842" };
      const days = node.due_at
        ? Math.round(
            (now.getTime() - new Date(node.due_at + "T12:00:00").getTime()) /
              86400000,
          )
        : null;
      return { label: days ? `${days}d ago` : "overdue", color: "#ff3b3b" };
    }
    if (variant === "suggestion") {
      if (!node.due_at) return null;
      const daysUntil = Math.round(
        (new Date(node.due_at + "T12:00:00").getTime() - now.getTime()) /
          86400000,
      );
      if (daysUntil <= 1) return { label: "due soon", color: "#ff6b35" };
      return {
        label: `due in ${daysUntil}d`,
        color: daysUntil <= 3 ? "#f5a623" : "rgba(255,255,255,0.3)",
      };
    }
    if (node.due_at) {
      const daysUntil = Math.round(
        (new Date(node.due_at + "T12:00:00").getTime() - now.getTime()) /
          86400000,
      );
      if (daysUntil === 0) return { label: "due today", color: "#f5c842" };
      if (daysUntil > 0)
        return { label: `due ${daysUntil}d`, color: "#f5c842" };
    }
    return null;
  })();

  const effortStr = (() => {
    const m = node.estimated_duration_minutes;
    if (!m) return null;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const rem = m % 60;
      return rem ? `~${h}h${rem}m` : `~${h}h`;
    }
    return `~${m}m`;
  })();

  const subTotal = node.sub_total ?? 0;
  const subDone = node.sub_done ?? 0;

  return (
    <motion.div animate={collapseCtrl} style={{ overflow: "hidden" }}>
      <div ref={innerRef}>
        <div
          style={rowStyle}
          onMouseEnter={() => {
            setHov(true);
            onHover?.(node.id);
          }}
          onMouseLeave={() => {
            setHov(false);
            onHover?.(null);
          }}
        >
          {/* Scanline */}
          {exitAnim &&
            (() => {
              const color =
                exitAnim === "complete"
                  ? "#4ade80"
                  : exitAnim === "delete"
                    ? "#ef4444"
                    : (rescheduleAction?.color ?? "#f5c842");
              const dur = exitAnim === "delete" ? 0.26 : 0.34;
              return (
                <motion.div
                  initial={{ width: "0%", opacity: 1 }}
                  animate={{ width: "100%", opacity: [1, 1, 0] }}
                  transition={{ duration: dur, ease: "easeInOut" }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    height: 2,
                    background: `linear-gradient(to right, transparent, ${color}, transparent)`,
                    pointerEvents: "none",
                    zIndex: 10,
                  }}
                />
              );
            })()}

          {/* Line 1: star + title + effort + badge + actions */}
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}
          >
            {/* Importance star */}
            {node.importance_level === 1 && (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="#f5c842"
                style={{
                  flexShrink: 0,
                  filter: "drop-shadow(0 0 4px #f5c84288)",
                }}
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}

            {/* Title */}
            <span
              style={{
                color:
                  exitAnim === "complete"
                    ? "rgba(255,255,255,0.22)"
                    : variant === "suggestion"
                      ? `${arc?.color_hex ?? "rgba(255,255,255,0.6)"}99`
                      : (arc?.color_hex ?? "#fff"),
                textDecoration:
                  exitAnim === "complete" ? "line-through" : "none",
                transition: "color 0.3s",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.title}
            </span>

            {/* Effort */}
            {effortStr && (
              <span
                style={{
                  color: "rgba(255,255,255,0.28)",
                  flexShrink: 0,
                  fontSize: "0.88rem",
                  letterSpacing: "1px",
                }}
              >
                {effortStr}
              </span>
            )}

            {/* Badge */}
            {badge && badge.label && (
              <span
                style={{
                  background: `${badge.color}22`,
                  color: badge.color,
                  padding: "0 6px",
                  lineHeight: 1.5,
                  flexShrink: 0,
                  fontSize: "0.88rem",
                  letterSpacing: "0.5px",
                }}
              >
                {badge.label}
              </span>
            )}

            {/* Actions */}
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexShrink: 0,
              }}
            >
              {rescheduleAction && (
                <IconAction
                  icon={<Forward size={14} />}
                  color={rescheduleAction.color}
                  title={rescheduleAction.title}
                  onClick={handleReschedule}
                />
              )}
              {onComplete && (
                <IconAction
                  icon={<CheckboxOn size={14} />}
                  color="#4ade80"
                  title="complete"
                  onClick={handleComplete}
                />
              )}
              <IconAction
                icon={<PenSquare size={14} />}
                color="rgba(255,255,255,0.7)"
                title="edit"
                onClick={onEdit}
              />
              {onDelete && (
                <IconAction
                  icon={<SkullSharp size={14} />}
                  color="#ef4444"
                  title="delete"
                  onClick={handleDelete}
                />
              )}
            </span>
          </div>

          {/* Line 2: subtask count + arc + project + groups (only rendered when content exists) */}
          {(subTotal > 0 ||
            arc ||
            proj ||
            (node.groups ?? []).some((g) => !g.is_ungrouped)) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginTop: "0.18rem",
                paddingLeft: "0.1rem",
                flexWrap: "wrap",
              }}
            >
              {/* Arc tag */}
              {arc && (
                <span
                  style={{
                    color: arc.color_hex,
                    flexShrink: 0,
                    fontSize: "0.78rem",
                    letterSpacing: "1.5px",
                    opacity: 0.85,
                    border: `1px solid ${arc.color_hex}44`,
                    padding: "0 5px",
                    lineHeight: 1.5,
                  }}
                >
                  {arc.name}
                </span>
              )}

              {proj && (
                <span
                  style={{
                    color: "rgba(255,255,255,0.38)",
                    flexShrink: 0,
                    fontSize: "0.78rem",
                    letterSpacing: "1.5px",
                    lineHeight: 1.5,
                  }}
                >
                  {proj.name}
                </span>
              )}

              {/* Group badges */}
              {(node.groups ?? [])
                .filter((g) => !g.is_ungrouped)
                .map((g) => (
                  <span
                    key={g.id}
                    style={{
                      color: g.color_hex,
                      flexShrink: 0,
                      fontSize: "0.75rem",
                      letterSpacing: "1px",
                      border: `1px solid ${g.color_hex}55`,
                      padding: "0 4px",
                      lineHeight: 1.5,
                      opacity: 0.8,
                    }}
                  >
                    {g.name}
                  </span>
                ))}

              {/* Subtask count */}
              {subTotal > 0 && (
                <button
                  onClick={() => setSubtasksOpen((v) => !v)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    color: subtasksOpen ? "#fff" : "rgba(255,255,255,0.35)",
                    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                    fontSize: "0.85rem",
                    letterSpacing: "1px",
                    flexShrink: 0,
                    transition: "color 0.1s",
                  }}
                >
                  [{subDone}/{subTotal}]
                </button>
              )}
            </div>
          )}
        </div>

        {/* Subtask expansion */}
        {subtasksOpen && subTasks && subTasks.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.1rem",
              paddingLeft: "1.2rem",
              marginTop: "0.1rem",
            }}
          >
            {subTasks.map((s) => (
              <div
                key={s.id}
                onClick={() => onToggleSubTask?.(s.id, s.is_completed)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.2rem 0.5rem",
                  cursor: onToggleSubTask ? "pointer" : "default",
                  fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                  fontSize: "0.95rem",
                  letterSpacing: "1px",
                  color: s.is_completed
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(255,255,255,0.65)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  textDecoration: s.is_completed ? "line-through" : "none",
                }}
              >
                {s.is_completed ? (
                  <CheckboxOn
                    width={13}
                    height={13}
                    style={{ color: "#4ade80", flexShrink: 0 }}
                  />
                ) : (
                  <Checkbox
                    width={13}
                    height={13}
                    style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }}
                  />
                )}
                {s.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Mini card (shared by OverdueCard + SuggestionCard) ───────────────────────

function MiniCard({
  node,
  onComplete,
  onDelete,
  onEdit,
  badge,
  primaryAction,
  suggestion,
}: {
  node: PlannerNode;
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
        {onComplete &&
          (() => {
            const subTotal = node.sub_total ?? 0;
            const subDone = node.sub_done ?? 0;
            const blocked = subTotal > 0 && subDone < subTotal;
            return (
              <button
                onClick={blocked ? undefined : onComplete}
                title={
                  blocked
                    ? `finish subtasks first (${subDone}/${subTotal})`
                    : "done"
                }
                style={{
                  ...actionBtn("#4ade80"),
                  opacity: blocked ? 0.35 : 1,
                  cursor: blocked ? "not-allowed" : "pointer",
                }}
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
  onComplete,
  onDelete,
  onEdit,
  rescheduleToday,
}: {
  node: PlannerNode;
  now: Date;
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

          {/* Center: dot */}
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
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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

const CAL_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const CAL_DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function calToDS(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function calAddDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function calGetWeekMon(offset: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  return calAddDays(today, (dow === 0 ? -6 : 1 - dow) + offset * 7);
}
function calAddMins(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function calNormTime(t: string): string {
  if (t.includes(":")) return t;
  if (t.length === 4) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return t;
}
function getArcColorCal(
  n: PlannerNode,
  arcs: Arc[],
  projects: Project[],
): string {
  if (n.arc_id)
    return arcs.find((a) => a.id === n.arc_id)?.color_hex ?? "#b0b0a8";
  if (n.project_id) {
    const proj = projects.find((p) => p.id === n.project_id);
    if (proj?.arc_id)
      return arcs.find((a) => a.id === proj.arc_id)?.color_hex ?? "#b0b0a8";
  }
  return "#b0b0a8";
}

function EventCalendarPanel({
  arcs,
  projects,
  nodes: storeNodes,
  highlightNodeId,
}: {
  arcs: Arc[];
  projects: Project[];
  nodes: PlannerNode[];
  highlightNodeId?: string | null;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDir, setWeekDir] = useState<1 | -1>(1);
  const [eventNodes, setEventNodes] = useState<PlannerNode[]>([]);
  const [nowCal, setNowCal] = useState(new Date());
  const [tooltip, setTooltip] = useState<{
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hourH, setHourH] = useState(28);

  const END_HOUR = 24;

  useEffect(() => {
    const id = setInterval(() => setNowCal(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const mon = calGetWeekMon(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => calAddDays(mon, i));
  const today = calToDS(new Date());

  useEffect(() => {
    const from = calToDS(mon);
    const to = calToDS(calAddDays(mon, 6));
    loadEventNodesForWeek(from, to).then(setEventNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, storeNodes]);

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerNode[]>();
    for (const d of days) map.set(calToDS(d), []);
    for (const n of eventNodes) {
      const k = (n.planned_start_at ?? "").slice(0, 10);
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
  }, [TOTAL_HRS, weekOffset]);

  const LABEL_W = 36;
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "0.75rem 1rem",
        minHeight: 0,
        margin: "0.5rem",
      }}
    >
      <style>{`
        @keyframes calPulseRed {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px 2px rgba(255,85,85,0.4); }
          50% { opacity: 0.45; box-shadow: 0 0 2px 1px rgba(255,85,85,0.15); }
        }
      `}</style>

      {/* Section title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
          flexShrink: 0,
        }}
      >
        <AspectRatio width={15} height={15} style={{ color: "#f5c842" }} />
        <span
          style={{
            fontFamily: "'VT323','HBIOS-SYS',monospace",
            fontSize: "1.05rem",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "#f5c842",
          }}
        >
          weekly overview
        </span>
      </div>

      {/* Week nav */}
      <div
        style={{
          display: "flex",
          paddingLeft: LABEL_W,
          flexShrink: 0,
          justifyContent: "center",
          marginBottom: 14,
          marginTop: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "4px 10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => {
                setWeekDir(-1);
                setWeekOffset(weekOffset - 1);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.5)",
                padding: 0,
              }}
            >
              <ChevronLeft width={14} height={14} />
            </button>
            <span
              style={{
                ...mono,
                fontSize: "0.88rem",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: 1,
              }}
            >
              {CAL_MONTH_SHORT[mon.getMonth()]} {mon.getDate()} –{" "}
              {calAddDays(mon, 6).getDate()}
            </span>
            <button
              onClick={() => {
                setWeekDir(1);
                setWeekOffset(weekOffset + 1);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.5)",
                padding: 0,
              }}
            >
              <ChevronRight width={14} height={14} />
            </button>
          </div>
          <button
            onClick={() => {
              setWeekDir(weekOffset > 0 ? -1 : 1);
              setWeekOffset(0);
            }}
            style={{
              ...mono,
              background: "none",
              border: "none",
              color:
                weekOffset === 0 ? "var(--teal)" : "rgba(255,255,255,0.35)",
              fontSize: "0.8rem",
              padding: 0,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            [this week]
          </button>
        </div>
      </div>

      {/* Day headers + time grid — animated on week change */}
      <motion.div
        key={weekOffset}
        initial={{ x: weekDir * 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeInOut" }}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Day headers */}
        <div
          style={{
            display: "flex",
            paddingLeft: LABEL_W,
            flexShrink: 0,
            marginBottom: 4,
            gap: 2,
          }}
        >
          {days.map((d) => {
            const key = calToDS(d);
            const isToday = key === today;
            return (
              <div
                key={key}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingBottom: 4,
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <span
                  style={{
                    ...mono,
                    fontSize: "0.68rem",
                    letterSpacing: 1.5,
                    color: isToday ? "var(--teal)" : "rgba(255,255,255,0.28)",
                    textTransform: "uppercase",
                  }}
                >
                  {CAL_DAY_SHORT[d.getDay()].slice(0, 2)}
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "1.05rem",
                    lineHeight: 1.2,
                    color: isToday ? "#000" : "rgba(255,255,255,0.45)",
                    background: isToday ? "var(--teal)" : "transparent",
                    padding: isToday ? "0 5px" : undefined,
                  }}
                >
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Load strip */}
        <div
          style={{
            display: "flex",
            paddingLeft: LABEL_W,
            flexShrink: 0,
            marginBottom: 10,
          }}
        >
          {days.map((d) => {
            const key = calToDS(d);
            const dayEvents = (byDay.get(key) ?? []).filter(
              (n) => n.planned_start_at && n.planned_start_at.length > 10,
            );
            const count = dayEvents.length;
            const totalMins = dayEvents.reduce(
              (s, n) => s + (n.estimated_duration_minutes ?? 30),
              0,
            );
            const yellows = [
              "#fff9c4",
              "#fde968",
              "#f5c842",
              "#e6a817",
              "#c47f00",
              "#a06000",
            ];
            const colorIdx =
              totalMins === 0
                ? -1
                : Math.min(Math.floor(totalMins / 60), yellows.length - 1);
            const bg = colorIdx < 0 ? "transparent" : yellows[colorIdx];
            return (
              <div
                key={key}
                style={{ flex: 1, display: "flex", justifyContent: "center" }}
              >
                {count > 0 && (
                  <div
                    style={{
                      background: bg,
                      width: 18,
                      height: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      ...mono,
                      fontSize: "0.95rem",
                      color: "#000",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div
          ref={gridRef}
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {/* Hour labels */}
            <div
              style={{ width: LABEL_W, flexShrink: 0, position: "relative" }}
            >
              {Array.from({ length: TOTAL_HRS + 1 }, (_, i) => {
                const h = i + START_HOUR;
                const isCurrentHour =
                  weekOffset === 0 && h === nowCal.getHours();
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: Math.max(0, i * hourH - 9),
                      right: 6,
                      ...mono,
                      fontSize: "0.85rem",
                      color: isCurrentHour
                        ? "#ff5555"
                        : "rgba(255,255,255,0.3)",
                      lineHeight: 1,
                      userSelect: "none",
                      fontWeight: isCurrentHour ? "bold" : "normal",
                    }}
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                );
              })}
            </div>

            {/* Grid + day columns */}
            <div
              style={{ flex: 1, position: "relative", display: "flex", gap: 2 }}
            >
              {/* Hour lines */}
              {Array.from({ length: TOTAL_HRS }, (_, i) => {
                const h = i + START_HOUR;
                const isMajor = h % 3 === 0;
                return (
                  <div
                    key={h}
                    style={{
                      position: "absolute",
                      top: i * hourH,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: isMajor
                        ? "rgba(255,255,255,0.14)"
                        : "rgba(255,255,255,0.05)",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                );
              })}

              {/* Full-width current-time glow line */}
              {weekOffset === 0 &&
                (() => {
                  const topPct =
                    (nowCal.getHours() * 60 + nowCal.getMinutes()) / 60 -
                    START_HOUR;
                  if (topPct < 0 || topPct > TOTAL_HRS) return null;
                  return (
                    <div
                      style={{
                        position: "absolute",
                        top: topPct * hourH,
                        left: 0,
                        right: 0,
                        height: 1,
                        background: "rgba(255,85,85,0.25)",
                        boxShadow: "0 0 6px 1px rgba(255,85,85,0.15)",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    />
                  );
                })()}

              {days.map((d, di) => {
                const key = calToDS(d);
                const isToday = key === today;
                const dayNodes = byDay.get(key) ?? [];

                return (
                  <div
                    key={key}
                    style={{
                      flex: 1,
                      position: "relative",
                      borderLeft:
                        di === 0 ? "none" : "1px solid rgba(255,255,255,0.07)",
                      background: isToday
                        ? "rgba(0,196,167,0.06)"
                        : "transparent",
                    }}
                  >
                    {/* Today: bright current-time line + dot */}
                    {isToday &&
                      (() => {
                        const topPct =
                          (nowCal.getHours() * 60 + nowCal.getMinutes()) / 60 -
                          START_HOUR;
                        if (topPct < 0 || topPct > TOTAL_HRS) return null;
                        return (
                          <div
                            style={{
                              position: "absolute",
                              top: topPct * hourH,
                              left: 0,
                              right: 0,
                              height: 2,
                              background: "#ff5555",
                              boxShadow: "0 0 8px 2px rgba(255,85,85,0.4)",
                              zIndex: 5,
                              pointerEvents: "none",
                              animation: "calPulseRed 4s ease-in-out infinite",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: -4,
                                top: -3,
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#ff5555",
                                boxShadow: "0 0 6px 2px rgba(255,85,85,0.5)",
                                animation:
                                  "calPulseRed 4s ease-in-out infinite",
                              }}
                            />
                          </div>
                        );
                      })()}

                    {dayNodes.map((n) => {
                      const timeStr =
                        n.planned_start_at && n.planned_start_at.length > 10
                          ? n.planned_start_at.slice(11, 16)
                          : null;
                      if (!timeStr) return null;
                      const [h, m] = timeStr.split(":").map(Number);
                      const topPx = (h + m / 60 - START_HOUR) * hourH;
                      if (topPx < 0) return null;
                      const dur = n.estimated_duration_minutes ?? 30;
                      const heightPx = Math.max(6, (dur / 60) * hourH);
                      const color = getArcColorCal(n, arcs, projects);
                      const normTime = calNormTime(timeStr);
                      const endTime = dur ? calAddMins(normTime, dur) : null;
                      const label = endTime
                        ? `${normTime}–${endTime}`
                        : normTime;

                      const endH = h + Math.floor((m + dur) / 60);
                      const endM = (m + dur) % 60;
                      const eventEndMs = new Date(
                        key +
                          "T" +
                          String(endH).padStart(2, "0") +
                          ":" +
                          String(endM).padStart(2, "0") +
                          ":00",
                      ).getTime();
                      const isPast = eventEndMs < nowCal.getTime();

                      return (
                        <div
                          key={n.id}
                          onMouseEnter={(e) =>
                            setTooltip({
                              title: `${n.title} · ${label}`,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseMove={(e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : null,
                            )
                          }
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            position: "absolute",
                            top: topPx + 1,
                            left: 3,
                            right: 3,
                            height: heightPx - 2,
                            background: isPast
                              ? `repeating-linear-gradient(45deg, ${color}99, ${color}99 2px, transparent 2px, transparent 7px)`
                              : color,
                            border:
                              n.id === highlightNodeId
                                ? `2px solid #fff`
                                : `1px solid ${color}${n.is_completed ? "33" : isPast ? "22" : "66"}`,
                            opacity: n.is_completed
                              ? 0.5
                              : highlightNodeId && n.id !== highlightNodeId
                                ? 0.35
                                : 1,
                            zIndex: n.id === highlightNodeId ? 3 : 2,
                            cursor: "default",
                            transition: "opacity 0.12s, border-color 0.12s",
                            boxSizing: "border-box",
                            boxShadow:
                              n.id === highlightNodeId
                                ? `0 0 0 1px ${color}`
                                : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {tooltip &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: tooltip.x + 12,
              top: tooltip.y - 28,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              ...mono,
              fontSize: "0.95rem",
              letterSpacing: "0.5px",
              padding: "2px 10px",
              pointerEvents: "none",
              zIndex: 9999,
              whiteSpace: "nowrap",
            }}
          >
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
          marginBottom: "0.35rem",
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

// Header compact progress tracker
function HeaderProgressTracker({
  todayNodes,
  doneSummary,
}: {
  todayNodes: PlannerNode[];
  doneSummary: TodayDoneSummary;
}) {
  const totalCount = todayNodes.length + doneSummary.count;
  const pct =
    totalCount > 0 ? Math.round((doneSummary.count / totalCount) * 100) : 0;
  const barColor = "var(--teal)";

  if (totalCount === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 110,
        maxWidth: 160,
      }}
    >
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
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
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

// Panel 2 — Mini Calendar
const WEEKDAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// Gradient stops: teal → green → yellow → orange, opacity 0.18 → 0.60
const HEAT_STOPS: Array<{
  t: number;
  rgb: [number, number, number];
  a: number;
}> = [
  { t: 0, rgb: [0, 196, 167], a: 0.18 },
  { t: 0.33, rgb: [74, 222, 128], a: 0.32 },
  { t: 0.66, rgb: [245, 200, 66], a: 0.46 },
  { t: 1, rgb: [255, 107, 53], a: 0.6 },
];

function heatColor(count: number): string {
  if (count === 0) return "transparent";
  const t = Math.min((count - 1) / 9, 1); // 1..10 → 0..1
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const s0 = HEAT_STOPS[i],
      s1 = HEAT_STOPS[i + 1];
    if (t <= s1.t) {
      const f = (t - s0.t) / (s1.t - s0.t);
      const r = Math.round(s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * f);
      const g = Math.round(s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * f);
      const b = Math.round(s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * f);
      const a = (s0.a + (s1.a - s0.a) * f).toFixed(2);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  const last = HEAT_STOPS[HEAT_STOPS.length - 1];
  return `rgba(${last.rgb[0]},${last.rgb[1]},${last.rgb[2]},${last.a})`;
}

function MiniCalendarPanel() {
  const { nodes } = usePlannerStore();
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [dayData, setDayData] = useState<CalendarDayData[]>([]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    titles: string[];
    date: string;
  } | null>(null);

  useEffect(() => {
    loadMonthCompletions(viewDate.getFullYear(), viewDate.getMonth() + 1)
      .then(setDayData)
      .catch(() => {});
  }, [viewDate, nodes]);

  const dataMap = useMemo(() => {
    const m = new Map<string, CalendarDayData>();
    dayData.forEach((d) => m.set(d.date, d));
    return m;
  }, [dayData]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build grid cells: leading nulls + day numbers
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    setDirection("prev");
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setDirection("next");
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  const VT = "'VT323', 'HBIOS-SYS', monospace";
  const TEAL = "#00c4a7";
  const monthKey = `${year}-${month}`;

  return (
    <SidebarPanel title="calendar" icon={Calendar}>
      {/* Month nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            all: "unset",
            cursor: "pointer",
            color: "rgba(255,255,255,0.4)",
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#fff")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color =
              "rgba(255,255,255,0.4)")
          }
        >
          <ChevronLeft width={14} height={14} />
        </button>
        <div
          style={{ overflow: "hidden", display: "flex", alignItems: "center" }}
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.span
              key={monthKey}
              custom={direction}
              variants={{
                initial: (dir: string) => ({
                  opacity: 0,
                  y: dir === "next" ? 10 : -10,
                }),
                animate: { opacity: 1, y: 0 },
                exit: (dir: string) => ({
                  opacity: 0,
                  y: dir === "next" ? -10 : 10,
                }),
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.16, ease: "easeInOut" }}
              style={{
                fontFamily: VT,
                fontSize: "1.1rem",
                letterSpacing: "3px",
                color: "#ffffff",
              }}
            >
              {MONTH_NAMES[month]} {year}
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          onClick={nextMonth}
          style={{
            all: "unset",
            cursor: "pointer",
            color: "rgba(255,255,255,0.4)",
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#fff")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color =
              "rgba(255,255,255,0.4)")
          }
        >
          <ChevronRight width={14} height={14} />
        </button>
      </div>

      {/* Weekday headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          marginBottom: "0.2rem",
        }}
      >
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontFamily: VT,
              fontSize: "0.8rem",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.25)",
              lineHeight: 1.6,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={monthKey}
            custom={direction}
            variants={{
              initial: (dir: string) => ({
                opacity: 0,
                x: dir === "next" ? 28 : -28,
              }),
              animate: { opacity: 1, x: 0 },
              exit: (dir: string) => ({
                opacity: 0,
                x: dir === "next" ? -28 : 28,
              }),
            }}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "2px",
            }}
          >
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const pad = String(day).padStart(2, "0");
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${pad}`;
              const data = dataMap.get(dateStr);
              const isToday = isCurrentMonth && dateStr === todayStr;

              const bg = heatColor(data?.count ?? 0);

              return (
                <div
                  key={i}
                  onMouseEnter={
                    data
                      ? (e) => {
                          const r = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setTooltip({
                            x: r.left + r.width / 2,
                            y: r.top,
                            titles: data.titles,
                            date: dateStr,
                          });
                        }
                      : undefined
                  }
                  onMouseLeave={data ? () => setTooltip(null) : undefined}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "3px 0 4px",
                    background: bg,
                    outline: isToday ? `1px solid ${TEAL}` : "none",
                    opacity: 1,
                    transition: "opacity 0.1s",
                  }}
                >
                  {/* Date number */}
                  <span
                    style={{
                      fontFamily: VT,
                      fontSize: "1rem",
                      letterSpacing: "0.5px",
                      lineHeight: 1,
                      color: isToday
                        ? TEAL
                        : data
                          ? "rgba(255,255,255,0.85)"
                          : "rgba(255,255,255,0.4)",
                      textShadow: isToday ? `0 0 10px ${TEAL}88` : "none",
                      marginBottom: 3,
                    }}
                  >
                    {day}
                  </span>

                  {/* Count circle */}
                  {data ? (
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "0.82rem",
                          lineHeight: 1,
                          color: "rgba(255,255,255,0.9)",
                        }}
                      >
                        {data.count > 9 ? "9+" : data.count}
                      </span>
                    </div>
                  ) : (
                    <div style={{ width: 18, height: 18 }} />
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Tooltip portal */}
      {tooltip &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
              background: "#0c0c0c",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "5px 10px 6px",
              zIndex: 9500,
              pointerEvents: "none",
              fontFamily: VT,
              boxShadow: "0 4px 16px rgba(0,0,0,0.85)",
              minWidth: 120,
              maxWidth: 220,
            }}
          >
            <div
              style={{
                fontSize: "0.85rem",
                letterSpacing: "2px",
                color: TEAL,
                marginBottom: 4,
              }}
            >
              {tooltip.date}
            </div>
            {tooltip.titles.map((t, i) => (
              <div
                key={i}
                style={{
                  fontSize: "0.95rem",
                  letterSpacing: "0.5px",
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                › {t}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </SidebarPanel>
  );
}

// Panel 3b — Completion Streak

function StreakPanel() {
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };
  const [streak, setStreak] = useState(0);
  const [longest, setLongest] = useState(0);

  useEffect(() => {
    const calc = async () => {
      const now = new Date();
      // Current streak
      let s = 0;
      let d = new Date(now);
      while (true) {
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const days = await loadMonthCompletions(year, month);
        const key = `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const entry = days.find((x) => x.date === key);
        if (!entry || entry.count === 0) break;
        s++;
        d.setDate(d.getDate() - 1);
        if (s > 365) break;
      }
      setStreak(s);

      // Longest streak — scan last 365 days
      let best = 0,
        run = 0;
      const scan = new Date(now);
      for (let i = 0; i < 365; i++) {
        const year = scan.getFullYear();
        const month = scan.getMonth() + 1;
        const days = await loadMonthCompletions(year, month);
        const key = `${year}-${String(month).padStart(2, "0")}-${String(scan.getDate()).padStart(2, "0")}`;
        const entry = days.find((x) => x.date === key);
        if (entry && entry.count > 0) {
          run++;
          best = Math.max(best, run);
        } else run = 0;
        scan.setDate(scan.getDate() - 1);
      }
      setLongest(Math.max(best, s));
    };
    calc();
  }, []);

  const lineStyle: React.CSSProperties = {
    ...mono,
    fontSize: "1.1rem",
    letterSpacing: "2px",
    color: "rgba(255,255,255,0.45)",
    paddingLeft: "2.2rem",
    lineHeight: 1,
  };

  return (
    <SidebarPanel title="streak" icon={Wind}>
      <div style={lineStyle}>
        consecutive days:{" "}
        <span
          style={{
            color: streak > 0 ? "var(--teal)" : "rgba(255,255,255,0.2)",
            fontSize: "1.6rem",
          }}
        >
          {streak}
        </span>
      </div>
      <div style={{ ...lineStyle, marginTop: "-0.3rem" }}>
        longest streak:{" "}
        <span
          style={{
            color:
              longest > 0 ? "rgba(0,196,167,0.5)" : "rgba(255,255,255,0.2)",
            fontSize: "1.6rem",
          }}
        >
          {longest}
        </span>
      </div>
    </SidebarPanel>
  );
}

// Panel 4 — Task Velocity

function TaskVelocityPanel({ nodes }: { nodes: PlannerNode[] }) {
  const mono: React.CSSProperties = {
    fontFamily: "'VT323', 'HBIOS-SYS', monospace",
  };
  const [pts, setPts] = useState<
    { date: string; count: number; day: string }[]
  >([]);

  useEffect(() => {
    const now = new Date();
    const load = async () => {
      const curr = await loadMonthCompletions(
        now.getFullYear(),
        now.getMonth() + 1,
      );
      const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prev = await loadMonthCompletions(
        prevD.getFullYear(),
        prevD.getMonth() + 1,
      );
      const map = new Map<string, number>();
      for (const d of [...prev, ...curr]) map.set(d.date, d.count);
      setPts(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - 6 + i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const label = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d.getDay()];
          return { date: key, count: map.get(key) ?? 0, day: label };
        }),
      );
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const todayCount = pts.find((p) => p.date === todayStr)?.count ?? 0;
  const avg =
    pts.length > 0
      ? (pts.reduce((s, p) => s + p.count, 0) / pts.length).toFixed(1)
      : "—";

  const chartConfig = {
    count: { label: "Completed", color: "var(--teal)" },
  };

  return (
    <SidebarPanel title="velocity" icon={Chart}>
      <ChartContainer
        config={chartConfig}
        style={{ width: "93%", height: 108, margin: "0 auto" }}
      >
        <LineChart
          data={pts}
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={(props) => {
              const { x, y, payload } = props;
              const isToday =
                pts.find((p) => p.day === payload.value)?.date === todayStr;
              return (
                <g transform={`translate(${x},${y})`}>
                  {isToday && (
                    <rect
                      x={-12}
                      y={0}
                      width={24}
                      height={20}
                      rx={0}
                      fill="var(--teal)"
                    />
                  )}
                  <text
                    x={0}
                    y={14}
                    textAnchor="middle"
                    fill={isToday ? "#000" : "rgba(255,255,255,0.75)"}
                    fontSize={17}
                    fontFamily="'VT323','HBIOS-SYS',monospace"
                  >
                    {payload.value}
                  </text>
                </g>
              );
            }}
          />
          <YAxis hide />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div
                  style={{
                    background: "#0d0d0d",
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "3px 10px",
                    ...mono,
                    fontSize: "0.9rem",
                    color: "#fff",
                  }}
                >
                  {label} ·{" "}
                  <span style={{ color: "var(--teal)" }}>
                    {payload[0].value}
                  </span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--teal)"
            strokeWidth={1.5}
            dot={(props) => {
              const isToday = pts[props.index]?.date === todayStr;
              return (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={isToday ? 4 : 2.5}
                  fill={isToday ? "#f5c842" : "rgba(255,255,255,0.5)"}
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 4, fill: "#ffffff", stroke: "none" }}
          />
        </LineChart>
      </ChartContainer>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          ...mono,
          fontSize: "1.15rem",
          letterSpacing: "1px",
          color: "rgba(255,255,255,0.7)",
          marginTop: 4,
        }}
      >
        <span>
          today <span style={{ color: "var(--teal)" }}>{todayCount}</span>
        </span>
        <span>
          7d avg <span style={{ color: "rgba(255,255,255,0.6)" }}>{avg}</span>
        </span>
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
