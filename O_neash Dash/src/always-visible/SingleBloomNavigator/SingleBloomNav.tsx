import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import QuickAddInput from "../../plugins/PlannerPlugin/components/QuickAddInput";
import { usePlannerStore } from "../../plugins/PlannerPlugin/store/usePlannerStore";
import { useHabitsStore } from "../../plugins/HabitsPlugin/store/useHabitsStore";
import { addEntry, getEntries } from "../../plugins/SleepTrackerPlugin/lib/sleepDb";
import type { Habit } from "../../plugins/HabitsPlugin/types";
import "./SingleBloomNav.css";

const VT = "var(--font-main), var(--font-kr), monospace";

type Tab = "task" | "habits" | "sleep";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildSleepDatetimes(date: string, sleepHHMM: string, wakeHHMM: string) {
  const [sh] = sleepHHMM.split(":").map(Number);
  const [wh] = wakeHHMM.split(":").map(Number);
  const sleepDate = sh < 14 ? addDays(date, 1) : date;
  const wakeDate =
    (sh >= 14 && wh < 14) || (wh < sh && wh < 14) ? addDays(sleepDate, 1) : sleepDate;
  return {
    sleep_start: `${sleepDate}T${sleepHHMM}:00`,
    wake_time: `${wakeDate}T${wakeHHMM}:00`,
  };
}

// ── Sleep bar constants & helpers ─────────────────────────────────────────────

