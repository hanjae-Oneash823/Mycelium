import { useState, useEffect, useRef, useMemo } from "react";
import { useHabitsStore } from "./store/useHabitsStore";
import HabitForm from "./components/HabitForm";
import type { Habit, GoalType, HabitValueType } from "./types";

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = "#6366f1";
const PX = "160px";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day)
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();
}

// ── Goal evaluation ───────────────────────────────────────────────────────────

interface GoalResult {
  label: string;
  achieved: boolean | null;
  progress: string;
  ratio: number;
}

function completionColor(ratio: number): string {
  const hue = Math.round(Math.min(ratio, 1) * 145);
  return `hsl(${hue}, 70%, 58%)`;
}

function getWeeksInMonth(
  year: number,
  month: number,
): { start: number; end: number }[] {
  const total = daysInMonth(year, month);
  const weeks: { start: number; end: number }[] = [];
  let start = 1;
  while (start <= total) {
    const dow = new Date(year, month - 1, start).getDay();
    const daysUntilSunday = dow === 0 ? 6 : 7 - dow;
    weeks.push({ start, end: Math.min(start + daysUntilSunday, total) });
    start = Math.min(start + daysUntilSunday, total) + 1;
  }
  return weeks;
}

function evaluateGoal(
  habit: Habit,
  logDates: Set<string>,
  logValues: Map<string, number>,
  year: number,
  month: number,
  today: string,
): GoalResult {
  const total = daysInMonth(year, month);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const todayYear = parseInt(today.slice(0, 4));
  const todayMonth = parseInt(today.slice(5, 7));
  const isCurrentMonth = year === todayYear && month === todayMonth;
  const daysElapsed = isCurrentMonth ? parseInt(today.slice(8, 10)) : total;

  if (habit.goal_type === "none")
    return { label: "—", achieved: null, progress: "", ratio: 0 };

  if (habit.value_type === "boolean") {
    const doneCount = Array.from(logDates).filter((d) =>
      d.startsWith(prefix),
    ).length;

    if (habit.goal_type === "every_day") {
      const target = isCurrentMonth ? daysElapsed : total;
      const achieved = doneCount >= target;
      return {
        label: "every day",
        achieved,
        progress: `${doneCount}/${target}`,
        ratio: target > 0 ? doneCount / target : 0,
      };
    }
    if (habit.goal_type === "times_per_month") {
      const target = habit.goal_value ?? 1;
      const achieved = doneCount >= target;
      return {
        label: `${target}×/mo`,
        achieved,
        progress: `${doneCount}/${target}`,
        ratio: doneCount / target,
      };
    }
    if (habit.goal_type === "times_per_week") {
      const target = habit.goal_value ?? 1;
      let weeksMet = 0,
        weeksFailed = 0;
      for (const { start, end } of getWeeksInMonth(year, month)) {
        const cutoff = isCurrentMonth ? Math.min(end, daysElapsed) : end;
        if (cutoff < start) continue;
        let cnt = 0;
        for (let d = start; d <= cutoff; d++) {
          if (logDates.has(dateStr(year, month, d))) cnt++;
        }
        if (cutoff === end || !isCurrentMonth) {
          if (cnt >= target) weeksMet++;
          else weeksFailed++;
        }
      }
      const total_wk = weeksMet + weeksFailed;
      const achieved = weeksFailed === 0 && weeksMet > 0;
      return {
        label: `${target}×/wk`,
        achieved: isCurrentMonth ? null : achieved,
        progress: `${weeksMet}wk`,
        ratio: total_wk > 0 ? weeksMet / total_wk : 0,
      };
    }
  }

  if (habit.value_type === "numeric") {
    const dayVals: number[] = [];
    for (let d = 1; d <= daysElapsed; d++) {
      const v = logValues.get(dateStr(year, month, d));
      if (v !== undefined) dayVals.push(v);
    }
    const monthTotal =
      Math.round(dayVals.reduce((a, b) => a + b, 0) * 100) / 100;
    const target = habit.goal_value ?? 1;

    if (habit.goal_type === "at_least_per_day") {
      const met = dayVals.filter((v) => v >= target).length;
      return {
        label: `≥${target}/day`,
        achieved: met === daysElapsed,
        progress: `${met}d`,
        ratio: daysElapsed > 0 ? met / daysElapsed : 0,
      };
    }
    if (habit.goal_type === "at_most_per_day") {
      const met = dayVals.filter((v) => v <= target).length;
      return {
        label: `≤${target}/day`,
        achieved: met === daysElapsed,
        progress: `${met}d`,
        ratio: daysElapsed > 0 ? met / daysElapsed : 0,
      };
    }
    if (habit.goal_type === "monthly_total") {
      return {
        label: `${target} total`,
        achieved: monthTotal >= target,
        progress: `${monthTotal}`,
        ratio: target > 0 ? Math.min(monthTotal / target, 1) : 0,
      };
    }
  }

  return { label: "—", achieved: null, progress: "", ratio: 0 };
}

