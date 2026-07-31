import { useEffect, useState } from "react";
import { Bed, HumanArmsUp, Algorithm } from "pixelarticons/react";
import LogEntryModal from "../../plugins/SleepTrackerPlugin/components/LogEntryModal";
import { getEntries, addEntry, formatDuration, type SleepEntry } from "../../plugins/SleepTrackerPlugin/lib/sleepDb";
import { getHabits, getLogsForMonth } from "../../plugins/HabitsPlugin/lib/habitsDb";
import type { HabitLog } from "../../plugins/HabitsPlugin/types";
import { loadSessionsForWeek, type WorkSession } from "../../plugins/PlannerPlugin/lib/onTheClockDb";
import { useSessionStore } from "../../plugins/PlannerPlugin/store/useSessionStore";
import { CircleButton } from "./CircleButton";
import { RunKmPopup } from "./RunKmPopup";
import { StartSessionPopup } from "./StartSessionPopup";
import { DayOrbs } from "./DayOrbs";
import { last7Dates, sleepHoursByDay, runKmByDay, sessionMinutesByDay } from "./dayOrbData";

const SLEEP_ACC   = "#6366f1";
const RUN_ACC     = "#40c4c4";
const SESSION_ACC = "#f59e0b";

const SLEEP_MAX_HOURS    = 9;
const RUN_MAX_KM         = 10;
const SESSION_MAX_MIN    = 480; // 8h

type OpenPopup = "sleep" | "run" | "session" | null;

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAYS = last7Dates();

async function fetchRunLogs(): Promise<{ habitId: string | null; logs: HabitLog[] }> {
  const habits = await getHabits();
  const runHabit = habits.find((h) => h.name.trim().toLowerCase() === "running");
  if (!runHabit) return { habitId: null, logs: [] };

  const monthKeys = new Set(DAYS.map((d) => d.slice(0, 7)));
  const logSets = await Promise.all(
    Array.from(monthKeys).map((key) => {
      const [y, m] = key.split("-").map(Number);
      return getLogsForMonth(y, m);
    }),
  );
  return { habitId: runHabit.id, logs: logSets.flat() };
}

export function QuickActionButtons() {
  const [sleepEntries, setSleepEntries] = useState<SleepEntry[]>([]);
  const [runHabitId, setRunHabitId]     = useState<string | null>(null);
  const [runLogs, setRunLogs]           = useState<HabitLog[]>([]);
  const [weekSessions, setWeekSessions] = useState<WorkSession[]>([]);
  const [openPopup, setOpenPopup]       = useState<OpenPopup>(null);
  const activeSession = useSessionStore((s) => s.activeSession);
  const loadSessions  = useSessionStore((s) => s.load);

  const refreshRun     = () => fetchRunLogs().then(({ habitId, logs }) => { setRunHabitId(habitId); setRunLogs(logs); });
  const refreshSession = () => loadSessionsForWeek(DAYS[0], DAYS[DAYS.length - 1]).then(setWeekSessions);

  useEffect(() => {
    getEntries().then(setSleepEntries);
    loadSessions();
    refreshRun();
    refreshSession();
  }, [loadSessions]);

  const yesterdayLogged = sleepEntries.some((e) => e.date === yesterdayStr());
  const todayRunLogged  = runLogs.some((l) => l.date === todayStr());
  const sessionActive   = activeSession !== null;

  const sleepDayValues   = sleepHoursByDay(sleepEntries, DAYS);
  const runDayValues     = runKmByDay(runLogs, runHabitId, DAYS);
  const sessionDayValues = sessionMinutesByDay(weekSessions, DAYS);

  async function handleSleepSubmit(entry: { date: string; sleep_start: string; wake_time: string; notes: string }) {
    await addEntry(entry);
    setOpenPopup(null);
    getEntries().then(setSleepEntries);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
          <CircleButton
            color={SLEEP_ACC}
            disabled={yesterdayLogged}
            onClick={() => setOpenPopup("sleep")}
            title={yesterdayLogged ? "yesterday's sleep (already logged)" : "log sleep"}
          >
            <Bed width={20} height={20} />
          </CircleButton>
          <DayOrbs values={sleepDayValues} color={SLEEP_ACC} max={SLEEP_MAX_HOURS} formatValue={formatDuration} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
          <CircleButton
            color={RUN_ACC}
            disabled={todayRunLogged}
            onClick={() => setOpenPopup("run")}
            title={todayRunLogged ? "today's run (already logged)" : "log today's run"}
          >
            <HumanArmsUp width={20} height={20} />
          </CircleButton>
          <DayOrbs values={runDayValues} color={RUN_ACC} max={RUN_MAX_KM} formatValue={(v) => `${v.toFixed(1)} km`} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
          <CircleButton
            color={SESSION_ACC}
            disabled={sessionActive}
            onClick={() => setOpenPopup("session")}
            title={sessionActive ? "start session (already active)" : "start session"}
          >
            <Algorithm width={20} height={20} />
          </CircleButton>
          <DayOrbs values={sessionDayValues} color={SESSION_ACC} max={SESSION_MAX_MIN} formatValue={(v) => formatDuration(v / 60)} />
        </div>
      </div>

      {openPopup === "sleep" && (
        <LogEntryModal
          existingEntries={sleepEntries}
          initialDate={new Date(`${yesterdayStr()}T12:00:00`)}
          onSubmit={handleSleepSubmit}
          onClose={() => setOpenPopup(null)}
        />
      )}
      {openPopup === "run" && (
        <RunKmPopup onClose={() => { setOpenPopup(null); refreshRun(); }} />
      )}
      {openPopup === "session" && (
        <StartSessionPopup onClose={() => { setOpenPopup(null); refreshSession(); }} />
      )}
    </>
  );
}
