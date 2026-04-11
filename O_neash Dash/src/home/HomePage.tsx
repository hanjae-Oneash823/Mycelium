import { useEffect, useRef, useState } from "react";
import ClockPlugin from "../plugins/ClockPlugin/ClockPlugin";
import { LaunchMenu } from "./LaunchMenu";
import { WidgetPanel } from "../widgets/WidgetPanel";
import { usePlannerStore } from "../plugins/PlannerPlugin/store/usePlannerStore";

// Eye positions calibrated to cyphel_grey_noeyes.png at 140×140px
const EYES = [
  { left: 56.5, top: 70 }, // left eye
  { left: 74.5, top: 70 }, // right eye
];
const EYE_SIZE = 9; // diameter in px

function AvatarWithEyes() {
  const [blink, setBlink] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const doBlink = () => {
      setBlink(true);
      setTimeout(() => setBlink(false), 130);
      timerRef.current = setTimeout(doBlink, 2200 + Math.random() * 2800);
    };
    timerRef.current = setTimeout(doBlink, 1000 + Math.random() * 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <img
        src="/icons/character/cyphel_grey_noeyes.png"
        alt="avatar"
        style={{ width: 140, height: 140, objectFit: "cover", display: "block" }}
      />
      {EYES.map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: pos.left,
            top: pos.top,
            width: EYE_SIZE,
            height: EYE_SIZE,
            borderRadius: "50%",
            background: "transparent",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#fff",
              transformOrigin: "bottom",
              transform: blink ? "scaleY(0)" : "scaleY(1)",
              transition: blink
                ? "transform 0.07s ease-in"
                : "transform 0.09s ease-out",
            }}
          />
        </div>
      ))}
    </div>
  );
}

const BORDER = "1px solid rgba(0,196,167,0.45)";
const BG = "rgba(0,196,167,0.02)";

function HomePage() {
  const loadAll = usePlannerStore((s) => s.loadAll);

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
        <div style={{ display: "flex", alignItems: "flex-start", paddingLeft: "3vw" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              flexShrink: 0,
              marginTop: 20,
            }}
          >
            <AvatarWithEyes />
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
