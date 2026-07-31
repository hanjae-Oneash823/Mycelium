import React, { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import { useArcVisibilityStore } from "../../../store/useArcVisibilityStore";
import { loadEventNodesForWeek } from "../lib/plannerDb";
import { loadSessionsForWeek, loadSessionNodes } from "../lib/onTheClockDb";
import type { WorkSession, SessionNodeWithNode } from "../lib/onTheClockDb";
import { getEntriesForRange } from "../../SleepTrackerPlugin/lib/sleepDb";
import type { SleepEntry } from "../../SleepTrackerPlugin/lib/sleepDb";
import type { PlannerNode, Arc, Project } from "../types";

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

/** Persistent weekly timetable — rendered as a left panel across all Planner tabs. */
export default function WeeklyTimetablePanel() {
  const { nodes: storeNodes, arcs: allArcs, projects } = usePlannerStore();
  const highlightNodeId = useViewStore(s => s.hoveredNodeId);
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
  const isArcHidden = (n: PlannerNode): boolean => {
    if (n.arc_id) return hiddenArcIds.includes(n.arc_id);
    if (n.project_id) {
      const proj = projects.find(p => p.id === n.project_id);
      if (proj?.arc_id) return hiddenArcIds.includes(proj.arc_id);
    }
    return false;
  };
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDir, setWeekDir] = useState<1 | -1>(1);
  const [eventNodes, setEventNodes] = useState<PlannerNode[]>([]);
  const [weekSessions, setWeekSessions] = useState<WorkSession[]>([]);
  const [weekSessionNodes, setWeekSessionNodes] = useState<Map<string, SessionNodeWithNode[]>>(new Map());
  const [weekSleepEntries, setWeekSleepEntries] = useState<SleepEntry[]>([]);
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
    getEntriesForRange(calToDS(calAddDays(mon, -1)), to).then(setWeekSleepEntries);
    loadSessionsForWeek(from, to).then(async sessions => {
      setWeekSessions(sessions);
      const nodeMap = new Map<string, SessionNodeWithNode[]>();
      await Promise.all(sessions.map(async s => {
        const nodes = await loadSessionNodes(s.id);
        nodeMap.set(s.id, nodes);
      }));
      setWeekSessionNodes(nodeMap);
    });
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

  const START_HOUR = 0; // always show the full 00–24 range

  const TOTAL_HRS = END_HOUR - START_HOUR;

  useEffect(() => {
    if (!gridRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setHourH(Math.max(16, (entry.contentRect.height - 14) / TOTAL_HRS));
    });
    obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, [TOTAL_HRS, weekOffset]);

  const LABEL_W = 36;
  const mono: React.CSSProperties = {
    fontFamily: "var(--font-main), var(--font-kr), monospace",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "0.75rem 1.8rem 0.75rem 0.5rem",
        minHeight: 0,
      }}
    >
      <style>{`
        @keyframes calPulseRed {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px 2px rgba(255,85,85,0.4); }
          50% { opacity: 0.45; box-shadow: 0 0 2px 1px rgba(255,85,85,0.15); }
        }
      `}</style>



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
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "4px 10px",
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={() => {
              setWeekDir(-1);
              setWeekOffset(weekOffset - 1);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
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
          <button
            onClick={() => {
              setWeekDir(1);
              setWeekOffset(weekOffset + 1);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
              padding: 0,
            }}
          >
            <ChevronRight width={14} height={14} />
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
                    fontSize: "0.82rem",
                    letterSpacing: 1.5,
                    color: isToday ? "var(--teal)" : "rgba(255,255,255,0.6)",
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
              style={{ width: LABEL_W, flexShrink: 0, position: "relative", overflow: "visible" }}
            >
              {Array.from({ length: TOTAL_HRS + 1 }, (_, i) => {
                const h = i + START_HOUR;
                const isCurrentHour = weekOffset === 0 && h === nowCal.getHours();
                const isKeyHour = [9, 12, 15, 18, 21, 24].includes(h);
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: Math.max(0, i * hourH - 9),
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      ...mono,
                      fontSize: isKeyHour ? "0.97rem" : "0.85rem",
                      color: isCurrentHour
                        ? "#ff5555"
                        : isKeyHour
                          ? "rgba(255,255,255,0.6)"
                          : "rgba(255,255,255,0.4)",
                      lineHeight: 1,
                      userSelect: "none",
                      fontWeight: isCurrentHour || isKeyHour ? "bold" : "normal",
                    }}
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                );
              })}
            </div>

            {/* Grid + day columns */}
            <div
              style={{
                flex: 1,
                position: "relative",
                display: "flex",
                gap: 2,
                height: TOTAL_HRS * hourH,
                flexShrink: 0,
              }}
            >
              {/* Hour lines */}
              {Array.from({ length: TOTAL_HRS + 1 }, (_, i) => {
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
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.15)",
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
                        di === 0 ? "none" : "1px solid rgba(255,255,255,0.15)",
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
                      const arcHidden = isArcHidden(n);
                      const color = arcHidden ? "rgba(255,255,255,0.18)" : getArcColorCal(n, arcs, projects);
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
                          onMouseEnter={arcHidden ? undefined : (e) =>
                            setTooltip({
                              title: `${n.title} · ${label}`,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseMove={arcHidden ? undefined : (e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : null,
                            )
                          }
                          onMouseLeave={arcHidden ? undefined : () => setTooltip(null)}
                          style={{
                            position: "absolute",
                            top: topPx + 1,
                            left: 3,
                            right: 3,
                            height: heightPx - 2,
                            background: isPast ? `${color}55` : color,
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

                    {/* Work session blocks */}
                    {weekSessions
                      .filter((s) => s.planned_date === key && s.actual_start)
                      .map((s) => {
                        const startD = new Date(s.actual_start!);
                        const endD = s.actual_end ? new Date(s.actual_end) : nowCal;
                        const sh = startD.getHours() + startD.getMinutes() / 60;
                        const rawEh = endD.getHours() + endD.getMinutes() / 60;
                        // clamp to 24 if session crosses midnight into the next day
                        const eh = rawEh < sh ? 24 : rawEh;
                        const topPx = (sh - START_HOUR) * hourH;
                        const heightPx = Math.max(4, (eh - sh) * hourH);
                        if (topPx < 0) return null;
                        const isActive = s.status === 'active' || s.status === 'paused';
                        const startLabel = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
                        const endLabel = s.actual_end
                          ? `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
                          : '...';
                        const sNodes = (weekSessionNodes.get(s.id) ?? []).filter(n => n.time_started != null);
                        const totalSessionMins = (eh - sh) * 60;

                        return (
                          <div
                            key={s.id}
                            onMouseEnter={(e) =>
                              setTooltip({
                                title: `${s.location_name ?? s.title} · ${startLabel}–${endLabel}`,
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
                              background: "#2a2a2a",
                              border: `1.5px solid rgba(255,255,255,${isActive ? '0.5' : '0.25'})`,
                              zIndex: 1,
                              cursor: "default",
                              boxSizing: "border-box",
                              overflow: "hidden",
                            }}
                          >
                            {sNodes.length === 0 && isActive && (
                              <div style={{
                                position: "absolute", top: 2, left: 4,
                                fontFamily: "var(--font-main), var(--font-kr), monospace",
                                fontSize: 9, letterSpacing: 1,
                                color: "rgba(255,255,255,0.5)",
                                textTransform: "uppercase", pointerEvents: "none",
                              }}>live</div>
                            )}
                            {sNodes.map(n => {
                              const nStart = new Date(n.time_started!);
                              const nStartH = nStart.getHours() + nStart.getMinutes() / 60;
                              const nTop = (nStartH - sh) * hourH;
                              const finished = !!n.time_finished;
                              const nH = finished
                                ? Math.max(3, (new Date(n.time_finished!).getTime() - nStart.getTime()) / 3600000 * hourH)
                                : n.total_minutes
                                  ? Math.max(3, n.total_minutes / 60 * hourH)
                                  : Math.max(3, (endD.getTime() - nStart.getTime()) / 3600000 * hourH);
                              return (
                                <div
                                  key={n.node_id}
                                  style={{
                                    position: "absolute",
                                    top: nTop,
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: 8,
                                    height: nH,
                                    background: n.arc_color + (finished ? "cc" : "55"),
                                    boxSizing: "border-box",
                                  }}
                                />
                              );
                            })}
                          </div>
                        );
                      })}

                    {/* Sleep blocks — split into bedtime/wake segments across midnight */}
                    {weekSleepEntries.map((entry) => {
                      const sleepD = new Date(entry.sleep_start);
                      const wakeD = new Date(entry.wake_time);
                      const sleepKey = calToDS(sleepD);
                      const wakeKey = calToDS(wakeD);
                      if (sleepKey !== key && wakeKey !== key) return null;

                      const bedLabel = `${String(sleepD.getHours()).padStart(2, "0")}:${String(sleepD.getMinutes()).padStart(2, "0")}`;
                      const wakeLabel = `${String(wakeD.getHours()).padStart(2, "0")}:${String(wakeD.getMinutes()).padStart(2, "0")}`;
                      const tooltipTitle = `sleep · ${bedLabel}–${wakeLabel}`;
                      const onMouseEnter = (e: React.MouseEvent) =>
                        setTooltip({ title: tooltipTitle, x: e.clientX, y: e.clientY });
                      const onMouseMove = (e: React.MouseEvent) =>
                        setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
                      const onMouseLeave = () => setTooltip(null);
                      const baseStyle: React.CSSProperties = {
                        position: "absolute",
                        left: 3,
                        right: 3,
                        background: "#150f2e",
                        border: "1.5px solid rgba(129,102,255,0.5)",
                        zIndex: 1,
                        cursor: "default",
                        boxSizing: "border-box",
                      };

                      if (sleepKey === key && wakeKey === key) {
                        const sh = sleepD.getHours() + sleepD.getMinutes() / 60;
                        const wh = wakeD.getHours() + wakeD.getMinutes() / 60;
                        const topPx = (sh - START_HOUR) * hourH;
                        if (topPx < 0) return null;
                        const heightPx = Math.max(4, (wh - sh) * hourH);
                        return (
                          <div
                            key={entry.id}
                            onMouseEnter={onMouseEnter}
                            onMouseMove={onMouseMove}
                            onMouseLeave={onMouseLeave}
                            style={{ ...baseStyle, top: topPx + 1, height: heightPx - 2 }}
                          />
                        );
                      }

                      if (sleepKey === key) {
                        const sh = sleepD.getHours() + sleepD.getMinutes() / 60;
                        const topPx = (sh - START_HOUR) * hourH;
                        if (topPx < 0) return null;
                        const heightPx = Math.max(4, (24 - sh) * hourH);
                        return (
                          <div
                            key={entry.id}
                            onMouseEnter={onMouseEnter}
                            onMouseMove={onMouseMove}
                            onMouseLeave={onMouseLeave}
                            style={{ ...baseStyle, top: topPx + 1, height: heightPx - 1, borderBottom: "none" }}
                          />
                        );
                      }

                      const wh = wakeD.getHours() + wakeD.getMinutes() / 60;
                      const heightPx = (wh - START_HOUR) * hourH;
                      if (heightPx <= 0) return null;
                      return (
                        <div
                          key={entry.id}
                          onMouseEnter={onMouseEnter}
                          onMouseMove={onMouseMove}
                          onMouseLeave={onMouseLeave}
                          style={{ ...baseStyle, top: 0, height: Math.max(4, heightPx - 1), borderTop: "none" }}
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
