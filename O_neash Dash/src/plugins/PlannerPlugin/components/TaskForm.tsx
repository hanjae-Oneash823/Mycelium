import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { UserImportance, NoteHit, RecurrenceRule } from "../types";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import { computeUrgencyLevel, toDateString } from "../lib/logicEngine";
import {
  linkNoteToTask,
  unlinkNoteFromTask,
  getLinkedNoteIds,
} from "../lib/noteLinks";
import { searchNotes, loadNotesByIds } from "../lib/noteSearch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusBox,
  Fire,
  GitBranch,
  PartyPopper,
  Contact,
  Trophy,
  Calendar,
} from "pixelarticons/react";
import TaskFormDotStage from "./TaskFormDotStage";
import DatePickerField from "./DatePickerField";
import "./TaskFormDotStage.css";

type Mode = "task" | "assignment" | "event";

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
  "#64c8ff",
  "#3dbfbf",
  "#4ade80",
  "#f5a623",
  "#ff6b35",
  "#c084fc",
  "#f5c842",
  "#ff3b3b",
  "#888888",
  "#00c4a7",
];

const EFFORT_SIZES = [
  { key: "·", label: "·", hours: 0, sub: "" },
  { key: "15m", label: "15m", hours: 0.25, sub: "" },
  { key: "30m", label: "30m", hours: 0.5, sub: "" },
  { key: "45m", label: "45m", hours: 0.75, sub: "" },
  { key: "1h", label: "1h", hours: 1, sub: "" },
  { key: "1.5h", label: "1.5h", hours: 1.5, sub: "" },
  { key: "2h", label: "2h", hours: 2, sub: "" },
  { key: "3h", label: "3h", hours: 3, sub: "" },
  { key: "4h", label: "4h", hours: 4, sub: "" },
] as const;

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const MODE_CONFIG: Record<
  Mode,
  {
    label: string;
    accent: string;
    bg: string;
    Icon: React.FC<{
      size?: number;
      style?: React.CSSProperties;
      className?: string;
    }>;
  }
> = {
  task: {
    label: "TASK",
    accent: "#00c4a7",
    bg: "rgba(0,196,167,0.1)",
    Icon: Fire,
  },
  assignment: {
    label: "ASSIGN",
    accent: "#f5a623",
    bg: "rgba(245,166,35,0.1)",
    Icon: Trophy,
  },
  event: {
    label: "EVENT",
    accent: "#c084fc",
    bg: "rgba(192,132,252,0.1)",
    Icon: PartyPopper,
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[9px] tracking-[2px] uppercase text-[rgba(255,255,255,0.3)] mb-1">
    {children}
  </p>
);

const Block = ({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.FC<{
    size?: number;
    style?: React.CSSProperties;
    className?: string;
  }>;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3 px-3 py-3">
    <div className="flex items-center gap-2">
      <Icon size={15} style={{ color: "#f5c842", flexShrink: 0 }} />
      <span
        className="font-mono text-[13px] tracking-[4px] uppercase"
        style={{ color: "#f5c842" }}
      >
        {label}
      </span>
    </div>
    {children}
  </div>
);

// ── Picker prompts ────────────────────────────────────────────────────────────

const PICKER_PROMPTS = [
  "WHAT ARE WE ADDING?",
  "WHAT'S ON YOUR MIND?",
  "WHAT ARE WE DOING?",
  "WHAT'S THE PLAN?",
  "LET'S GET SOMETHING DONE.",
  "ADD IT. DO IT. DONE.",
  "ANOTHER ONE? LET'S GO.",
  "PUT IT ON THE LIST.",
  "ANOTHER TASK? BOLD MOVE.",
  "THE LIST GROWS.",
  "FINE. WHAT IS IT.",
  "OK OK OK. WHAT.",
  "A NEW THING ENTERS THE SYSTEM.",
  "WHAT MUST BE DONE?",
  "THE VOID AWAITS YOUR INPUT.",
  "SPEAK IT INTO EXISTENCE.",
];

let pickerPromptIndex = 0;
function nextPickerPrompt(): string {
  const prompt = PICKER_PROMPTS[pickerPromptIndex % PICKER_PROMPTS.length];
  pickerPromptIndex++;
  return prompt;
}

// ── Mode picker option ────────────────────────────────────────────────────────

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  task: "flexible · no deadline",
  assignment: "has a due date",
  event: "scheduled at a specific time",
};

function ModeOption({ m, onSelect }: { m: Mode; onSelect: () => void }) {
  const cfg = MODE_CONFIG[m];
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1.25rem",
        padding: "1rem 1.25rem",
        width: "100%",
        cursor: "pointer",
        border: `1px solid ${hovered ? cfg.accent : "rgba(255,255,255,0.1)"}`,
        background: hovered ? cfg.bg : "transparent",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <cfg.Icon size={20} style={{ color: cfg.accent, flexShrink: 0 }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <span
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: "1.5rem",
            letterSpacing: "3px",
            color: hovered ? "#fff" : "rgba(255,255,255,0.85)",
            textTransform: "uppercase",
          }}
        >
          {m === "assignment" ? "ASSIGNMENT" : cfg.label}
        </span>
        <span
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: "0.85rem",
            letterSpacing: "1.5px",
            color: hovered ? cfg.accent : "rgba(255,255,255,0.3)",
          }}
        >
          {MODE_DESCRIPTIONS[m]}
        </span>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// Map effort minutes → chip key
function minutesToEffortKey(minutes: number | null | undefined): string {
  if (!minutes) return "·";
  const match = EFFORT_SIZES.find(
    (e) => e.hours > 0 && Math.abs(e.hours * 60 - minutes) < 5,
  );
  return match?.key ?? "";
}

