import React, { useState, useEffect } from 'react';
import DatePickerField from './DatePickerField';
import HoursInput from './HoursInput';

export interface QuickFieldsProps {
  dueAt: Date | null;
  setDueAt: (d: Date | null) => void;
  plannedAt: Date | null;
  setPlannedAt: (d: Date | null) => void;
  effortHours: number;
  setEffortHours: (v: number) => void;
}

type WhenMode = '-3d' | '-2d' | '-1d' | 'same' | 'custom' | null;

const WHEN_BTNS: { mode: WhenMode; label: string }[] = [
  { mode: '-3d',   label: '-3d' },
  { mode: '-2d',   label: '-2d' },
  { mode: '-1d',   label: '-1d' },
  { mode: 'same',  label: 'on the day' },
  { mode: 'custom', label: 'custom' },
];

function applyOffset(due: Date, mode: WhenMode): Date | null {
  if (!mode || mode === 'custom') return null;
  const d = new Date(due);
  if (mode === '-3d') d.setDate(d.getDate() - 3);
  else if (mode === '-2d') d.setDate(d.getDate() - 2);
  else if (mode === '-1d') d.setDate(d.getDate() - 1);
  // 'same' stays as-is
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[10px] tracking-[2px] uppercase text-[rgba(255,255,255,0.35)] mb-1">
    {children}
  </p>
);

export default function QuickFields({
  dueAt, setDueAt,
  plannedAt, setPlannedAt,
  effortHours, setEffortHours,
}: QuickFieldsProps) {
  const [whenMode, setWhenMode] = useState<WhenMode>(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const isPast = (result: Date | null) => result !== null && result < today;

  // Recalculate plannedAt whenever dueAt changes and a relative mode is active
  useEffect(() => {
    if (whenMode && whenMode !== 'custom' && dueAt) {
      const result = applyOffset(dueAt, whenMode);
      if (isPast(result)) {
        setWhenMode(null);
        setPlannedAt(null);
      } else {
        setPlannedAt(result);
      }
    } else if (whenMode && whenMode !== 'custom' && !dueAt) {
      setPlannedAt(null);
    }
  }, [dueAt, whenMode]);

  const handleWhenMode = (mode: WhenMode) => {
    setWhenMode(mode);
    if (mode === 'custom') return;
    if (mode === null) { setPlannedAt(null); return; }
    if (dueAt) setPlannedAt(applyOffset(dueAt, mode));
    else setPlannedAt(null);
  };

  const hasRelative = whenMode && whenMode !== 'custom';
  const disabled = (mode: WhenMode) => {
    if (mode === 'custom') return false;
    if (!dueAt) return true;
    return isPast(applyOffset(dueAt, mode));
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <FieldLabel>DUE DATE</FieldLabel>
        <DatePickerField value={dueAt} onChange={setDueAt} placeholder="no due date" />
      </div>

      <HoursInput value={effortHours} onChange={setEffortHours} />

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] tracking-[2px] uppercase text-[rgba(255,255,255,0.35)]">WHEN TO DO IT?</p>
          {plannedAt && hasRelative && (
            <span className="font-mono text-[10px] tracking-[1px] text-[#f5c842]">→ {fmtDate(plannedAt)}</span>
          )}
        </div>

        {/* Button row */}
        <div className="flex gap-1 flex-wrap mt-1">
          {WHEN_BTNS.map(({ mode, label }) => {
            const active  = whenMode === mode;
            const isDisabled = disabled(mode);
            return (
              <button
                key={mode}
                onClick={() => !isDisabled && handleWhenMode(active ? null : mode)}
                disabled={isDisabled}
                className="font-mono text-[10px] tracking-[2px] uppercase px-2 py-1 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                style={{
                  background: active ? 'rgba(0,196,167,0.12)' : 'transparent',
                  border: `1px solid ${active ? '#00c4a7' : 'rgba(255,255,255,0.2)'}`,
                  color: active ? '#00c4a7' : 'rgba(255,255,255,0.45)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Custom calendar */}
        {whenMode === 'custom' && (
          <div className="mt-2">
            <DatePickerField value={plannedAt} onChange={setPlannedAt} placeholder="pick a date" />
          </div>
        )}

        {!dueAt && whenMode && whenMode !== 'custom' && (
          <p className="font-mono text-[10px] text-[rgba(255,255,255,0.25)] mt-1 tracking-wide">
            set a due date first
          </p>
        )}
      </div>
    </div>
  );
}
