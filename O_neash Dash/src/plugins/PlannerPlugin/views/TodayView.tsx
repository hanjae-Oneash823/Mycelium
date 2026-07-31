import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ComposedChart, Bar } from "recharts";
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
  Algorithm,
  Fire,
  BracesContent,
  Flatten,
} from "pixelarticons/react";
import { Checkbox } from "pixelarticons/react/Checkbox";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { Plus } from "pixelarticons/react/Plus";
import { Calendar } from "pixelarticons/react/Calendar";
import { Chart } from "pixelarticons/react/Chart";
import { Wind } from "pixelarticons/react/Wind";
import { AspectRatio } from "pixelarticons/react/AspectRatio";
import { ArrowBarDown } from "pixelarticons/react/ArrowBarDown";
import { usePlannerStore } from "../store/usePlannerStore";
import { useArcVisibilityStore } from "../../../store/useArcVisibilityStore";
import { useViewStore } from "../store/useViewStore";
import { useSessionStore } from "../store/useSessionStore";
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
import { loadSessionsForWeek, loadArcBreakdown } from "../lib/onTheClockDb";
import type { SessionNodeWithNode, ArcBreakdown } from "../lib/onTheClockDb";
import DotNode from "../components/DotNode";
import QuickAddInput from "../components/QuickAddInput";
import type { PlannerNode, Arc, Project } from "../types";

const SUGGESTION_LIMIT = 3;

