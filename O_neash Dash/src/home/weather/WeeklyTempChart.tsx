import { useState } from "react";

const VT = "var(--font-main), var(--font-kr), monospace";
export const HIGH_COLOR = "#fb923c";
export const LOW_COLOR  = "#60a5fa";

function lighten(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

const HIGH_DOT_COLOR = lighten(HIGH_COLOR, 0.4);
const LOW_DOT_COLOR  = lighten(LOW_COLOR, 0.4);

const WIDTH  = 220;
const HEIGHT = 70;
const PAD    = 10;

interface WeeklyTempChartProps {
  dates: string[];
  highs: number[];
  lows: number[];
}

function dayAbbrev(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "narrow" });
}

function dayFull(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function pointsFor(values: number[], min: number, max: number): string {
  const span = Math.max(1, max - min);
  const stepX = (WIDTH - PAD * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WeeklyTempChart({ dates, highs, lows }: WeeklyTempChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (dates.length === 0 || highs.length === 0 || lows.length === 0) return null;

  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = Math.max(1, max - min);
  const highPoints = pointsFor(highs, min, max);
  const lowPoints  = pointsFor(lows, min, max);
  const stepX = (WIDTH - PAD * 2) / (dates.length - 1);
  const todayIndex = 1;

  const yFor = (v: number) => PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: VT }}>
      <div style={{ position: "relative" }}>
        <svg width={WIDTH} height={HEIGHT} style={{ display: "block", overflow: "visible" }}>
          <polyline points={highPoints} fill="none" stroke={HIGH_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={lowPoints} fill="none" stroke={LOW_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

          {hovered !== null && (
            <line
              x1={PAD + hovered * stepX} x2={PAD + hovered * stepX}
              y1={PAD} y2={HEIGHT - PAD}
              stroke="rgba(255,255,255,0.15)" strokeWidth={1}
            />
          )}

          {highs.map((v, i) => (
            <circle key={`h${i}`} cx={PAD + i * stepX} cy={yFor(v)} r={i === hovered ? 4.6 : i === todayIndex ? 3.6 : 2.6} fill={HIGH_DOT_COLOR} />
          ))}
          {lows.map((v, i) => (
            <circle key={`l${i}`} cx={PAD + i * stepX} cy={yFor(v)} r={i === hovered ? 4.6 : i === todayIndex ? 3.6 : 2.6} fill={LOW_DOT_COLOR} />
          ))}

          {dates.map((_, i) => (
            <rect
              key={`hit${i}`}
              x={PAD + i * stepX - stepX / 2}
              y={0}
              width={stepX}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              style={{ cursor: "default" }}
            />
          ))}
        </svg>

        {hovered !== null && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: PAD + hovered * stepX,
              bottom: "calc(100% + 8px)",
              transform: `translateX(${hovered === 0 ? "0%" : hovered === dates.length - 1 ? "-100%" : "-50%"})`,
              background: "#06060f",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              fontFamily: VT,
              fontSize: "0.8rem",
              letterSpacing: 1,
              padding: "4px 10px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.7)" }}>{dayFull(dates[hovered])}</div>
            <div>
              <span style={{ color: HIGH_COLOR }}>H {Math.round(highs[hovered])}°C</span>
              {"  "}
              <span style={{ color: LOW_COLOR }}>L {Math.round(lows[hovered])}°C</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative", width: WIDTH, height: 20 }}>
        {dates.map((d, i) => {
          const isToday = i === todayIndex;
          return (
            <span
              key={d}
              style={{
                position: "absolute",
                left: PAD + i * stepX,
                top: 0,
                transform: "translateX(-50%)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: isToday ? 20 : undefined,
                height: isToday ? 20 : undefined,
                background: isToday ? "#fff" : "transparent",
                boxSizing: "border-box",
                fontSize: "0.95rem",
                fontWeight: isToday || i === hovered ? "bold" : "normal",
                color: isToday ? "#000" : i === hovered ? "#fff" : "rgba(255,255,255,0.55)",
              }}
            >
              {dayAbbrev(d)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
