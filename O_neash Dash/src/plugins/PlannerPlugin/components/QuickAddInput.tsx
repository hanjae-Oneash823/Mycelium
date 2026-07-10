import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, type Variants, useAnimationControls } from "framer-motion";
import { usePlannerStore } from "../store/usePlannerStore";
import { useArcVisibilityStore } from "../../../store/useArcVisibilityStore";

const BADGE_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.6, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 460, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    y: -8,
    transition: { duration: 0.15, ease: "easeIn" as const },
  },
};

const QA_PLACEHOLDER = "enter quick task".split("");
const QA_STAGGER = 0.045;
const QA_CHAR_DUR = 0.22;
const QA_STAGGER_TOTAL = QA_PLACEHOLDER.length * QA_STAGGER + QA_CHAR_DUR + 0.05;

function QAPlaceholder({ visible }: { visible: boolean }) {
  const [waving, setWaving] = useState(false);
  useEffect(() => {
    if (!visible) {
      setWaving(false);
      return;
    }
    const t = setTimeout(() => setWaving(true), QA_STAGGER_TOTAL * 1000);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            pointerEvents: "none",
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: "1rem",
            letterSpacing: 1,
          }}
        >
          {QA_PLACEHOLDER.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={
                waving
                  ? {
                      y: [0, -3, 0],
                      opacity: ch === " " ? 0 : [0.5, 0.8, 0.5],
                    }
                  : {
                      opacity: ch === " " ? 0 : 0.55,
                      y: 0,
                    }
              }
              transition={
                waving
                  ? {
                      y: {
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.09,
                        repeatDelay: 2,
                      },
                      opacity: {
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.09,
                        repeatDelay: 2,
                      },
                    }
                  : {
                      delay: i * QA_STAGGER,
                      duration: QA_CHAR_DUR,
                      ease: "easeOut",
                    }
              }
              style={{ display: "inline-block", color: "rgba(255,255,255,0.55)" }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function QuickAddInput({
  onCommit,
}: {
  onCommit: (
    title: string,
    arcId?: string,
    projectId?: string,
    groupIds?: string[],
  ) => Promise<void>;
}) {
  const { arcs: allArcs, projects: allProjects, groups } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore((s) => s.hiddenArcIds);
  const arcs = allArcs.filter((a) => !hiddenArcIds.includes(a.id) && (!a.status || a.status === 'active'));
  const projects = allProjects.filter((p) => !p.status || p.status === 'active');
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [launchItem, setLaunchItem] = useState<{ text: string; x: number; y: number } | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [badgePos, setBadgePos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropListRef = useRef<HTMLDivElement>(null);
  const squishCtrl = useAnimationControls();

  useEffect(() => {
    if (!dropListRef.current) return;
    const item = dropListRef.current.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const slug = (s: string) => s.replace(/\s+/g, "_");

  const allOptions = useMemo(() => {
    const opts: { id: string; label: string; display: string; color: string; type: "arc" | "project" | "group" }[] = [];
    arcs.forEach((a) =>
      opts.push({ id: a.id, label: `arc-${slug(a.name)}`, display: a.name, color: a.color_hex, type: "arc" }),
    );
    if (selectedArcId) {
      projects
        .filter((p) => p.arc_id === selectedArcId)
        .forEach((p) =>
          opts.push({ id: p.id, label: `project-${slug(p.name)}`, display: p.name, color: "rgba(255,255,255,0.75)", type: "project" }),
        );
    }
    groups
      .filter((g) => !g.is_ungrouped)
      .forEach((g) =>
        opts.push({ id: g.id, label: `group-${slug(g.name)}`, display: g.name, color: g.color_hex, type: "group" }),
      );
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs, projects, groups, selectedArcId]);

  const filteredOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [mentionQuery, allOptions]);

  useEffect(() => {
    if (mentionQuery !== null && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropPos(null);
    }
  }, [mentionQuery]);

  useEffect(() => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setBadgePos({ top: rect.top, left: rect.left, width: rect.width });
  }, [selectedArcId, selectedProjectId, selectedGroupIds]);

  useEffect(() => {
    const update = () => {
      if (!boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      setBadgePos({ top: rect.top, left: rect.left, width: rect.width });
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function detectMention(v: string, cursor: number) {
    const before = v.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(" ")) {
        setMentionQuery(query);
        setActiveIdx(0);
        return;
      }
    }
    setMentionQuery(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    setPulseKey((k) => k + 1);
    detectMention(v, e.target.selectionStart ?? v.length);
  }

  function selectOption(opt: (typeof allOptions)[0]) {
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    const newVal = (before.slice(0, atIdx) + after).trimStart();
    setValue(newVal);

    if (opt.type === "arc") {
      setSelectedArcId(opt.id);
      setSelectedProjectId(null);
    } else if (opt.type === "project") {
      setSelectedProjectId(opt.id);
    } else {
      setSelectedGroupIds((ids) =>
        ids.includes(opt.id) ? ids.filter((id) => id !== opt.id) : [...ids, opt.id],
      );
    }

    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleCommit() {
    const title = value.trim();
    if (!title) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const lx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const ly = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    squishCtrl.start({
      scaleY: [1, 0.78, 1.07, 1],
      scaleX: [1, 1.05, 0.97, 1],
      transition: { duration: 0.42, times: [0, 0.28, 0.65, 1], ease: "easeOut" },
    });
    setLaunchItem({ text: title, x: lx, y: ly });
    setValue("");
    setSelectedArcId(null);
    setSelectedProjectId(null);
    setSelectedGroupIds([]);
    await onCommit(
      title,
      selectedArcId ?? undefined,
      selectedProjectId ?? undefined,
      selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    );
  }

  return (
    <div style={{ width: "100%", fontFamily: "'VT323', 'HBIOS-SYS', monospace" }}>
      {launchItem &&
        createPortal(
          <motion.div
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={{ opacity: 0, scale: 0.55, y: -200 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setLaunchItem(null)}
            style={{
              position: "fixed",
              left: launchItem.x,
              top: launchItem.y,
              translateX: "-50%",
              translateY: "-50%",
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: "1.1rem",
              letterSpacing: 1,
              color: "#00c4a7",
              textShadow: "0 0 18px rgba(0,196,167,0.7)",
              pointerEvents: "none",
              zIndex: 9999,
              whiteSpace: "nowrap",
            }}
          >
            {launchItem.text}
          </motion.div>,
          document.body,
        )}

      <motion.div ref={boxRef} animate={squishCtrl} style={{ width: "100%" }}>
        <motion.div
          animate={{
            borderColor: focused ? "rgba(0,196,167,0.55)" : "rgba(255,255,255,0.18)",
            backgroundColor: focused ? "rgba(0,12,10,0.96)" : "rgba(0,0,0,0.88)",
          }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: "flex",
            alignItems: "stretch",
            border: "1px solid rgba(255,255,255,0.18)",
            overflow: "hidden",
            width: "100%",
            position: "relative",
          }}
        >
          <AnimatePresence>
            <motion.div
              key={pulseKey}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: -1,
                border: "2px solid rgba(0,196,167,1)",
                boxShadow: "0 0 14px rgba(0,196,167,0.5), inset 0 0 10px rgba(0,196,167,0.12)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          </AnimatePresence>

          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <QAPlaceholder visible={!focused && !value} />
            <input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (mentionQuery !== null && filteredOptions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, filteredOptions.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    selectOption(filteredOptions[activeIdx]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCommit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setValue("");
                }
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setTimeout(() => {
                  setMentionQuery(null);
                  setSelectedArcId(null);
                  setSelectedProjectId(null);
                  setSelectedGroupIds([]);
                }, 150);
              }}
              placeholder=""
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.82)",
                fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                fontSize: "1rem",
                padding: "6px 10px",
                letterSpacing: 1,
                outline: "none",
                width: "100%",
              }}
            />
            {dropPos &&
              filteredOptions.length > 0 &&
              createPortal(
                <div
                  ref={dropListRef}
                  className="quick-add-dropdown"
                  style={{
                    position: "fixed",
                    top: dropPos.top,
                    left: dropPos.left,
                    width: dropPos.width,
                    background: "#0d0d0d",
                    border: "1px solid rgba(255,255,255,0.18)",
                    zIndex: 99999,
                    fontFamily: "'VT323','HBIOS-SYS',monospace",
                    fontSize: "1rem",
                    letterSpacing: "1px",
                    maxHeight: Math.min(220, window.innerHeight - dropPos.top - 8),
                    overflowY: "auto",
                  }}
                >
                  {filteredOptions.map((opt, i) => {
                    const isGroupSelected = opt.type === "group" && selectedGroupIds.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectOption(opt);
                        }}
                        style={{
                          padding: "5px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: i === activeIdx ? "rgba(255,255,255,0.07)" : "transparent",
                          color:
                            i === activeIdx ? "#fff" : isGroupSelected ? "var(--teal)" : "rgba(255,255,255,0.55)",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{ width: 7, height: 7, background: opt.color, flexShrink: 0, display: "inline-block" }}
                        />
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem", marginRight: 2 }}>
                          {opt.type}
                        </span>
                        {opt.display}
                        {isGroupSelected && (
                          <span style={{ marginLeft: "auto", color: "var(--teal)", fontSize: "0.8rem" }}>✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>,
                document.documentElement,
              )}
          </div>

          <button
            onClick={handleCommit}
            style={{
              background: "none",
              border: "none",
              borderLeft: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.35)",
              padding: "0 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#fff")}
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)")
            }
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: "flex", alignItems: "center" }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
              </svg>
            </motion.div>
          </button>
        </motion.div>
      </motion.div>

      {/* Floating badges — portaled above the input box */}
      {badgePos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: badgePos.top - 10,
              left: badgePos.left,
              width: badgePos.width,
              transform: "translateY(-100%)",
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              zIndex: 99999,
              pointerEvents: "auto",
            }}
          >
            <AnimatePresence mode="popLayout">
              {selectedArcId &&
                (() => {
                  const arc = arcs.find((a) => a.id === selectedArcId);
                  return arc ? (
                    <motion.span
                      key={arc.id}
                      layout
                      variants={BADGE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{ display: "inline-flex" }}
                    >
                      <motion.span
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                        className="badge-idle-pulse"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedArcId(null);
                          setSelectedProjectId(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          background: arc.color_hex,
                          border: `1px solid ${arc.color_hex}`,
                          color: "#000",
                          fontFamily: "'VT323','HBIOS-SYS',monospace",
                          fontSize: "0.85rem",
                          letterSpacing: "1px",
                          cursor: "pointer",
                        }}
                      >
                        arc · {arc.name}
                      </motion.span>
                    </motion.span>
                  ) : null;
                })()}
              {selectedProjectId &&
                (() => {
                  const proj = projects.find((p) => p.id === selectedProjectId);
                  return proj ? (
                    <motion.span
                      key={proj.id}
                      layout
                      variants={BADGE_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{ display: "inline-flex" }}
                    >
                      <motion.span
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                        className="badge-idle-pulse"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedProjectId(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          background: "#b0b0a8",
                          border: "1px solid #b0b0a8",
                          color: "#000",
                          fontFamily: "'VT323','HBIOS-SYS',monospace",
                          fontSize: "0.85rem",
                          letterSpacing: "1px",
                          cursor: "pointer",
                        }}
                      >
                        project · {proj.name}
                      </motion.span>
                    </motion.span>
                  ) : null;
                })()}
              {selectedGroupIds.map((gid, gi) => {
                const grp = groups.find((g) => g.id === gid);
                return grp ? (
                  <motion.span
                    key={gid}
                    layout
                    variants={BADGE_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ display: "inline-flex" }}
                  >
                    <motion.span
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 2.4 + gi * 0.28, repeat: Infinity, ease: "easeInOut", delay: gi * 0.45 }}
                      className="badge-idle-pulse"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedGroupIds((ids) => ids.filter((id) => id !== gid));
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        background: grp.color_hex,
                        border: `1px solid ${grp.color_hex}`,
                        color: "#000",
                        fontFamily: "'VT323','HBIOS-SYS',monospace",
                        fontSize: "0.85rem",
                        letterSpacing: "1px",
                        cursor: "pointer",
                      }}
                    >
                      group · {grp.name}
                    </motion.span>
                  </motion.span>
                ) : null;
              })}
            </AnimatePresence>
          </div>,
          document.documentElement,
        )}
    </div>
  );
}
