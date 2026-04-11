// cspell:ignore pixelarticons HBIOS sleeptracker ampm toolcase
import { useState, useEffect } from "react";
import { Shapes, BookOpen, Bed } from "pixelarticons/react";
import { Clock } from "pixelarticons/react/Clock";
import { ArrowsHorizontal } from "pixelarticons/react/ArrowsHorizontal";
import { ToolCase } from "pixelarticons/react/ToolCase";
import type { SleepEntry, SleepTarget } from "./lib/sleepDb";
import {
  getEntries,
  getLast7MainSessions,
  getActiveTarget,
  addEntry,
  deleteEntry,
  setTarget,
} from "./lib/sleepDb";
import SleepChart from "./components/SleepChart";
import SleepLog from "./components/SleepLog";
import LogEntryModal from "./components/LogEntryModal";
import TargetModal from "./components/TargetModal";

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = "#6366f1";
const PX = "160px";

type Tab = "dashboard" | "analytics" | "log";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "DASHBOARD", icon: <Shapes size={16} /> },
  {
    id: "analytics",
    label: "ANALYTICS",
    icon: <Clock width={16} height={16} />,
  },
  { id: "log", label: "LOG", icon: <BookOpen size={16} /> },
];

export default function SleepTrackerPlugin() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [sessions, setSessions] = useState<SleepEntry[]>([]);
  const [target, setTargetState] = useState<SleepTarget | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);

  async function load() {
    const [all, last7, tgt] = await Promise.all([
      getEntries(),
      getLast7MainSessions(),
      getActiveTarget(),
    ]);
    setEntries(all);
    setSessions(last7);
    setTargetState(tgt);
  }

  useEffect(() => {
    load();
  }, []);

  // Number keys 1–3 + arrow left/right to switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setTab(TABS[idx].id);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        setTab((prev) => {
          const cur = TABS.findIndex((t) => t.id === prev);
          const next =
            e.key === "ArrowRight"
              ? (cur + 1) % TABS.length
              : (cur - 1 + TABS.length) % TABS.length;
          return TABS[next].id;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function handleAddEntry(entry: { date: string; sleep_start: string; wake_time: string; notes: string }) {
    await addEntry(entry);
    setShowLogModal(false);
    await load();
  }

  async function handleDeleteEntry(id: number) {
    await deleteEntry(id);
    await load();
  }

  async function handleSetTarget(start: string, duration: number) {
    await setTarget(start, duration);
    setShowTargetModal(false);
    await load();
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: `112px ${PX} 0`,
          flexShrink: 0,
        }}
      >
        {/* Title row */}
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
            sleeptracker
          </span>

          <div style={{ display: "flex", gap: 10 }}>
            <HeaderBtn
              label="set target"
              onClick={() => setShowTargetModal(true)}
            />
            <HeaderBtn
              label="+ log entry"
              onClick={() => setShowLogModal(true)}
              accent
            />
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "2.4rem" }}>
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: VT,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  transition: "all 0.12s ease",
                }}
              >
                <span
                  style={{
                    fontSize: "1.1rem",
                    color: active ? ACC : "rgba(255,255,255,0.22)",
                    transition: "color 0.12s ease",
                  }}
                >
                  {i + 1}
                </span>
                {active && (
                  <span
                    style={{
                      color: ACC,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {t.icon}
                  </span>
                )}
                <span
                  style={{
                    fontSize: active ? "2.6rem" : "1.45rem",
                    color: active ? "#fff" : "rgba(255,255,255,0.28)",
                    textTransform: active ? "uppercase" : "lowercase",
                    letterSpacing: active ? "3px" : "1.5px",
                    transition: "font-size 0.12s ease, color 0.12s ease",
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ flexShrink: 0 }} />

      {/* ── Page content ── */}
      {tab === "dashboard" && (
        <div
          style={{
            flex: 1,
            padding: `80px ${PX} 28px`,
            display: "flex",
            gap: 16,
            overflow: "hidden",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {/* ── Left: stat cards ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 36,
              flexShrink: 0,
              width: 420,
              paddingLeft: 24,
            }}
          >
            <StatCard
              icon={<ArrowsHorizontal width={22} height={22} />}
              label="TARGET SLEEP DURATION"
              value={
                target ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: "2.6rem" }}>
                      {Math.floor(target.target_duration)}
                    </span>
                    <span style={{ fontSize: "1.5rem", opacity: 0.6 }}>h</span>
                    <span style={{ fontSize: "2.6rem", marginLeft: 6 }}>
                      {Math.round((target.target_duration % 1) * 60)
                        .toString()
                        .padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: "1.5rem", opacity: 0.6 }}>m</span>
                  </span>
                ) : (
                  <span style={{ fontSize: "2rem", opacity: 0.3 }}>--</span>
                )
              }
            />

            {/* ── Sleep note ── */}
            <p
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: "0.72rem",
                fontStyle: "italic",
                color: "rgba(255,255,255,0.28)",
                lineHeight: 1.55,
                margin: "-24px 0 0",
                maxWidth: 320,
                paddingLeft: 20,
              }}
            >
              Adults generally need 7 or more hours of quality sleep per night
              for optimal health. Consistently sleeping less than 7 hours can
              increase risks for chronic conditions like diabetes,
              cardiovascular disease, obesity, and depression.{" "}
              <span style={{ opacity: 0.55 }}>(Mayo Clinic)</span>
            </p>

            <StatCard
              icon={<Bed size={22} />}
              label="TARGET SLEEP START"
              value={
                target ? (
                  <span>
                    <span style={{ fontSize: "2.6rem" }}>
                      {fmtAmPm(target.target_sleep_start).time}
                    </span>
                    <span style={{ fontSize: "1.5rem", opacity: 0.6 }}>
                      {" "}
                      {fmtAmPm(target.target_sleep_start).ampm}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: "2rem", opacity: 0.3 }}>--:--</span>
                )
              }
            />

            {/* ── Goal Legend ── */}
            <GoalLegend target={target} />
          </div>

          {/* ── Right: chart ── */}
          <div
            style={{
              width: 800,
              flexShrink: 0,
              height: 476,
              paddingLeft: 24,
            }}
          >
            <SleepChart sessions={sessions} target={target} />
          </div>
        </div>
      )}

      {tab === "analytics" && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: VT,
              fontSize: "1rem",
              letterSpacing: 3,
              color: "rgba(99,102,241,0.3)",
              textTransform: "uppercase",
            }}
          >
            analytics — coming soon
          </span>
        </div>
      )}

      {tab === "log" && (
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
          <div style={{ padding: `0 ${PX}` }}>
            <SleepLog
              entries={entries}
              target={target}
              onDelete={handleDeleteEntry}
            />
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showLogModal && (
        <LogEntryModal
          existingEntries={entries}
          onSubmit={handleAddEntry}
          onClose={() => setShowLogModal(false)}
        />
      )}
      {showTargetModal && (
        <TargetModal
          current={target}
          onSave={handleSetTarget}
          onClose={() => setShowTargetModal(false)}
        />
      )}
    </div>
  );
}

