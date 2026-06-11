import { useState } from "react";
import SleepPotentialLandscape from "./SleepPotentialLandscape";
import SleepHmmTimeline from "./SleepHmmTimeline";
import SleepDebtCurve from "./SleepDebtCurve";

const VT = "'VT323', 'HBIOS-SYS', monospace";

function ComingSoonCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div
        style={{
          paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
          fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
          color: "rgba(255,255,255,0.15)", textTransform: "uppercase", lineHeight: 1.2,
        }}
      >
        coming soon
      </div>
      <div
        style={{
          aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontFamily: VT, fontSize: "1rem", letterSpacing: "3px", color: "rgba(255,255,255,0.06)" }}>
          ···
        </span>
      </div>
    </div>
  );
}

export default function SleepPanel() {
  const [insights1, setInsights1] = useState<string[]>([]);
  const [insights2, setInsights2] = useState<string[]>([]);
  const [insights3, setInsights3] = useState<string[]>([]);

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        {/* Graph 1: Stochastic Potential Landscape */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div
            style={{
              paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
              fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
              color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
            }}
          >
            what time is my<br />body clock set to?
          </div>
          <div
            style={{
              aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
              border: "1px solid rgba(96,165,250,0.2)", overflow: "hidden",
            }}
          >
            <SleepPotentialLandscape onInsights={setInsights1} />
          </div>
          <div
            style={{
              paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
              color: "rgba(96,165,250,0.5)", textTransform: "uppercase",
              textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
            }}
          >
            potential landscape
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights1.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                  color: i === 0 ? "rgba(96,165,250,0.8)" : "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                  maxWidth: "95%", margin: "0 auto", width: "100%",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: HMM Sleep Regime Timeline */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div
            style={{
              paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
              fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
              color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
            }}
          >
            what hidden sleep<br />modes do i have?
          </div>
          <div
            style={{
              aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
              border: "1px solid rgba(240,176,48,0.2)", overflow: "hidden",
            }}
          >
            <SleepHmmTimeline onInsights={setInsights2} />
          </div>
          <div
            style={{
              paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
              color: "rgba(167,139,250,0.5)", textTransform: "uppercase",
              textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
            }}
          >
            hmm regime detection
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights2.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                  color: i === 0 ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                  maxWidth: "95%", margin: "0 auto", width: "100%",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Graph 3: Borbély Two-Process Sleep Debt */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{
            paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
            fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
            color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
          }}>
            am i accumulating<br />sleep debt?
          </div>
          <div style={{
            aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
            border: "1px solid rgba(248,113,113,0.2)", overflow: "hidden",
          }}>
            <SleepDebtCurve onInsights={setInsights3} />
          </div>
          <div style={{
            paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
            color: "rgba(248,113,113,0.5)", textTransform: "uppercase",
            textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
          }}>
            two-process model
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights3.map((line, i) => (
              <div key={i} style={{
                fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                color: i === 0 ? "rgba(248,113,113,0.8)" : "rgba(255,255,255,0.3)",
                textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                maxWidth: "95%", margin: "0 auto", width: "100%",
              }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign: "center", fontFamily: VT, fontSize: "1.05rem", letterSpacing: "2px",
          color: "rgba(255,255,255,0.2)", textTransform: "uppercase", flexShrink: 0,
        }}
      >
        sleep analytics · v1
      </div>
    </>
  );
}