// ── Numeric cell editor ───────────────────────────────────────────────────────

function heatBg(color: string, ratio: number): string {
  const alpha = Math.round((0.15 + ratio * 0.75) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${alpha}`;
}

interface NumericCellProps {
  value: number | null;
  color: string;
  ratio: number;
  disabled: boolean;
  onChange: (v: number | null) => void;
}

function NumericCell({
  value,
  color,
  ratio,
  disabled,
  onChange,
}: NumericCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    if (disabled) return;
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const n = parseFloat(draft);
    onChange(draft.trim() === "" || isNaN(n) ? null : n);
    setEditing(false);
  };

  return (
    <div
      onClick={!editing ? start : undefined}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        background: value !== null ? heatBg(color, ratio) : "transparent",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") commit();
          }}
          style={{
            width: "85%",
            background: "transparent",
            border: "none",
            color: "#fff",
            fontFamily: VT,
            fontSize: "1rem",
            textAlign: "center",
            outline: "none",
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: VT,
            fontSize: "1rem",
            color:
              value !== null
                ? "#fff"
                : disabled
                  ? "transparent"
                  : "rgba(255,255,255,0.4)",
          }}
        >
          {value !== null ? value : "·"}
        </span>
      )}
    </div>
  );
}

// ── Floating modal wrapper ────────────────────────────────────────────────────

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          background: "#0d0d0d",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "28px 32px",
          minWidth: 420,
          maxWidth: 560,
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type FormMode = { kind: "create" } | { kind: "edit"; habit: Habit } | null;

const COL_W = 36;
const ROW_H = 40;
const NAME_W = 300;
const GOAL_W = 100;
const ACHIEVED_W = 90;
const SLEEP_COLOR = "#7060e0";

export default function HabitsPlugin() {
  const store = useHabitsStore();
  const today = todayStr();
  const [form, setForm] = useState<FormMode>(null);
  const [hovRow, setHovRow] = useState<string | null>(null);

  useEffect(() => {
    store.reload();
  }, []);

  const { viewYear, viewMonth } = store;
  const numDays = daysInMonth(viewYear, viewMonth);
  const todayDay = today.startsWith(
    `${viewYear}-${String(viewMonth).padStart(2, "0")}`,
  )
    ? parseInt(today.slice(8, 10))
    : null;

  const prevMonth = () => {
    const m = viewMonth === 1 ? 12 : viewMonth - 1;
    store.setMonth(viewMonth === 1 ? viewYear - 1 : viewYear, m);
  };
  const nextMonth = () => {
    const m = viewMonth === 12 ? 1 : viewMonth + 1;
    store.setMonth(viewMonth === 12 ? viewYear + 1 : viewYear, m);
  };

  const logMap = useMemo(() => {
    const map = new Map<string, Map<string, number | null>>();
    for (const log of store.logs) {
      if (!map.has(log.habit_id)) map.set(log.habit_id, new Map());
      map.get(log.habit_id)!.set(log.date, log.value);
    }
    return map;
  }, [store.logs]);

  const handleSave = async (
    name: string,
    color: string,
    vt: HabitValueType,
    gt: GoalType,
    gv: number | null,
  ) => {
    if (form?.kind === "edit") {
      await store.updateHabit(form.habit.id, name, color, vt, gt, gv);
    } else {
      await store.createHabit(name, color, vt, gt, gv);
    }
    setForm(null);
  };

  const tableWidth = NAME_W + numDays * COL_W + GOAL_W + ACHIEVED_W;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Floating form modal ── */}
      {form && (
        <Modal onClose={() => setForm(null)}>
          <HabitForm
            initial={form.kind === "edit" ? form.habit : undefined}
            onSave={handleSave}
            onCancel={() => setForm(null)}
          />
        </Modal>
      )}

      {/* ── Header ── */}
      <div style={{ padding: `112px ${PX} 0`, flexShrink: 0 }}>
        {/* Plugin name row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontFamily: VT,
              fontSize: "2rem",
              letterSpacing: 5,
              color: ACC,
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            habits
          </span>

          <button
            onClick={() => setForm({ kind: "create" })}
            style={{
              all: "unset",
              fontFamily: VT,
              fontSize: "1rem",
              letterSpacing: 2,
              color: "rgba(255,255,255,0.3)",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "5px 16px",
              transition: "color 0.1s, border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.75)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.3)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
          >
            + habit
          </button>
        </div>

        {/* Month nav row — centered */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <button
            onClick={prevMonth}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: VT,
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.3)",
              lineHeight: 1,
              padding: "0 2px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.75)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.3)")
            }
          >
            ‹
          </button>
          <span
            style={{
              fontFamily: VT,
              fontSize: "1.5rem",
              letterSpacing: "3px",
              color: "rgba(255,255,255,0.6)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {monthLabel(viewYear, viewMonth)}
          </span>
          <button
            onClick={nextMonth}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: VT,
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.3)",
              lineHeight: 1,
              padding: "0 2px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.75)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.3)")
            }
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Table (centered) ── */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "auto",
          padding: "28px 0 48px",
        }}
      >
        <div
          style={{ minWidth: tableWidth, width: tableWidth, margin: "0 auto" }}
        >
          {/* Column headers */}
          <div style={{ display: "flex", marginLeft: NAME_W }}>
            {Array.from({ length: numDays }, (_, i) => {
              const day = i + 1;
              const isToday = todayDay === day;
              const ds = dateStr(viewYear, viewMonth, day);
              const isFuture = ds > today;
              return (
                <div
                  key={day}
                  style={{
                    width: COL_W,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingBottom: 8,
                    borderBottom: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  {isToday ? (
                    <div
                      style={{
                        background: "#8b5cf6",
                        padding: "3px 5px 4px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        lineHeight: 1,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "0.9rem",
                          color: "#000",
                          letterSpacing: 0.5,
                          lineHeight: 1,
                        }}
                      >
                        {dayOfWeek(viewYear, viewMonth, day).slice(0, 2)}
                      </span>
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "1.25rem",
                          color: "#000",
                          lineHeight: 1,
                        }}
                      >
                        {day}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "0.9rem",
                          color: isFuture ? "rgba(255,255,255,0.35)" : "#fff",
                          letterSpacing: 0.5,
                        }}
                      >
                        {dayOfWeek(viewYear, viewMonth, day).slice(0, 2)}
                      </span>
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "1.25rem",
                          color: isFuture ? "rgba(255,255,255,0.35)" : "#fff",
                          lineHeight: 1,
                        }}
                      >
                        {day}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            <div
              style={{
                width: GOAL_W,
                flexShrink: 0,
                paddingBottom: 8,
                borderBottom: "1px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: VT,
                  fontSize: "0.9rem",
                  color: "rgba(255,255,255,0.2)",
                  letterSpacing: 2,
                }}
              >
                GOAL
              </span>
            </div>
            <div
              style={{
                width: ACHIEVED_W,
                flexShrink: 0,
                paddingBottom: 8,
                borderBottom: "1px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: VT,
                  fontSize: "0.9rem",
                  color: "rgba(255,255,255,0.2)",
                  letterSpacing: 2,
                }}
              >
                NOW
              </span>
            </div>
          </div>

          {/* ── Sleep row (built-in, read-only) ── */}
          {(() => {
            const sleepMax = Math.max(0, ...Object.values(store.sleepByDate));
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: ROW_H,
                  borderBottom: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {/* Name */}
                <div
                  style={{
                    width: NAME_W,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingRight: 12,
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: SLEEP_COLOR,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: VT,
                      fontSize: "1.05rem",
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.65)",
                    }}
                  >
                    sleep
                  </span>
                </div>
                {/* Day cells */}
                {Array.from({ length: numDays }, (_, i) => {
                  const day = i + 1;
                  const ds = dateStr(viewYear, viewMonth, day);
                  const isFuture = ds > today;
                  const isToday = todayDay === day;
                  const val = store.sleepByDate[ds] ?? null;
                  const ratio =
                    sleepMax > 0 && val !== null ? val / sleepMax : 0;
                  return (
                    <div
                      key={day}
                      style={{
                        width: COL_W,
                        height: "100%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          val !== null
                            ? heatBg(SLEEP_COLOR, ratio)
                            : isToday
                              ? "rgba(255,255,255,0.03)"
                              : "transparent",
                        borderLeft: isToday
                          ? "1px solid rgba(255,255,255,0.2)"
                          : "none",
                        borderRight: isToday
                          ? "1px solid rgba(255,255,255,0.2)"
                          : "none",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: VT,
                          fontSize: "1rem",
                          color:
                            val !== null
                              ? "#fff"
                              : isFuture
                                ? "transparent"
                                : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {val !== null ? val : "·"}
                      </span>
                    </div>
                  );
                })}
                <div
                  style={{
                    width: GOAL_W,
                    flexShrink: 0,
                    height: "100%",
                    borderLeft: "1px solid rgba(255,255,255,0.18)",
                  }}
                />
                <div
                  style={{
                    width: ACHIEVED_W,
                    flexShrink: 0,
                    height: "100%",
                    borderLeft: "1px solid rgba(255,255,255,0.18)",
                  }}
                />
              </div>
            );
          })()}

          {/* ── Sleep goal met row (built-in, read-only) ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: ROW_H,
              borderBottom: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div
              style={{
                width: NAME_W,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingRight: 12,
                paddingLeft: 15,
              }}
            >
              <span
                style={{
                  fontFamily: VT,
                  fontSize: "0.95rem",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                sleep goal
              </span>
            </div>
            {Array.from({ length: numDays }, (_, i) => {
              const day = i + 1;
              const ds = dateStr(viewYear, viewMonth, day);
              const isFuture = ds > today;
              const isToday = todayDay === day;
              const hours = store.sleepByDate[ds] ?? null;
              const met =
                store.sleepTarget !== null &&
                hours !== null &&
                hours >= store.sleepTarget;
              const noTarget = store.sleepTarget === null;
              return (
                <div
                  key={day}
                  style={{
                    width: COL_W,
                    height: "100%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isToday
                      ? "rgba(255,255,255,0.03)"
                      : "transparent",
                    borderLeft: isToday
                      ? "1px solid rgba(255,255,255,0.2)"
                      : "none",
                    borderRight: isToday
                      ? "1px solid rgba(255,255,255,0.2)"
                      : "none",
                  }}
                >
                  {!noTarget && (
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        background: met ? SLEEP_COLOR : "transparent",
                        border: `1px solid ${met ? SLEEP_COLOR : isFuture ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)"}`,
                        filter: met ? "brightness(1.3) saturate(1.2)" : "none",
                        transition: "background 0.1s",
                      }}
                    />
                  )}
                </div>
              );
            })}
            <div
              style={{
                width: GOAL_W,
                flexShrink: 0,
                height: "100%",
                borderLeft: "1px solid rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {store.sleepTarget !== null && (
                <span
                  style={{
                    fontFamily: VT,
                    fontSize: "0.95rem",
                    color: "rgba(255,255,255,0.6)",
                    letterSpacing: 1,
                  }}
                >
                  ≥{store.sleepTarget}h
                </span>
              )}
            </div>
            <div
              style={{
                width: ACHIEVED_W,
                flexShrink: 0,
                height: "100%",
                borderLeft: "1px solid rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {store.sleepTarget !== null &&
                (() => {
                  const elapsed = todayDay ?? numDays;
                  const met = Array.from({ length: elapsed }, (_, i) => {
                    const ds = dateStr(viewYear, viewMonth, i + 1);
                    return (store.sleepByDate[ds] ?? 0) >= store.sleepTarget!;
                  }).filter(Boolean).length;
                  const sleepRatio = elapsed > 0 ? met / elapsed : 0;
                  const achieved = met === elapsed;
                  return (
                    <span
                      style={{
                        fontFamily: VT,
                        fontSize: "0.95rem",
                        letterSpacing: 1,
                        color:
                          sleepRatio > 0
                            ? completionColor(sleepRatio)
                            : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {met}/{elapsed}
                      {achieved ? " ✓" : ""}
                    </span>
                  );
                })()}
            </div>
          </div>

          {/* Empty state */}
          {store.habits.length === 0 && !store.loading && (
            <div
              style={{
                paddingTop: 40,
                fontFamily: VT,
                fontSize: "1.1rem",
                color: "rgba(255,255,255,0.15)",
                letterSpacing: 2,
              }}
            >
              no habits yet — click + habit to add one
            </div>
          )}

          {/* Habit rows */}
          {store.habits.map((habit) => {
            const habitLogs =
              logMap.get(habit.id) ?? new Map<string, number | null>();
            const logDates = new Set(habitLogs.keys());
            const logValues = new Map<string, number>();
            habitLogs.forEach((v, k) => {
              if (v !== null) logValues.set(k, v);
            });
            const numericMax =
              habit.value_type === "numeric"
                ? Math.max(0, ...Array.from(logValues.values()))
                : 0;
            const goal = evaluateGoal(
              habit,
              logDates,
              logValues,
              viewYear,
              viewMonth,
              today,
            );
            const isHov = hovRow === habit.id;

            return (
              <div
                key={habit.id}
                onMouseEnter={() => setHovRow(habit.id)}
                onMouseLeave={() => setHovRow(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: ROW_H,
                  borderBottom: "1px solid rgba(255,255,255,0.15)",
                  background: isHov ? "rgba(255,255,255,0.02)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                {/* Habit name */}
                <div
                  style={{
                    width: NAME_W,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingRight: 12,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: habit.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: VT,
                      fontSize: "1.05rem",
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.65)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1,
                    }}
                  >
                    {habit.name}
                  </span>
                  {isHov && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setForm({ kind: "edit", habit })}
                        style={{
                          all: "unset",
                          fontFamily: VT,
                          fontSize: "0.85rem",
                          color: "rgba(255,255,255,0.25)",
                          cursor: "pointer",
                          letterSpacing: 1,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color =
                            "rgba(255,255,255,0.65)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "rgba(255,255,255,0.25)")
                        }
                      >
                        edit
                      </button>
                      <button
                        onClick={() => store.archiveHabit(habit.id)}
                        style={{
                          all: "unset",
                          fontFamily: VT,
                          fontSize: "0.85rem",
                          color: "rgba(255,255,255,0.12)",
                          cursor: "pointer",
                          letterSpacing: 1,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "rgba(255,80,80,0.65)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "rgba(255,255,255,0.12)")
                        }
                      >
                        del
                      </button>
                    </div>
                  )}
                </div>

                {/* Day cells */}
                {Array.from({ length: numDays }, (_, i) => {
                  const day = i + 1;
                  const ds = dateStr(viewYear, viewMonth, day);
                  const isFuture = ds > today;
                  const isToday = todayDay === day;

                  if (habit.value_type === "boolean") {
                    const done = habitLogs.has(ds);
                    return (
                      <div
                        key={day}
                        onClick={() =>
                          !isFuture && store.toggleBoolean(habit.id, ds)
                        }
                        style={{
                          width: COL_W,
                          height: "100%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: isFuture ? "default" : "pointer",
                          background: isToday
                            ? "rgba(255,255,255,0.03)"
                            : "transparent",
                          borderLeft: isToday
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                          borderRight: isToday
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            background: done ? habit.color : "transparent",
                            border: `1px solid ${done ? habit.color : isFuture ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)"}`,
                            filter: done
                              ? "brightness(1.3) saturate(1.2)"
                              : "none",
                            transition: "background 0.1s, border-color 0.1s",
                          }}
                        />
                      </div>
                    );
                  } else {
                    const val = habitLogs.has(ds)
                      ? (habitLogs.get(ds) as number | null)
                      : null;
                    return (
                      <div
                        key={day}
                        style={{
                          width: COL_W,
                          height: "100%",
                          flexShrink: 0,
                          background: isToday
                            ? "rgba(255,255,255,0.03)"
                            : "transparent",
                          borderLeft: isToday
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                          borderRight: isToday
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                        }}
                      >
                        <NumericCell
                          value={val}
                          color={habit.color}
                          ratio={
                            numericMax > 0 && val !== null
                              ? val / numericMax
                              : 0
                          }
                          disabled={isFuture}
                          onChange={(v) => store.setNumeric(habit.id, ds, v)}
                        />
                      </div>
                    );
                  }
                })}

                {/* Goal column */}
                <div
                  style={{
                    width: GOAL_W,
                    flexShrink: 0,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderLeft: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: VT,
                      fontSize: "0.95rem",
                      letterSpacing: 1,
                      color:
                        goal.label === "—"
                          ? "rgba(255,255,255,0.2)"
                          : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {goal.label}
                  </span>
                </div>

                {/* Achieved column */}
                <div
                  style={{
                    width: ACHIEVED_W,
                    flexShrink: 0,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderLeft: "1px solid rgba(255,255,255,0.18)",
                    gap: 4,
                  }}
                >
                  {goal.progress && (
                    <span
                      style={{
                        fontFamily: VT,
                        fontSize: "0.95rem",
                        letterSpacing: 1,
                        color:
                          goal.ratio > 0
                            ? completionColor(goal.ratio)
                            : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {goal.progress}
                    </span>
                  )}
                  {goal.achieved === true && (
                    <span
                      style={{
                        fontFamily: VT,
                        fontSize: "0.85rem",
                        color: completionColor(1),
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
