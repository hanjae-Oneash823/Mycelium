import { useState, useEffect, useRef } from "react";
import type { Habit, HabitValueType, GoalType, BooleanGoalType, NumericGoalType } from "../types";

const VT = "'VT323', 'HBIOS-SYS', monospace";

const PRESET_COLORS = [
  "#e05555", // red
  "#e07d40", // orange
  "#d4b84a", // yellow
  "#7ec450", // yellow-green
  "#4ec48a", // green
  "#40c4c4", // teal
  "#4d8fe0", // blue
  "#7060e0", // indigo
  "#a070e0", // purple
  "#e060a0", // pink
];

const BOOL_GOALS: { type: BooleanGoalType; label: string; hasValue: boolean; placeholder: string }[] = [
  { type: "every_day",       label: "every day", hasValue: false, placeholder: "" },
  { type: "times_per_month", label: "×/month",   hasValue: true,  placeholder: "times" },
  { type: "times_per_week",  label: "×/week",    hasValue: true,  placeholder: "days" },
  { type: "none",            label: "no goal",   hasValue: false, placeholder: "" },
];

const NUM_GOALS: { type: NumericGoalType; label: string; placeholder: string }[] = [
  { type: "at_least_per_day", label: "≥ /day",      placeholder: "min" },
  { type: "at_most_per_day",  label: "≤ /day",      placeholder: "max" },
  { type: "monthly_total",    label: "total/month", placeholder: "total" },
  { type: "none",             label: "no goal",     placeholder: "" },
];

interface Props {
  initial?: Habit;
  onSave: (name: string, color: string, valueType: HabitValueType, goalType: GoalType, goalValue: number | null) => void;
  onCancel: () => void;
}

export default function HabitForm({ initial, onSave, onCancel }: Props) {
  const [name, setName]           = useState(initial?.name ?? "");
  const [color, setColor]         = useState(initial?.color ?? PRESET_COLORS[4]);
  const [valueType, setValueType] = useState<HabitValueType>(initial?.value_type ?? "boolean");
  const [goalType, setGoalType]   = useState<GoalType>(initial?.goal_type ?? "none");
  const [goalValue, setGoalValue] = useState<string>(initial?.goal_value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const boolGoal   = BOOL_GOALS.find(g => g.type === goalType);
  const numGoal    = NUM_GOALS.find(g => g.type === goalType);
  const needsValue = valueType === "boolean" ? boolGoal?.hasValue : goalType !== "none";

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const gv = needsValue && goalValue !== "" ? parseFloat(goalValue) : null;
    onSave(trimmed, color, valueType, goalType, isNaN(gv as number) ? null : gv);
  };

  const pill = (active: boolean) => ({
    all: "unset" as const,
    fontFamily: VT,
    fontSize: "1rem",
    letterSpacing: 1.5,
    padding: "3px 12px",
    background: active ? "#3b1f6e" : "transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.3)",
    cursor: "pointer" as const,
    transition: "color 0.1s, background 0.1s",
  });

  const rowLabel = {
    fontFamily: VT,
    fontSize: "1.1rem",
    letterSpacing: 1.5,
    color: "#fff",
    minWidth: 52,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={rowLabel}>habit name</span>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel(); }}
          placeholder="..."
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontFamily: VT,
            fontSize: "1.2rem",
            letterSpacing: 2,
            textTransform: "uppercase",
            outline: "none",
            padding: "4px 0",
            flex: 1,
          }}
        />
      </div>

      {/* Value type */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={rowLabel}>type</span>
        <button style={pill(valueType === "boolean")} onClick={() => { setValueType("boolean"); setGoalType("none"); setGoalValue(""); }}>done/blank</button>
        <button style={pill(valueType === "numeric")} onClick={() => { setValueType("numeric"); setGoalType("none"); setGoalValue(""); }}>numeric</button>
      </div>

      {/* Goal type */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={rowLabel}>goal</span>
        {valueType === "boolean"
          ? BOOL_GOALS.map(g => (
              <button key={g.type} style={pill(goalType === g.type)} onClick={() => { setGoalType(g.type); setGoalValue(""); }}>{g.label}</button>
            ))
          : NUM_GOALS.map(g => (
              <button key={g.type} style={pill(goalType === g.type)} onClick={() => { setGoalType(g.type); setGoalValue(""); }}>{g.label}</button>
            ))
        }
        {needsValue && (
          <input
            type="number"
            min={1}
            value={goalValue}
            onChange={e => setGoalValue(e.target.value)}
            placeholder={valueType === "boolean" ? boolGoal?.placeholder : numGoal?.placeholder}
            style={{
              background: "#000",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              fontFamily: VT,
              fontSize: "1rem",
              letterSpacing: 1,
              outline: "none",
              width: 58,
              padding: "3px 8px",
              textAlign: "center",
            }}
          />
        )}
      </div>

      {/* Color swatches */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              all: "unset",
              width: 18, height: 18,
              background: c,
              cursor: "pointer",
              outline: color === c ? "2px solid rgba(255,255,255,0.8)" : "none",
              outlineOffset: 2,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Actions — right-aligned */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{ all: "unset", fontFamily: VT, fontSize: "1rem", letterSpacing: 2, color: "rgba(255,255,255,0.3)", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >cancel</button>
        <button
          onClick={handleSave}
          style={{ all: "unset", fontFamily: VT, fontSize: "1rem", letterSpacing: 2, padding: "4px 18px", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.8)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)")}
        >{initial ? "save" : "add"}</button>
      </div>
    </div>
  );
}
