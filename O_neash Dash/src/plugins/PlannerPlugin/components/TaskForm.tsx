import React, { useState, useEffect, useCallback } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import type { CreateNodeData, UserImportance } from '../types';

const SWATCH_COLORS = [
  '#64c8ff', '#3dbfbf', '#4ade80', '#f5a623', '#ff6b35',
  '#c084fc', '#f5c842', '#ff3b3b', '#888888', '#00c4a7',
];

function parseEffortMinutes(str: string): number {
  const s = str.toLowerCase().trim();
  const num = parseFloat(s);
  if (isNaN(num)) return 60;
  if (s.includes('h')) return Math.round(num * 60);
  return Math.round(num);
}

export default function TaskForm() {
  const { groups, createNode, createGroup } = usePlannerStore();
  const { taskFormDefaults, closeTaskForm } = useViewStore();

  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [when, setWhen]           = useState('');
  const [effort, setEffort]       = useState('');
  const [importance, setImp]      = useState<UserImportance>(0);
  const [selectedGroups, setSG]   = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Inline group creator state
  const [showNewGroup, setShowNewGroup]   = useState(false);
  const [newGroupName, setNewGroupName]   = useState('');
  const [newGroupColor, setNewGroupColor] = useState(SWATCH_COLORS[0]);

  // Apply defaults from openTaskForm(defaults)
  useEffect(() => {
    if (taskFormDefaults.planned_start_at) setWhen(taskFormDefaults.planned_start_at);
    if (taskFormDefaults.importance_level !== undefined) setImp(taskFormDefaults.importance_level as UserImportance);
  }, [taskFormDefaults]);

  const toggleGroup = (id: string) => {
    setSG(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('title is required'); return; }
    setSaving(true);
    try {
      const data: CreateNodeData = {
        title: title.trim(),
        description: description.trim() || undefined,
        planned_start_at: when || undefined,
        due_at: when || undefined,
        estimated_duration_minutes: effort ? parseEffortMinutes(effort) : undefined,
        importance_level: importance,
        group_ids: selectedGroups.length > 0 ? selectedGroups : undefined,
      };
      await createNode(data);
      closeTaskForm();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeTaskForm();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, when, effort, importance, selectedGroups]);

  const handleNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const id = await createGroup({ name: newGroupName.trim(), color_hex: newGroupColor });
    setSG(prev => [...prev, id]);
    setNewGroupName('');
    setNewGroupColor(SWATCH_COLORS[0]);
    setShowNewGroup(false);
  };

  const realGroups = groups.filter(g => !g.is_ungrouped);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.97)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Scanline overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)', pointerEvents: 'none' }} />

      <div style={{
        background: '#050505',
        border: '1px solid rgba(255,255,255,0.18)',
        width: 520, maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
        position: 'relative',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '1.1rem', letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>new task</span>
          <button onClick={closeTaskForm} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

          {/* Title */}
          <div>
            <label style={labelStyle}>title *</label>
            <input
              autoFocus
              value={title}
              onChange={e => { setTitle(e.target.value); setError(''); }}
              placeholder="what needs to be done?"
              style={inputStyle}
            />
            {error && <div style={{ fontSize: '0.85rem', color: '#ff3b3b', marginTop: '0.25rem', letterSpacing: '1px' }}>{error}</div>}
          </div>

          {/* Importance */}
          <div>
            <label style={labelStyle}>importance</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
              {([0, 1] as UserImportance[]).map(lvl => {
                const active = importance === lvl;
                const label  = lvl === 0 ? 'normal' : 'important';
                const color  = lvl === 0 ? 'rgba(255,255,255,0.5)' : '#f5a623';
                return (
                  <button
                    key={lvl}
                    onClick={() => setImp(lvl)}
                    style={{
                      background: active ? (lvl === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(245,166,35,0.1)') : 'transparent',
                      border: `1px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
                      color: active ? color : 'rgba(255,255,255,0.35)',
                      padding: '0.3rem 1.1rem',
                      fontSize: '1rem',
                      letterSpacing: '2px',
                      textTransform: 'lowercase',
                      cursor: 'pointer',
                      fontFamily: "'VT323', monospace",
                      transition: 'all 0.12s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Groups */}
          <div>
            <label style={labelStyle}>groups</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
              {realGroups.map(g => {
                const sel = selectedGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      background: sel ? g.color_hex + '22' : 'transparent',
                      border: `1px solid ${sel ? g.color_hex : 'rgba(255,255,255,0.2)'}`,
                      color: sel ? g.color_hex : 'rgba(255,255,255,0.5)',
                      padding: '0.15rem 0.7rem',
                      fontSize: '0.9rem',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      fontFamily: "'VT323', monospace",
                      transition: 'all 0.13s',
                    }}
                  >
                    {g.name}
                  </button>
                );
              })}
              {/* New group chip */}
              <button
                onClick={() => setShowNewGroup(!showNewGroup)}
                style={{
                  background: 'transparent',
                  border: '1px dashed rgba(255,255,255,0.25)',
                  color: 'rgba(255,255,255,0.35)',
                  padding: '0.15rem 0.7rem',
                  fontSize: '0.9rem',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  fontFamily: "'VT323', monospace",
                }}
              >
                + group
              </button>
            </div>

            {/* Inline new group creator */}
            {showNewGroup && (
              <div style={{ marginTop: '0.7rem', padding: '0.8rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="group name"
                  style={{ ...inputStyle, marginBottom: '0.6rem', fontSize: '0.95rem' }}
                  onKeyDown={e => { if (e.key === 'Enter') handleNewGroup(); if (e.key === 'Escape') setShowNewGroup(false); }}
                />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  {SWATCH_COLORS.map(c => (
                    <button
                      key={c}
                      className="dot"
                      onClick={() => setNewGroupColor(c)}
                      style={{
                        width: 20, height: 20, backgroundColor: c, cursor: 'pointer', padding: 0,
                        border: newGroupColor === c ? '2px solid #fff' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleNewGroup} style={{ background: 'transparent', border: '1px solid #4ade80', color: '#4ade80', padding: '0.2rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: "'VT323', monospace", letterSpacing: '1px' }}>save</button>
                  <button onClick={() => setShowNewGroup(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)', padding: '0.2rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: "'VT323', monospace", letterSpacing: '1px' }}>cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* When */}
          <div>
            <label style={labelStyle}>when (optional)</label>
            <input
              type="date"
              value={when}
              onChange={e => setWhen(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>

          {/* Effort */}
          <div>
            <label style={labelStyle}>effort (e.g. "30 min", "2hr")</label>
            <input
              value={effort}
              onChange={e => setEffort(e.target.value)}
              placeholder="leave blank for ~1hr"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="notes, context, [[link to a note]]..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5' }}
            />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.9rem' }}>
            <button onClick={closeTaskForm} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', padding: '0.4rem 1.2rem', fontSize: '1.05rem', letterSpacing: '2px', cursor: 'pointer', fontFamily: "'VT323', monospace", textTransform: 'lowercase' }}>
              cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'transparent', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '0.4rem 1.4rem', fontSize: '1.05rem', letterSpacing: '2px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'VT323', monospace", textTransform: 'lowercase', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'saving…' : 'save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem', letterSpacing: '3px', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
  fontSize: '1.05rem', padding: '0.55rem 0.75rem',
  fontFamily: "'VT323', 'IBM Plex Mono', monospace",
  letterSpacing: '0.5px', outline: 'none',
};
