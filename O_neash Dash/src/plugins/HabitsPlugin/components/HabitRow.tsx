import { useState, useMemo, Fragment } from "react";
import type { Habit, HabitLog } from "../types";

const VT = "'VT323', 'HBIOS-SYS', monospace";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLast14Days(today: string): string[] {
  const base = new Date(today + "T12:00:00");
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function getMondayOf(ds: string): Date {
  const d = new Date(ds + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function logsInWeek(mon: Date, logSet: Set<string>): number {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    if (logSet.has(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}

function computeStreak(
  habit: Habit,
  logSet: Set<string>,
  today: string,
): { count: number; unit: "d" | "w" } {
  if (habit.type === "daily") {
    let count = 0;
    const cursor = new Date(today + "T12:00:00");
    if (!logSet.has(today)) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 90; i++) {
      const ds = cursor.toISOString().slice(0, 10);
      if (!logSet.has(ds)) break;
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { count, unit: "d" };
  }

  const target = habit.type === "weekly" ? 1 : (habit.times_per_week ?? 1);
  let streak = 0;
  let mon = getMondayOf(today);
  if (logsInWeek(mon, logSet) < target) mon.setDate(mon.getDate() - 7);
  for (let w = 0; w < 13; w++) {
    if (logsInWeek(mon, logSet) >= target) {
      streak++;
      mon = new Date(mon);
      mon.setDate(mon.getDate() - 7);
    } else {
      break;
    }
  }
  return { count: streak, unit: "w" };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  habit: Habit;
  logs: HabitLog[];
  today: string;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export default function HabitRow({ habit, logs, today, onToggle, onEdit, onArchive }: Props) {
  const [hov, setHov] = useState(false);
  const [togHov, setTogHov] = useState(false);

  const logSet = useMemo(() => new Set(logs.map(l => l.date)), [logs]);
  const days   = useMemo(() => getLast14Days(today), [today]);
  const streak = useMemo(() => computeStreak(habit, logSet, today), [habit, logSet, today]);
  const todayDone = logSet.has(today);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "11px 0",
        borderBottom: "1px solid rgba(255,255,255,0.045)",
        cursor: "default",
        userSelect: "none",
      }}
    >
      {/* Color dot */}
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: habit.color, flexShrink: 0,
        opacity: todayDone ? 1 : 0.4,
        transition: "opacity 0.15s",
      }} />

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{
          fontFamily: VT,
          fontSize: "1.15rem",
          letterSpacing: 2,
          textTransform: "uppercase",
          color: todayDone ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.38)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "color 0.15s",
        }}>
          {habit.name}
        </span>
        <span style={{
          fontFamily: VT, fontSize: "0.85rem", letterSpacing: 1,
          color: "rgba(255,255,255,0.18)", flexShrink: 0,
        }}>
          {habit.type === "daily" ? "daily"
            : habit.type === "weekly" ? "weekly"
            : `${habit.times_per_week ?? 1}×/wk`}
        </span>
      </div>

      {/* 14-day strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {days.map((day, i) => {
          const logged = logSet.has(day);
          const isMon  = new Date(day + "T12:00:00").getDay() === 1;
          const gap    = i > 0 && isMon;
          return (
            <Fragment key={day}>
              {gap && <div style={{ width: 5, flexShrink: 0 }} />}
              <div style={{
                width: 9, height: 9, flexShrink: 0,
                background: logged ? habit.color : "transparent",
                border: `1px solid ${logged ? habit.color : "rgba(255,255,255,0.1)"}`,
                transition: "background 0.1s, border-color 0.1s",
              }} />
            </Fragment>
          );
        })}
      </div>

      {/* Streak */}
      <span style={{
        fontFamily: VT, fontSize: "0.9rem", letterSpacing: 1,
        color: streak.count > 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)",
        width: 38, textAlign: "right", flexShrink: 0,
      }}>
        {streak.count > 0 ? `${streak.count}${streak.unit}` : "—"}
      </span>

      {/* Actions (on hover) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, width: 60, justifyContent: "flex-end" }}>
        {hov && (
          <>
            <button
              onClick={onEdit}
              style={{ all: "unset", fontFamily: VT, fontSize: "0.8rem", letterSpacing: 1, color: "rgba(255,255,255,0.22)", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}
            >edit</button>
            <button
              onClick={onArchive}
              style={{ all: "unset", fontFamily: VT, fontSize: "0.8rem", letterSpacing: 1, color: "rgba(255,255,255,0.12)", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,100,100,0.5)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.12)")}
            >del</button>
          </>
        )}
      </div>

      {/* Today toggle */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setTogHov(true)}
        onMouseLeave={() => setTogHov(false)}
        style={{
          all: "unset",
          width: 20, height: 20, flexShrink: 0,
          border: `1px solid ${todayDone ? habit.color : togHov ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)"}`,
          background: todayDone ? habit.color : "transparent",
          cursor: "pointer",
          transition: "background 0.12s, border-color 0.12s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {todayDone && (
          <span style={{ fontFamily: VT, fontSize: 14, color: "rgba(0,0,0,0.7)", lineHeight: 1 }}>✓</span>
        )}
      </button>
    </div>
  );
}
