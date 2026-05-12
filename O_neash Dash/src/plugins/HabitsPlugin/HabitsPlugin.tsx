// cspell:ignore HBIOS pixelarticons
import { useState, useEffect } from "react";
import { useHabitsStore } from "./store/useHabitsStore";
import HabitRow from "./components/HabitRow";
import HabitForm from "./components/HabitForm";
import type { Habit, HabitType } from "./types";

const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = "#6366f1";   // clinic accent (indigo)
const PX  = "160px";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(ds: string): string {
  return new Date(ds + "T12:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

// ── Main ──────────────────────────────────────────────────────────────────────

type FormMode = { kind: "create" } | { kind: "edit"; habit: Habit } | null;

export default function HabitsPlugin() {
  const store   = useHabitsStore();
  const today   = todayStr();
  const [form, setForm] = useState<FormMode>(null);

  useEffect(() => { store.reload(); }, []);

  const todayLogs   = store.logs.filter(l => l.date === today);
  const doneToday   = store.habits.filter(h => todayLogs.some(l => l.habit_id === h.id)).length;
  const totalHabits = store.habits.length;

  const handleSave = async (name: string, color: string, type: HabitType, n: number | null) => {
    if (form?.kind === "edit") {
      await store.updateHabit(form.habit.id, name, color, type, n);
    } else {
      await store.createHabit(name, color, type, n);
    }
    setForm(null);
  };

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#000",
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{ padding: `112px ${PX} 0`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <span style={{
            fontFamily: VT,
            fontSize: "2rem",
            letterSpacing: 5,
            color: ACC,
            textTransform: "uppercase",
            lineHeight: 1,
          }}>
            habits
          </span>
          {totalHabits > 0 && (
            <span style={{
              fontFamily: VT,
              fontSize: "2rem",
              letterSpacing: 3,
              color: doneToday === totalHabits
                ? "rgba(255,255,255,0.7)"
                : "rgba(255,255,255,0.25)",
              lineHeight: 1,
              transition: "color 0.2s",
            }}>
              {doneToday} / {totalHabits}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: VT,
          fontSize: "2.6rem",
          letterSpacing: "3px",
          color: "#fff",
          textTransform: "uppercase",
          lineHeight: 1,
          marginTop: 4,
        }}>
          {formatDate(today)}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: `40px ${PX} 40px`,
        display: "flex",
        flexDirection: "column",
      }}>

        {store.loading && store.habits.length === 0 ? (
          <span style={{ fontFamily: VT, fontSize: "1rem", color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
            loading...
          </span>
        ) : store.habits.length === 0 && !form ? (
          <span style={{ fontFamily: VT, fontSize: "1rem", color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
            no habits yet
          </span>
        ) : null}

        {store.habits.map(habit => {
          if (form?.kind === "edit" && form.habit.id === habit.id) {
            return (
              <HabitForm
                key={habit.id}
                initial={form.habit}
                onSave={handleSave}
                onCancel={() => setForm(null)}
              />
            );
          }
          return (
            <HabitRow
              key={habit.id}
              habit={habit}
              logs={store.logs.filter(l => l.habit_id === habit.id)}
              today={today}
              onToggle={() => store.toggleLog(habit.id, today)}
              onEdit={() => setForm({ kind: "edit", habit })}
              onArchive={() => store.archiveHabit(habit.id)}
            />
          );
        })}

        {/* Add form or button */}
        {form?.kind === "create" ? (
          <HabitForm
            onSave={handleSave}
            onCancel={() => setForm(null)}
          />
        ) : (
          <button
            onClick={() => setForm({ kind: "create" })}
            style={{
              all: "unset",
              fontFamily: VT,
              fontSize: "0.95rem",
              letterSpacing: 2,
              color: "rgba(255,255,255,0.2)",
              cursor: "pointer",
              marginTop: store.habits.length > 0 ? 18 : 0,
              display: "inline-block",
              transition: "color 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
          >
            + new habit
          </button>
        )}
      </div>
    </div>
  );
}
