import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'pixelarticons/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlannerStore } from '../store/usePlannerStore';
import type { Project } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogContent = DialogContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedDialogTitle = DialogTitle as React.FC<any>;

const VT = "'VT323', monospace";

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

interface ProjectFormProps {
  open: boolean;
  editProject?: Project | null;
  defaultArcId?: string | null;
  onClose: () => void;
}

export default function ProjectForm({ open, editProject, defaultArcId, onClose }: ProjectFormProps) {
  const { arcs, createProject, updateProject } = usePlannerStore();

  const [name, setName]   = useState('');
  const [arcId, setArcId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError]         = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const isEditMode = !!editProject;

  useEffect(() => {
    if (!open) return;
    setIsClosing(false);
    setError('');
    setSaving(false);
    if (editProject) {
      setName(editProject.name);
      setArcId(editProject.arc_id ?? '');
    } else {
      setName('');
      setArcId(defaultArcId ?? '');
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
      if (isEditMode && editProject) {
        await updateProject(editProject.id, {
          name:   name.trim(),
          arc_id: arcId || null,
        });
      } else {
        await createProject({
          name:   name.trim(),
          arc_id: arcId || undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }, [name, arcId, isEditMode, editProject, createProject, updateProject, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
  }, [handleClose, handleSave]);

  const parentArc = arcs.find(a => a.id === arcId);
  const displayColor = parentArc?.color_hex || '#64c8ff';

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
        <TypedDialogTitle className="sr-only">{isEditMode ? 'Edit Project' : 'New Project'}</TypedDialogTitle>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-5" style={{ height: 54, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <GitBranch width={18} height={18} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
          <span style={{ fontFamily: VT, fontSize: 17, letterSpacing: 5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
            {isEditMode ? 'EDIT PROJECT' : 'NEW PROJECT'}
          </span>
        </div>

        <div className="flex flex-col gap-5 p-5 overflow-y-auto">

          {/* IDENTITY block */}
          <Block label="IDENTITY" icon={GitBranch}>
            <div className="flex flex-col gap-3">

              {/* name */}
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1, color: 'rgba(255,255,255,0.65)', width: 52, flexShrink: 0 }}>name:</span>
                <div className="flex items-center flex-1">
                  <span style={{ fontFamily: VT, fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>[</span>
                  <Input
                    autoFocus
                    value={name}
                    onChange={e => { setName(e.target.value); setError(''); }}
                    placeholder="e.g. backend refactor"
                    className="flex-1 rounded-none bg-transparent border-0 text-white focus-visible:ring-0 h-7 px-1 placeholder:text-[rgba(255,255,255,0.2)]"
                    style={{ fontFamily: VT, fontSize: 16 }}
                  />
                  <span style={{ fontFamily: VT, fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>]</span>
                </div>
                {error && <span style={{ fontFamily: VT, fontSize: 12, color: '#ff3b3b', letterSpacing: 1, flexShrink: 0 }}>{error}</span>}
              </div>

              {/* arc */}
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1, color: 'rgba(255,255,255,0.65)', width: 52, flexShrink: 0 }}>arc:</span>
                <div className="flex-1">
                  <Select value={arcId || '__none__'} onValueChange={v => setArcId(v === '__none__' ? '' : v)}>
                    <SelectTrigger
                      className="w-full rounded-none border-[rgba(255,255,255,0.15)] bg-transparent text-white focus:ring-0 focus:ring-offset-0 h-8"
                      style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1 }}
                    >
                      <SelectValue placeholder="none" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none bg-black border-[rgba(255,255,255,0.15)]" style={{ fontFamily: VT }}>
                      <SelectItem value="__none__" style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1 }}>none</SelectItem>
                      {arcs.map(a => (
                        <SelectItem key={a.id} value={a.id} style={{ fontFamily: VT, fontSize: 15, letterSpacing: 1 }}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* preview */}
              <div className="flex items-center gap-2" style={{ marginLeft: 52 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: displayColor, flexShrink: 0 }} />
                <span style={{ fontFamily: VT, fontSize: 13, letterSpacing: 1, color: displayColor }}>{name || 'project name'}</span>
                {arcId && <span style={{ fontFamily: VT, fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>inherits arc color</span>}
              </div>

            </div>
          </Block>

          <span style={{ fontFamily: VT, fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', paddingLeft: 12 }}>
            ctrl+enter to save · esc to cancel
          </span>

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <button
            onClick={handleClose}
            style={{
              fontFamily: VT, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase',
              padding: '6px 18px',
              border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)',
              background: 'transparent', cursor: 'pointer',
            }}
          >CANCEL</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              fontFamily: VT, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase',
              padding: '6px 18px',
              border: `1px solid ${name.trim() ? '#64c8ff' : 'rgba(255,255,255,0.15)'}`,
              color: name.trim() ? '#64c8ff' : 'rgba(255,255,255,0.3)',
              background: 'transparent',
              cursor: name.trim() ? 'pointer' : 'default',
              opacity: saving ? 0.5 : 1,
            }}
          >{saving ? 'SAVING…' : isEditMode ? 'UPDATE' : 'CREATE'}</button>
        </div>

      </TypedDialogContent>
    </Dialog>
  );
}
