import { useState } from "react";
import { orbColor } from "./colorScale";

const VT = "var(--font-main), var(--font-kr), monospace";

interface DayOrbsProps {
  values: (number | null)[];
  color: string;
  max: number;
  formatValue: (v: number) => string;
}

function dayLabel(index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - index));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface OrbProps {
  label: string;
  color: string;
  fill: string | null;
  ringed: boolean;
}

function Orb({ label, color, fill, ringed }: OrbProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: fill ?? "transparent",
          border: fill
            ? ringed ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent"
            : "1px solid rgba(255,255,255,0.15)",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      />

      <div
        role="tooltip"
        style={{
          position: "absolute",
          left: "calc(100% + 10px)",
          top: "50%",
          background: "#06060f",
          border: `1px solid ${color}66`,
          color: "#fff",
          fontFamily: VT,
          fontSize: "0.8rem",
          letterSpacing: 1,
          padding: "4px 10px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 20,
          opacity: hovered ? 1 : 0,
          transform: `translateY(-50%) translateX(${hovered ? 0 : -4}px)`,
          transition: "opacity 0.15s ease, transform 0.15s ease",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function DayOrbs({ values, color, max, formatValue }: DayOrbsProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "center",
      flex: "1 1 auto",
      height: "100%",
      minHeight: 0,
      paddingBlock: 10,
      boxSizing: "border-box",
    }}>
      {values.map((v, i) => [v, i] as const).reverse().map(([v, i]) => {
        const isToday = i === values.length - 1;
        const blank   = v === null;
        return (
          <Orb
            key={i}
            label={`${dayLabel(i)}: ${blank ? "no data" : formatValue(v)}`}
            color={color}
            fill={blank ? null : orbColor(color, v / max)}
            ringed={isToday}
          />
        );
      })}
    </div>
  );
}