export default function TaskForm() {
  const {
    groups,
    arcs,
    projects,
    createNode,
    updateNode,
    replaceNodeGroups,
    createGroup,
  } = usePlannerStore();
  const { taskFormOpen, taskFormDefaults, editNode, closeTaskForm } =
    useViewStore();
  const isEditMode = !!editNode;

  const [step, setStep] = useState<"pick" | "form">("pick");
  const [pickerPrompt] = useState(() => nextPickerPrompt());
  const [mode, setMode] = useState<Mode>("task");
  const [title, setTitle] = useState("");
  const [selectedGroups, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const dueAtRef = useRef<Date | null>(null);
  dueAtRef.current = dueAt; // always tracks latest value for handleSave
  const [plannedAt, setPlannedAt] = useState<Date | null>(null);
  const [effortSize, setEffortSize] = useState<string>("");
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState("");
  const [durationHours, setDurationHours] = useState<number>(0);
  const [arcId, setArcId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurrenceRule["freq"]>("weekly");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [recurUntil, setRecurUntil] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [isClosingGroup, setIsClosingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#64c8ff");
  const [showDescription, setShowDescription] = useState(false);
  const isClosingRef = useRef(false);
  // Note links
  const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([]);
  const [linkedNoteHits, setLinkedNoteHits] = useState<NoteHit[]>([]);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [noteSearchQ, setNoteSearchQ] = useState("");
  const [noteResults, setNoteResults] = useState<NoteHit[]>([]);

  // ── Close — Radix waits for [data-state=closed] CSS animation before unmounting ──
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    closeTaskForm();
  }, [closeTaskForm]);

  const closeGroupForm = useCallback(() => {
    setIsClosingGroup(true);
    setTimeout(() => {
      setShowNewGroup(false);
      setIsClosingGroup(false);
    }, 140);
  }, []);

  // ── Reset to blank slate on every open, then apply any defaults ──
  useEffect(() => {
    if (!taskFormOpen) return;
    isClosingRef.current = false;
    const goToForm = !!(
      editNode ||
      taskFormDefaults.node_type ||
      taskFormDefaults.due_at
    );
    setStep(goToForm ? "form" : "pick");
    setMode("task");
    setTitle("");
    setSelected([]);
    setDescription("");
    setShowDescription(false);
    setIsImportant(false);
    setDueAt(null);
    setPlannedAt(null);
    setEffortSize("");
    setEventDate(null);
    setEventTime("");
    setDurationHours(0);
    setArcId(null);
    setProjectId(null);
    setIsRecurring(false);
    setRecurFreq("weekly");
    setRecurInterval(1);
    setRecurDays([]);
    setRecurUntil(null);
    setSaving(false);
    setError("");
    setShowNewGroup(false);
    setIsClosingGroup(false);
    setNewGroupName("");
    setNewGroupColor("#64c8ff");
    setLinkedNoteIds([]);
    setLinkedNoteHits([]);
    setNotePickerOpen(false);
    setNoteSearchQ("");
    setNoteResults([]);
    if (editNode) {
      // ── Edit mode: pre-fill from existing node ──
      setTitle(editNode.title);
      setDescription(editNode.description ?? "");
      setShowDescription(!!editNode.description);
      setIsImportant(editNode.importance_level === 1);
      setDueAt(editNode.due_at ? new Date(editNode.due_at) : null);
      setPlannedAt(
        editNode.planned_start_at ? new Date(editNode.planned_start_at) : null,
      );
      setEffortSize(minutesToEffortKey(editNode.estimated_duration_minutes));
      setDurationHours(
        editNode.estimated_duration_minutes
          ? editNode.estimated_duration_minutes / 60
          : 0,
      );
      setArcId(editNode.arc_id ?? null);
      setProjectId(editNode.project_id ?? null);
      setMode(
        editNode.node_type === "event"
          ? "event"
          : editNode.due_at
            ? "assignment"
            : "task",
      );
      if (editNode.node_type === "event" && editNode.planned_start_at) {
        const evtStr = editNode.planned_start_at;
        const evtDt = new Date(
          evtStr.includes("T") ? evtStr : evtStr + "T00:00:00",
        );
        setEventDate(evtDt);
        if (evtStr.includes("T")) {
          setEventTime(
            `${String(evtDt.getHours()).padStart(2, "0")}:${String(evtDt.getMinutes()).padStart(2, "0")}`,
          );
        }
      }
      setSelected(
        editNode.groups?.filter((g) => !g.is_ungrouped).map((g) => g.id) ?? [],
      );
      if (editNode.recurrence_rule) {
        try {
          const rule: RecurrenceRule = JSON.parse(editNode.recurrence_rule);
          setIsRecurring(true);
          setRecurFreq(rule.freq);
          setRecurInterval(rule.interval);
          setRecurDays(rule.days ?? []);
          setRecurUntil(rule.until ? new Date(rule.until + "T00:00:00") : null);
        } catch {
          /* ignore malformed JSON */
        }
      }
    } else {
      // ── Create mode: apply optional defaults ──
      if (taskFormDefaults.planned_start_at)
        setPlannedAt(new Date(taskFormDefaults.planned_start_at));
      if (taskFormDefaults.importance_level !== undefined)
        setIsImportant(taskFormDefaults.importance_level === 1);
      if (taskFormDefaults.node_type === "event") {
        setMode("event");
        if (taskFormDefaults.planned_start_at) {
          const evtStr = taskFormDefaults.planned_start_at;
          const evtDt = new Date(
            evtStr.includes("T") ? evtStr : evtStr + "T00:00:00",
          );
          setEventDate(evtDt);
          if (evtStr.includes("T")) {
            setEventTime(
              `${String(evtDt.getHours()).padStart(2, "0")}:${String(evtDt.getMinutes()).padStart(2, "0")}`,
            );
          }
        }
      } else if (taskFormDefaults.due_at) {
        setMode("assignment");
        setDueAt(new Date(taskFormDefaults.due_at));
      }
    }
  }, [taskFormOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load linked notes in edit mode ──
  useEffect(() => {
    if (!taskFormOpen || !editNode) return;
    let cancelled = false;
    async function load() {
      const ids = await getLinkedNoteIds(editNode!.id);
      const hits = await loadNotesByIds(ids);
      if (!cancelled) {
        setLinkedNoteIds(ids);
        setLinkedNoteHits(hits);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [taskFormOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Note search (debounced) ──
  useEffect(() => {
    if (!notePickerOpen || !noteSearchQ.trim()) {
      setNoteResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const hits = await searchNotes(noteSearchQ);
      setNoteResults(
        hits.filter((h) => !linkedNoteIds.includes(h.compositeId)),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [noteSearchQ, notePickerOpen, linkedNoteIds]);

  // ── Auto-reset plannedAt if dueAt moves before it ──
  useEffect(() => {
    if (dueAt && plannedAt && plannedAt > dueAt) {
      setPlannedAt(null);
    }
  }, [dueAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isEvent = mode === "event";
  const effortHours =
    EFFORT_SIZES.find((e) => e.key === effortSize)?.hours ?? 0;
  const effortMinutes = (isEvent ? durationHours : effortHours) * 60;

  // 7-day week strip, capped at dueAt if within range
  const stripDays = useMemo(() => {
    const start = new Date(today);
    const maxDays = 7;
    const cutoff = dueAt
      ? Math.ceil((dueAt.getTime() - start.getTime()) / 86400000) + 1
      : maxDays;
    const limit = Math.max(1, Math.min(maxDays, cutoff));
    return Array.from({ length: limit }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueAt]);
  const importanceLevel: UserImportance = isImportant ? 1 : 0;
  const dotUrgency = isEvent
    ? 0
    : computeUrgencyLevel(
        isImportant,
        dueAt?.toISOString() ?? null,
        new Date(),
      );

  // ── Actions ──
  const toggleGroup = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError("title is required");
      return;
    }
    setSaving(true);
    try {
      let planStart: string | undefined;
      if (isEvent && eventDate) {
        const p2 = (n: number) => String(n).padStart(2, "0");
        const ymd = `${eventDate.getFullYear()}-${p2(eventDate.getMonth() + 1)}-${p2(eventDate.getDate())}`;
        if (eventTime) {
          // Store as local ISO string (no Z) so the calendar positions it at the user's selected local time
          const [h, m] = eventTime.split(":").map(Number);
          planStart = `${ymd}T${p2(h)}:${p2(m)}:00`;
        } else {
          // No time specified: store as date-only so the calendar defaults to 9am display
          planStart = ymd;
        }
      } else if (plannedAt) {
        planStart = plannedAt.toISOString();
      }

      const builtRule: RecurrenceRule | null =
        isEvent && isRecurring
          ? {
              freq: recurFreq,
              interval: recurInterval || 1,
              ...(recurFreq === "weekly" && recurDays.length > 0
                ? { days: recurDays }
                : {}),
              ...(recurUntil
                ? { until: recurUntil.toISOString().slice(0, 10) }
                : {}),
            }
          : null;

      if (isEditMode && editNode) {
        await updateNode(editNode.id, {
          title: title.trim(),
          description: description || null,
          importance_level: isEvent ? 0 : importanceLevel,
          estimated_duration_minutes: effortMinutes || null,
          due_at: dueAtRef.current ? toDateString(dueAtRef.current) : null,
          planned_start_at: planStart ?? null,
          arc_id: arcId ?? null,
          project_id: projectId ?? null,
          recurrence_rule: builtRule ? JSON.stringify(builtRule) : null,
        });
        await replaceNodeGroups(editNode.id, selectedGroups);
        // Reconcile note links
        const oldIds = await getLinkedNoteIds(editNode.id);
        await Promise.all([
          ...linkedNoteIds
            .filter((id) => !oldIds.includes(id))
            .map((id) => linkNoteToTask(id, editNode.id)),
          ...oldIds
            .filter((id) => !linkedNoteIds.includes(id))
            .map((id) => unlinkNoteFromTask(id, editNode.id)),
        ]);
      } else {
        const newId = await createNode({
          title: title.trim(),
          description: description || undefined,
          node_type: isEvent ? "event" : "task",
          importance_level: isEvent ? 0 : importanceLevel,
          estimated_duration_minutes: effortMinutes || undefined,
          due_at: dueAtRef.current ? toDateString(dueAtRef.current) : undefined,
          planned_start_at: planStart,
          arc_id: arcId ?? undefined,
          project_id: projectId ?? undefined,
          group_ids: selectedGroups.length > 0 ? selectedGroups : undefined,
          recurrence_rule: builtRule,
        });
        await Promise.all(linkedNoteIds.map((id) => linkNoteToTask(id, newId)));
      }
      closeTaskForm();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }, [
    title,
    description,
    isEvent,
    eventDate,
    eventTime,
    plannedAt,
    importanceLevel,
    effortMinutes,
    arcId,
    projectId,
    selectedGroups,
    isRecurring,
    recurFreq,
    recurInterval,
    recurDays,
    recurUntil,
    isEditMode,
    editNode,
    createNode,
    updateNode,
    replaceNodeGroups,
    closeTaskForm,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
    },
    [handleSave, handleClose],
  );

  const handleNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const id = await createGroup({
      name: newGroupName.trim(),
      color_hex: newGroupColor,
    });
    setSelected((prev) => [...prev, id]);
    setNewGroupName("");
    setNewGroupColor("#64c8ff");
    setShowNewGroup(false);
  };

  const realGroups = groups.filter((g) => !g.is_ungrouped);
  const filteredProjects = projects.filter(
    (p) => p.arc_id === arcId && !p.is_archived,
  );
  const activeAccent = MODE_CONFIG[mode].accent;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog
      open={taskFormOpen}
      onOpenChange={(open: boolean) => {
        if (!open) handleClose();
      }}
    >
      <TypedDialogContent
        className={
          step === "pick"
            ? "planner-task-form w-[400px] bg-black border border-[rgba(255,255,255,0.2)] rounded-none p-0 gap-0 [&>button]:hidden"
            : "planner-task-form max-w-[58rem] bg-black border border-[rgba(255,255,255,0.2)] rounded-none p-0 gap-0 h-[800px] flex flex-col overflow-hidden [&>button]:hidden"
        }
        onKeyDown={handleKeyDown}
      >
        <TypedDialogTitle className="sr-only">
          {isEditMode ? "Edit Task" : "New Task"}
        </TypedDialogTitle>

        {/* ── Picker step ─────────────────────────────────────────────────── */}
        {step === "pick" && (
          <div style={{ padding: "2rem 2rem 2.5rem" }}>
            <div
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "0.75rem",
                letterSpacing: "4px",
                color: "rgba(255,255,255,0.75)",
                marginBottom: "1.5rem",
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              "{pickerPrompt}"
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              {(["task", "assignment", "event"] as Mode[]).map((m) => (
                <ModeOption
                  key={m}
                  m={m}
                  onSelect={() => {
                    setMode(m);
                    setStep("form");
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Form step ───────────────────────────────────────────────────── */}
        {step === "form" && (
          <>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div
              className="shrink-0 flex items-center justify-between px-5"
              style={{
                height: 54,
                borderBottom: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div className="flex items-center gap-2">
                <PlusBox
                  size={18}
                  className="text-[rgba(255,255,255,0.4)]"
                  style={{ marginRight: 4 }}
                />
                <span className="font-mono text-[15px] tracking-[4px] uppercase text-[rgba(255,255,255,0.85)]">
                  {isEditMode
                    ? `EDIT ${MODE_CONFIG[mode].label}`
                    : `NEW ${MODE_CONFIG[mode].label}`}
                </span>
              </div>
              <div className="flex gap-1.5">
                {(["task", "assignment", "event"] as Mode[]).map((m) => {
                  const cfg = MODE_CONFIG[m];
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => { setMode(m); if (m === "task") setDueAt(null); }}
                      className="flex items-center gap-1.5 font-mono text-[10px] tracking-[2px] uppercase px-3 py-1.5 transition-all"
                      style={{
                        border: `1px solid ${active ? cfg.accent : "rgba(255,255,255,0.15)"}`,
                        background: active ? cfg.bg : "transparent",
                        color: active ? cfg.accent : "rgba(255,255,255,0.28)",
                      }}
                    >
                      <cfg.Icon size={13} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Main row: stage + fields ────────────────────────────────────── */}
            <div className="flex flex-row flex-1 overflow-hidden">
              {/* Left: dot stage */}
              <TaskFormDotStage
                importanceLevel={dotUrgency}
                effortMinutes={effortMinutes}
                isEvent={isEvent}
                dueAt={dueAt ?? eventDate}
              />

              {/* Right: field pane */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
                  {/* ── PRIORITY ──────────────────────────────────────────────── */}
                  {!isEvent && (
                    <Block label="PRIORITY" icon={Trophy}>
                      {/* TASK mode: [★] = L{1|2} */}
                      {mode === "task" && (
                        <div
                          className="font-mono py-2"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto auto auto",
                            gap: "4px 8px",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div className="flex items-center">
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              [
                            </span>
                            <button
                              onClick={() => setIsImportant(!isImportant)}
                              className="px-0.5 transition-colors text-lg leading-none"
                              style={{
                                color: isImportant
                                  ? "#f5a623"
                                  : "rgba(255,255,255,0.45)",
                              }}
                            >
                              ★
                            </button>
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              ]
                            </span>
                          </div>
                          <span className="text-[rgba(255,255,255,0.45)] text-base select-none text-center px-1">
                            =
                          </span>
                          <span
                            className="text-2xl tracking-widest transition-colors text-center"
                            style={{
                              color: (
                                [
                                  "#7ecfff",
                                  "#3dbfbf",
                                  "#4ade80",
                                  "#f5a623",
                                  "#ff6b35",
                                ] as const
                              )[dotUrgency],
                            }}
                          >
                            L{dotUrgency}
                          </span>
                          <div
                            style={{
                              position: "relative",
                              minWidth: 0,
                              height: 14,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                whiteSpace: "nowrap",
                                fontSize: 8,
                                letterSpacing: 2,
                                textTransform: "uppercase",
                                color: isImportant
                                  ? "#f5a623"
                                  : "rgba(255,255,255,0.25)",
                              }}
                            >
                              {isImportant ? "important" : "not important"}
                            </span>
                          </div>
                          <span />
                          <div
                            style={{
                              position: "relative",
                              minWidth: 0,
                              height: 14,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                whiteSpace: "nowrap",
                                fontSize: 8,
                                letterSpacing: 2,
                                textTransform: "uppercase",
                                color: isImportant
                                  ? "#4ade80"
                                  : "rgba(255,255,255,0.25)",
                              }}
                            >
                              {isImportant
                                ? "L2 · flex important"
                                : "L1 · flex"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* ASSIGNMENT mode: [★] + [DD] = L{x} */}
                      {mode === "assignment" && (
                        <div
                          className="font-mono py-2"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto auto auto auto auto",
                            gap: "4px 6px",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div className="flex items-center">
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              [
                            </span>
                            <button
                              onClick={() => setIsImportant(!isImportant)}
                              className="px-0.5 transition-colors text-lg leading-none"
                              style={{
                                color: isImportant
                                  ? "#f5a623"
                                  : "rgba(255,255,255,0.45)",
                              }}
                            >
                              ★
                            </button>
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              ]
                            </span>
                          </div>
                          <span className="text-[rgba(255,255,255,0.45)] text-base select-none text-center px-1">
                            +
                          </span>
                          <div className="flex items-center">
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              [
                            </span>
                            <DatePickerField
                              value={dueAt}
                              onChange={setDueAt}
                              placeholder="due date"
                              hideIcon
                              triggerClassName="h-auto py-0 px-0.5 bg-transparent border-0 shadow-none font-mono text-base text-[rgba(255,255,255,0.8)] hover:text-white hover:bg-transparent focus-visible:ring-0 rounded-none"
                            />
                            <span className="text-[rgba(255,255,255,0.6)] text-lg select-none">
                              ]
                            </span>
                          </div>
                          <span className="text-[rgba(255,255,255,0.45)] text-base select-none text-center px-1">
                            =
                          </span>
                          <span
                            className="text-2xl tracking-widest transition-colors text-center"
                            style={{
                              color: (
                                [
                                  "#7ecfff",
                                  "#3dbfbf",
                                  "#4ade80",
                                  "#f5a623",
                                  "#ff6b35",
                                ] as const
                              )[dotUrgency],
                            }}
                          >
                            L{dotUrgency}
                          </span>
                          <div
                            style={{
                              position: "relative",
                              minWidth: 0,
                              height: 14,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                whiteSpace: "nowrap",
                                fontSize: 8,
                                letterSpacing: 2,
                                textTransform: "uppercase",
                                color: isImportant
                                  ? "#f5a623"
                                  : "rgba(255,255,255,0.25)",
                              }}
                            >
                              {isImportant ? "important" : "not important"}
                            </span>
                          </div>
                          <span />
                          <div
                            style={{
                              position: "relative",
                              minWidth: 0,
                              height: 14,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                whiteSpace: "nowrap",
                                fontSize: 8,
                                letterSpacing: 2,
                                textTransform: "uppercase",
                                color: dueAt
                                  ? (
                                      [
                                        "#7ecfff",
                                        "#3dbfbf",
                                        "#4ade80",
                                        "#f5a623",
                                        "#ff6b35",
                                      ] as const
                                    )[dotUrgency]
                                  : "rgba(255,255,255,0.25)",
                              }}
                            >
                              {!dueAt
                                ? "set deadline"
                                : dotUrgency >= 4
                                  ? "urgent"
                                  : dotUrgency >= 3
                                    ? "soon"
                                    : dotUrgency >= 2
                                      ? "moderate"
                                      : "relaxed"}
                            </span>
                          </div>
                          <span />
                          <span />
                        </div>
                      )}
                    </Block>
                  )}

                  {/* ── IDENTITY ──────────────────────────────────────────────── */}
                  <Block label="IDENTITY" icon={Contact}>
                    <div className="flex flex-col gap-3 font-mono">
                      {/* name: [ input ] */}
                      <div className="flex items-center gap-2">
                        <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-12 shrink-0">
                          name:
                        </span>
                        <div className="flex items-center flex-1">
                          <span className="text-[rgba(255,255,255,0.45)] text-sm select-none">
                            [
                          </span>
                          <Input
                            autoFocus
                            value={title}
                            onChange={(e) => {
                              setTitle(e.target.value);
                              setError("");
                            }}
                            placeholder="what needs to be done?"
                            className="flex-1 rounded-none bg-transparent border-0 text-white font-mono text-sm focus-visible:ring-0 h-7 px-1 placeholder:text-[rgba(255,255,255,0.2)]"
                          />
                          <span className="text-[rgba(255,255,255,0.45)] text-sm select-none">
                            ]
                          </span>
                        </div>
                        {error && (
                          <span className="font-mono text-[10px] text-[#ff3b3b] tracking-wide shrink-0">
                            {error}
                          </span>
                        )}
                      </div>

                      {/* tags: #tag #tag + */}
                      <div className="flex items-start gap-2">
                        <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-12 shrink-0 pt-0.5">
                          groups:
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {realGroups.map((g) => {
                            const sel = selectedGroups.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => toggleGroup(g.id)}
                                className="font-mono text-[12px] transition-colors"
                                style={{
                                  color: sel
                                    ? g.color_hex
                                    : "rgba(255,255,255,0.3)",
                                }}
                              >
                                #{g.name}
                              </button>
                            );
                          })}
                          <button
                            onClick={() =>
                              showNewGroup
                                ? closeGroupForm()
                                : setShowNewGroup(true)
                            }
                            className="font-mono text-[13px] text-[rgba(255,255,255,0.5)] hover:text-white transition-colors px-1"
                            style={{
                              border: "1px solid rgba(255,255,255,0.2)",
                              lineHeight: 1,
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* new group — terminal inline prompt */}
                      {showNewGroup && (
                        <div
                          className="flex flex-col gap-1.5 ml-14"
                          style={{
                            animation: `${isClosingGroup ? "term-out" : "term-in"} 0.14s ease forwards`,
                          }}
                        >
                          {/* line 1: prompt + input + swatches */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12px] text-[#00c4a7] select-none">
                              &gt;
                            </span>
                            <input
                              autoFocus
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              placeholder="group name_"
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") handleNewGroup();
                                if (e.key === "Escape") closeGroupForm();
                              }}
                              className="font-mono text-[12px] bg-transparent border-0 border-b focus:outline-none placeholder:text-[rgba(255,255,255,0.2)] w-28"
                              style={{
                                borderColor: "rgba(255,255,255,0.25)",
                                color: newGroupColor,
                              }}
                            />
                            <div className="flex gap-1 items-center">
                              {SWATCH_COLORS.map((c) => (
                                <button
                                  key={c}
                                  onClick={() => setNewGroupColor(c)}
                                  className="transition-transform hover:scale-110"
                                  style={{
                                    width: 9,
                                    height: 9,
                                    backgroundColor: c,
                                    outline:
                                      newGroupColor === c
                                        ? `2px solid ${c}`
                                        : "none",
                                    outlineOffset: 2,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          {/* line 2: keyboard hints */}
                          <div className="flex gap-3 font-mono text-[10px] text-[rgba(255,255,255,0.25)]">
                            <span>
                              <span className="text-[rgba(255,255,255,0.45)]">
                                ↵
                              </span>{" "}
                              save
                            </span>
                            <span>
                              <span className="text-[rgba(255,255,255,0.45)]">
                                esc
                              </span>{" "}
                              cancel
                            </span>
                          </div>
                        </div>
                      )}

                      {/* arc/project — all modes */}
                      {
                        <div className="flex items-center gap-2">
                          <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-12 shrink-0">
                            arc:
                          </span>
                          <div className="grid grid-cols-2 gap-2 flex-1">
                            <Select
                              value={arcId ?? "__none__"}
                              onValueChange={(v: string) => {
                                setArcId(v === "__none__" ? null : v || null);
                                setProjectId(null);
                              }}
                            >
                              <TypedSelectTrigger
                                className="rounded-none bg-transparent border-[rgba(255,255,255,0.2)] font-mono text-sm focus:ring-0 h-8 w-full"
                                style={{ color: arcId ? (arcs.find(a => a.id === arcId)?.color_hex ?? 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.55)' }}
                              >
                                <SelectValue placeholder="select arc" />
                              </TypedSelectTrigger>
                              <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                                <TypedSelectItem value="__none__" className="font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  no arc
                                </TypedSelectItem>
                                {arcs
                                  .filter((a) => !a.is_archived)
                                  .map((arc) => (
                                    <TypedSelectItem
                                      key={arc.id}
                                      value={arc.id}
                                      className="font-mono text-sm"
                                      style={{ color: arc.color_hex }}
                                    >
                                      {arc.name}
                                    </TypedSelectItem>
                                  ))}
                              </TypedSelectContent>
                            </Select>
                            <Select
                              value={projectId ?? "__none__"}
                              onValueChange={(v: string) =>
                                setProjectId(v === "__none__" ? null : v || null)
                              }
                              disabled={!arcId}
                            >
                              <TypedSelectTrigger
                                className="rounded-none bg-transparent border-[rgba(255,255,255,0.2)] font-mono text-sm focus:ring-0 h-8 w-full disabled:opacity-35"
                                style={{ color: projectId ? (filteredProjects.find(p => p.id === projectId)?.color_hex ?? arcs.find(a => a.id === arcId)?.color_hex ?? 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.55)' }}
                              >
                                <SelectValue
                                  placeholder={
                                    arcId ? "select project" : "arc first"
                                  }
                                />
                              </TypedSelectTrigger>
                              <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                                <TypedSelectItem value="__none__" className="font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  no project
                                </TypedSelectItem>
                                {filteredProjects.map((p) => (
                                  <TypedSelectItem
                                    key={p.id}
                                    value={p.id}
                                    className="font-mono text-sm"
                                    style={{ color: p.color_hex ?? arcs.find(a => a.id === arcId)?.color_hex }}
                                  >
                                    {p.name}
                                  </TypedSelectItem>
                                ))}
                              </TypedSelectContent>
                            </Select>
                          </div>
                        </div>
                      }

                      {/* // add notes toggle */}
                      {!showDescription ? (
                        <button
                          onClick={() => setShowDescription(true)}
                          className="text-left font-mono text-[11px] tracking-wide transition-colors text-[rgba(255,255,255,0.2)] hover:text-[rgba(255,255,255,0.5)]"
                        >
                          // add notes ▸
                        </button>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-12 shrink-0 pt-0.5">
                            note:
                          </span>
                          <div className="flex items-start flex-1">
                            <span className="text-[rgba(255,255,255,0.45)] text-sm select-none pt-0.5">
                              [
                            </span>
                            <textarea
                              autoFocus
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="notes, context..."
                              rows={2}
                              className="flex-1 bg-transparent border-0 text-white font-mono text-sm px-1 py-0.5 resize-none focus:outline-none rounded-none leading-relaxed placeholder:text-[rgba(255,255,255,0.2)]"
                            />
                            <span className="text-[rgba(255,255,255,0.45)] text-sm select-none pt-0.5">
                              ]
                            </span>
                          </div>
                        </div>
                      )}

                      {/* // link notes section */}
                      <div className="flex flex-col gap-1.5">
                        {/* Linked note chips */}
                        {linkedNoteHits.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 ml-14">
                            {linkedNoteHits.map((n) => (
                              <div
                                key={n.compositeId}
                                className="flex items-center gap-1 font-mono text-[11px]"
                                style={{
                                  border: "1px solid rgba(192,132,252,0.35)",
                                  padding: "1px 6px",
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: n.groupColor,
                                    flexShrink: 0,
                                    display: "inline-block",
                                  }}
                                />
                                <span
                                  style={{
                                    color: "#c084fc",
                                    maxWidth: 120,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {n.title || "(untitled)"}
                                </span>
                                <button
                                  onClick={() => {
                                    setLinkedNoteIds((prev) =>
                                      prev.filter((id) => id !== n.compositeId),
                                    );
                                    setLinkedNoteHits((prev) =>
                                      prev.filter(
                                        (h) => h.compositeId !== n.compositeId,
                                      ),
                                    );
                                  }}
                                  className="text-[rgba(255,59,59,0.6)] hover:text-[#ff3b3b] leading-none ml-0.5"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Note picker toggle + search */}
                        {!notePickerOpen ? (
                          <button
                            onClick={() => setNotePickerOpen(true)}
                            className="text-left font-mono text-[11px] tracking-wide transition-colors text-[rgba(255,255,255,0.2)] hover:text-[rgba(255,255,255,0.5)]"
                          >
                            // link note ▸
                          </button>
                        ) : (
                          <div
                            className="flex flex-col gap-1.5 ml-14"
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[12px] text-[#c084fc] select-none">
                                &gt;
                              </span>
                              <input
                                autoFocus
                                value={noteSearchQ}
                                onChange={(e) => setNoteSearchQ(e.target.value)}
                                placeholder="search notes_"
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setNotePickerOpen(false);
                                    setNoteSearchQ("");
                                  }
                                }}
                                className="font-mono text-[12px] bg-transparent border-0 border-b focus:outline-none placeholder:text-[rgba(255,255,255,0.2)] text-white flex-1"
                                style={{
                                  borderColor: "rgba(192,132,252,0.35)",
                                }}
                              />
                              <button
                                onClick={() => {
                                  setNotePickerOpen(false);
                                  setNoteSearchQ("");
                                }}
                                className="font-mono text-[10px] text-[rgba(255,255,255,0.3)]"
                              >
                                ✕
                              </button>
                            </div>
                            {noteResults.length > 0 && (
                              <div
                                className="flex flex-col"
                                style={{
                                  border: "1px solid rgba(192,132,252,0.2)",
                                  maxHeight: 120,
                                  overflowY: "auto",
                                }}
                              >
                                {noteResults.slice(0, 8).map((hit) => (
                                  <button
                                    key={hit.compositeId}
                                    onClick={() => {
                                      setLinkedNoteIds((prev) => [
                                        ...prev,
                                        hit.compositeId,
                                      ]);
                                      setLinkedNoteHits((prev) => [
                                        ...prev,
                                        hit,
                                      ]);
                                      setNoteSearchQ("");
                                      setNoteResults([]);
                                      setNotePickerOpen(false);
                                    }}
                                    className="flex items-center gap-2 px-2 py-1 text-left font-mono text-[11px] hover:bg-[rgba(192,132,252,0.08)] transition-colors"
                                  >
                                    <span
                                      style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        background: hit.groupColor,
                                        flexShrink: 0,
                                        display: "inline-block",
                                      }}
                                    />
                                    <span
                                      style={{
                                        color: "rgba(255,255,255,0.7)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {hit.title || "(untitled)"}
                                    </span>
                                    <span
                                      style={{
                                        color: "rgba(255,255,255,0.25)",
                                        fontSize: 10,
                                        marginLeft: "auto",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {hit.groupName}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {noteSearchQ.trim() && noteResults.length === 0 && (
                              <span className="font-mono text-[10px] text-[rgba(255,255,255,0.2)] ml-4">
                                no matching notes
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Block>

                  {/* ── SCHEDULING ────────────────────────────────────────────── */}
                  <Block label="SCHEDULING" icon={Calendar}>
                    {isEvent ? (
                      <>
                        {/* Event date + time */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <FieldLabel>DATE</FieldLabel>
                            <DatePickerField
                              value={eventDate}
                              onChange={setEventDate}
                              placeholder="event date"
                            />
                          </div>
                          <div>
                            <FieldLabel>TIME</FieldLabel>
                            <input
                              type="time"
                              value={eventTime}
                              onChange={(e) => setEventTime(e.target.value)}
                              className="flex h-9 w-full bg-transparent border border-[rgba(255,255,255,0.2)] text-white font-mono text-sm px-3 focus:outline-none focus:border-[#c084fc]"
                              style={{ colorScheme: "dark" }}
                            />
                          </div>
                        </div>
                        {/* Duration chips — same style as effort */}
                        <div className="flex items-center gap-0 font-mono">
                          <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-16 shrink-0">
                            duration:
                          </span>
                          <span className="text-[rgba(255,255,255,0.2)] mr-1">
                            ▸
                          </span>
                          {EFFORT_SIZES.map(({ key, hours }, i) => {
                            const active = hours === durationHours;
                            const isDot = key === "·";
                            return (
                              <React.Fragment key={key}>
                                {i > 0 && (
                                  <span className="text-[rgba(255,255,255,0.12)] select-none px-0.5">
                                    │
                                  </span>
                                )}
                                <button
                                  onClick={() =>
                                    setDurationHours(active ? 0 : hours)
                                  }
                                  className="font-mono text-[13px] tracking-wider transition-colors"
                                  style={{
                                    color: active
                                      ? "#000"
                                      : isDot
                                        ? "rgba(255,255,255,0.2)"
                                        : "rgba(255,255,255,0.55)",
                                  }}
                                >
                                  {active ? (
                                    <span style={{ color: "rgba(0,0,0,0.45)" }}>
                                      [
                                    </span>
                                  ) : null}
                                  <span
                                    className="px-0.5"
                                    style={{
                                      background: active
                                        ? "#fff"
                                        : "transparent",
                                    }}
                                  >
                                    {key}
                                  </span>
                                  {active ? (
                                    <span style={{ color: "rgba(0,0,0,0.45)" }}>
                                      ]
                                    </span>
                                  ) : null}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* ── RECURRENCE ─────────────────────────────────────── */}
                        <div className="flex flex-col gap-2">
                          <FieldLabel>REPEAT</FieldLabel>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setIsRecurring(!isRecurring)}
                              className="font-mono text-[11px] tracking-[2px] uppercase px-2 py-1 transition-all"
                              style={{
                                border: `1px solid ${isRecurring ? "#c084fc" : "rgba(255,255,255,0.2)"}`,
                                color: isRecurring
                                  ? "#c084fc"
                                  : "rgba(255,255,255,0.35)",
                                background: isRecurring
                                  ? "rgba(192,132,252,0.08)"
                                  : "transparent",
                              }}
                            >
                              {isRecurring ? "ON" : "OFF"}
                            </button>
                            {isRecurring && (
                              <span className="font-mono text-[10px] text-[rgba(255,255,255,0.3)]">
                                repeating event
                              </span>
                            )}
                          </div>

                          {isRecurring && (
                            <div className="flex flex-col gap-2 ml-2">
                              {/* Frequency */}
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-[rgba(255,255,255,0.45)] w-16 shrink-0">
                                  freq:
                                </span>
                                <div className="flex gap-1">
                                  {(
                                    ["daily", "weekly", "monthly"] as const
                                  ).map((f) => (
                                    <button
                                      key={f}
                                      onClick={() => setRecurFreq(f)}
                                      className="font-mono text-[11px] tracking-[1px] uppercase px-2 py-0.5 transition-all"
                                      style={{
                                        border: `1px solid ${recurFreq === f ? "#c084fc" : "rgba(255,255,255,0.15)"}`,
                                        color:
                                          recurFreq === f
                                            ? "#c084fc"
                                            : "rgba(255,255,255,0.3)",
                                        background:
                                          recurFreq === f
                                            ? "rgba(192,132,252,0.08)"
                                            : "transparent",
                                      }}
                                    >
                                      {f}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Interval */}
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-[rgba(255,255,255,0.45)] w-16 shrink-0">
                                  every:
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() =>
                                      setRecurInterval(
                                        Math.max(1, recurInterval - 1),
                                      )
                                    }
                                    className="font-mono text-[14px] text-[rgba(255,255,255,0.4)] hover:text-white w-5 text-center leading-none"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono text-[13px] text-white w-4 text-center">
                                    {recurInterval}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setRecurInterval(
                                        Math.min(52, recurInterval + 1),
                                      )
                                    }
                                    className="font-mono text-[14px] text-[rgba(255,255,255,0.4)] hover:text-white w-5 text-center leading-none"
                                  >
                                    +
                                  </button>
                                  <span className="font-mono text-[11px] text-[rgba(255,255,255,0.3)] ml-1">
                                    {recurFreq === "daily"
                                      ? recurInterval === 1
                                        ? "day"
                                        : "days"
                                      : recurFreq === "weekly"
                                        ? recurInterval === 1
                                          ? "week"
                                          : "weeks"
                                        : recurInterval === 1
                                          ? "month"
                                          : "months"}
                                  </span>
                                </div>
                              </div>

                              {/* Day picker (weekly only) */}
                              {recurFreq === "weekly" && (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-[rgba(255,255,255,0.45)] w-16 shrink-0">
                                    on:
                                  </span>
                                  <div className="flex gap-1">
                                    {DAY_LETTERS.map((letter, i) => {
                                      const sel = recurDays.includes(i);
                                      return (
                                        <button
                                          key={i}
                                          onClick={() =>
                                            setRecurDays((prev) =>
                                              sel
                                                ? prev.filter((d) => d !== i)
                                                : [...prev, i],
                                            )
                                          }
                                          className="font-mono text-[11px] w-6 h-6 flex items-center justify-center transition-all"
                                          style={{
                                            border: `1px solid ${sel ? "#c084fc" : "rgba(255,255,255,0.15)"}`,
                                            color: sel
                                              ? "#c084fc"
                                              : "rgba(255,255,255,0.3)",
                                            background: sel
                                              ? "rgba(192,132,252,0.12)"
                                              : "transparent",
                                          }}
                                        >
                                          {letter}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Until date */}
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-[rgba(255,255,255,0.45)] w-16 shrink-0">
                                  until:
                                </span>
                                <div className="flex items-center">
                                  <span className="font-mono text-[rgba(255,255,255,0.3)] text-sm">
                                    [
                                  </span>
                                  <DatePickerField
                                    value={recurUntil}
                                    onChange={setRecurUntil}
                                    placeholder="no end"
                                    hideIcon
                                    triggerClassName="h-auto py-0 px-0.5 bg-transparent border-0 shadow-none font-mono text-[13px] text-[rgba(255,255,255,0.7)] hover:text-white hover:bg-transparent focus-visible:ring-0 rounded-none"
                                  />
                                  <span className="font-mono text-[rgba(255,255,255,0.3)] text-sm">
                                    ]
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-2 font-mono text-[12px]">
                        {/* effort row */}
                        <div className="flex items-center gap-0">
                          <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-16 shrink-0">
                            effort:
                          </span>
                          <span className="text-[rgba(255,255,255,0.2)] mr-1">
                            ▸
                          </span>
                          {EFFORT_SIZES.map(({ key }, i) => {
                            const active = effortSize === key;
                            const isDot = key === "·";
                            return (
                              <React.Fragment key={key}>
                                {i > 0 && (
                                  <span className="text-[rgba(255,255,255,0.12)] select-none px-0.5">
                                    │
                                  </span>
                                )}
                                <button
                                  onClick={() =>
                                    setEffortSize(active ? "" : key)
                                  }
                                  className="font-mono text-[13px] tracking-wider transition-colors"
                                  style={{
                                    color: active
                                      ? "#000"
                                      : isDot
                                        ? "rgba(255,255,255,0.2)"
                                        : "rgba(255,255,255,0.55)",
                                  }}
                                >
                                  {active ? (
                                    <span style={{ color: "rgba(0,0,0,0.45)" }}>
                                      [
                                    </span>
                                  ) : null}
                                  <span
                                    className="px-0.5"
                                    style={{
                                      background: active
                                        ? "#fff"
                                        : "transparent",
                                    }}
                                  >
                                    {key}
                                  </span>
                                  {active ? (
                                    <span style={{ color: "rgba(0,0,0,0.45)" }}>
                                      ]
                                    </span>
                                  ) : null}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* when? row */}
                        <div className="flex items-start gap-0">
                          <span className="text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] w-16 shrink-0 pt-0.5">
                            when?:
                          </span>
                          <span className="text-[rgba(255,255,255,0.2)] mr-1 pt-0.5">
                            ▸
                          </span>
                          <div className="flex flex-col gap-0 flex-1">
                            {/* day names + date numbers — single button per column */}
                            <div className="flex items-stretch">
                              {stripDays.map((d, i) => {
                                const isSelected =
                                  !!plannedAt &&
                                  d.toDateString() === plannedAt.toDateString();
                                const isDueDay =
                                  !!dueAt &&
                                  d.toDateString() === dueAt.toDateString();
                                const baseColor = isDueDay
                                  ? "#ff6b35"
                                  : i === 0
                                    ? "rgba(255,255,255,0.6)"
                                    : "rgba(255,255,255,0.28)";
                                return (
                                  <button
                                    key={i}
                                    onClick={() =>
                                      setPlannedAt(isSelected ? null : d)
                                    }
                                    className="font-mono flex-1 text-center py-0.5 transition-colors flex flex-col items-center leading-tight"
                                    style={{
                                      color: isSelected ? "#000" : baseColor,
                                    }}
                                  >
                                    <span
                                      className="text-[11px]"
                                      style={{
                                        background: isSelected
                                          ? "#fff"
                                          : "transparent",
                                        display: "block",
                                        width: "100%",
                                      }}
                                    >
                                      {isSelected ? "[" : " "}
                                      {DAY_LETTERS[d.getDay()]}
                                      {isSelected ? "]" : " "}
                                    </span>
                                    <span
                                      className="text-[13px]"
                                      style={{
                                        background: isSelected
                                          ? "rgba(255,255,255,0.15)"
                                          : "transparent",
                                        color: isSelected ? "#fff" : undefined,
                                        display: "block",
                                        width: "100%",
                                      }}
                                    >
                                      {d.getDate()}
                                    </span>
                                    {isDueDay && !isSelected && (
                                      <span
                                        className="text-[8px] leading-none"
                                        style={{ color: "#ff6b35" }}
                                      >
                                        ▲
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                              <DatePickerField
                                value={
                                  plannedAt &&
                                  !stripDays.some(
                                    (d) =>
                                      d.toDateString() ===
                                      plannedAt!.toDateString(),
                                  )
                                    ? plannedAt
                                    : null
                                }
                                onChange={setPlannedAt}
                                placeholder="+"
                                hideIcon
                                toDate={dueAt ?? undefined}
                                triggerClassName="flex-none w-6 h-auto py-0.5 px-0 bg-transparent border-0 font-mono text-[10px] text-[rgba(255,255,255,0.2)] hover:text-white rounded-none justify-center shadow-none"
                              />
                            </div>
                            {plannedAt && (
                              <span className="text-[10px] text-[rgba(255,255,255,0.25)] mt-1">
                                →{" "}
                                {plannedAt.toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </Block>
                </div>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <div
              className="flex justify-end gap-2 px-5 py-3 shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}
            >
              <button
                onClick={handleClose}
                className="font-mono text-[10px] tracking-[2px] uppercase px-4 py-2 transition-all"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="font-mono text-[10px] tracking-[2px] uppercase px-4 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  border: `1px solid ${activeAccent}`,
                  color: activeAccent,
                }}
              >
                {saving ? "SAVING…" : isEditMode ? "UPDATE" : "SAVE"}
              </button>
            </div>
          </>
        )}
      </TypedDialogContent>
    </Dialog>
  );
}
