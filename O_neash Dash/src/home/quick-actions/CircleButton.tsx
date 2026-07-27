import { useState, type ReactNode } from "react";

const VT = "var(--font-main), var(--font-kr), monospace";

/** Black or white, whichever contrasts better against a given fill color (YIQ perceptual brightness). */
function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000' : '#fff';
}

interface CircleButtonProps {
  color: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}

export function CircleButton({ color, disabled, onClick, title, children }: CircleButtonProps) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && !disabled;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 36,
          height: 36,
          borderRadius: 0,
          background: disabled ? "rgba(255,255,255,0.1)" : color,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.35 : 1,
          color: disabled ? "rgba(255,255,255,0.4)" : textColorFor(color),
          flexShrink: 0,
          transform: active ? "scale(1.08)" : "scale(1)",
          transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {children}
      </button>

      <div
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 10px)",
          left: "50%",
          background: "#06060f",
          border: `1px solid ${color}66`,
          color: "#fff",
          fontFamily: VT,
          fontSize: "0.85rem",
          letterSpacing: 1,
          padding: "4px 10px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 20,
          opacity: hovered ? 1 : 0,
          transform: `translateX(-50%) translateY(${hovered ? 0 : 4}px)`,
          transition: "opacity 0.15s ease, transform 0.15s ease",
        }}
      >
        {title}
      </div>
    </div>
  );
}
