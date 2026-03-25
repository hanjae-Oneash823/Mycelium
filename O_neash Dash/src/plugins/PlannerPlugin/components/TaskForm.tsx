import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { UserImportance } from "../types";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import { computeUrgencyLevel, toDateString } from "../lib/logicEngine";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Fire,
  PartyPopper,
  Trophy,
  Contact,
  Calendar,
  CheckboxOn,
  SkullSharp,
  ArrowLeftBox,
  ArrowRightBox,
} from "pixelarticons/react";
import { Checkbox } from "pixelarticons/react/Checkbox";
import DatePickerField from "./DatePickerField";
import "./TaskFormDotStage.css";

type Mode = "task" | "assignment" | "event";
type StepKey = "priority" | "identity" | "scheduling" | "checklist";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogContent = DialogContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogTitle = DialogTitle as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectTrigger = SelectTrigger as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectContent = SelectContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectItem = SelectItem as React.FC<any>;

const SWATCH_COLORS = [
  "#64c8ff","#3dbfbf","#4ade80","#f5a623","#ff6b35",
  "#c084fc","#f5c842","#ff3b3b","#888888","#00c4a7",
];

const EFFORT_SIZES = [
  { key: "·",    hours: 0         },
  { key: "10m",  hours: 10 / 60   },
  { key: "30m",  hours: 0.5       },
  { key: "1h",   hours: 1         },
  { key: "1.5h", hours: 1.5       },
  { key: "2h",   hours: 2         },
  { key: "2.5h", hours: 2.5       },
  { key: "3h",   hours: 3         },
] as const;

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const LEVEL_LABELS = ["seed", "low", "schedule", "delegate", "urgent"];
const URG_COLORS = ["#7ecfff", "#3dbfbf", "#4ade80", "#f5a623", "#ff6b35"] as const;

const STEPS: Record<Mode, StepKey[]> = {
  task:       ["priority", "identity", "scheduling", "checklist"],
  assignment: ["priority", "identity", "scheduling", "checklist"],
  event:      ["identity", "scheduling"],
};

const STEP_LABELS: Record<StepKey, string> = {
  priority:   "PRIORITY",
  identity:   "IDENTITY",
  scheduling: "SCHEDULING",
  checklist:  "CHECKLIST",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STEP_ICONS: Record<StepKey, React.FC<any>> = {
  priority:   Trophy,
  identity:   Contact,
  scheduling: Calendar,
  checklist:  CheckboxOn,
};

const MODE_CONFIG: Record<Mode, {
  label: string; accent: string; bg: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.FC<any>;
}> = {
  task:       { label: "TASK",       accent: "#00c4a7", bg: "rgba(0,196,167,0.1)",   Icon: Fire       },
  assignment: { label: "ASSIGNMENT", accent: "#f5a623", bg: "rgba(245,166,35,0.1)",  Icon: Trophy     },
  event:      { label: "EVENT",      accent: "#c084fc", bg: "rgba(192,132,252,0.1)", Icon: PartyPopper },
};

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  task:       "flexible · no deadline",
  assignment: "has a due date",
  event:      "scheduled at a specific time",
};

const PICKER_PROMPTS = [
  "WHAT ARE WE ADDING?","WHAT'S ON YOUR MIND?","WHAT ARE WE DOING?",
  "WHAT'S THE PLAN?","LET'S GET SOMETHING DONE.","ADD IT. DO IT. DONE.",
  "ANOTHER ONE? LET'S GO.","PUT IT ON THE LIST.","ANOTHER TASK? BOLD MOVE.",
  "THE LIST GROWS.","FINE. WHAT IS IT.","OK OK OK. WHAT.",
  "A NEW THING ENTERS THE SYSTEM.","WHAT MUST BE DONE?",
  "THE VOID AWAITS YOUR INPUT.","SPEAK IT INTO EXISTENCE.",
];
let pickerPromptIndex = 0;
function nextPickerPrompt(): string {
  return PICKER_PROMPTS[pickerPromptIndex++ % PICKER_PROMPTS.length];
}

function minutesToEffortKey(minutes: number | null | undefined): string {
  if (!minutes) return "·";
  const match = EFFORT_SIZES.find(
    (e) => e.hours > 0 && Math.abs(e.hours * 60 - minutes) < 3,
  );
  return match?.key ?? "custom";
}

// ── Shared style constant ─────────────────────────────────────────────────────
const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };

// ── Shared primitives ─────────────────────────────────────────────────────────


function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      ...mono, fontSize: "0.68rem", letterSpacing: "3px",
      color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
      display: "block", marginBottom: "0.4rem",
    }}>
      {children}
    </span>
  );
}

function FocusIndicator({ focused }: { focused: boolean }) {
  return (
    <span style={{
      ...mono, fontSize: "1rem", lineHeight: 1,
      color: focused ? "rgba(255,255,255,0.65)" : "transparent",
      flexShrink: 0, userSelect: "none", transition: "color 0.1s",
      paddingTop: "0.05rem",
    }}>▸</span>
  );
}

// ── SubTaskRow ────────────────────────────────────────────────────────────────

