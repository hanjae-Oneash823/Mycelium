import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { Slider as SliderBase } from '@/components/ui/slider';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Slider = SliderBase as React.FC<any>;

interface HoursInputProps {
  value: number;      // in hours (0–6)
  onChange: (v: number) => void;
  label?: string;
}

function formatLabel(hours: number): string {
  if (hours === 0) return '—';
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins}m`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function HoursInput({ value, onChange, label = 'EFFORT' }: HoursInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-[rgba(255,255,255,0.35)]">
          {label}
        </span>
        <span className="font-mono text-sm text-[rgba(255,255,255,0.7)]">
          {formatLabel(value)}
        </span>
      </div>
      <Slider
        min={0}
        max={6}
        step={0.25}
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        className="[&>span:first-child]:rounded-none [&>span:first-child]:h-[2px] [&>span:first-child]:bg-[rgba(255,255,255,0.12)] [&_[role=slider]]:rounded-none [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-[#00c4a7] [&_[role=slider]]:border-0 [&_[role=slider]]:shadow-none [&>span:first-child>span]:rounded-none [&>span:first-child>span]:bg-[#00c4a7]"
      />
      <div className="flex justify-between font-mono text-[11px] text-[rgba(255,255,255,0.25)] tracking-wide pointer-events-none">
        <span>0</span><span>1h</span><span>2h</span><span>3h</span><span>4h</span><span>5h</span><span>6h</span>
      </div>
    </div>
  );
}
