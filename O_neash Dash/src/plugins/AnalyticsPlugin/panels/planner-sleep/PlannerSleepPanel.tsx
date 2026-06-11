import { useState, useEffect } from "react";
import SleepOutputScatter from "./SleepOutputScatter";
import ClusterPanel from "./ClusterPanel";
import RecurrencePlot from "./RecurrencePlot";
import { computeClusters, CLUSTER_COLORS } from "./clusterMath";
import type { ClusterResult } from "./clusterMath";

const VT = "'VT323', 'HBIOS-SYS', monospace";

const K_OPTIONS = [2, 3, 4, 5, 6, 7] as const;
type KOption = typeof K_OPTIONS[number];

export default function PlannerSleepPanel() {
  const [insights2, setInsights2]   = useState<string[]>([]);
  const [clusterResult, setCluster] = useState<ClusterResult | null>(null);
  const [selectedK, setSelectedK]   = useState<KOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCluster(null);
    computeClusters(selectedK ?? undefined)
      .then(r => { if (!cancelled) setCluster(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedK]);

  const clusterInsights = clusterResult?.clusters.map(c => `${c.id + 1}  ${c.label}  (${c.size}D)`) ?? [];
  const trendInsights   = clusterResult?.recentTrend ?? [];

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem" }}>

        {/* Panel 1: Cluster (t-SNE upper, stacked area lower) */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>

          <div style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            maxWidth: "95%", margin: "0 auto", width: "100%", paddingBottom: "0.4rem",
          }}>
            <div style={{
              fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
              color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
            }}>
              which behavioral modes<br />am i drifting into?
            </div>

            <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: VT, fontSize: "0.75rem", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginRight: "0.1rem" }}>K</span>
              {([null, ...K_OPTIONS] as (KOption | null)[]).map(k => {
                const active = k === selectedK;
                return (
                  <button
                    key={k ?? "auto"}
                    onClick={() => setSelectedK(k)}
                    style={{
                      fontFamily: VT, fontSize: "0.85rem", letterSpacing: "1.5px",
                      textTransform: "uppercase", cursor: "pointer",
                      padding: "1px 7px", border: "1px solid",
                      borderColor: active ? "#00c4a7" : "rgba(255,255,255,0.15)",
                      background: active ? "rgba(0,196,167,0.15)" : "transparent",
                      color: active ? "#00c4a7" : "rgba(255,255,255,0.35)",
                      transition: "all 0.15s",
                    }}
                  >
                    {k ?? "AUTO"}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
            border: "1px solid rgba(0,196,167,0.2)", overflow: "hidden",
          }}>
            <ClusterPanel result={clusterResult} />
          </div>

          <div style={{
            paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
            color: "rgba(0,196,167,0.5)", textTransform: "uppercase",
            textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
          }}>
            umap · 10d drift
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {clusterInsights.map((line, i) => (
              <div key={i} style={{
                fontFamily: VT, fontSize: "0.75rem", letterSpacing: "1px",
                color: (CLUSTER_COLORS[i] ?? "#ffffff") + "bf",
                textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                maxWidth: "95%", margin: "0 auto", width: "100%",
              }}>
                {line}
              </div>
            ))}
            {trendInsights.map((line, i) => (
              <div key={`t${i}`} style={{
                fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                color: i === 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                maxWidth: "95%", margin: "0 auto", width: "100%",
              }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Sleep × Output scatter */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{
            paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
            fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
            color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
          }}>
            more sleep<br />more output?
          </div>
          <div style={{
            aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
            border: "1px solid rgba(0,196,167,0.2)", overflow: "hidden",
          }}>
            <SleepOutputScatter onInsights={setInsights2} />
          </div>
          <div style={{
            paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
            color: "rgba(0,196,167,0.5)", textTransform: "uppercase",
            textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
          }}>
            sleep × output
          </div>
          <div style={{ paddingTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            {insights2.map((line, i) => (
              <div key={i} style={{
                fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1px",
                color: i === 0 ? "rgba(0,196,167,0.8)" : "rgba(255,255,255,0.3)",
                textTransform: "uppercase", textAlign: "center", lineHeight: 1.4,
                maxWidth: "95%", margin: "0 auto", width: "100%",
              }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Panel 3: Recurrence Plot */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{
            paddingBottom: "0.5rem", maxWidth: "95%", margin: "0 auto", width: "100%",
            fontFamily: VT, fontSize: "1.4rem", letterSpacing: "2px",
            color: "#ffffff", textTransform: "uppercase", lineHeight: 1.2,
          }}>
            do my patterns<br />repeat?
          </div>
          <div style={{
            aspectRatio: "1 / 1", maxWidth: "95%", margin: "0 auto", width: "100%",
            border: "1px solid rgba(0,196,167,0.2)", overflow: "hidden",
          }}>
            <RecurrencePlot result={clusterResult} />
          </div>
          <div style={{
            paddingTop: "0.75rem", fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
            color: "rgba(0,196,167,0.5)", textTransform: "uppercase",
            textAlign: "center", lineHeight: 1.4, maxWidth: "95%", margin: "0 auto", width: "100%",
          }}>
            recurrence · 8d features
          </div>
        </div>
      </div>

      <div style={{
        textAlign: "center", fontFamily: VT, fontSize: "1.05rem", letterSpacing: "2px",
        color: "rgba(255,255,255,0.2)", textTransform: "uppercase", flexShrink: 0,
      }}>
        sleep × planner · v1
      </div>
    </>
  );
}
