import React, { useState, useRef } from 'react';
import './TaskFormDotStage.css';

interface DotStageProps {
  importanceLevel: number;
  effortMinutes: number;
  isEvent: boolean;
  dueAt: Date | null;
}

function getDotColor(importance: number, isEvent: boolean, dueAt: Date | null): string {
  if (isEvent) return '#888888';
  if (!dueAt) return '#7ecfff';
  const daysLeft = (dueAt.getTime() - Date.now()) / 86400000;
  if (daysLeft < 0) return '#ff3b3b'; // overdue
  return (['#7ecfff', '#3dbfbf', '#4ade80', '#f5a623', '#ff6b35'][importance] ?? '#7ecfff');
}

function getDotSize(minutes: number): number {
  if (minutes <= 0) return 32;
  const t = Math.log(Math.max(minutes, 1) / 15) / Math.log(480 / 15);
  return 22 + Math.max(0, Math.min(1, t)) * 30;
}

// Animation speed based on urgency level
function getPulseDuration(importanceLevel: number, isOverdue: boolean): string {
  if (isOverdue)           return '0.9s';
  if (importanceLevel >= 4) return '1.2s';
  if (importanceLevel >= 3) return '1.8s';
  if (importanceLevel >= 2) return '2.4s';
  return '4s';
}

const LEVEL_LABELS = ['seed', 'low', 'schedule', 'delegate', 'urgent'];
const MAX_DRIFT = 36;

function LegendCell({ color, label, active }: { color: string; label: string; active: boolean }) {
  return (
    <div
      style={{
        width: 55,
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        background: active ? color + '22' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 5px',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: active ? 1 : 0.35, flexShrink: 0 }} />
      <span style={{ fontFamily: "'VT323UI', 'HBIOS-SYS', monospace", fontSize: 10, letterSpacing: 1, color: active ? color : 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

export default function TaskFormDotStage({ importanceLevel, effortMinutes, isEvent, dueAt }: DotStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dotColor  = getDotColor(importanceLevel, isEvent, dueAt);
  const dotSize   = getDotSize(effortMinutes);
  const isOverdue = !!dueAt && (dueAt.getTime() - Date.now()) / 86400000 < 0;
  const pulseDur  = getPulseDuration(importanceLevel, isOverdue);

  const effortHours = effortMinutes > 0
    ? (effortMinutes / 60).toFixed(1).replace(/\.0$/, '')
    : '0';

  let stateLabel: string;
  if (isEvent) {
    stateLabel = `EVENT · ${effortHours}h`;
  } else if (!dueAt) {
    stateLabel = 'L0 · seed';
  } else {
    const n = Math.max(0, Math.min(4, importanceLevel));
    stateLabel = `L${n} · ${effortHours}h · ${LEVEL_LABELS[n]}`;
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (e.clientX - cx) * 0.28));
    const dy = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (e.clientY - cy) * 0.28));
    setOffset({ x: dx, y: dy });
  };

  const handleMouseLeave = () => {
    setHovering(false);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      ref={stageRef}
      className="w-[312px] shrink-0 self-stretch flex flex-col items-center justify-center relative cursor-crosshair"
      style={{
        background: 'radial-gradient(circle at center, rgba(255,255,255,0.025) 0%, transparent 60%)',
        borderRight: '1px solid rgba(255,255,255,0.2)',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Crosshair horizontal */}
      <div className="absolute pointer-events-none" style={{ top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.05)', transform: 'translateY(-50%)' }} />
      {/* Crosshair vertical */}
      <div className="absolute pointer-events-none" style={{ left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.05)', transform: 'translateX(-50%)' }} />

      {/* Dot */}
      <div
        className="rounded-full absolute"
        style={{
          width: dotSize,
          height: dotSize,
          background: dotColor,
          // @ts-expect-error CSS custom properties
          '--dot-glow': dotColor,
          '--dot-glow-faint': dotColor + '44',
          '--pulse-dur': pulseDur,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          animation: hovering
            ? 'dot-pulse var(--pulse-dur) ease-in-out infinite'
            : 'dot-pulse var(--pulse-dur) ease-in-out infinite, dot-wiggle 6s ease-in-out infinite',
          transition: hovering
            ? 'width 0.3s ease, height 0.3s ease, background-color 0.3s ease, transform 0.08s ease-out'
            : 'width 0.3s ease, height 0.3s ease, background-color 0.3s ease, transform 0.6s ease-out',
        }}
      />

      {/* State label */}
      <p className="text-[10px] tracking-widest text-[rgba(255,255,255,0.35)] uppercase font-mono absolute bottom-6 pointer-events-none">
        {stateLabel}
      </p>

      {/* 2×2 legend */}
      <div
        className="absolute top-3 right-3 pointer-events-none"
        style={{ display: 'grid', gridTemplateColumns: 'auto 55px 55px', gap: 4, alignItems: 'center' }}
      >
        {/* header row */}
        <div />
        <div />
        <span className="font-mono text-[8px] tracking-widest text-[rgba(255,255,255,0.45)] uppercase text-center">urg</span>
        {/* important row */}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', paddingRight: 4, lineHeight: 1 }}>★</span>
        <LegendCell color="#4ade80" label="L2" active={importanceLevel === 2} />
        <LegendCell color="#ff6b35" label="L4" active={importanceLevel === 4} />
        {/* not important row */}
        <div />
        <LegendCell color="#3dbfbf" label="L1" active={importanceLevel === 1} />
        <LegendCell color="#f5a623" label="L3" active={importanceLevel === 3} />
      </div>
    </div>
  );
}
