import { useEffect } from "react";
import ClockPlugin from "../plugins/ClockPlugin/ClockPlugin";
import { LaunchMenu } from "./LaunchMenu";
import { WidgetPanel } from "../widgets/WidgetPanel";
import { usePlannerStore } from "../plugins/PlannerPlugin/store/usePlannerStore";

const BORDER = "1px solid rgba(0,196,167,0.45)";
const BG = "rgba(0,196,167,0.02)";

function HomePage() {
  const loadAll = usePlannerStore(s => s.loadAll);

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "row",
        padding: "12vh 5vw",
        gap: "4vw",
        boxSizing: "border-box",
      }}
    >
      {/* ── Left column — avatar + clock + app selector ── */}
      <div
        style={{
          position: "relative",
          width: "40vw",
          flexShrink: 0,
        }}
      >
        {/* Avatar + clock — pinned to top of column */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              flexShrink: 0,
              marginTop: 20,
            }}
          >
            <div
              style={{
                width: 140,
                height: 140,
                border: BORDER,
                background: BG,
              }}
            />
            <div style={{ fontFamily: "'VT323', monospace" }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: "2px",
                }}
              >
                Welcome,
              </div>
              <div
                style={{
                  fontSize: "1.7rem",
                  color: "#fff",
                  letterSpacing: "3px",
                  lineHeight: 1.1,
                }}
              >
                HAN-JAE
              </div>
            </div>
          </div>
          <ClockPlugin />
        </div>

        {/* App selector — top aligned to 50% of window height */}
        <div
          style={{
            position: "absolute",
            top: "calc(50vh - 15vh)",
            width: "100%",
          }}
        >
          <LaunchMenu />
        </div>
      </div>

      {/* ── Right column — widget panel ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <WidgetPanel />
      </div>
    </div>
  );
}

export default HomePage;