export default function TodayView() {
  const {
    nodes,
    arcs: allArcs,
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
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
  const { openTaskForm, openTaskFormEdit, setHoveredNodeId } = useViewStore();
  const activeSession      = useSessionStore((s) => s.activeSession);
  const activeSessionNodes = useSessionStore((s) => s.activeSessionNodes);
  const sessionStartNode   = useSessionStore((s) => s.startNode);
  const sessionFinishNode  = useSessionStore((s) => s.finishNode);
  const sessionReturnQueue = useSessionStore((s) => s.returnToQueue);
  const sessionRemoveNode  = useSessionStore((s) => s.removeNode);
  const sessionAddNodes    = useSessionStore((s) => s.addNodes);
  const activeSessionNodeIds = useMemo(
    () => new Set(activeSessionNodes.map((n) => n.node_id)),
    [activeSessionNodes],
  );
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

  const [chevronHovered, setChevronHovered] = useState(false);

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
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          border: "0.5px solid rgba(255,255,255,0.35)",
        }}
      >
        {/* Date + SYS_LOG block */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              lineHeight: 1,
            }}
          >
            {/* Plugin title */}
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
        <HeaderProgressTracker
          todayNodes={todayNodes}
          doneSummary={doneSummary}
        />

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

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
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
              padding: "1.25rem 1.8rem 1.25rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "2.25rem",
            }}
          >
            {/* IN SESSION */}
            {activeSession && (() => {
              const visibleSessionNodes = activeSessionNodes.filter((sn) => {
                const plannerNode = nodes.find((n) => n.id === sn.node_id);
                if (plannerNode?.is_completed) return false;
                if (sn.status === 'queued' || sn.status === 'in_progress') return true;
                if (sn.status === 'done') return plannerNode ? !plannerNode.is_completed : false;
                return false;
              });
              // always render — title stays visible even with no nodes
              const elapsedMs = activeSession.actual_start
                ? Date.now() - new Date(activeSession.actual_start).getTime()
                : 0;
              const elapsedMins = Math.floor(elapsedMs / 60000);
              const elapsedStr = elapsedMins >= 60
                ? `${Math.floor(elapsedMins / 60)}h ${elapsedMins % 60}m`
                : `${elapsedMins}m`;
              const sessionLocation = activeSession.location_name ?? activeSession.title;
              const completedCount = activeSessionNodes.filter((n) => n.status === "done").length;
              const totalCount = activeSessionNodes.length;
              return (
                <section>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    marginBottom: "0.5rem",
                    background: "#f5c842",
                    padding: "0.1rem 0.6rem",
                    color: "#000",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", color: "#0055FF" }}>
                      <Algorithm size={20} />
                    </span>
                    <span style={{
                      fontSize: "1.45rem",
                      letterSpacing: "4px",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      fontFamily: "var(--font-main), var(--font-kr), monospace",
                    }}>
                      {`in session · ${visibleSessionNodes.length}`.split("").map((ch, i) => (
                        <span
                          key={i}
                          style={{
                            animation: `letterDip 3.2s steps(1) infinite`,
                            animationDelay: `${i * 0.2}s`,
                            display: "inline-block",
                          }}
                        >{ch}</span>
                      ))}
                    </span>
                    <div style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      fontFamily: "var(--font-main), var(--font-kr), monospace",
                      fontSize: "1.1rem",
                      letterSpacing: "1px",
                      opacity: 0.75,
                    }}>
                      <span>{elapsedStr}</span>
                      {sessionLocation && <><span style={{ opacity: 0.4 }}>·</span><span>{sessionLocation}</span></>}
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{completedCount} / {totalCount}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    {visibleSessionNodes.map((sn) => {
                      const fullNode = nodes.find((n) => n.id === sn.node_id);
                      return (
                        <InSessionTaskRow
                          key={sn.node_id}
                          sessionNode={sn}
                          node={fullNode}
                          onStartNode={() => sessionStartNode(sn.node_id)}
                          onReturnQueue={() => sessionReturnQueue(sn.node_id)}
                          onFinish={() => { sessionFinishNode(sn.node_id); if (fullNode) completeNode(fullNode.id); loadAll(); }}
                          onEdit={() => fullNode && openTaskFormEdit(fullNode)}
                          onRemove={() => sessionRemoveNode(sn.node_id)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })()}

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
                    background: "#ff3b3b",
                    padding: "0.1rem 0.6rem",
                    color: "#000",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <Frown size={20} />
                  </span>
                  <span
                    style={{
                      fontSize: "1.45rem",
                      letterSpacing: "4px",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      fontFamily: "var(--font-main), var(--font-kr), monospace",
                    }}
                  >
                    overdue · {overdue.length}
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      marginLeft: "auto",
                      transition: "transform 0.18s",
                      transform: overdueCollapsed ? "rotate(-90deg)" : "none",
                      opacity: 0.6,
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
                        sessionAction={activeSession && !activeSessionNodeIds.has(node.id)
                          ? { onClick: () => sessionAddNodes([node.id]) }
                          : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* EVENTS */}
            {todayEvents.length > 0 && (
              <section style={{ marginBottom: "0.5rem" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  marginBottom: "0.5rem",
                  background: "rgba(192,132,252,1)",
                  padding: "0.1rem 0.6rem",
                  color: "#000",
                }}>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <AlarmClock size={20} />
                  </span>
                  <span style={{
                    fontSize: "1.45rem",
                    letterSpacing: "4px",
                    textTransform: "uppercase",
                    lineHeight: 1,
                    fontFamily: "var(--font-main), var(--font-kr), monospace",
                  }}>
                    {`events · ${todayEvents.length}`}
                  </span>
                </div>
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
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                marginBottom: "0.5rem",
                background: "#00c4a7",
                padding: "0.1rem 0.6rem",
                color: "#000",
              }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <HumanArmsUp size={20} />
                </span>
                <span style={{
                  fontSize: "1.45rem",
                  letterSpacing: "4px",
                  textTransform: "uppercase",
                  lineHeight: 1,
                  fontFamily: "var(--font-main), var(--font-kr), monospace",
                }}>
                  {`today · ${todayNodes.length}`}
                </span>
              </div>
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
                    {todayNodes
                      .filter((node) => !activeSessionNodeIds.has(node.id))
                      .map((node) => (
                        <TaskRow
                          key={node.id}
                          {...cardProps(node)}
                          variant="today"
                          rescheduleAction={{
                            onClick: () => rescheduleNode(node.id, tomorrow),
                            title: "→ tmrw",
                            color: "rgba(255,255,255,0.75)",
                          }}
                          sessionAction={activeSession
                            ? { onClick: () => sessionAddNodes([node.id]) }
                            : undefined}
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
                            icon: <ArrowBarDown size={14} />,
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
                    press + to add something
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
                  fontFamily: "var(--font-main), var(--font-kr), monospace",
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
          <TaskVelocityPanel nodes={nodes} />
          <SessionBreakdownPanel />
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

  const VT = "var(--font-main), var(--font-kr), monospace";
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
            border: `1.5px solid ${hov ? "rgba(192,132,252,1)" : "rgba(192,132,252,0.6)"}`,
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
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
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
              fontFamily: "var(--font-main), var(--font-kr), monospace",
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
  labelClassName,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  labelClassName?: string;
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
      <span className={labelClassName} style={{ display: "flex", alignItems: "center", opacity: 0.9 }}>
        {icon}
      </span>
      <span
        className={labelClassName}
        style={{
          fontSize: "1.45rem",
          letterSpacing: "4px",
          textTransform: "uppercase",
          lineHeight: 1,
          fontFamily: "var(--font-main), var(--font-kr), monospace",
        }}
      >
        {label}
      </span>
      <div className={labelClassName} style={{ flex: 1, height: 1, background: color, opacity: 0.4 }} />
    </div>
  );
}

// ─── In-session task row ──────────────────────────────────────────────────────

function InSessionTaskRow({
  sessionNode,
  node,
  onStartNode,
  onReturnQueue,
  onFinish,
  onEdit,
  onRemove,
}: {
  sessionNode: SessionNodeWithNode;
  node: PlannerNode | undefined;
  onStartNode: () => void;
  onReturnQueue: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { arcs: allArcs, projects } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
  const [hov, setHov] = useState(false);
  const isActive = sessionNode.status === "in_progress";
  const arc  = node?.arc_id     ? arcs.find((a) => a.id === node.arc_id)         : null;
  const proj = node?.project_id ? projects.find((p) => p.id === node.project_id) : null;

  const [elapsedSecs, setElapsedSecs] = useState(0);
  useEffect(() => {
    if (!isActive || !sessionNode.time_started) { setElapsedSecs(0); return; }
    const tick = () => setElapsedSecs(Math.floor((Date.now() - new Date(sessionNode.time_started!).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, sessionNode.time_started]);

  const elapsedLabel = (() => {
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={isActive ? "session-active-pulse" : undefined}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "0.3rem 0.5rem",
        border: `1px solid ${isActive ? "#f5c842" : hov ? "rgba(245,200,66,0.6)" : "rgba(245,200,66,0.32)"}`,
        background: "#000",
        transition: "background 0.1s, border-color 0.1s",
        fontFamily: "var(--font-main), var(--font-kr), monospace",
        fontSize: "1.05rem",
        letterSpacing: "1px",
        minHeight: "2rem",
      }}
    >
      {/* Line 1: active indicator + title + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>

        {/* Active pulse dot */}
        {isActive && (
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#ff3b3b", flexShrink: 0,
            animation: "dot-pulse 1.2s ease-in-out infinite",
            // @ts-expect-error CSS custom properties
            "--dot-glow": "#ff3b3b",
            "--dot-glow-faint": "rgba(255,59,59,0.25)",
            "--pulse-dur": "1.2s",
          }} />
        )}

        {/* Title */}
        <span style={{
          color: arc?.color_hex ?? "#fff",
          flex: 1, minWidth: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }}>
          {sessionNode.title}
        </span>

        {/* Actions */}
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {/* Elapsed time badge (active nodes only) */}
          {isActive && sessionNode.time_started && (
            <span style={{
              background: "#f5c842", color: "#000",
              fontFamily: "var(--font-main), var(--font-kr), monospace",
              fontSize: "1rem", letterSpacing: "1px",
              padding: "0 5px", lineHeight: 1.2, flexShrink: 0, marginRight: "0.35rem",
            }}>
              {elapsedLabel}
            </span>
          )}
          {/* Active / Queue toggle */}
          {isActive ? (
            <IconAction
              icon={<Fire size={14} style={{ color: "#ff3b3b" }} />}
              color="#ff3b3b"
              title="set to queue"
              onClick={onReturnQueue}
            />
          ) : (
            <IconAction
              icon={<BracesContent size={14} />}
              color="#7fa8c0"
              title="set active"
              onClick={onStartNode}
            />
          )}
          <IconAction icon={<CheckboxOn size={14} />} color="#4ade80" title="complete" onClick={onFinish} />
          <IconAction icon={<PenSquare size={14} />} color="rgba(255,255,255,0.7)" title="edit" onClick={onEdit} />
          <IconAction icon={<SkullSharp size={14} />} color="#ef4444" title="remove from session" onClick={onRemove} />
        </span>
      </div>

      {/* Line 2: arc / project / groups */}
      {(arc || proj || (node?.groups ?? []).some((g) => !g.is_ungrouped)) && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.18rem", paddingLeft: "0.1rem", flexWrap: "wrap" }}>
          {arc && (
            <span style={{ color: arc.color_hex, flexShrink: 0, fontSize: "0.78rem", letterSpacing: "1.5px", opacity: 0.85, border: `1px solid ${arc.color_hex}44`, padding: "0 5px", lineHeight: 1.5 }}>
              {arc.name}
            </span>
          )}
          {proj && (
            <span style={{ color: "rgba(255,255,255,0.38)", flexShrink: 0, fontSize: "0.78rem", letterSpacing: "1.5px", lineHeight: 1.5 }}>
              {proj.name}
            </span>
          )}
          {(node?.groups ?? []).filter((g) => !g.is_ungrouped).map((g) => (
            <span key={g.id} style={{ color: g.color_hex, flexShrink: 0, fontSize: "0.75rem", letterSpacing: "1px", border: `1px solid ${g.color_hex}55`, padding: "0 4px", lineHeight: 1.5, opacity: 0.8 }}>
              {g.name}
            </span>
          ))}
        </div>
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
  sessionAction,
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
  rescheduleAction?: { onClick: () => void; title: string; color: string; icon?: React.ReactNode };
  sessionAction?: { onClick: () => void };
  onHover?: (id: string | null) => void;
}) {
  const { arcs: allArcs, projects } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
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
    fontFamily: "var(--font-main), var(--font-kr), monospace",
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
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
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
              {sessionAction && (
                <IconAction
                  icon={<Flatten size={14} />}
                  color="#f5c842"
                  title="add to session"
                  onClick={sessionAction.onClick}
                />
              )}
              {rescheduleAction && (
                <IconAction
                  icon={rescheduleAction.icon ?? <Forward size={14} />}
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
                    fontFamily: "var(--font-main), var(--font-kr), monospace",
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
                  fontFamily: "var(--font-main), var(--font-kr), monospace",
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
  primaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
  suggestion?: boolean;
}) {
  const { arcs: allArcs, projects } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
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
            fontFamily: "var(--font-main), var(--font-kr), monospace",
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
              fontFamily: "var(--font-main), var(--font-kr), monospace",
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
              fontFamily: "var(--font-main), var(--font-kr), monospace",
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
            fontFamily: "var(--font-main), var(--font-kr), monospace",
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
              fontFamily: "var(--font-main), var(--font-kr), monospace",
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
            fontFamily: "var(--font-main), var(--font-kr), monospace",
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
            title={primaryAction.label}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.55)",
              padding: primaryAction.icon ? "0.1rem 0.35rem" : "0.05rem 0.5rem",
              fontSize: "0.9rem",
              letterSpacing: "1px",
              cursor: "pointer",
              fontFamily: "var(--font-main), var(--font-kr), monospace",
              marginRight: "0.15rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            {primaryAction.icon ?? primaryAction.label}
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
    fontFamily: "var(--font-main), var(--font-kr), monospace",
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
          color: "rgba(255,255,255,0.75)",
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
      primaryAction={{ label: "+ today", onClick: rescheduleToday, icon: <ArrowBarDown width={16} height={16} /> }}
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
  const { arcs: allArcs, projects } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
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
    fontFamily: "var(--font-main), var(--font-kr), monospace",
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
                fontFamily: "var(--font-main), var(--font-kr), monospace",
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

// ─── Analytics sidebar ────────────────────────────────────────────────────────

function SidebarPanel({
  title,
  icon: Icon,
  titleRight,
  onTitleClick,
  hideTitle,
  children,
}: {
  title: string;
  icon?: React.FC<{ size?: number; style?: React.CSSProperties }>;
  titleRight?: React.ReactNode;
  onTitleClick?: () => void;
  hideTitle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "0.65rem 1.1rem 0.6rem",
      }}
    >
      {!hideTitle && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.35rem",
          }}
        >
          {Icon && <Icon size={15} style={{ color: "rgba(255,255,255,0.75)", flexShrink: 0 }} />}
          <span
            onClick={onTitleClick}
            style={{
              fontFamily: "var(--font-main), var(--font-kr), monospace",
              fontSize: "1.05rem",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
              cursor: onTitleClick ? "pointer" : undefined,
              textDecoration: onTitleClick ? "underline dotted" : undefined,
              textUnderlineOffset: "3px",
            }}
          >
            {title}
          </span>
          {titleRight && <span style={{ marginLeft: "auto" }}>{titleRight}</span>}
        </div>
      )}
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

  const VT = "var(--font-main), var(--font-kr), monospace";
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
          paddingLeft: "6px",
          paddingRight: "6px",
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
      <div style={{ overflow: "hidden", position: "relative", paddingLeft: "6px", paddingRight: "6px" }}>
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
                    boxShadow: isToday ? `inset 0 0 0 1px ${TEAL}` : "none",
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
                        {data.count}
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
      <div style={{ paddingBottom: '0.6rem' }} />

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

// Panel 3b — Session Breakdown (arc time share, htop-style)

const BREAKDOWN_BAR_COLS = 10;

interface AnimRow {
  arc_name:     string;
  arc_color:    string;
  animFill:     number;
  targetFill:   number;
  label:        string;
  task_count:   number;
  total_minutes: number;
  nameVisible:  boolean;
  prevName:     string | null;
  prevColor:    string | null;
  prevVisible:  boolean;
}

function localDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function SessionBreakdownPanel() {
  const mono: React.CSSProperties = { fontFamily: "var(--font-main), var(--font-kr), monospace" };
  const [animRows, setAnimRows] = useState<AnimRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const isFirst = useRef(true);

  const to   = localDateStr(offset * 7);
  const from = localDateStr(offset * 7 + 6);

  // Flicker tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 650);
    return () => clearInterval(id);
  }, []);

  // Bar fill animation — steps animFill toward targetFill one char at a time
  useEffect(() => {
    const id = setInterval(() => {
      setAnimRows(prev => {
        if (prev.every(r => r.animFill === r.targetFill)) return prev;
        return prev.map(r =>
          r.animFill === r.targetFill ? r :
          { ...r, animFill: r.animFill < r.targetFill ? r.animFill + 1 : r.animFill - 1 },
        );
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Data fetch — diff against current slots and animate
  useEffect(() => {
    loadArcBreakdown(from, to).then(data => {
      const total = data.reduce((s, r) => s + r.total_minutes, 0);
      const newSlots = Array.from({ length: 4 }, (_, i) => {
        const r = data[i];
        if (!r) return null;
        return {
          arc_name: r.arc_name, arc_color: r.arc_color,
          label: total > 0 ? (r.total_minutes / total * 100).toFixed(1) + '%' : '0.0%',
          task_count: r.task_count, total_minutes: r.total_minutes,
          targetFill: total > 0 ? Math.round((r.total_minutes / total) * BREAKDOWN_BAR_COLS) : 0,
        };
      });

      if (isFirst.current) {
        isFirst.current = false;
        const initial = newSlots.map(s => s ? ({
          ...s, animFill: 0, nameVisible: false, prevName: null, prevColor: null, prevVisible: false,
        }) : null).filter(Boolean) as AnimRow[];
        setAnimRows(initial);
        setInitialLoading(false);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setAnimRows(prev => prev.map(r => ({ ...r, nameVisible: true })));
        }));
        return;
      }

      // Diff each slot by position
      setAnimRows(prev => {
        return newSlots.map((n, i) => {
          const o = prev[i];
          if (!n) {
            // slot going empty — animate bar out
            return o ? { ...o, targetFill: 0, label: '' } : null;
          }
          if (!o || o.arc_name !== n.arc_name) {
            // new arc in this slot — crossfade name, bar restarts from current
            return {
              ...n, animFill: o?.animFill ?? 0,
              nameVisible: false,
              prevName: o?.arc_name ?? null, prevColor: o?.arc_color ?? null, prevVisible: !!(o?.arc_name),
            };
          }
          // same arc — just update target
          return { ...o, ...n, animFill: o.animFill };
        }).filter(Boolean) as AnimRow[];
      });

      // Fade new names in, then clear prev names after transition
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setAnimRows(prev => prev.map(r => ({ ...r, nameVisible: true, prevVisible: false })));
        setTimeout(() => {
          setAnimRows(prev => prev.map(r => ({ ...r, prevName: null, prevColor: null })));
        }, 420);
      }));
    });
  }, [from, to]);

  const navBtn: React.CSSProperties = {
    ...mono, fontSize: '1rem', background: 'none',
    border: 'none', color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer', padding: '0 2px', lineHeight: 1,
  };

  const titleRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={navBtn} onClick={() => setOffset(o => o + 1)}><ChevronLeft width={9} height={9} /></button>
      <span style={{ ...mono, fontSize: '0.8rem', letterSpacing: 1, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
        {fmtShort(from)}–{fmtShort(to)}
      </span>
      <button style={{ ...navBtn, opacity: offset === 0 ? 0.2 : 1, cursor: offset === 0 ? 'default' : 'pointer' }}
        onClick={() => { if (offset > 0) setOffset(o => o - 1); }}><ChevronRight width={9} height={9} /></button>
    </div>
  );

  const hasContent = animRows.some(r => r.arc_name !== '' || r.animFill > 0);

  return (
    <SidebarPanel title="session htop" icon={Wind} titleRight={titleRight}>
      {initialLoading ? (
        <span style={{ ...mono, fontSize: '0.9rem', letterSpacing: 2, color: 'rgba(255,255,255,0.18)' }}>
          loading...
        </span>
      ) : !hasContent ? (
        <span style={{ ...mono, fontSize: '0.9rem', letterSpacing: 2, color: 'rgba(255,255,255,0.18)' }}>
          no session data
        </span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', paddingLeft: '1.8rem' }}>
          {animRows.map((row, i) => {
            const fill    = row.animFill;
            const atRest  = fill === row.targetFill;
            const flicker = atRest && fill > 0 ? 1 + (i % 2) : 0;
            const stable  = Math.max(0, fill - flicker);
            const flickOn = (tick + i) % 2 === 0;
            const empty   = BREAKDOWN_BAR_COLS - fill;
            return (
              <div key={i} style={{ minWidth: 0, position: 'relative' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Tooltip */}
                {hoveredIdx === i && row.arc_name && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                    background: 'rgba(6,6,6,0.97)', border: `1px solid ${row.arc_color}55`,
                    padding: '5px 10px', zIndex: 50, whiteSpace: 'nowrap', pointerEvents: 'none',
                  }}>
                    <div style={{ ...mono, fontSize: '0.95rem', letterSpacing: 1, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                      tasks <span style={{ color: '#fff' }}>{row.task_count}</span>
                    </div>
                    <div style={{ ...mono, fontSize: '0.95rem', letterSpacing: 1, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                      time{'  '}<span style={{ color: '#fff' }}>{`${Math.floor(row.total_minutes / 60)}h ${String(Math.round(row.total_minutes % 60)).padStart(2, '0')}m`}</span>
                    </div>
                  </div>
                )}

                {/* Arc name — crossfade between prev and current */}
                <div style={{ position: 'relative', lineHeight: 1, marginBottom: -2, overflow: 'hidden' }}>
                  {row.prevName && (
                    <div style={{
                      ...mono, fontSize: '0.95rem', letterSpacing: 1,
                      color: row.prevColor ?? '#888',
                      position: 'absolute', inset: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      opacity: row.prevVisible ? 1 : 0,
                      transition: 'opacity 0.4s',
                      pointerEvents: 'none',
                    }}>
                      {row.prevName}
                    </div>
                  )}
                  <div style={{
                    ...mono, fontSize: '0.95rem', letterSpacing: 1,
                    color: row.arc_color,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    opacity: row.nameVisible ? 1 : 0,
                    transition: 'opacity 0.4s',
                  }}>
                    {row.arc_name}
                  </div>
                </div>

                {/* Bar — brackets always visible */}
                <div style={{ ...mono, fontSize: '0.95rem', letterSpacing: 1, whiteSpace: 'pre', display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>[</span>
                  <span style={{ color: row.arc_color }}>{'|'.repeat(stable)}</span>
                  <span style={{ color: flickOn ? row.arc_color : 'transparent' }}>{'|'.repeat(flicker)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.07)' }}>{' '.repeat(empty)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>]</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', marginLeft: '0.4ch' }}>{row.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SidebarPanel>
  );
}

// Panel 4 — Velocity expanded popup (6 weeks)

function VelocityExpandedPopup({ onClose }: { onClose: () => void }) {
  const mono: React.CSSProperties = { fontFamily: "var(--font-main), var(--font-kr), monospace" };
  const [pts, setPts] = useState<{ date: string; count: number; sessionMins: number; eventMins: number; label: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const seen = new Set<string>();
      const months: { year: number; month: number }[] = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!seen.has(key)) { seen.add(key); months.push({ year: d.getFullYear(), month: d.getMonth() + 1 }); }
      }
      const allMonths = await Promise.all(months.map(m => loadMonthCompletions(m.year, m.month)));
      const map = new Map<string, number>();
      for (const month of allMonths) for (const d of month) map.set(d.date, d.count);

      const start42 = new Date(now); start42.setDate(now.getDate() - 41);
      const fromKey = `${start42.getFullYear()}-${String(start42.getMonth() + 1).padStart(2, "0")}-${String(start42.getDate()).padStart(2, "0")}`;
      const toKey   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const [sessions, eventNodes] = await Promise.all([
        loadSessionsForWeek(fromKey, toKey),
        loadEventNodesForWeek(fromKey, toKey),
      ]);

      const minsMap = new Map<string, number>();
      for (const s of sessions) {
        if (!s.actual_start) continue;
        const startMs = new Date(s.actual_start).getTime();
        const endMs   = s.actual_end ? new Date(s.actual_end).getTime() : Date.now();
        const mins    = Math.max(0, Math.round((endMs - startMs) / 60000));
        minsMap.set(s.planned_date.slice(0, 10), (minsMap.get(s.planned_date.slice(0, 10)) ?? 0) + mins);
      }

      const eventMinsMap = new Map<string, number>();
      for (const ev of eventNodes) {
        if (!ev.planned_start_at) continue;
        const dayKey = ev.planned_start_at.slice(0, 10);
        eventMinsMap.set(dayKey, (eventMinsMap.get(dayKey) ?? 0) + (ev.estimated_duration_minutes ?? 0));
      }

      setPts(Array.from({ length: 42 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - 41 + i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const label = i % 7 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : "";
        return { date: dateKey, count: map.get(dateKey) ?? 0, sessionMins: minsMap.get(dateKey) ?? 0, eventMins: eventMinsMap.get(dateKey) ?? 0, label };
      }));
    };
    load();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })();
  const total = pts.reduce((s, p) => s + p.count, 0);
  const avg = pts.length > 0 ? (total / pts.length).toFixed(1) : "—";
  const best = pts.length > 0 ? Math.max(...pts.map(p => p.count)) : 0;

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.12)", width: 620, padding: "24px 28px 20px", boxShadow: "0 8px 40px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <span style={{ ...mono, fontSize: "1.4rem", letterSpacing: 4, color: "#f5c842", textTransform: "uppercase" }}>7-day footprint</span>
          <span style={{ ...mono, fontSize: "0.9rem", letterSpacing: 2, color: "rgba(255,255,255,0.3)", marginLeft: 12 }}>6 weeks</span>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", ...mono, fontSize: "1.4rem", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 0, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
          >×</button>
        </div>

        {/* Chart */}
        <ChartContainer
          config={{ count: { label: "Completed", color: "#00c4a7" } }}
          style={{ width: "100%", height: 200 }}
        >
          <ComposedChart data={pts} margin={{ top: 8, right: 16, left: 32, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={(props: { x: number; y: number; payload: { value: string } }) => {
                const { x, y, payload } = props;
                if (!payload.value) return <g />;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={14} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={13} fontFamily="var(--font-main), var(--font-kr), monospace">
                      {payload.value}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis yAxisId="left" hide />
            <YAxis yAxisId="right"  orientation="right" hide />
            <YAxis yAxisId="right2" orientation="right" hide />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = payload[0].payload as { date: string; count: number; sessionMins: number; eventMins: number };
                const fmt = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                return (
                  <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.15)", padding: "3px 10px", ...mono, fontSize: "0.9rem", color: "#fff", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span><span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>{pt.date}</span>{" · "}<span style={{ color: "#00c4a7" }}>{pt.count} tasks</span></span>
                    {pt.sessionMins > 0 && <span style={{ color: "#f5c842" }}>{fmt(pt.sessionMins)} session</span>}
                    {pt.eventMins  > 0 && <span style={{ color: "#c084fc" }}>{fmt(pt.eventMins)} events</span>}
                  </div>
                );
              }}
            />
            {/* Bars — rendered first */}
            <Bar
              yAxisId="left"
              dataKey="count"
              radius={0}
              isAnimationActive={false}
              shape={(props: { x: number; y: number; width: number; height: number; index: number }) => {
                const { x, y, width, height, index } = props;
                const isToday = pts[index]?.date === todayStr;
                return (
                  <rect key={index} x={x} y={y} width={width} height={height}
                    fill={isToday ? "rgba(245,200,66,0.18)" : "rgba(0,196,167,0.15)"}
                  />
                );
              }}
            />
            {/* Red — session time */}
            <Line yAxisId="right" type="monotone" dataKey="sessionMins" stroke="#f5c842" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: "#f5c842", stroke: "none" }} isAnimationActive={false} />
            {/* Purple — event time */}
            <Line yAxisId="right2" type="monotone" dataKey="eventMins" stroke="#c084fc" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: "#c084fc", stroke: "none" }} isAnimationActive={false} />
            {/* Teal line — thickest, drawn last (on top) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="count"
              stroke="#00c4a7"
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {/* Dots — topmost layer */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="count"
              stroke="transparent"
              dot={(props: { cx: number; cy: number; index: number }) => {
                const isToday = pts[props.index]?.date === todayStr;
                return (
                  <circle key={props.index} cx={props.cx} cy={props.cy}
                    r={isToday ? 5 : 3}
                    fill={isToday ? "#f5c842" : "#00c4a7"}
                    stroke="#0a0a0a"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 5, fill: "#ffffff", stroke: "none" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>

        {/* Stats */}
        <div style={{ display: "flex", gap: 40, marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {([
            { label: "6w total", value: total },
            { label: "daily avg", value: avg },
            { label: "best day",  value: best },
          ] as { label: string; value: number | string }[]).map(s => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...mono, fontSize: "0.72rem", letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{s.label}</span>
              <span style={{ ...mono, fontSize: "1.8rem", letterSpacing: 2, color: "#00c4a7", lineHeight: 1 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Panel 4 — Task Velocity

function TaskVelocityPanel({ nodes }: { nodes: PlannerNode[] }) {
  const mono: React.CSSProperties = {
    fontFamily: "var(--font-main), var(--font-kr), monospace",
  };
  const [popupOpen, setPopupOpen] = useState(false);
  const [pts, setPts] = useState<
    { date: string; count: number; sessionMins: number; eventMins: number; day: string }[]
  >([]);

  useEffect(() => {
    const now = new Date();
    const load = async () => {
      const curr = await loadMonthCompletions(now.getFullYear(), now.getMonth() + 1);
      const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prev  = await loadMonthCompletions(prevD.getFullYear(), prevD.getMonth() + 1);
      const map = new Map<string, number>();
      for (const d of [...prev, ...curr]) map.set(d.date, d.count);

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      const fromKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      const toKey   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const [sessions, eventNodes] = await Promise.all([
        loadSessionsForWeek(fromKey, toKey),
        loadEventNodesForWeek(fromKey, toKey),
      ]);

      const minsMap = new Map<string, number>();
      for (const s of sessions) {
        if (!s.actual_start) continue;
        const startMs = new Date(s.actual_start).getTime();
        const endMs   = s.actual_end ? new Date(s.actual_end).getTime() : Date.now();
        const mins    = Math.max(0, Math.round((endMs - startMs) / 60000));
        const dayKey  = s.planned_date.slice(0, 10);
        minsMap.set(dayKey, (minsMap.get(dayKey) ?? 0) + mins);
      }

      const eventMinsMap = new Map<string, number>();
      for (const ev of eventNodes) {
        if (!ev.planned_start_at) continue;
        const dayKey = ev.planned_start_at.slice(0, 10);
        eventMinsMap.set(dayKey, (eventMinsMap.get(dayKey) ?? 0) + (ev.estimated_duration_minutes ?? 0));
      }

      setPts(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - 6 + i);
          const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const label = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d.getDay()];
          return { date: key, count: map.get(key) ?? 0, sessionMins: minsMap.get(key) ?? 0, eventMins: eventMinsMap.get(key) ?? 0, day: label };
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
    <>
    {popupOpen && <VelocityExpandedPopup onClose={() => setPopupOpen(false)} />}
    <SidebarPanel title="7-day footprint" icon={Chart} onTitleClick={() => setPopupOpen(true)}>
      <ChartContainer
        config={chartConfig}
        style={{ width: "93%", height: 108, margin: "0 auto" }}
      >
        <ComposedChart
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
                    fontFamily="var(--font-main), var(--font-kr), monospace"
                  >
                    {payload.value}
                  </text>
                </g>
              );
            }}
          />
          <YAxis yAxisId="left" hide />
          <YAxis yAxisId="right" orientation="right" hide />
          <YAxis yAxisId="right2" orientation="right" hide />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const countVal = payload.find((p) => p.dataKey === "count")?.value;
              const minsVal  = payload.find((p) => p.dataKey === "sessionMins")?.value as number | undefined;
              return (
                <div
                  style={{
                    background: "#0d0d0d",
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "3px 10px",
                    ...mono,
                    fontSize: "0.9rem",
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span>{label} · <span style={{ color: "var(--teal)" }}>{countVal} tasks</span></span>
                  {minsVal != null && minsVal > 0 && (
                    <span style={{ color: "#f5c842" }}>
                      {minsVal >= 60 ? `${Math.floor(minsVal / 60)}h ${minsVal % 60}m` : `${minsVal}m`} session
                    </span>
                  )}
                  {(() => { const ev = payload.find((p) => p.dataKey === "eventMins")?.value as number | undefined; return ev != null && ev > 0 ? <span style={{ color: "var(--purple)" }}>{ev >= 60 ? `${Math.floor(ev / 60)}h ${ev % 60}m` : `${ev}m`} events</span> : null; })()}
                </div>
              );
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="count"
            fill="rgba(0,196,167,0.18)"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sessionMins"
            stroke="#f5c842"
            strokeWidth={1.5}
            dot={(props) => {
              const isToday = pts[props.index]?.date === todayStr;
              return (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={isToday ? 4 : 2.5}
                  fill={isToday ? "#fff" : "rgba(245,200,66,0.6)"}
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 4, fill: "#f5c842", stroke: "none" }}
          />
          <Line
            yAxisId="right2"
            type="monotone"
            dataKey="eventMins"
            stroke="var(--purple)"
            strokeWidth={1.5}
            dot={(props) => {
              const isToday = pts[props.index]?.date === todayStr;
              return (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={isToday ? 4 : 2.5}
                  fill={isToday ? "#f5c842" : "rgba(192,132,252,0.6)"}
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 4, fill: "var(--purple)", stroke: "none" }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="count"
            stroke="var(--teal)"
            strokeWidth={2.5}
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
        </ComposedChart>
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
    </>
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
