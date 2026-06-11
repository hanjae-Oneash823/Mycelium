import { useState, useEffect } from "react";
import { loadChronoData } from "./chronoData";
import { loadArcs } from "../../../PlannerPlugin/lib/plannerDb";
import {
  runChronoModel,
  concentrationLabel,
  formatHour,
  arcDivergence,
} from "./chronoMath";
import type { ChronoResult, ChronoPoint } from "./chronoMath";
import ChronoPolarChart from "./ChronoPolarChart";
import ScatterKdeChart from "./ScatterKdeChart";

const VT = "'VT323', 'HBIOS-SYS', monospace";

type ViewMode = "main" | "arcs" | "session";

const VIEW_LABELS: Record<ViewMode, string> = {
  main: "OVERALL",
  arcs: "BY ARC",
  session: "SESSION",
};

function buildInsights(result: ChronoResult, arcNames: Map<string, string>): string[] {
  const { peaks, concentration, ovl, driftHours, arcResults } = result;
  const lines: string[] = [];

  const primary = peaks[0];
  if (primary) {
    const label = concentrationLabel(concentration).toUpperCase();
    lines.push(`PRIMARY: ${formatHour(primary.hour)} · C=${concentration.toFixed(2)} · ${label}`);
  }

  if (peaks[1]) {
    lines.push(`SECONDARY WINDOW AT ${formatHour(peaks[1].hour)}`);
  }

  if (driftHours !== null && Math.abs(driftHours) > 1.5) {
    const dir = driftHours > 0 ? "LATER" : "EARLIER";
    lines.push(`PEAK SHIFTED ${Math.abs(driftHours).toFixed(1)}H ${dir} VS LAST MONTH`);
  }

  if (ovl > 0.7) {
    lines.push("SESSIONS ALIGNED WITH YOUR NATURAL RHYTHM");
  } else if (ovl > 0 && ovl < 0.4 && primary) {
    lines.push(`SESSIONS MISALIGNED — SHIFT TO ${formatHour(primary.hour)}`);
  }

  const arcIds = Array.from(arcResults.keys());
  let maxDiv = 0;
  let divPair: [string, string] | null = null;
  for (let i = 0; i < arcIds.length; i++) {
    for (let j = i + 1; j < arcIds.length; j++) {
      const d = arcDivergence(arcResults.get(arcIds[i])!.mu, arcResults.get(arcIds[j])!.mu);
      if (d > maxDiv) { maxDiv = d; divPair = [arcIds[i], arcIds[j]]; }
    }
  }
  if (divPair) {
    const nA = (arcNames.get(divPair[0]) ?? divPair[0]).toUpperCase();
    const nB = (arcNames.get(divPair[1]) ?? divPair[1]).toUpperCase();
    if (maxDiv > 0.6) lines.push(`${nA} + ${nB} OCCUPY DISTINCT TIME ZONES`);
    else if (maxDiv < 0.2) lines.push(`${nA} + ${nB} COMPETE FOR SAME WINDOW`);
  }

  return lines;
}

interface Props {
  onInsights?: (lines: string[]) => void;
}

export default function ChronoFingerprint({ onInsights }: Props) {
  const [result, setResult]       = useState<ChronoResult | null>(null);
  const [rawPoints, setRawPoints] = useState<ChronoPoint[]>([]);
  const [arcColors, setArcColors] = useState<Map<string, string>>(new Map());
  const [arcNames, setArcNames]   = useState<Map<string, string>>(new Map());
  const [viewMode, setViewMode]   = useState<ViewMode>("main");
  const [status, setStatus]       = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pts, arcs] = await Promise.all([loadChronoData(), loadArcs()]);
        if (cancelled) return;
        const names = new Map(arcs.map((a) => [a.id, a.name]));
        setArcColors(new Map(arcs.map((a) => [a.id, a.color_hex])));
        setArcNames(names);
        if (pts.length < 15) { setStatus("empty"); return; }
        setRawPoints(pts);
        const r = runChronoModel(pts);
        setResult(r);
        setStatus("ready");
        onInsights?.(buildInsights(r, names));
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: VT, fontSize: "0.85rem", letterSpacing: "2px", color: "rgba(255,255,255,0.18)" }}>
          LOADING...
        </span>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
        <span style={{ fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1.5px", color: "rgba(255,255,255,0.18)", textAlign: "center", lineHeight: 1.6, textTransform: "uppercase" }}>
          not enough data · complete 15+ tasks
        </span>
      </div>
    );
  }

  if (status === "error" || !result) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: VT, fontSize: "0.8rem", letterSpacing: "1.5px", color: "rgba(255,80,80,0.4)" }}>
          LOAD ERROR
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0.35rem 0.2rem 0.2rem" }}>
      {/* Mode toggles */}
      <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", marginBottom: "0.25rem", flexShrink: 0 }}>
        {(["main", "arcs", "session"] as ViewMode[]).map((mode) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontFamily: VT, fontSize: "0.72rem", letterSpacing: "1.2px",
                padding: "0.02rem 0.4rem", cursor: "pointer", borderRadius: 0,
                background: active ? "rgba(0,196,167,0.12)" : "transparent",
                border: `1px solid ${active ? "#00c4a7" : "rgba(255,255,255,0.1)"}`,
                color: active ? "#00c4a7" : "rgba(255,255,255,0.28)",
                transition: "all 0.1s",
              }}
            >
              {VIEW_LABELS[mode]}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {viewMode === "main" ? (
          <ScatterKdeChart result={result} points={rawPoints} />
        ) : (
          <ChronoPolarChart
            result={result}
            arcColors={arcColors}
            arcNames={arcNames}
            showArcs={viewMode === "arcs"}
            showSession={viewMode === "session"}
          />
        )}
      </div>
    </div>
  );
}
