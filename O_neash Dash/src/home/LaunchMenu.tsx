import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import usePluginStore from "../store/usePluginStore";
import {
  Terminal,
  Notes,
  CheckDouble,
  SettingsCog2,
  Analytics,
  TeachSharp,
  BookOpen,
  Clipboard,
  Camera,
  MapPin,
  Grid2x22,
  Human,
  Trophy,
  Bed,
  Fish,
  PcCase,
  CoffeeSharp,
  StickyNoteText,
  ImageSharp,
  Zap,
} from "pixelarticons/react";

// ── Data ──────────────────────────────────────────────────────────────────────

interface AppItem {
  id: string;
  label: string;
  icon: ReactNode;
  desc: string;
  pluginId?: string;
}

interface Category {
  id: string;
  label: string;
  icon: ReactNode;
  accent: string;
  apps: AppItem[];
}

export const CATEGORIES: Category[] = [
  {
    id: "basic",
    label: "BASIC",
    icon: <Terminal size={18} />,
    accent: "#00c4a7",
    apps: [
      {
        id: "notes",
        label: "Notes",
        icon: <Notes size={14} />,
        desc: "thoughts, ideas, memos",
        pluginId: "notes",
      },
      {
        id: "todo",
        label: "Todo List",
        icon: <CheckDouble size={14} />,
        desc: "eisenhower matrix task tracker",
        pluginId: "todo-list",
      },
      {
        id: "planner",
        label: "Planner",
        icon: <Zap size={14} />,
        desc: "tasks, deadlines, project arcs",
        pluginId: "planner",
      },
      {
        id: "journal",
        label: "Journal",
        icon: <PcCase size={14} />,
        desc: "daily log. persistence is key",
      },
      {
        id: "settings",
        label: "Settings",
        icon: <SettingsCog2 size={14} />,
        desc: "widgets, layout, preferences",
        pluginId: "settings",
      },
      {
        id: "monitor",
        label: "System Resource Monitor",
        icon: <Analytics size={14} />,
        desc: "",
      },
    ],
  },
  {
    id: "lab",
    label: "the LAB",
    icon: <CoffeeSharp size={18} />,
    accent: "#f59e0b",
    apps: [
      {
        id: "esra",
        label: "L'ESRA",
        icon: <BookOpen size={14} />,
        desc: "encyclopedia of relative & absolute knowledge",
        pluginId: "esra",
      },
      {
        id: "projects",
        label: "Projects",
        icon: <TeachSharp size={14} />,
        desc: "deadlines, milestones, progress",
      },
      {
        id: "academic",
        label: "Academic Planner",
        icon: <BookOpen size={14} />,
        desc: "study goals & assignments",
      },
      {
        id: "protocol",
        label: "Protocol Manager",
        icon: <Clipboard size={14} />,
        desc: "experimental protocol archive",
      },
      {
        id: "papers",
        label: "Paper Library",
        icon: <StickyNoteText size={14} />,
        desc: "papers database & RSS feed",
      },
    ],
  },
  {
    id: "studio",
    label: "the STUDIO",
    icon: <Camera size={18} />,
    accent: "#e879f9",
    apps: [
      {
        id: "geo-portal",
        label: "Geo-Portal",
        icon: <MapPin size={14} />,
        desc: "travel logs & bucket list",
        pluginId: "geo-portal",
      },
      {
        id: "film",
        label: "Film Neg Lab",
        icon: <ImageSharp size={14} />,
        desc: "photo archive",
      },
      {
        id: "canvas",
        label: "CANVAS",
        icon: <Grid2x22 size={14} />,
        desc: "open moodboard",
      },
    ],
  },
  {
    id: "clinic",
    label: "the CLINIC",
    icon: <Human size={18} />,
    accent: "#6366f1",
    apps: [
      {
        id: "habits",
        label: "Habits and Health",
        icon: <Trophy size={14} />,
        desc: "habit & health analytics",
      },
      {
        id: "sleep",
        label: "SleepTracker",
        icon: <Bed size={14} />,
        desc: "sleep log & schedule fix",
        pluginId: "sleep-tracker",
      },
      {
        id: "diet",
        label: "Diet Log",
        icon: <Fish size={14} />,
        desc: "meal prep & diet planner",
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LaunchMenu() {
  const setActivePlugin = usePluginStore((s) => s.setActivePlugin);
  const [activeCat, setActiveCat] = useState(0);
  const [activeApp, setActiveApp] = useState(0);

  const apps = CATEGORIES[activeCat].apps;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // 1–4: switch category
      const catIdx = parseInt(e.key) - 1;
      if (!isNaN(catIdx) && catIdx >= 0 && catIdx < CATEGORIES.length) {
        setActiveCat(catIdx);
        setActiveApp(0);
        return;
      }

      const currentApps = CATEGORIES[activeCat].apps;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveApp((i) => Math.min(i + 1, currentApps.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveApp((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowRight") {
        setActiveCat((c) => {
          const n = Math.min(c + 1, CATEGORIES.length - 1);
          setActiveApp(0);
          return n;
        });
      } else if (e.key === "ArrowLeft") {
        setActiveCat((c) => {
          const n = Math.max(c - 1, 0);
          setActiveApp(0);
          return n;
        });
      } else if (e.key === "Enter") {
        const app = currentApps[activeApp];
        if (app?.pluginId) setActivePlugin(app.pluginId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCat, activeApp, setActivePlugin]);

  return (
    <div style={{ fontFamily: "'VT323', monospace", width: "100%" }}>
      <style>{`
        @keyframes icon-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .app-icon-blink { animation: icon-blink 1s step-start infinite; }
      `}</style>

      {/* ── Category row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "2.4rem",
          paddingBottom: "0.6rem",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {CATEGORIES.map((cat, i) => {
          const active = activeCat === i;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCat(i);
                setActiveApp(0);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                lineHeight: 1,
                transition: "all 0.12s ease",
              }}
            >
              <span
                style={{
                  fontSize: "1.2rem",
                  color: active ? cat.accent : "rgba(255,255,255,0.22)",
                  transition: "color 0.12s ease",
                }}
              >
                {i + 1}
              </span>
              {active && (
                <span
                  style={{
                    color: cat.accent,
                    display: "flex",
                    alignItems: "center",
                    transform: "scale(1.25)",
                    transformOrigin: "center",
                    margin: "0 8px",
                  }}
                >
                  {cat.icon}
                </span>
              )}
              <span
                style={{
                  fontSize: active ? "2.4rem" : "1.5rem",
                  color: active ? "#fff" : "rgba(255,255,255,0.28)",
                  textTransform: active ? "uppercase" : "lowercase",
                  letterSpacing: active ? "3px" : "1.5px",
                  transition: "font-size 0.12s ease, color 0.12s ease",
                }}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Terminal app list ── */}
      <div style={{ marginTop: 10 }}>
        {apps.map((app, i) => {
          const sel = activeApp === i;
          const available = !!app.pluginId;
          return (
            <button
              key={app.id}
              onClick={() => {
                setActiveApp(i);
                if (app.pluginId) setActivePlugin(app.pluginId);
              }}
              onMouseEnter={() => setActiveApp(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                width: "100%",
                padding: "1px 0",
                background: "none",
                border: "none",
                cursor: available ? "pointer" : "default",
                opacity: 1,
                transition: "opacity 0.1s",
              }}
            >
              {/* cursor */}
              <span
                style={{
                  width: 12,
                  flexShrink: 0,
                  fontSize: "1.1rem",
                  color: sel ? CATEGORIES[activeCat].accent : "transparent",
                }}
              >
                {">"}
              </span>
              {/* inner pill — only wraps the content, not the full row */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "1px 7px",
                  background: sel ? "rgba(255,255,255,0.88)" : "none",
                  transition: "background 0.1s",
                }}
              >
                {/* index */}
                <span
                  style={{
                    width: 16,
                    flexShrink: 0,
                    textAlign: "right",
                    fontSize: "1.1rem",
                    color: sel ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.28)",
                  }}
                >
                  {i + 1}
                </span>
                {/* icon */}
                <span
                  className={sel ? "app-icon-blink" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    color: sel ? "rgba(0,0,0,0.7)" : `${CATEGORIES[activeCat].accent}88`,
                    transition: "color 0.1s",
                  }}
                >
                  {app.icon}
                </span>
                {/* name */}
                <span
                  style={{
                    fontSize: "1.2rem",
                    letterSpacing: "1px",
                    minWidth: 190,
                    textAlign: "left",
                    color: sel ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.55)",
                    transition: "color 0.1s",
                  }}
                >
                  {app.label}
                </span>
                {/* description */}
                {app.desc && (
                  <span
                    style={{
                      fontSize: "1rem",
                      letterSpacing: "0.5px",
                      color: sel ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.2)",
                    }}
                  >
                    {app.desc}
                  </span>
                )}
              </span>
              {/* end inner pill */}
            </button>
          );
        })}
      </div>
    </div>
  );
}
