import { useState } from "react";
import ChronoFingerprint from "./ChronoFingerprint";
import BehavioralStateSpace from "./BehavioralStateSpace";
import ArcCompositionStream from "./ArcCompositionStream";

const VT = "'VT323', 'HBIOS-SYS', monospace";

function ComingSoonCard({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div
        style={{
          aspectRatio: "1 / 1",
          maxWidth: "95%",
          margin: "0 auto",
          width: "100%",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: VT, fontSize: "1rem", letterSpacing: "3px",
            textTransform: "uppercase", color: "rgba(255,255,255,0.1)",
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          paddingTop: "0.75rem",
          fontFamily: VT, fontSize: "1rem", letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
          textAlign: "center", lineHeight: 1.4,
        }}
      >
        coming soon
      </div>
    </div>
  );
}

export default function PlannerPanel() {
  const [insights, setInsights]   = useState<string[]>([]);
  const [insights2, setInsights2] = useState<string[]>([]);
  const [insights3, setInsights3] = useState<string[]>([]);

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        {/* Graph 1: Chrono-Fingerprint */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ paddingBottom: "0.5rem", fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px", color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2, maxWidth: "95%", margin: "0 auto", width: "100%" }}>
            when am i<br />most productive?
          </div>
          <div
            style={{
              aspectRatio: "1 / 1",
              maxWidth: "95%",
              margin: "0 auto",
              width: "100%",
              border: "1px solid rgba(0,196,167,0.2)",
              overflow: "hidden",
            }}
          >
            <ChronoFingerprint onInsights={setInsights} />
          </div>
          <div
            style={{
              paddingTop: "0.75rem",
              fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
              color: "rgba(0,196,167,0.5)", textTransform: "uppercase",
              textAlign: "center", lineHeight: 1.4,
            }}
          >
            chrono-fingerprint
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                  color: i === 0 ? "#00c4a7" : "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: Behavioral State Space */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ paddingBottom: "0.5rem", fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px", color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2, maxWidth: "95%", margin: "0 auto", width: "100%" }}>
            how focused<br />have i been?
          </div>
          <div
            style={{
              aspectRatio: "1 / 1",
              maxWidth: "95%",
              margin: "0 auto",
              width: "100%",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <BehavioralStateSpace onInsights={setInsights2} />
          </div>
          <div
            style={{
              paddingTop: "0.75rem",
              fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
              textAlign: "center", lineHeight: 1.4,
            }}
          >
            behavioral state space
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights2.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                  color: i === 0 ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)",
                  textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
        {/* Graph 3: Arc Composition Stream */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ paddingBottom: "0.5rem", fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px", color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2, maxWidth: "95%", margin: "0 auto", width: "100%" }}>
            where is my<br />effort going?
          </div>
          <div
            style={{
              aspectRatio: "1 / 1",
              maxWidth: "95%",
              margin: "0 auto",
              width: "100%",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <ArcCompositionStream onInsights={setInsights3} />
          </div>
          <div
            style={{
              paddingTop: "0.75rem",
              fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
              textAlign: "center", lineHeight: 1.4,
            }}
          >
            arc composition stream
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights3.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                  color: i === 0 ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.28)",
                  textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          fontFamily: VT,
          fontSize: "1.05rem",
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        planner analytics · v1
      </div>
    </>
  );
}