const LEGEND_ITEMS: { color: string; tt: string; dur: string; desc: string }[] = [
  { color: "#60a5fa", tt: "YES", dur: "> TD+1h",    desc: "child of a new world"       },
  { color: "#4ade80", tt: "YES", dur: "TD ~ TD+1h", desc: "perfect"                    },
  { color: "#facc15", tt: "NO",  dur: "TD ~ TD+1h", desc: "you an owl?"                },
  { color: "#fb923c", tt: "YES", dur: "< TD",        desc: "nice try..."               },
  { color: "#f43f5e", tt: "NO",  dur: "< TD",        desc: "sleep... more... please..." },
];

function GoalLegend({ target }: { target: SleepTarget | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: VT,
          fontSize: "1.6rem",
          letterSpacing: "4px",
          color: YELLOW,
          textTransform: "uppercase",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", color: YELLOW }}>
          <ToolCase width={22} height={22} />
        </span>
        GOAL LEGEND
      </div>
      {/* column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "12px 36px 90px 1fr", gap: "0 10px", paddingLeft: 36, alignItems: "center", marginBottom: 2 }}>
        <div />
        <span style={{ fontFamily: VT, fontSize: "0.85rem", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", lineHeight: 1 }}>TT?</span>
        <span style={{ fontFamily: VT, fontSize: "0.85rem", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", lineHeight: 1 }}>DURATION</span>
        <span />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 36 }}>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.color} style={{ display: "grid", gridTemplateColumns: "12px 36px 90px 1fr", gap: "0 10px", alignItems: "center" }}>
            <div style={{
              width: 10,
              height: 10,
              background: target ? item.color : "rgba(255,255,255,0.1)",
              flexShrink: 0,
              outline: "1px solid rgba(0,0,0,0.5)",
            }} />
            <span style={{
              fontFamily: VT,
              fontSize: "1.1rem",
              letterSpacing: "1.5px",
              color: target ? (item.tt === "YES" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)") : "rgba(255,255,255,0.15)",
              lineHeight: 1,
            }}>
              {item.tt}
            </span>
            <span style={{
              fontFamily: VT,
              fontSize: "1.1rem",
              letterSpacing: "1px",
              color: target ? item.color : "rgba(255,255,255,0.15)",
              lineHeight: 1,
            }}>
              {item.dur}
            </span>
            <span style={{
              fontFamily: "'Georgia', serif",
              fontSize: "0.7rem",
              fontStyle: "italic",
              color: target ? item.color : "rgba(255,255,255,0.15)",
              lineHeight: 1,
            }}>
              {item.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtAmPm(hhmm: string): { time: string; ampm: string } {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return {
    time: `${h12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
    ampm,
  };
}

const YELLOW = "#f5c842";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: VT,
          fontSize: "1.6rem",
          letterSpacing: "4px",
          color: YELLOW,
          textTransform: "uppercase",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", color: YELLOW }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: VT,
          color: "#fff",
          lineHeight: 1,
          letterSpacing: 1,
          paddingLeft: 20,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "1.2rem" }}>
          ▶
        </span>
        {value}
      </div>
    </div>
  );
}

function HeaderBtn({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset",
        fontFamily: VT,
        fontSize: "0.95rem",
        letterSpacing: 2,
        textTransform: "uppercase",
        color: accent
          ? hov
            ? "#fff"
            : ACC
          : hov
            ? "rgba(255,255,255,0.75)"
            : "rgba(255,255,255,0.4)",
        border: `1px solid ${
          accent
            ? hov
              ? "rgba(99,102,241,0.7)"
              : "rgba(99,102,241,0.4)"
            : hov
              ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.15)"
        }`,
        padding: "4px 14px",
        cursor: "pointer",
        transition: "color 0.1s, border-color 0.1s",
      }}
    >
      {label}
    </button>
  );
}