const ACC         = '#6366f1';
const BAR_START   = 22 * 60;
const BAR_SPAN    = 14 * 60;
const SNAP_MIN    = 5;
const TICK_HOURS  = [22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LABELED_HOURS = new Set([22, 0, 3, 6, 9, 12]);

function hourToPos(h: number): number {
  const abs = h >= 22 ? h : h + 24;
  return (abs * 60 - BAR_START) / BAR_SPAN;
}
function snapPos(pos: number): number {
  const mins    = pos * BAR_SPAN;
  const snapped = Math.round(mins / SNAP_MIN) * SNAP_MIN;
  return Math.max(0, Math.min(1, snapped / BAR_SPAN));
}
function posToHHMM(pos: number): string {
  const totalMin = BAR_START + Math.round(pos * BAR_SPAN);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function durLabel(a: number, b: number): string {
  const mins = Math.round(Math.abs(b - a) * BAR_SPAN);
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`;
}

// ── Sleep bar ─────────────────────────────────────────────────────────────────

interface SleepBarProps {
  onChange: (sleepHHMM: string | null, wakeHHMM: string | null) => void;
}

function SleepBar({ onChange }: SleepBarProps) {
  const barRef      = useRef<HTMLDivElement>(null);
  const dragging    = useRef(false);
  const anchorRef   = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const [selA,  setSelA]  = useState<number | null>(null);
  const [selB,  setSelB]  = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const getRawPos = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const raw = getRawPos(e.clientX);
      setHover(raw);
      if (!dragging.current) return;
      setSelA(anchorRef.current);
      setSelB(snapPos(raw));
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      setSelB(snapPos(getRawPos(e.clientX)));
      setHover(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [getRawPos]);

  const selStart    = selA !== null && selB !== null ? Math.min(selA, selB) : null;
  const selEnd      = selA !== null && selB !== null ? Math.max(selA, selB) : null;
  const hasSelection = selStart !== null && selEnd !== null && selEnd > selStart + 0.005;

  useEffect(() => {
    if (hasSelection) {
      onChangeRef.current(posToHHMM(selStart!), posToHHMM(selEnd!));
    } else {
      onChangeRef.current(null, null);
    }
  }, [selStart, selEnd, hasSelection]);

  const snappedHover = hover !== null ? snapPos(hover) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, userSelect: 'none' }}>
      <div style={{ position: 'relative' }}>
        {snappedHover !== null && !dragging.current && (
          <div style={{
            position: 'absolute', bottom: '100%',
            left: `${snappedHover * 100}%`, transform: 'translateX(-50%)',
            marginBottom: 4, background: '#0d0d20',
            border: `1px solid ${ACC}55`, padding: '1px 6px',
            fontFamily: VT, fontSize: '1.1rem', letterSpacing: 1,
            color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 10,
          }}>
            {posToHHMM(snappedHover)}
          </div>
        )}

        <div
          ref={barRef}
          onMouseDown={e => {
            const p = snapPos(getRawPos(e.clientX));
            anchorRef.current = p;
            dragging.current  = true;
            setSelA(p); setSelB(p);
          }}
          onMouseMove={e => setHover(getRawPos(e.clientX))}
          onMouseLeave={() => { if (!dragging.current) setHover(null); }}
          style={{
            position: 'relative', width: '100%', height: 28,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'crosshair', boxSizing: 'border-box',
          }}
        >
          {TICK_HOURS.map(h => {
            const labeled = LABELED_HOURS.has(h);
            return (
              <div key={h} style={{
                position: 'absolute', left: `${hourToPos(h) * 100}%`, top: 0,
                width: 1, height: labeled ? '100%' : '40%',
                background: labeled ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                pointerEvents: 'none',
              }} />
            );
          })}

          {hasSelection && (
            <div style={{
              position: 'absolute', left: `${selStart! * 100}%`,
              width: `${(selEnd! - selStart!) * 100}%`, top: 0, bottom: 0,
              background: 'rgba(250,204,21,0.18)',
              borderLeft: '2px solid #facc15', borderRight: '2px solid #facc15',
              pointerEvents: 'none',
            }} />
          )}

          {snappedHover !== null && (
            <div style={{
              position: 'absolute', left: `${snappedHover * 100}%`,
              top: 0, bottom: 0, width: 1,
              background: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>

      <div style={{ position: 'relative', height: 14, flexShrink: 0 }}>
        {TICK_HOURS.filter(h => LABELED_HOURS.has(h)).map(h => (
          <span key={h} style={{
            position: 'absolute', left: `${hourToPos(h) * 100}%`,
            transform: 'translateX(-50%)',
            fontFamily: VT, fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', letterSpacing: 0.5,
          }}>
            {h.toString().padStart(2, '0')}
          </span>
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        fontFamily: VT, fontSize: '1.3rem', letterSpacing: 1.5, minHeight: 24,
      }}>
        {hasSelection ? (
          <span>
            <span style={{ color: '#facc15' }}>{posToHHMM(selStart!)}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}> → </span>
            <span style={{ color: '#facc15' }}>{posToHHMM(selEnd!)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
              [{durLabel(selStart!, selEnd!)}]
            </span>
          </span>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>drag to select</span>
        )}
      </div>
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ["task", "habits", "sleep"];
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 14 }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            fontFamily: VT,
            fontSize: "0.95rem",
            letterSpacing: 2,
            background: "none",
            border: "none",
            borderBottom: active === t ? "2px solid #00c4a7" : "2px solid transparent",
            color: active === t ? "#00c4a7" : "rgba(255,255,255,0.3)",
            padding: "4px 12px 6px",
            cursor: "pointer",
            transition: "color 0.12s, border-color 0.12s",
            marginBottom: -1,
          }}
          onMouseEnter={(e) => {
            if (active !== t) e.currentTarget.style.color = "rgba(255,255,255,0.65)";
          }}
          onMouseLeave={(e) => {
            if (active !== t) e.currentTarget.style.color = "rgba(255,255,255,0.3)";
          }}
        >
          [{t}]
        </button>
      ))}
    </div>
  );
}

// ── Task section ──────────────────────────────────────────────────────────────

function TaskSection() {
  const { createNode } = usePlannerStore();
  const today = todayStr();
  return (
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
  );
}

// ── Habit row ─────────────────────────────────────────────────────────────────

function HabitRow({
  habit,
  logged,
  value,
  onToggle,
  onSetNumeric,
}: {
  habit: Habit;
  logged: boolean;
  value: number | null;
  onToggle: () => void;
  onSetNumeric: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const n = parseFloat(draft);
    onSetNumeric(draft.trim() === "" || isNaN(n) ? null : n);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 2px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {habit.value_type === "boolean" ? (
        <div
          onClick={onToggle}
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            background: logged ? habit.color : "transparent",
            border: `1px solid ${logged ? habit.color : "rgba(255,255,255,0.3)"}`,
            cursor: "pointer",
            transition: "background 0.1s, border-color 0.1s",
          }}
        />
      ) : (
        <div
          onClick={!editing ? startEdit : undefined}
          style={{
            width: 44,
            height: 22,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: value !== null ? `${habit.color}33` : "transparent",
            border: `1px solid ${value !== null ? habit.color : "rgba(255,255,255,0.2)"}`,
            cursor: "pointer",
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") commitEdit();
              }}
              style={{
                width: "90%",
                background: "transparent",
                border: "none",
                color: "#fff",
                fontFamily: VT,
                fontSize: "0.9rem",
                textAlign: "center",
                outline: "none",
              }}
            />
          ) : (
            <span style={{ fontFamily: VT, fontSize: "0.9rem", color: value !== null ? "#fff" : "rgba(255,255,255,0.3)" }}>
              {value !== null ? value : "·"}
            </span>
          )}
        </div>
      )}

      <span
        style={{
          fontFamily: VT,
          fontSize: "1rem",
          letterSpacing: 1,
          color: logged || value !== null ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {habit.name}
      </span>

      <div
        style={{ width: 6, height: 6, borderRadius: "50%", background: habit.color, flexShrink: 0, opacity: 0.6 }}
      />
    </div>
  );
}

// ── Habits section ────────────────────────────────────────────────────────────

function HabitsSection() {
  const store = useHabitsStore();
  const today = todayStr();

  useEffect(() => {
    store.reload();
  }, []);

  const todayLogMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const log of store.logs) {
      if (log.date === today) map.set(log.habit_id, log.value ?? null);
    }
    return map;
  }, [store.logs, today]);

  if (store.loading) {
    return (
      <div style={{ fontFamily: VT, fontSize: "0.85rem", color: "rgba(255,255,255,0.2)", letterSpacing: 1 }}>
        loading...
      </div>
    );
  }

  if (store.habits.length === 0) {
    return (
      <div style={{ fontFamily: VT, fontSize: "0.85rem", color: "rgba(255,255,255,0.2)", letterSpacing: 1 }}>
        no habits — add some in the Habits plugin
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {store.habits.map((habit) => {
        const logged = todayLogMap.has(habit.id);
        const value = todayLogMap.get(habit.id) ?? null;
        return (
          <HabitRow
            key={habit.id}
            habit={habit}
            logged={logged}
            value={value}
            onToggle={() => store.toggleBoolean(habit.id, today)}
            onSetNumeric={(v) => store.setNumeric(habit.id, today, v)}
          />
        );
      })}
    </div>
  );
}

// ── Sleep section ─────────────────────────────────────────────────────────────

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SleepSection() {
  const [date, setDate] = useState(() => new Date());
  const [sleepHHMM, setSleepHHMM] = useState<string | null>(null);
  const [wakeHHMM,  setWakeHHMM]  = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    getEntries(90).then(entries => setLoggedDates(new Set(entries.map(e => e.date))));
  }, []);

  const todayS       = todayStr();
  const dateStr      = dateToStr(date);
  const isToday      = dateStr === todayS;
  const alreadyLogged = loggedDates.has(dateStr);
  const dateLabel = isToday
    ? "today"
    : dateStr === addDays(todayS, -1)
      ? "yesterday"
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  function shiftDay(n: number) {
    setDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; });
    setSleepHHMM(null);
    setWakeHHMM(null);
  }

  async function handleLog() {
    if (!sleepHHMM || !wakeHHMM || alreadyLogged) return;
    try {
      const { sleep_start, wake_time } = buildSleepDatetimes(dateStr, sleepHHMM, wakeHHMM);
      await addEntry({ date: dateStr, sleep_start, wake_time, notes: "" });
      setLoggedDates(prev => new Set(prev).add(dateStr));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const canLog = sleepHHMM !== null && wakeHHMM !== null && !alreadyLogged;
  const navBtn: React.CSSProperties = {
    background: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.5)",
    fontFamily: VT,
    fontSize: "1rem",
    width: 26,
    height: 22,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    transition: "border-color 0.1s, color 0.1s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={navBtn} onClick={() => shiftDay(-1)}>←</button>
        <span style={{
          fontFamily: VT, fontSize: "1rem", letterSpacing: 2,
          color: isToday ? "rgba(255,255,255,0.55)" : "#facc15",
          flex: 1, textAlign: "center",
        }}>
          {dateLabel}
        </span>
        <button
          style={{ ...navBtn, opacity: isToday ? 0.25 : 1, cursor: isToday ? "not-allowed" : "pointer" }}
          onClick={() => { if (!isToday) shiftDay(1); }}
          disabled={isToday}
        >→</button>
      </div>

      <div style={{ opacity: alreadyLogged ? 0.35 : 1, pointerEvents: alreadyLogged ? "none" : "auto" }}>
        <SleepBar onChange={(s, w) => { setSleepHHMM(s); setWakeHHMM(w); }} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {alreadyLogged ? (
          <span style={{ fontFamily: VT, fontSize: "0.95rem", letterSpacing: 2, color: "rgba(255,255,255,0.25)" }}>
            [ already logged ]
          </span>
        ) : (
          <button
            onClick={handleLog}
            disabled={!canLog}
            style={{
              fontFamily: VT, fontSize: "0.95rem", letterSpacing: 2,
              background:
                status === "saved" ? "rgba(74,222,128,0.15)"
                : status === "error" ? "rgba(248,113,113,0.15)"
                : "rgba(99,102,241,0.12)",
              border: `1px solid ${
                status === "saved" ? "#4ade80" : status === "error" ? "#f87171" : "rgba(99,102,241,0.4)"
              }`,
              color: status === "saved" ? "#4ade80" : status === "error" ? "#f87171" : "#6366f1",
              padding: "4px 16px",
              cursor: canLog ? "pointer" : "not-allowed",
              opacity: canLog ? 1 : 0.4,
              transition: "all 0.15s",
            }}
          >
            {status === "saved" ? "saved ✓" : status === "error" ? "error ✗" : "log sleep"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Bloom panel ───────────────────────────────────────────────────────────────

function BloomPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("task");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // defer so the button click that opened the panel doesn't immediately close it
    const t = setTimeout(() => window.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div ref={panelRef} className="bloom-panel">
      <TabBar active={activeTab} onChange={setActiveTab} />
      {activeTab === "task" && <TaskSection />}
      {activeTab === "habits" && <HabitsSection />}
      {activeTab === "sleep" && <SleepSection />}
    </div>
  );
}

// ── SingleBloomNav ────────────────────────────────────────────────────────────

function SingleBloomNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="single-bloom-container">
      {open && <BloomPanel onClose={() => setOpen(false)} />}
      <button
        className={`bloom-center${open ? " expanded" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="quick actions"
      >
        <span className="bloom-dot" />
      </button>
    </div>
  );
}

export default SingleBloomNav;
