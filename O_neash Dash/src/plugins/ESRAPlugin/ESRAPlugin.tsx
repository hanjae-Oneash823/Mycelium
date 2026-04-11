// cspell:ignore ESRA pixelarticons odibee
import { useState, useEffect, useRef } from "react";
import { Library } from "pixelarticons/react/Library";
import { Search } from "pixelarticons/react/Search";
import { Circle } from "pixelarticons/react/Circle";
import { Bookmark } from "pixelarticons/react/Bookmark";
import { BracesContent } from "pixelarticons/react/BracesContent";
import { Algorithm } from "pixelarticons/react/Algorithm";

const VT = "'VT323', monospace";
const OD = "'Odibee Sans', monospace";
const ACC = "#f59e0b";
const PX = "160px";

type Tab = "bookshelf" | "search" | "spores" | "entries" | "articles" | "network";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "bookshelf", label: "BOOKSHELF",  icon: <Library width={24} height={24} /> },
  { id: "search",    label: "SEARCH",     icon: <Search width={24} height={24} /> },
  { id: "spores",    label: "SPORES",     icon: <Circle width={24} height={24} /> },
  { id: "entries",   label: "ENTRIES",    icon: <Bookmark width={24} height={24} /> },
  { id: "articles",  label: "ARTICLES",   icon: <BracesContent width={24} height={24} /> },
  { id: "network",   label: "THE NETWORK",icon: <Algorithm width={24} height={24} /> },
];

// ── Loading Screen ─────────────────────────────────────────────────────────────

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [textIdx, setTextIdx] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const DURATION = 4000;

  const loadingTexts = [
    "Initialising knowledge index...",
    "Loading entry database...",
    "Mapping cross-references...",
    "Building the network...",
    "Ready.",
  ];

  useEffect(() => {
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(elapsed / DURATION, 1);
      setProgress(pct);
      setTextIdx(Math.min(Math.floor(pct * loadingTexts.length), loadingTexts.length - 1));
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(onDone, 200);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <style>{`
        @keyframes esra-flicker {
          0%, 100% { opacity: 1; }
          92%       { opacity: 1; }
          93%       { opacity: 0.6; }
          94%       { opacity: 1; }
          96%       { opacity: 0.8; }
          97%       { opacity: 1; }
        }
        .esra-logo { animation: esra-flicker 3s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, width: 320 }}>
        {/* Logo */}
        <div className="esra-logo" style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: OD,
              fontSize: "5rem",
              color: ACC,
              lineHeight: 1,
              letterSpacing: "6px",
            }}
          >
            L'ESRA
</div>
          <div
            style={{
              fontFamily: OD,
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "1.5px",
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            The Encyclopedia of<br />Relative &amp; Absolute Knowledge

          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: 2,
            background: "rgba(255,255,255,0.1)",
            marginTop: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: ACC,
              transition: "width 0.05s linear",
            }}
          />
        </div>

        {/* Status text */}
        <div
          style={{
            fontFamily: VT,
            fontSize: "1.1rem",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "1px",
            height: 20,
          }}
        >
          {loadingTexts[textIdx]}
        </div>
      </div>
    </div>
  );
}

// ── Empty Views ────────────────────────────────────────────────────────────────

function EmptyView({ tab }: { tab: Tab }) {
  const config: Record<Tab, { icon: React.ReactNode; label: string; hint: string }> = {
    bookshelf: {
      icon: <Library width={32} height={32} />,
      label: "BOOKSHELF",
      hint: "Your knowledge dashboard. Stats, recent entries, and activity will appear here.",
    },
    search:    {
      icon: <Search width={32} height={32} />,
      label: "SEARCH",
      hint: "Full-text search across all spores, entries, and articles.",
    },
    spores:    {
      icon: <Circle width={32} height={32} />,
      label: "SPORES",
      hint: "Raw ideas and factoids waiting to become entries. Capture before it's lost.",
    },
    entries:   {
      icon: <Bookmark width={32} height={32} />,
      label: "ENTRIES",
      hint: "The core units of L'ESRA. Each entry has a number, a subject, and cross-references.",
    },
    articles:  {
      icon: <BracesContent width={32} height={32} />,
      label: "ARTICLES",
      hint: "Narratives that combine multiple entries into a longer story or essay.",
    },
    network:   {
      icon: <Algorithm width={32} height={32} />,
      label: "THE NETWORK",
      hint: "A node graph of all entries and how they connect to each other.",
    },
  };

  const { icon, label, hint } = config[tab];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "rgba(255,255,255,0.15)",
        paddingBottom: 80,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.08)" }}>{icon}</div>
      <div
        style={{
          fontFamily: VT,
          fontSize: "1.4rem",
          letterSpacing: "4px",
          color: "rgba(255,255,255,0.12)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: VT,
          fontSize: "1.1rem",
          color: "rgba(255,255,255,0.2)",
          letterSpacing: "0.5px",
          maxWidth: 400,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

// ── Main Plugin ────────────────────────────────────────────────────────────────

export default function ESRAPlugin() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("bookshelf");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!loaded) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setTab(TABS[idx].id);
        return;
      }
      if (e.key === "ArrowRight") {
        setTab((prev) => {
          const cur = TABS.findIndex((t) => t.id === prev);
          return TABS[(cur + 1) % TABS.length].id;
        });
      } else if (e.key === "ArrowLeft") {
        setTab((prev) => {
          const cur = TABS.findIndex((t) => t.id === prev);
          return TABS[(cur - 1 + TABS.length) % TABS.length].id;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loaded]);

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
        position: "relative",
      }}
    >
      {!loaded && <LoadingScreen onDone={() => setLoaded(true)} />}

      {/* ── Header ── */}
      <div
        style={{
          padding: "112px 160px 0",
          background: "#000",
          flexShrink: 0,
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: OD,
              fontSize: "2rem",
              letterSpacing: 5,
              color: ACC,
              lineHeight: 1,
            }}
          >
            L'ESRA
          </span>
          <span
            style={{
              fontFamily: VT,
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.28)",
              letterSpacing: "1px",
            }}
          >
            L'Encyclopédie du savoir relatif et absolu
          </span>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2.4rem",
            paddingBottom: "0.7rem",
          }}
        >
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
                letterSpacing: active ? "3px" : "1.5px",
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
                <span style={{ color: ACC, display: "flex", alignItems: "center" }}>
                  {t.icon}
                </span>
              )}
              <span
                style={{
                  fontSize: active ? "2.6rem" : "1.45rem",
                  color: active ? "#fff" : "rgba(255,255,255,0.28)",
                  textTransform: active ? "uppercase" : "lowercase",
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

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          padding: `0 ${PX}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <EmptyView tab={tab} />
      </div>
    </div>
  );
}
