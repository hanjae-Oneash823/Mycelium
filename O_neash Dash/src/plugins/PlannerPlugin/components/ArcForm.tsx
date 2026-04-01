import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'pixelarticons/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePlannerStore } from '../store/usePlannerStore';
import type { Arc } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogContent = DialogContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogTitle = DialogTitle as React.FC<any>;

const VT = "'VT323', monospace";

const SWATCH_COLORS = [
  '#00c4a7', '#64c8ff', '#4ade80', '#f5c842',
  '#ff6b35', '#ff3b3b', '#c084fc', '#f472b6',
  '#38bdf8', '#a3e635',
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Block({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <Icon width={15} height={15} style={{ color: '#f5c842', flexShrink: 0 }} />
        <span style={{ fontFamily: VT, fontSize: 15, letterSpacing: 4, textTransform: 'uppercase', color: '#f5c842' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ArcFormProps {
  open: boolean;
  editArc?: Arc | null;
  onClose: () => void;
}

export default function ArcForm({ open, editArc, onClose }: ArcFormProps) {
  const { createArc, updateArc } = usePlannerStore();

  const [name, setName]           = useState('');
  const [color, setColor]         = useState(SWATCH_COLORS[0]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const isEditMode = !!editArc;

  useEffect(() => {
    if (!open) return;
    setIsClosing(false);
    setError('');
    setSaving(false);
    if (editArc) {
      setName(editArc.name);
      setColor(editArc.color_hex);
    } else {
      setName('');
      setColor(SWATCH_COLORS[0]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    onClose();
  }, [isClosing, onClose]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('name is required'); return; }
    setSaving(true);
    try {
      if (isEditMode && editArc) {
        await updateArc(editArc.id, { name: name.trim(), color_hex: color });
      } else {
        await createArc({ name: name.trim(), color_hex: color });
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }, [name, color, isEditMode, editArc, createArc, updateArc, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
  }, [handleClose, handleSave]);

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) handleClose(); }}>
      <TypedDialogContent
        className="max-w-[420px] bg-black border border-[rgba(255,255,255,0.2)] rounded-none p-0 gap-0 flex flex-col overflow-hidden data-[state=closed]:animate-none [&>button]:hidden"
        style={{
          fontFamily: VT,
          ...(isClosing ? { animation: 'planner-form-out 0.17s ease forwards', pointerEvents: 'none' } : {}),
        }}
        onKeyDown={handleKeyDown}
      >
        <TypedDialogTitle className="sr-only">{isEditMode ? 'Edit Arc' : 'New Arc'}</TypedDialogTitle>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center gap-2 px-5"
          style={{ height: 54, borderBottom: '1px solid rgba(255,255,255,0.2)' }}
        >
          <GitBranch width={18} height={18} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
          <span style={{ fontFamily: VT, fontSize: 17, letterSpacing: 5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
            {isEditMode ? 'EDIT ARC' : 'NEW ARC'}
          </span>
        </div>

        {/* ── Fields ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 p-5 overflow-y-auto">

          {/* IDENTITY block */}
          <Block label="IDENTITY" icon={GitBranch}>
            <div className="flex flex-col gap-3">

              {/* name row */}
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1, color: 'rgba(255,255,255,0.65)', width: 52, flexShrink: 0 }}>name:</span>
                <div className="flex items-center flex-1">
                  <span style={{ fontFamily: VT, fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>[</span>
                  <Input
                    autoFocus
                    value={name}
                    onChange={e => { setName(e.target.value); setError(''); }}
                    placeholder="e.g. Q2 product launch"
                    className="flex-1 rounded-none bg-transparent border-0 text-white focus-visible:ring-0 h-7 px-1 placeholder:text-[rgba(255,255,255,0.2)]"
                    style={{ fontFamily: VT, fontSize: 16 }}
                  />
                  <span style={{ fontFamily: VT, fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>]</span>
                </div>
                {error && (
                  <span style={{ fontFamily: VT, fontSize: 12, color: '#ff3b3b', letterSpacing: 1, flexShrink: 0 }}>{error}</span>
                )}
              </div>

              {/* color row */}
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1, color: 'rgba(255,255,255,0.65)', width: 52, flexShrink: 0 }}>color:</span>
                <div className="flex gap-1.5 items-center flex-wrap">
                  {SWATCH_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: 12, height: 12, borderRadius: '50%',
                        backgroundColor: c,
                        outline: color === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2,
                        flexShrink: 0,
                        transition: 'outline 0.1s',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    title="Custom color"
                    style={{ width: 14, height: 14, padding: 0, border: 'none', cursor: 'pointer', background: 'none', flexShrink: 0 }}
                  />
                </div>
              </div>

              {/* live preview */}
              <div className="flex items-center gap-2" style={{ marginLeft: 52 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                <span style={{ fontFamily: VT, fontSize: 14, letterSpacing: 1, color }}>{name || 'arc name'}</span>
              </div>

            </div>
          </Block>

          <span style={{ fontFamily: VT, fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginTop: 2, padding: '0 0.75rem 0.75rem' }}>
            ctrl+enter to save · esc to cancel
          </span>

        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div
          className="flex justify-end gap-2 px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}
        >
          <button
            onClick={handleClose}
            style={{
              fontFamily: VT, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase',
              padding: '6px 18px',
              border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              fontFamily: VT, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase',
              padding: '6px 18px',
              border: `1px solid ${name.trim() ? '#00c4a7' : 'rgba(255,255,255,0.15)'}`,
              color: name.trim() ? '#00c4a7' : 'rgba(255,255,255,0.3)',
              background: 'transparent',
              cursor: name.trim() ? 'pointer' : 'default',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'SAVING…' : isEditMode ? 'UPDATE' : 'CREATE'}
          </button>
        </div>

      </TypedDialogContent>
    </Dialog>
  );
}
