import type { ArcCompletionRecord } from "../../../PlannerPlugin/lib/plannerDb";

const NUM_WEEKS      = 13;
const UNTAGGED_COLOR = "#666680";
const FALLBACK_MINS  = 30;

export interface ArcStream {
  arcId: string | null;
  arcName: string;
  arcColor: string;
  bottoms: number[];  // silhouette y values in effort-minutes
  tops: number[];
  totalEffortMinutes: number;
  peakWeek: number;
}

export interface StreamResult {
  streams: ArcStream[];
  numWeeks: number;
  weekLabels: string[];
  maxHalfHeight: number; // max |y| across all streams — used for Y scaling
}

function formatWeekLabel(weeksAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Events have reliable actual-duration data (estimated_duration_minutes = the event length).
// All other nodes use the average event duration as their effort proxy.
// Falls back to all non-null durations, then to FALLBACK_MINS if nothing exists.
function computeReferenceDuration(records: ArcCompletionRecord[]): number {
  const eventDurs = records
    .filter(r => r.node_type === "event" && r.estimated_duration_minutes != null)
    .map(r => r.estimated_duration_minutes!);
  if (eventDurs.length > 0) {
    return eventDurs.reduce((s, v) => s + v, 0) / eventDurs.length;
  }
  const allDurs = records
    .filter(r => r.estimated_duration_minutes != null)
    .map(r => r.estimated_duration_minutes!);
  return allDurs.length > 0
    ? allDurs.reduce((s, v) => s + v, 0) / allDurs.length
    : FALLBACK_MINS;
}

export function computeArcStreams(records: ArcCompletionRecord[]): StreamResult | null {
  if (records.length < 4) return null;

  const refDuration = computeReferenceDuration(records);
  const now         = Date.now();
  const periodMs    = NUM_WEEKS * 7 * 24 * 60 * 60 * 1000;

  type ArcInfo = { id: string | null; name: string; color: string };
  const arcInfoMap = new Map<string, ArcInfo>();
  for (const r of records) {
    const key = r.arc_id ?? "__none__";
    if (!arcInfoMap.has(key)) {
      arcInfoMap.set(key, {
        id: r.arc_id,
        name: (r.arc_name ?? "UNTAGGED").toUpperCase(),
        color: r.arc_color ?? UNTAGGED_COLOR,
      });
    }
  }

  const arcKeys = Array.from(arcInfoMap.keys());
  const numArcs = arcKeys.length;

  // Effort matrix: effort[week][arcIdx] = sum of node durations (minutes)
  const effortMatrix: number[][] = Array.from({ length: NUM_WEEKS }, () => new Array(numArcs).fill(0));
  for (const r of records) {
    const elapsed = now - new Date(r.actual_completed_at).getTime();
    if (elapsed < 0 || elapsed >= periodMs) continue;
    const wIdx = Math.max(0, Math.min(
      NUM_WEEKS - 1,
      NUM_WEEKS - 1 - Math.floor((elapsed / periodMs) * NUM_WEEKS),
    ));
    const aIdx = arcKeys.indexOf(r.arc_id ?? "__none__");
    if (aIdx < 0) continue;
    // Events: use their actual duration. All other nodes: use reference average.
    const dur = r.node_type === "event" && r.estimated_duration_minutes != null
      ? r.estimated_duration_minutes
      : refDuration;
    effortMatrix[wIdx][aIdx] += dur;
  }

  // Sort arcs by total effort descending — dominant arc near the centre
  const arcTotals = arcKeys.map((_, a) => effortMatrix.reduce((s, row) => s + row[a], 0));
  const sortedIdx = arcKeys.map((_, i) => i).sort((a, b) => arcTotals[b] - arcTotals[a]);

  // Silhouette (ThemeRiver) layout with ABSOLUTE effort values (not normalised).
  // baseline_w = -totalEffort_w / 2  →  total height reflects real workload.
  const sBottoms: number[][] = sortedIdx.map(() => new Array(NUM_WEEKS).fill(0));
  const sTops: number[][]    = sortedIdx.map(() => new Array(NUM_WEEKS).fill(0));
  for (let w = 0; w < NUM_WEEKS; w++) {
    const total = effortMatrix[w].reduce((s, v) => s + v, 0);
    let cursor = -total / 2;
    for (let si = 0; si < sortedIdx.length; si++) {
      const oi = sortedIdx[si];
      sBottoms[si][w] = cursor;
      cursor += effortMatrix[w][oi];
      sTops[si][w] = cursor;
    }
  }

  const maxHalfHeight = Math.max(
    1,
    ...Array.from({ length: NUM_WEEKS }, (_, w) =>
      effortMatrix[w].reduce((s, v) => s + v, 0) / 2,
    ),
  );

  const streams: ArcStream[] = sortedIdx.map((oi, si) => {
    const info = arcInfoMap.get(arcKeys[oi])!;
    let peakBand = 0, peakWeek = 0;
    for (let w = 0; w < NUM_WEEKS; w++) {
      const band = sTops[si][w] - sBottoms[si][w];
      if (band > peakBand) { peakBand = band; peakWeek = w; }
    }
    return {
      arcId: info.id,
      arcName: info.name,
      arcColor: info.color,
      bottoms: sBottoms[si],
      tops: sTops[si],
      totalEffortMinutes: arcTotals[oi],
      peakWeek,
    };
  });

  const weekLabels = Array.from({ length: NUM_WEEKS }, (_, i) => formatWeekLabel(NUM_WEEKS - 1 - i));
  return { streams, numWeeks: NUM_WEEKS, weekLabels, maxHalfHeight };
}

export function buildStreamInsights(result: StreamResult): string[] {
  const { streams, numWeeks } = result;
  const lines: string[] = [];

  if (streams.length > 0) {
    const dom = streams[0];
    const hrs = Math.round(dom.totalEffortMinutes / 60);
    lines.push(`${dom.arcName} · ${hrs}H OF EFFORT IN 90 DAYS`);
  }

  // Detect fastest-growing arc (second half vs first half weekly average)
  const mid = Math.floor(numWeeks / 2);
  const bandAt = (s: ArcStream, w: number) => s.tops[w] - s.bottoms[w];
  let maxGrowth = 15; // minutes/week threshold to report
  let growingArc = "";
  for (const s of streams) {
    const early = Array.from({ length: mid }, (_, w) => bandAt(s, w)).reduce((a, v) => a + v, 0) / mid;
    const late  = Array.from({ length: numWeeks - mid }, (_, w) => bandAt(s, mid + w)).reduce((a, v) => a + v, 0) / (numWeeks - mid);
    if (late - early > maxGrowth) { maxGrowth = late - early; growingArc = s.arcName; }
  }
  if (growingArc) {
    lines.push(`${growingArc} GROWING · +${Math.round(maxGrowth / 60 * 10) / 10}H/WEEK RECENTLY`);
  }

  lines.push(`${streams.length} ARCS · 90-DAY EFFORT HISTORY`);
  return lines;
}