function SubTaskRow({ title, isCompleted, onToggle, onDelete, onTitleCommit }: {
  title: string; isCompleted: boolean;
  onToggle: () => void; onDelete: () => void; onTitleCommit: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 24 }}
    >
      <button onClick={onToggle} style={{ color: isCompleted ? "#4ade80" : "rgba(255,255,255,0.3)", flexShrink: 0, display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {isCompleted ? <CheckboxOn width={18} height={18} /> : <Checkbox width={18} height={18} />}
      </button>
      {editing ? (
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={() => { onTitleCommit(draft.trim() || title); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") { onTitleCommit(draft.trim() || title); setEditing(false); }
            if (e.key === "Escape") { setDraft(title); setEditing(false); }
          }}
          style={{ flex: 1, background: "transparent", border: 0, borderBottom: "1px solid rgba(255,255,255,0.2)", ...mono, fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", padding: 0, outline: "none" }}
        />
      ) : (
        <span
          onClick={() => { setDraft(title); setEditing(true); }}
          style={{ flex: 1, ...mono, fontSize: "0.85rem", cursor: "text", color: isCompleted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.65)", textDecoration: isCompleted ? "line-through" : "none" }}
        >
          {title}
        </span>
      )}
      <button onClick={onDelete} style={{ opacity: hovered ? 0.6 : 0, color: "#ff3b3b", display: "flex", alignItems: "center", flexShrink: 0, transition: "opacity 0.1s", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <SkullSharp size={11} />
      </button>
    </div>
  );
}

// ── Mode picker option ────────────────────────────────────────────────────────

function ModeOption({ m, onSelect }: { m: Mode; onSelect: () => void }) {
  const cfg = MODE_CONFIG[m];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: "1.25rem",
        padding: "1rem 1.25rem", width: "100%", cursor: "pointer",
        border: `1px solid ${hovered ? cfg.accent : "rgba(255,255,255,0.1)"}`,
        background: hovered ? cfg.bg : "transparent",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <cfg.Icon size={20} style={{ color: cfg.accent, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
        <span style={{ ...mono, fontSize: "1.5rem", letterSpacing: "3px", color: hovered ? "#fff" : "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
          {cfg.label}
        </span>
        <span style={{ ...mono, fontSize: "0.85rem", letterSpacing: "1.5px", color: hovered ? cfg.accent : "rgba(255,255,255,0.3)" }}>
          {MODE_DESCRIPTIONS[m]}
        </span>
      </div>
    </button>
  );
}

// ── Dot stage strip ───────────────────────────────────────────────────────────

function dotColorOf(level: number, isEvent: boolean, dueAt: Date | null): string {
  if (isEvent) return "#888888";
  if (!dueAt) return "#7ecfff";
  if ((dueAt.getTime() - Date.now()) / 86400000 < 0) return "#ff3b3b";
  return (["#7ecfff","#3dbfbf","#4ade80","#f5a623","#ff6b35"][level] ?? "#7ecfff");
}
function dotSizeOf(minutes: number): number {
  if (minutes <= 0) return 32;
  return 22 + Math.max(0, Math.min(1, Math.log(Math.max(minutes, 1) / 15) / Math.log(32))) * 30;
}
function pulseDurOf(level: number, overdue: boolean): string {
  if (overdue) return "0.9s";
  if (level >= 4) return "1.2s";
  if (level >= 3) return "1.8s";
  if (level >= 2) return "2.4s";
  return "4s";
}

function LegendCell({ color, label, active }: { color: string; label: string; active: boolean }) {
  return (
    <div style={{ width: 52, border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`, background: active ? color + "22" : "transparent", display: "flex", alignItems: "center", gap: 5, padding: "3px 5px", transition: "all 0.2s" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, opacity: active ? 1 : 0.35, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 10, letterSpacing: 1, color: active ? color : "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function DotStageStrip({ importanceLevel, effortMinutes, isEvent, dueAt }: {
  importanceLevel: number; effortMinutes: number; isEvent: boolean; dueAt: Date | null;
}) {
  const [hovering, setHovering] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const color   = dotColorOf(importanceLevel, isEvent, dueAt);
  const size    = dotSizeOf(effortMinutes);
  const overdue = !!dueAt && (dueAt.getTime() - Date.now()) / 86400000 < 0;
  const dur     = pulseDurOf(importanceLevel, overdue);
  const effortH = effortMinutes > 0 ? (effortMinutes / 60).toFixed(1).replace(/\.0$/, "") : "0";
  const n       = Math.max(0, Math.min(4, importanceLevel));
  const label   = isEvent ? `EVENT · ${effortH}h` : !dueAt ? "L0 · seed" : `L${n} · ${effortH}h · ${LEVEL_LABELS[n]}`;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOffset({
      x: Math.max(-20, Math.min(20, (e.clientX - r.left - r.width  / 2) * 0.22)),
      y: Math.max(-20, Math.min(20, (e.clientY - r.top  - r.height / 2) * 0.22)),
    });
  };

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseMove={handleMove}
      onMouseLeave={() => { setHovering(false); setOffset({ x: 0, y: 0 }); }}
      style={{
        width: "100%", height: 158, position: "relative", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle at center, rgba(255,255,255,0.025) 0%, transparent 60%)",
        borderBottom: "1px solid rgba(255,255,255,0.1)", cursor: "crosshair",
      }}
    >
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.04)", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.04)", transform: "translateX(-50%)", pointerEvents: "none" }} />

      <div style={{
        width: size, height: size, borderRadius: "50%", background: color, position: "absolute",
        // @ts-expect-error CSS custom properties
        "--dot-glow": color, "--dot-glow-faint": color + "44", "--pulse-dur": dur,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        animation: "dot-pulse var(--pulse-dur) ease-in-out infinite, dot-wiggle 6s ease-in-out infinite",
        transition: hovering
          ? "width 0.3s, height 0.3s, background-color 0.3s, transform 0.08s ease-out"
          : "width 0.3s, height 0.3s, background-color 0.3s, transform 0.6s ease-out",
      }} />

      <p style={{ ...mono, fontSize: "0.6rem", letterSpacing: "3px", color: "rgba(255,255,255,0.32)", textTransform: "uppercase", position: "absolute", bottom: 7, pointerEvents: "none" }}>
        {label}
      </p>

      <div style={{ position: "absolute", top: 8, right: 8, display: "grid", gridTemplateColumns: "auto 52px 52px", gap: 4, alignItems: "center", pointerEvents: "none" }}>
        <div /><div />
        <span style={{ ...mono, fontSize: 8, letterSpacing: 2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", textAlign: "center" }}>urg</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", paddingRight: 4, lineHeight: 1 }}>★</span>
        <LegendCell color="#4ade80" label="L2" active={importanceLevel === 2} />
        <LegendCell color="#ff6b35" label="L4" active={importanceLevel === 4} />
        <div />
        <LegendCell color="#3dbfbf" label="L1" active={importanceLevel === 1} />
        <LegendCell color="#f5a623" label="L3" active={importanceLevel === 3} />
      </div>
    </div>
  );
}

// ── Step nav arrow ────────────────────────────────────────────────────────────

function StepArrow({ dir, onClick, disabled }: { dir: "prev" | "next"; onClick: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  const Icon = dir === "prev" ? ArrowLeftBox : ArrowRightBox;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        background: "transparent", border: "none",
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", padding: "0.1rem",
        color: disabled ? "rgba(255,255,255,0.07)" : hov ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)",
        transition: "color 0.12s", userSelect: "none",
      }}
    >
      <Icon size={20} />
    </button>
  );
}

// ── Step header ───────────────────────────────────────────────────────────────

function StepHeader({ mode, steps, stepIndex, onBack }: {
  mode: Mode; steps: StepKey[]; stepIndex: number; onBack: () => void;
}) {
  const cfg    = MODE_CONFIG[mode];
  const accent = cfg.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", height: 52, borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <cfg.Icon size={15} style={{ color: accent }} />
        <span style={{ ...mono, fontSize: "1.1rem", letterSpacing: "3px", color: accent, textTransform: "uppercase" }}>
          {cfg.label}
        </span>
        <button onClick={onBack}
          style={{ ...mono, fontSize: "0.68rem", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", padding: 0, marginLeft: 4 }}>
          ← type
        </button>
      </div>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: i === stepIndex ? accent : i < stepIndex ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
            transition: "background 0.15s",
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Priority step ─────────────────────────────────────────────────────────────

const EQ_SIZE = "1.55rem"; // unified font-size for brackets, star, operators

/* Each token: symbol on top, tiny label below.
   Operators get an invisible spacer so all columns share the same total height —
   this keeps alignItems:"center" on the row working correctly. */
function EqCol({ symbol, label, labelColor }: { symbol: React.ReactNode; label?: string; labelColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", paddingBottom: "1.1rem" }}>
      {symbol}
      {label && (
        <span style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          fontFamily: "'VT323','HBIOS-SYS',monospace", fontSize: "0.55rem",
          letterSpacing: "3px", textTransform: "uppercase",
          color: labelColor ?? "rgba(255,255,255,0.3)", userSelect: "none",
        }}>
          {label}
        </span>
      )}
    </div>
  );
}

function PriorityStep({ mode, isImportant, setIsImportant, dueAt, setDueAt, urgency, onNext }: {
  mode: Mode; isImportant: boolean; setIsImportant: (v: boolean) => void;
  dueAt: Date | null; setDueAt: (d: Date | null) => void;
  urgency: number; accent: string; onNext: () => void;
}) {
  const isAssignment = mode === "assignment";
  const urgColor     = URG_COLORS[urgency];
  // shared style for all bracket/operator characters — identical size = perfect vertical alignment
  const eqChar: React.CSSProperties = { fontFamily: "'VT323','HBIOS-SYS',monospace", fontSize: EQ_SIZE, lineHeight: 1, userSelect: "none" };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "BUTTON") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault(); e.stopPropagation(); setIsImportant(!isImportant);
    } else if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation(); onNext();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", outline: "none" }}
      tabIndex={-1}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>

        {/* [ ★ ]
            Each char is a flex cell with alignItems:center + the same explicit height.
            This forces the glyph to be visually centered regardless of per-char font metrics. */}
        <EqCol
          label={isImportant ? "important" : "normal"}
          labelColor={urgColor}
          symbol={
            <button
              onClick={() => setIsImportant(!isImportant)}
              style={{ display: "flex", alignItems: "stretch", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <span style={{ ...eqChar, color: "rgba(255,255,255,0.32)", display: "flex", alignItems: "center" }}>[</span>
              <span style={{ ...eqChar, color: isImportant ? "#f5a623" : "rgba(255,255,255,0.18)", transition: "color 0.15s", padding: "0 0.1rem", display: "flex", alignItems: "center", transform: "translateY(-0.14em)" }}>★</span>
              <span style={{ ...eqChar, color: "rgba(255,255,255,0.32)", display: "flex", alignItems: "center" }}>]</span>
            </button>
          }
        />

        {/* + [ date ] */}
        {isAssignment && (
          <>
            <EqCol symbol={<span style={{ ...eqChar, color: "rgba(255,255,255,0.32)" }}>+</span>} />
            <EqCol
              label="deadline"
              labelColor={urgColor}
              symbol={
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  <span style={{ ...eqChar, color: "rgba(255,255,255,0.32)", display: "flex", alignItems: "center" }}>[</span>
                  <DatePickerField
                    value={dueAt}
                    onChange={setDueAt}
                    placeholder="date"
                    hideIcon
                    triggerClassName="h-auto py-0 px-1 bg-transparent border-0 shadow-none font-mono text-[1rem] leading-none text-[rgba(255,255,255,0.65)] hover:text-white rounded-none focus-visible:ring-0"
                  />
                  <span style={{ ...eqChar, color: "rgba(255,255,255,0.32)", display: "flex", alignItems: "center" }}>]</span>
                </div>
              }
            />
          </>
        )}

        {/* = */}
        <EqCol symbol={<span style={{ ...eqChar, color: "rgba(255,255,255,0.32)" }}>=</span>} />

        {/* L{n} — same size as brackets, level label aligned beneath */}
        <EqCol
          label={LEVEL_LABELS[urgency]}
          labelColor={urgColor}
          symbol={
            <span style={{ ...eqChar, color: urgColor, letterSpacing: "2px" }}>
              L{urgency}
            </span>
          }
        />
      </div>
    </div>
  );
}

// ── Identity step ─────────────────────────────────────────────────────────────

function IdentityStep({
  title, setTitle, error, setError,
  selectedGroups, setSelected, groups,
  arcId, setArcId, projectId, setProjectId, arcs, projects,
  showNewGroup, setShowNewGroup, closeGroupForm,
  newGroupName, setNewGroupName, newGroupColor, setNewGroupColor,
  isClosingGroup, handleNewGroup,
  onNext,
}: {
  title: string; setTitle: (v: string) => void; error: string; setError: (v: string) => void;
  selectedGroups: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groups: any[]; arcId: string | null; setArcId: (v: string | null) => void;
  projectId: string | null; setProjectId: (v: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arcs: any[]; projects: any[];
  showNewGroup: boolean; setShowNewGroup: (v: boolean) => void;
  closeGroupForm: () => void;
  newGroupName: string; setNewGroupName: (v: string) => void;
  newGroupColor: string; setNewGroupColor: (v: string) => void;
  isClosingGroup: boolean; handleNewGroup: () => void;
  onNext: () => void;
}) {
  const [focusedRow, setFocusedRow] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const NUM_ROWS = 4;

  useEffect(() => { if (focusedRow === 0) nameRef.current?.focus(); }, [focusedRow]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realGroups  = groups.filter((g: any) => !g.is_ungrouped);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcList     = arcs.filter((a: any) => !a.is_archived);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredPrj = projects.filter((p: any) => p.arc_id === arcId && !p.is_archived);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const isText = tag === "INPUT" || tag === "TEXTAREA";
    if (e.key === "Tab") {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) setFocusedRow(r => Math.max(0, r - 1));
      else { if (focusedRow < NUM_ROWS - 1) setFocusedRow(r => r + 1); else onNext(); }
      return;
    }
    if (!isText) {
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); if (focusedRow < NUM_ROWS - 1) setFocusedRow(r => r + 1); else onNext(); }
      if (e.key === "ArrowUp")   { e.preventDefault(); e.stopPropagation(); setFocusedRow(r => Math.max(0, r - 1)); }
      // Arc row keyboard nav
      if (focusedRow === 1) {
        const all = [null, ...arcList];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const idx = all.findIndex((a: any) => (a?.id ?? null) === arcId);
        if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); const n = all[(idx + 1) % all.length]; setArcId(n?.id ?? null); setProjectId(null); }
        if (e.key === "ArrowLeft")  { e.preventDefault(); e.stopPropagation(); const n = all[(idx - 1 + all.length) % all.length]; setArcId(n?.id ?? null); setProjectId(null); }
      }
    }
  };

  return (
    <div onKeyDown={handleKeyDown} style={{ display: "flex", flexDirection: "column", gap: "0.9rem", outline: "none" }} tabIndex={-1}>

      {/* Row 0: name */}
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <FocusIndicator focused={focusedRow === 0} />
        <div style={{ flex: 1 }}>
          <RowLabel>name</RowLabel>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ ...mono, color: "rgba(255,255,255,0.28)", fontSize: "0.9rem" }}>[</span>
            <input
              ref={nameRef}
              autoFocus
              value={title}
              onChange={e => { setTitle(e.target.value); setError(""); }}
              onFocus={() => setFocusedRow(0)}
              placeholder="what needs to be done?"
              style={{ flex: 1, background: "transparent", border: 0, ...mono, fontSize: "1rem", color: "#fff", padding: "0 0.3rem", outline: "none" }}
              className="placeholder:text-[rgba(255,255,255,0.18)]"
            />
            <span style={{ ...mono, color: "rgba(255,255,255,0.28)", fontSize: "0.9rem" }}>]</span>
          </div>
          {error && <span style={{ ...mono, fontSize: "0.72rem", color: "#ff3b3b", letterSpacing: "1px" }}>{error}</span>}
        </div>
      </div>

      {/* Row 1: arc + project */}
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <FocusIndicator focused={focusedRow === 1} />
        <div style={{ flex: 1 }}>
          <RowLabel>arc · project</RowLabel>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Select value={arcId ?? "__none__"} onValueChange={(v: string) => { setArcId(v === "__none__" ? null : v); setProjectId(null); }}>
              <TypedSelectTrigger
                className="rounded-none bg-transparent border-[rgba(255,255,255,0.15)] font-mono text-sm focus:ring-0 h-7 px-2"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                style={{ color: arcId ? (arcList.find((a: any) => a.id === arcId)?.color_hex ?? "rgba(255,255,255,0.55)") : "rgba(255,255,255,0.35)" }}
              >
                <SelectValue placeholder="arc" />
              </TypedSelectTrigger>
              <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                <TypedSelectItem value="__none__" className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>no arc</TypedSelectItem>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {arcList.map((a: any) => (
                  <TypedSelectItem key={a.id} value={a.id} className="font-mono text-sm" style={{ color: a.color_hex }}>{a.name}</TypedSelectItem>
                ))}
              </TypedSelectContent>
            </Select>
            <Select value={projectId ?? "__none__"} onValueChange={(v: string) => setProjectId(v === "__none__" ? null : v)} disabled={!arcId}>
              <TypedSelectTrigger className="rounded-none bg-transparent border-[rgba(255,255,255,0.15)] font-mono text-sm focus:ring-0 h-7 px-2 disabled:opacity-35" style={{ color: "rgba(255,255,255,0.35)" }}>
                <SelectValue placeholder={arcId ? "project" : "—"} />
              </TypedSelectTrigger>
              <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                <TypedSelectItem value="__none__" className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>no project</TypedSelectItem>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {filteredPrj.map((p: any) => (
                  <TypedSelectItem key={p.id} value={p.id} className="font-mono text-sm">{p.name}</TypedSelectItem>
                ))}
              </TypedSelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Row 2: groups */}
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <FocusIndicator focused={focusedRow === 2} />
        <div style={{ flex: 1 }}>
          <RowLabel>groups</RowLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {realGroups.map((g: any) => {
              const sel = selectedGroups.includes(g.id);
              return (
                <button key={g.id}
                  onClick={() => setSelected(prev => sel ? prev.filter(id => id !== g.id) : [...prev, g.id])}
                  style={{ ...mono, fontSize: "0.88rem", color: sel ? g.color_hex : "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  #{g.name}
                </button>
              );
            })}
            <button
              onClick={() => showNewGroup ? closeGroupForm() : setShowNewGroup(true)}
              style={{ ...mono, fontSize: "0.95rem", color: "rgba(255,255,255,0.38)", background: "none", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", padding: "0 0.3rem", lineHeight: 1.3 }}>
              +
            </button>
          </div>
          {showNewGroup && (
            <div style={{ marginTop: "0.5rem", animation: `${isClosingGroup ? "term-out" : "term-in"} 0.14s ease forwards` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: "0.85rem", color: "#00c4a7" }}>&gt;</span>
                <input
                  autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder="group name_"
                  onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") handleNewGroup(); if (e.key === "Escape") closeGroupForm(); }}
                  style={{ ...mono, fontSize: "0.85rem", background: "transparent", border: 0, borderBottom: "1px solid rgba(255,255,255,0.25)", color: newGroupColor, outline: "none", width: 110 }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  {SWATCH_COLORS.map(c => (
                    <button key={c} onClick={() => setNewGroupColor(c)}
                      style={{ width: 9, height: 9, background: c, outline: newGroupColor === c ? `2px solid ${c}` : "none", outlineOffset: 2, cursor: "pointer", border: "none" }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Scheduling step ───────────────────────────────────────────────────────────

function SchedulingStep({
  mode, effortSize, setEffortSize, customEffortHours, setCustomEffortHours,
  plannedAt, setPlannedAt, dueAt,
  eventDate, setEventDate, eventTime, setEventTime, eventTimeInputRef,
  durationHours, setDurationHours,
  accent, onNext,
}: {
  mode: Mode; effortSize: string; setEffortSize: (v: string) => void;
  customEffortHours: number; setCustomEffortHours: (v: number) => void;
  plannedAt: Date | null; setPlannedAt: (d: Date | null) => void;
  dueAt: Date | null; eventDate: Date | null; setEventDate: (d: Date | null) => void;
  eventTime: string; setEventTime: (v: string) => void;
  eventTimeInputRef: React.RefObject<HTMLInputElement | null>;
  durationHours: number; setDurationHours: (v: number) => void;
  accent: string; onNext: () => void;
}) {
  const isEvent = mode === "event";
  const today   = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [focusedRow, setFocusedRow] = useState(0);
  const numRows = isEvent ? 2 : 2;

  const effortKeys = EFFORT_SIZES.map(e => e.key);
  const weekDays   = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + i * 86400000)), [today]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const isText = tag === "INPUT" || tag === "TEXTAREA";
    if (isText) return;
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault(); e.stopPropagation();
      if (focusedRow < numRows - 1) setFocusedRow(r => r + 1); else onNext();
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault(); e.stopPropagation();
      setFocusedRow(r => Math.max(0, r - 1));
    }
    if (!isEvent && focusedRow === 0) {
      const idx = effortKeys.indexOf((effortSize || "·") as typeof effortKeys[number]);
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); setEffortSize(effortKeys[(idx + 1) % effortKeys.length] as string); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); e.stopPropagation(); setEffortSize(effortKeys[(idx - 1 + effortKeys.length) % effortKeys.length] as string); }
    }
    if (!isEvent && focusedRow === 1) {
      const validDays = dueAt ? weekDays.filter(d => d <= dueAt) : weekDays;
      const idx = validDays.findIndex(d => plannedAt && d.toDateString() === plannedAt.toDateString());
      const si = idx === -1 ? -1 : idx;
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); setPlannedAt(validDays[(si + 1) % validDays.length]); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); e.stopPropagation(); setPlannedAt(validDays[Math.max(0, si - 1)]); }
    }
    if (isEvent && focusedRow === 1) {
      const idx = EFFORT_SIZES.findIndex(e => e.hours === durationHours);
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); setDurationHours(EFFORT_SIZES[(idx + 1) % EFFORT_SIZES.length].hours); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); e.stopPropagation(); setDurationHours(EFFORT_SIZES[(idx - 1 + EFFORT_SIZES.length) % EFFORT_SIZES.length].hours); }
    }
  };

  return (
    <div onKeyDown={handleKeyDown} style={{ display: "flex", flexDirection: "column", gap: "1.1rem", outline: "none" }} tabIndex={-1}>
      {!isEvent ? (
        <>
          {/* effort — inline terminal style */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ ...mono, fontSize: "1rem", color: "rgba(255,255,255,0.45)", minWidth: 68, flexShrink: 0 }}>effort:</span>
            <FocusIndicator focused={focusedRow === 0} />
            <div style={{ display: "flex", alignItems: "center" }}>
              {EFFORT_SIZES.map(({ key }, idx) => (
                <React.Fragment key={key}>
                  {idx > 0 && <span style={{ ...mono, color: "rgba(255,255,255,0.18)", padding: "0 0.22rem" }}>|</span>}
                  <button
                    onClick={() => setEffortSize(effortSize === key ? "" : key)}
                    style={{ ...mono, fontSize: "1rem", background: "none", border: "none", cursor: "pointer", padding: 0, color: effortSize === key ? accent : "rgba(255,255,255,0.4)", transition: "color 0.1s" }}
                  >
                    {key}
                  </button>
                </React.Fragment>
              ))}
              <span style={{ ...mono, color: "rgba(255,255,255,0.18)", padding: "0 0.22rem" }}>|</span>
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>[</span>
              <input
                placeholder="#"
                value={effortSize === "custom" ? (customEffortHours || "") : ""}
                onFocus={() => setEffortSize("custom")}
                onChange={e => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setCustomEffortHours(parseFloat(v) || 0);
                }}
                style={{ ...mono, fontSize: "1rem", width: 30, background: "transparent", border: "none", outline: "none", color: effortSize === "custom" ? accent : "rgba(255,255,255,0.35)", padding: 0, textAlign: "center" }}
              />
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>]</span>
            </div>
          </div>

          {/* when — calendar week grid */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <span style={{ ...mono, fontSize: "1rem", color: "rgba(255,255,255,0.45)", minWidth: 68, flexShrink: 0, paddingTop: "0.15rem" }}>when?:</span>
            <FocusIndicator focused={focusedRow === 1} />
            <div>
              {(() => {
                const displayDays = dueAt ? weekDays.filter(d => d <= dueAt) : weekDays;
                const isCustom = !!plannedAt && !displayDays.some(d => d.toDateString() === plannedAt!.toDateString());
                return (
                  <div style={{ display: "flex", gap: "0.3rem", alignItems: "flex-start" }}>
                    {displayDays.map(date => {
                      const isActive = !!plannedAt && plannedAt.toDateString() === date.toDateString();
                      const letter   = DAY_LETTERS[date.getDay()];
                      const num      = date.getDate();
                      return (
                        <button
                          key={date.toDateString()}
                          onClick={() => setPlannedAt(plannedAt?.toDateString() === date.toDateString() ? null : date)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28 }}
                        >
                          <span style={{ ...mono, fontSize: "0.82rem", color: isActive ? "#fff" : "rgba(255,255,255,0.38)", lineHeight: 1.2 }}>
                            {isActive ? `[${letter}]` : letter}
                          </span>
                          <span style={{ ...mono, fontSize: "1rem", lineHeight: 1.3, minWidth: 28, textAlign: "center", padding: "0.05rem 0.2rem", background: isActive ? "#fff" : "transparent", color: isActive ? "#000" : "rgba(255,255,255,0.45)" }}>
                            {num}
                          </span>
                        </button>
                      );
                    })}
                    <DatePickerField
                      value={isCustom ? plannedAt : null}
                      onChange={setPlannedAt}
                      placeholder="+"
                      hideIcon
                      toDate={dueAt ?? undefined}
                      triggerClassName="h-auto py-0 px-1 bg-transparent border-0 shadow-none font-mono text-[1rem] text-[rgba(255,255,255,0.3)] hover:text-white rounded-none focus-visible:ring-0 self-end mb-[2px]"
                    />
                  </div>
                );
              })()}

              {plannedAt && (
                <span style={{ ...mono, fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block", letterSpacing: "1px" }}>
                  → {plannedAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* date + time — same line, terminal style */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ ...mono, fontSize: "1rem", color: "rgba(255,255,255,0.45)", minWidth: 68, flexShrink: 0 }}>when:</span>
            <FocusIndicator focused={focusedRow === 0} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>[</span>
              <DatePickerField
                value={eventDate} onChange={setEventDate} placeholder="date"
                hideIcon
                triggerClassName="h-auto py-0 px-0 bg-transparent border-0 shadow-none font-mono text-[1rem] text-[rgba(255,255,255,0.65)] hover:text-white rounded-none focus-visible:ring-0"
              />
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>]</span>
              <span style={{ ...mono, color: "rgba(255,255,255,0.22)", fontSize: "1rem", padding: "0 0.3rem" }}>@</span>
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>[</span>
              <input
                ref={eventTimeInputRef}
                type="text" placeholder="HH:MM" value={eventTime}
                onChange={e => { let v = e.target.value.replace(/[^0-9:]/g, ""); if (v.length === 2 && !v.includes(":") && eventTime.length < 2) v = v + ":"; setEventTime(v.slice(0, 5)); }}
                onFocus={() => setFocusedRow(0)}
                style={{ ...mono, fontSize: "1rem", width: 52, background: "transparent", border: "none", outline: "none", color: "#fff", padding: 0, textAlign: "center" }}
                className="placeholder:text-[rgba(255,255,255,0.2)]"
              />
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>]</span>
            </div>
          </div>
          {/* duration — pipe style matching effort */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ ...mono, fontSize: "1rem", color: "rgba(255,255,255,0.45)", minWidth: 68, flexShrink: 0 }}>duration:</span>
            <FocusIndicator focused={focusedRow === 1} />
            <div style={{ display: "flex", alignItems: "center" }}>
              {EFFORT_SIZES.map(({ key, hours }, idx) => (
                <React.Fragment key={key}>
                  {idx > 0 && <span style={{ ...mono, color: "rgba(255,255,255,0.18)", padding: "0 0.22rem" }}>|</span>}
                  <button
                    onClick={() => setDurationHours(hours === durationHours ? 0 : hours)}
                    style={{ ...mono, fontSize: "1rem", background: "none", border: "none", cursor: "pointer", padding: 0, color: hours === durationHours ? accent : "rgba(255,255,255,0.4)", transition: "color 0.1s" }}
                  >
                    {key}
                  </button>
                </React.Fragment>
              ))}
              <span style={{ ...mono, color: "rgba(255,255,255,0.18)", padding: "0 0.22rem" }}>|</span>
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>[</span>
              <input
                placeholder="#"
                value={(() => { const isCustom = durationHours > 0 && !EFFORT_SIZES.some(e => e.hours === durationHours); return isCustom ? String(durationHours) : ""; })()}
                onChange={e => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setDurationHours(parseFloat(v) || 0); }}
                style={{ ...mono, fontSize: "1rem", width: 30, background: "transparent", border: "none", outline: "none", color: (() => { const isCustom = durationHours > 0 && !EFFORT_SIZES.some(e => e.hours === durationHours); return isCustom ? accent : "rgba(255,255,255,0.35)"; })(), padding: 0, textAlign: "center" }}
              />
              <span style={{ ...mono, color: "rgba(255,255,255,0.32)", fontSize: "1rem" }}>]</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Checklist step ────────────────────────────────────────────────────────────

function ChecklistStep({
  isEditMode, editNode, pendingSubTasks, setPendingSubTasks,
  newSubInput, setNewSubInput, subTasksByNode,
  storeCreateSubTask, toggleSubTask, updateSubTaskTitle, storeDeleteSubTask,
}: {
  isEditMode: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingSubTasks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setPendingSubTasks: React.Dispatch<React.SetStateAction<any[]>>;
  newSubInput: string; setNewSubInput: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subTasksByNode: Record<string, any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeCreateSubTask: any; toggleSubTask: any; updateSubTaskTitle: any; storeDeleteSubTask: any;
}) {
  const liveItems = isEditMode && editNode ? (subTasksByNode[editNode.id] ?? []) : [];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Scrollable list */}
      <div className="checklist-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {isEditMode && liveItems.map((sub: any) => (
          <SubTaskRow key={sub.id} title={sub.title} isCompleted={sub.is_completed}
            onToggle={() => toggleSubTask(sub.id, editNode.id, sub.is_completed)}
            onDelete={() => storeDeleteSubTask(sub.id, editNode.id)}
            onTitleCommit={(t: string) => updateSubTaskTitle(sub.id, editNode.id, t)}
          />
        ))}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {!isEditMode && pendingSubTasks.map((sub: any) => (
          <SubTaskRow key={sub.id} title={sub.title} isCompleted={false}
            onToggle={() => {}}
            onDelete={() => setPendingSubTasks(p => p.filter((s: { id: string }) => s.id !== sub.id))}
            onTitleCommit={(t: string) => setPendingSubTasks(p => p.map((s: { id: string; title: string }) => s.id === sub.id ? { ...s, title: t } : s))}
          />
        ))}
      </div>
      {/* Pinned add input */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "0.5rem", flexShrink: 0 }}>
        <span style={{ ...mono, color: "rgba(255,255,255,0.2)", fontSize: "1.1rem" }}>+</span>
        <input
          value={newSubInput}
          onChange={e => setNewSubInput(e.target.value)}
          onKeyDown={e => {
            if (e.key !== "Enter" || !newSubInput.trim()) return;
            e.preventDefault(); e.stopPropagation();
            if (isEditMode && editNode) { storeCreateSubTask(editNode.id, newSubInput.trim()); }
            else { setPendingSubTasks(p => [...p, { id: crypto.randomUUID(), title: newSubInput.trim() }]); }
            setNewSubInput("");
          }}
          placeholder="add step..."
          style={{ flex: 1, background: "transparent", border: 0, borderBottom: "1px solid rgba(255,255,255,0.1)", ...mono, fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", padding: "0 0 0.2rem", outline: "none" }}
          className="placeholder:text-[rgba(255,255,255,0.18)] focus:border-b-[rgba(255,255,255,0.28)]"
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskForm() {
  const {
    groups, arcs, projects, subTasksByNode,
    createNode, updateNode, replaceNodeGroups, createGroup, loadSubTasks,
    createSubTask: storeCreateSubTask, toggleSubTask, updateSubTaskTitle,
    deleteSubTask: storeDeleteSubTask,
  } = usePlannerStore();
  const { taskFormOpen, taskFormDefaults, editNode, closeTaskForm } = useViewStore();
  const isEditMode = !!editNode;

  const [step,      setStep]      = useState<"pick" | "form">("pick");
  const [formStep,  setFormStep]  = useState(0);
  const [pickerPrompt]            = useState(() => nextPickerPrompt());
  const [mode,      setMode]      = useState<Mode>("task");
  const [title,     setTitle]     = useState("");
  const [selectedGroups, setSelected] = useState<string[]>([]);
  const [isImportant,    setIsImportant]    = useState(false);
  const [dueAt,          setDueAt]          = useState<Date | null>(null);
  const dueAtRef = useRef<Date | null>(null);
  dueAtRef.current = dueAt;
  const [plannedAt,      setPlannedAt]      = useState<Date | null>(null);
  const [effortSize,          setEffortSize]          = useState<string>("");
  const [customEffortHours,   setCustomEffortHours]   = useState<number>(0);
  const [eventDate,      setEventDate]      = useState<Date | null>(null);
  const [eventTime,      setEventTime]      = useState("");
  const eventTimeInputRef = useRef<HTMLInputElement>(null);
  const [durationHours,  setDurationHours]  = useState<number>(0);
  const [arcId,          setArcId]          = useState<string | null>(null);
  const [projectId,      setProjectId]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [showNewGroup,   setShowNewGroup]   = useState(false);
  const [isClosingGroup, setIsClosingGroup] = useState(false);
  const [newGroupName,   setNewGroupName]   = useState("");
  const [newGroupColor,  setNewGroupColor]  = useState("#64c8ff");
  const isClosingRef  = useRef(false);
  const [pendingSubTasks, setPendingSubTasks] = useState<{ id: string; title: string }[]>([]);
  const [newSubInput,    setNewSubInput]    = useState("");

  // ── Derived ──────────────────────────────────────────────────────────────────
  const steps       = STEPS[mode];
  const lastStepIdx = steps.length - 1;
  const isEvent     = mode === "event";
  const effortHours = effortSize === "custom" ? customEffortHours : (EFFORT_SIZES.find(e => e.key === effortSize)?.hours ?? 0);
  const effortMinutes = (isEvent ? durationHours : effortHours) * 60;
  const dotUrgency = (isEvent ? 0 : computeUrgencyLevel(isImportant, dueAt?.toISOString() ?? null, new Date())) as number;
  const activeAccent = MODE_CONFIG[mode].accent;

  // ── Close ─────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    closeTaskForm();
  }, [closeTaskForm]);

  const closeGroupForm = useCallback(() => {
    setIsClosingGroup(true);
    setTimeout(() => { setShowNewGroup(false); setIsClosingGroup(false); }, 140);
  }, []);

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!taskFormOpen) return;
    isClosingRef.current = false;
    const goToForm = !!(editNode || taskFormDefaults.node_type || taskFormDefaults.due_at);
    setStep(goToForm ? "form" : "pick");
    setFormStep(0);
    setMode("task"); setTitle(""); setSelected([]);
    setIsImportant(false); setDueAt(null); setPlannedAt(null); setEffortSize("");
    setEventDate(null); setEventTime(""); setDurationHours(0); setArcId(null); setProjectId(null);
    setSaving(false); setError(""); setShowNewGroup(false); setIsClosingGroup(false);
    setNewGroupName(""); setNewGroupColor("#64c8ff");

    if (editNode) {
      setTitle(editNode.title);
      setIsImportant(editNode.importance_level === 1);
      setDueAt(editNode.due_at ? new Date(editNode.due_at) : null);
      setPlannedAt(editNode.planned_start_at ? new Date(editNode.planned_start_at) : null);
      setEffortSize(minutesToEffortKey(editNode.estimated_duration_minutes));
      setDurationHours(editNode.estimated_duration_minutes ? editNode.estimated_duration_minutes / 60 : 0);
      setArcId(editNode.arc_id ?? null);
      setProjectId(editNode.project_id ?? null);
      setMode(editNode.node_type === "event" ? "event" : editNode.due_at ? "assignment" : "task");
      if (editNode.node_type === "event" && editNode.planned_start_at) {
        const s = editNode.planned_start_at;
        const dt = new Date(s.includes("T") ? s : s + "T00:00:00");
        setEventDate(dt);
        if (s.includes("T")) setEventTime(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);
      }
      setSelected(editNode.groups?.filter((g: { is_ungrouped: boolean }) => !g.is_ungrouped).map((g: { id: string }) => g.id) ?? []);
    } else {
      if (taskFormDefaults.planned_start_at) setPlannedAt(new Date(taskFormDefaults.planned_start_at));
      if (taskFormDefaults.importance_level !== undefined) setIsImportant(taskFormDefaults.importance_level === 1);
      if (taskFormDefaults.node_type === "event") {
        setMode("event");
        if (taskFormDefaults.planned_start_at) {
          const s = taskFormDefaults.planned_start_at;
          const dt = new Date(s.includes("T") ? s : s + "T00:00:00");
          setEventDate(dt);
          if (s.includes("T")) setEventTime(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);
        }
      } else if (taskFormDefaults.due_at) {
        setMode("assignment");
        setDueAt(new Date(taskFormDefaults.due_at));
      }
    }
  }, [taskFormOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskFormOpen) return;
    setPendingSubTasks([]); setNewSubInput("");
    if (editNode && editNode.node_type !== "event") loadSubTasks(editNode.id);
  }, [taskFormOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dueAt && plannedAt && plannedAt > dueAt) setPlannedAt(null);
  }, [dueAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step navigation ─────────────────────────────────────────────────────────
  const goNext = useCallback(() => setFormStep(s => Math.min(lastStepIdx, s + 1)), [lastStepIdx]);
  const goPrev = useCallback(() => setFormStep(s => Math.max(0, s - 1)), []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!title.trim()) { setError("title is required"); setFormStep(STEPS[mode].indexOf("identity")); return; }
    setSaving(true);
    try {
      let planStart: string | undefined;
      if (isEvent && eventDate) {
        const p2 = (n: number) => String(n).padStart(2, "0");
        const ymd = `${eventDate.getFullYear()}-${p2(eventDate.getMonth() + 1)}-${p2(eventDate.getDate())}`;
        const resolvedTime = eventTime || eventTimeInputRef.current?.value || "";
        if (resolvedTime) {
          const [h, m] = resolvedTime.split(":").map(Number);
          planStart = `${ymd}T${p2(h)}:${p2(m)}:00`;
        } else {
          planStart = ymd;
        }
      } else if (plannedAt) {
        planStart = plannedAt.toISOString();
      }

      const importanceLevel: UserImportance = isImportant ? 1 : 0;

      if (isEditMode && editNode) {
        await updateNode(editNode.id, {
          title: title.trim(),
          importance_level: isEvent ? 0 : importanceLevel,
          estimated_duration_minutes: effortMinutes || null,
          due_at: dueAtRef.current ? toDateString(dueAtRef.current) : null,
          planned_start_at: planStart ?? null,
          arc_id: arcId ?? null, project_id: projectId ?? null,
          recurrence_rule: null,
        });
        await replaceNodeGroups(editNode.id, selectedGroups);
      } else {
        const newId = await createNode({
          title: title.trim(),
          node_type: isEvent ? "event" : "task",
          importance_level: isEvent ? 0 : importanceLevel,
          estimated_duration_minutes: effortMinutes || undefined,
          due_at: dueAtRef.current ? toDateString(dueAtRef.current) : undefined,
          planned_start_at: planStart, arc_id: arcId ?? undefined, project_id: projectId ?? undefined,
          group_ids: selectedGroups.length > 0 ? selectedGroups : undefined,
        });
        for (let i = 0; i < pendingSubTasks.length; i++) await storeCreateSubTask(newId, pendingSubTasks[i].title);
      }
      closeTaskForm();
    } catch (e) {
      setError(String(e)); setSaving(false);
    }
  }, [
    title, isEvent, eventDate, eventTime, plannedAt,
    isImportant, effortMinutes, arcId, projectId, selectedGroups,
    isEditMode, editNode, pendingSubTasks, storeCreateSubTask,
    createNode, updateNode, replaceNodeGroups, closeTaskForm, mode,
  ]);

  const handleNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const id = await createGroup({ name: newGroupName.trim(), color_hex: newGroupColor });
    setSelected(prev => [...prev, id]);
    setNewGroupName(""); setNewGroupColor("#64c8ff"); setShowNewGroup(false);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { handleClose(); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { handleSave(); return; }
  }, [handleSave, handleClose]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={taskFormOpen} onOpenChange={(open: boolean) => { if (!open) handleClose(); }}>
      <TypedDialogContent
        className={
          step === "pick"
            ? "planner-task-form w-[440px] bg-black border border-[rgba(255,255,255,0.2)] rounded-none p-0 gap-0 [&>button]:hidden"
            : "planner-task-form w-[500px] h-[540px] bg-black border border-[rgba(255,255,255,0.2)] rounded-none p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden"
        }
        onKeyDown={handleKeyDown}
      >
        <TypedDialogTitle className="sr-only">{isEditMode ? "Edit Task" : "New Task"}</TypedDialogTitle>

        {/* ── Type picker ─────────────────────────────────────────────────── */}
        {step === "pick" && (
          <div style={{ padding: "2rem 2rem 2.5rem" }}>
            <div style={{ ...mono, fontSize: "0.75rem", letterSpacing: "4px", color: "rgba(255,255,255,0.75)", marginBottom: "1.5rem", textTransform: "uppercase", textAlign: "center" }}>
              "{pickerPrompt}"
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {(["task", "assignment", "event"] as Mode[]).map(m => (
                <ModeOption key={m} m={m} onSelect={() => { setMode(m); setFormStep(0); setStep("form"); }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Wizard form ──────────────────────────────────────────────────── */}
        {step === "form" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>

            {/* Header */}
            <StepHeader mode={mode} steps={steps} stepIndex={formStep} onBack={() => { setStep("pick"); setFormStep(0); }} />

            {/* Dot stage */}
            <DotStageStrip importanceLevel={dotUrgency} effortMinutes={effortMinutes} isEvent={isEvent} dueAt={dueAt ?? eventDate} />

            {/* Field header — step title + arrows */}
            {(() => {
              const sk = steps[formStep];
              const SI = STEP_ICONS[sk];
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", height: 38, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                  <StepArrow dir="prev" onClick={goPrev} disabled={formStep === 0} />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SI size={13} style={{ color: "#f5c842" }} />
                    <span style={{ ...mono, fontSize: "0.78rem", letterSpacing: "3px", color: "#f5c842", textTransform: "uppercase" }}>
                      {STEP_LABELS[sk]}
                    </span>
                  </div>
                  <StepArrow dir="next" onClick={goNext} disabled={formStep === lastStepIdx} />
                </div>
              );
            })()}

            {/* Step fields */}
            <div style={{ flex: 1, minHeight: 0, overflow: steps[formStep] === "checklist" ? "hidden" : "auto", padding: "1rem 2rem", display: "flex", flexDirection: "column" }}>
              {steps[formStep] === "priority" && (
                <PriorityStep
                  mode={mode} isImportant={isImportant} setIsImportant={setIsImportant}
                  dueAt={dueAt} setDueAt={setDueAt} urgency={dotUrgency}
                  accent={activeAccent} onNext={goNext}
                />
              )}
              {steps[formStep] === "identity" && (
                <IdentityStep
                  title={title} setTitle={setTitle} error={error} setError={setError}
                  selectedGroups={selectedGroups} setSelected={setSelected} groups={groups}
                  arcId={arcId} setArcId={setArcId} projectId={projectId} setProjectId={setProjectId}
                  arcs={arcs} projects={projects}
                  showNewGroup={showNewGroup} setShowNewGroup={setShowNewGroup}
                  closeGroupForm={closeGroupForm} newGroupName={newGroupName} setNewGroupName={setNewGroupName}
                  newGroupColor={newGroupColor} setNewGroupColor={setNewGroupColor}
                  isClosingGroup={isClosingGroup} handleNewGroup={handleNewGroup}
                  onNext={goNext}
                />
              )}
              {steps[formStep] === "scheduling" && (
                <SchedulingStep
                  mode={mode} effortSize={effortSize} setEffortSize={setEffortSize}
                  customEffortHours={customEffortHours} setCustomEffortHours={setCustomEffortHours}
                  plannedAt={plannedAt} setPlannedAt={setPlannedAt} dueAt={dueAt}
                  eventDate={eventDate} setEventDate={setEventDate}
                  eventTime={eventTime} setEventTime={setEventTime}
                  eventTimeInputRef={eventTimeInputRef}
                  durationHours={durationHours} setDurationHours={setDurationHours}
                  accent={activeAccent} onNext={goNext}
                />
              )}
              {steps[formStep] === "checklist" && (
                <ChecklistStep
                  isEditMode={isEditMode} editNode={editNode}
                  pendingSubTasks={pendingSubTasks} setPendingSubTasks={setPendingSubTasks}
                  newSubInput={newSubInput} setNewSubInput={setNewSubInput}
                  subTasksByNode={subTasksByNode}
                  storeCreateSubTask={storeCreateSubTask} toggleSubTask={toggleSubTask}
                  updateSubTaskTitle={updateSubTaskTitle} storeDeleteSubTask={storeDeleteSubTask}
                />
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0.7rem 1.5rem", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={handleClose}
                  style={{ ...mono, fontSize: "0.72rem", letterSpacing: "2px", textTransform: "uppercase", padding: "0.35rem 1rem", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.4)", background: "none", cursor: "pointer" }}>
                  CANCEL
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ ...mono, fontSize: "0.72rem", letterSpacing: "2px", textTransform: "uppercase", padding: "0.35rem 1rem", border: `1px solid ${activeAccent}`, color: activeAccent, background: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                  {saving ? "SAVING…" : isEditMode ? "UPDATE" : "SAVE"}
                </button>
              </div>
            </div>
          </div>
        )}
      </TypedDialogContent>
    </Dialog>
  );
}
