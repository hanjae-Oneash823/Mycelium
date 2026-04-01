import { useState, useMemo } from 'react';
import { Reload, Calendar, Contact, TeachSharp, Fire, PartyPopper } from 'pixelarticons/react';
import { generateOccurrenceDates } from '../lib/recurrence';
import { cancelException } from '../lib/routineDb';
import { usePlannerStore } from '../store/usePlannerStore';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Routine, RecurrenceRule, RoutineRule, ManualOccInput } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TS = SelectTrigger as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TC = SelectContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TI = SelectItem   as React.FC<any>;

// ── exported save shape ───────────────────────────────────────────────────────
// rules array contains both recurring rules (with their exceptions arrays)
// and manual rules (freq='manual', one node per rule)
export type RoutineFormData = Omit<Routine, 'id' | 'created_at' | 'updated_at'> & {
  group_ids?: string[];
};

interface Props {
  initial?:            Routine | null;
  onSave:              (data: RoutineFormData) => void;
  onCancel:            () => void;
  onRemoveManualOcc?:  (date: string) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const gid  = () => Math.random().toString(36).slice(2, 10);
const toDS = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addM = (d: Date, n: number) => {
  const r = new Date(d); r.setMonth(r.getMonth() + n); r.setDate(1); return r;
};
function normalizeTime(t: string): string {
  if (t.includes(':')) return t;
  if (t.length === 4) return `${t.slice(0,2)}:${t.slice(2)}`;
  if (t.length === 3) return `0${t.slice(0,1)}:${t.slice(1)}`;
  return t;
}
function addMins(time: string, mins: number): string {
  const norm = normalizeTime(time);
  const [h, m] = norm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return norm;
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
const vm: React.CSSProperties = { fontFamily: "'VT323UI','HBIOS-SYS',monospace" };
const SWATCH_COLORS = [
  '#64c8ff','#3dbfbf','#4ade80','#f5a623','#ff6b35',
  '#c084fc','#f5c842','#ff3b3b','#888888','#00c4a7',
];

function defaultRule(): RoutineRule {
  return { id: gid(), start_date: toDS(new Date()), end_mode: 'count', end_count: 52,
    freq: 'weekly', repeat_interval: 1, days: [new Date().getDay()] };
}
// genRuleDatesRaw: all dates a rule generates, ignoring its own exceptions
function genRuleDatesRaw(rule: RoutineRule): string[] {
  if (rule.freq === 'manual') return [rule.start_date];
  const rec: RecurrenceRule = { freq: rule.freq, interval: rule.repeat_interval,
    days: rule.days ?? undefined, until: rule.end_mode === 'date' ? rule.end_date ?? undefined : undefined };
  const dates = generateOccurrenceDates(rec, rule.start_date);
  return rule.end_mode === 'count' && rule.end_count ? dates.slice(0, rule.end_count) : dates;
}
// genRuleDates: dates excluding the rule's own stored exceptions
function genRuleDates(rule: RoutineRule): string[] {
  const all = genRuleDatesRaw(rule);
  const exc = new Set(rule.exceptions ?? []);
  return exc.size > 0 ? all.filter(d => !exc.has(d)) : all;
}
function ruleLabel(r: RoutineRule): string {
  if (r.freq === 'manual') {
    const t = r.start_time ? ` · ${r.start_time}` : '';
    const exc = r.exceptions?.length ? ` (${r.exceptions.length} exception${r.exceptions.length>1?'s':''})` : '';
    return `manual · ${r.start_date}${t}${exc}`;
  }
  const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const f = r.freq === 'daily' ? (r.repeat_interval===1?'every day':`every ${r.repeat_interval} days`)
          : r.freq === 'monthly' ? (r.repeat_interval===1?'every month':`every ${r.repeat_interval} months`)
          : r.days?.length ? `every ${r.days.map(d=>DW[d]).join(', ')}`
          : r.repeat_interval===1 ? 'every week' : `every ${r.repeat_interval} weeks`;
  const e = r.end_mode==='date' && r.end_date ? `until ${r.end_date}` : `${r.end_count??'?'} times`;
  const exc = r.exceptions?.length ? ` · ${r.exceptions.length} exception${r.exceptions.length>1?'s':''}` : '';
  const t = r.start_time ? ` · ${normalizeTime(r.start_time)}` : '';
  return `${f} · ${e}${exc}${t}`;
}

const MFull = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DH    = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const DL    = ['S','M','T','W','T','F','S'];

// ── Step 1 — Type picker ──────────────────────────────────────────────────────
function TypePicker({ onSelect }: { onSelect: (t: 'task'|'event') => void }) {
  const [hov, setHov] = useState<string|null>(null);
  const opts = [
    { k:'task'  as const, label:'TASK',  desc:'flexible · recurring work',
      accent:'#00c4a7', bg:'rgba(0,196,167,0.1)',   Icon:Fire       },
    { k:'event' as const, label:'EVENT', desc:'scheduled at a specific time',
      accent:'#c084fc', bg:'rgba(192,132,252,0.1)', Icon:PartyPopper },
  ];
  return (
    <div style={{ position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.75)' }}>
      <div style={{ background:'#080808',border:'1px solid rgba(255,255,255,0.1)',padding:'28px 32px',width:440,...vm,color:'#fff' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:24 }}>
          <Reload size={18} style={{ color:'var(--teal)' }} />
          <span style={{ fontSize:'1.6rem',letterSpacing:3,color:'var(--teal)' }}>ADD NEW ROUTINE</span>
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          {opts.map(o=>(
            <button key={o.k} onClick={()=>onSelect(o.k)}
              onMouseEnter={()=>setHov(o.k)} onMouseLeave={()=>setHov(null)}
              style={{ display:'flex',alignItems:'center',gap:'1.25rem',padding:'1rem 1.25rem',cursor:'pointer',
                border:`1px solid ${hov===o.k?o.accent:'rgba(255,255,255,0.1)'}`,
                background:hov===o.k?o.bg:'transparent',transition:'border-color 0.12s,background 0.12s' }}>
              <o.Icon size={20} style={{ color:o.accent,flexShrink:0 }} />
              <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2 }}>
                <span style={{ ...vm,fontSize:'1.5rem',letterSpacing:'3px',
                  color:hov===o.k?'#fff':'rgba(255,255,255,0.85)',textTransform:'uppercase' }}>{o.label}</span>
                <span style={{ ...vm,fontSize:'0.85rem',letterSpacing:'1.5px',
                  color:hov===o.k?o.accent:'rgba(255,255,255,0.3)' }}>{o.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Calendar widget ───────────────────────────────────────────────────────────
function RoutineCalendar({ month, setMonth, fixed, manual, exceptions, onToggle }: {
  month: Date; setMonth:(d:Date)=>void;
  fixed: Set<string>; manual: Set<string>; exceptions: Set<string>;
  onToggle:(date:string,isFixed:boolean,isManual:boolean)=>void;
}) {
  const y = month.getFullYear(); const m = month.getMonth();
  const firstDow = new Date(y,m,1).getDay();
  const dim = new Date(y,m+1,0).getDate();
  const today = toDS(new Date());
  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6 }}>
        <button onClick={()=>setMonth(addM(month,-1))} style={{ ...vm,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)',fontSize:'1rem',padding:0 }}>◀</button>
        <span style={{ ...vm,fontSize:'0.95rem',color:'rgba(255,255,255,0.7)' }}>{MFull[m]} {y}</span>
        <button onClick={()=>setMonth(addM(month,1))}  style={{ ...vm,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)',fontSize:'1rem',padding:0 }}>▶</button>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'1px' }}>
        {DH.map(d=><div key={d} style={{ ...vm,textAlign:'center',fontSize:'0.72rem',color:'rgba(255,255,255,0.3)',paddingBottom:3 }}>{d}</div>)}
        {Array.from({length:firstDow},(_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:dim},(_,i)=>{
          const day=i+1;
          const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isF=fixed.has(ds); const isM=manual.has(ds); const isE=exceptions.has(ds);
          return (
            <div key={ds}
              onClick={()=>(isF||isM)&&onToggle(ds,isF,isM)}
              title={(isF||isM)?'click to remove':undefined}
              style={{ textAlign:'center',padding:'2px 0',cursor:(isF||isM)?'pointer':'default',
                background:isM?'#3a6fa8':isF?'rgba(255,255,255,0.8)':'transparent',
                color:isM?'#fff':isF?'#000':isE?'rgba(255,255,255,0.18)':ds===today?'var(--teal)':'rgba(255,255,255,0.55)',
                ...vm,fontSize:'0.82rem' }}
            >{day}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── Occurrences list ──────────────────────────────────────────────────────────
function OccList({ occs, isEvent, onRm }: {
  occs:{date:string;time?:string;duration_minutes?:number;isManual:boolean}[]; isEvent:boolean;
  onRm:(date:string,isManual:boolean)=>void;
}) {
  return (
    <div style={{ flex:1,minHeight:0,overflowY:'auto' }} className="checklist-scroll">
      {occs.length===0&&<div style={{ ...vm,color:'rgba(255,255,255,0.2)',fontSize:'0.82rem' }}>no occurrences yet</div>}
      {occs.map((o,i)=>{
        const t = o.time ? normalizeTime(o.time) : undefined;
        const timeLabel = isEvent && t
          ? (o.duration_minutes ? ` · ${t}~${addMins(t, o.duration_minutes)}` : ` · ${t}`)
          : '';
        return (
          <div key={`${o.date}${i}`} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1px 0',borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ ...vm,fontSize:'0.82rem',color:o.isManual?'#64c8ff':'rgba(255,255,255,0.7)' }}>
              {o.date}{timeLabel}
            </span>
            <button onClick={()=>onRm(o.date,o.isManual)} style={{ ...vm,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.2)',fontSize:'0.78rem',padding:'0 2px',lineHeight:1 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Inline rule editor ────────────────────────────────────────────────────────
function RuleEditor({ rule, isEvent, onChange }: {
  rule:RoutineRule; isEvent:boolean; onChange:(r:RoutineRule)=>void;
}) {
  const s = (p:Partial<RoutineRule>)=>onChange({...rule,...p});
  const inp: React.CSSProperties = { ...vm,background:'transparent',border:'1px solid rgba(255,255,255,0.15)',
    color:'#fff',fontSize:'0.82rem',outline:'none',padding:'1px 4px',colorScheme:'dark' };
  const rowL: React.CSSProperties = { ...vm,fontSize:'0.78rem',color:'rgba(255,255,255,0.32)',width:62,flexShrink:0 };
  const row: React.CSSProperties = { display:'flex',alignItems:'center',gap:6,marginBottom:5,flexWrap:'wrap' };
  const tabBtn=(label:string,active:boolean,onClick:()=>void)=>(
    <button onClick={onClick} style={{ ...vm,background:'none',border:'none',cursor:'pointer',padding:0,fontSize:'0.82rem',
      color:active?'#fff':'rgba(255,255,255,0.28)',textDecoration:active?'underline':'none' }}>{label}</button>
  );
  return (
    <div style={{ padding:'6px 0 6px 10px',borderLeft:'2px solid rgba(255,255,255,0.1)',marginTop:3 }}>
      {/* Start date */}
      <div style={row}>
        <span style={rowL}>start:</span>
        <input type="date" value={rule.start_date} onChange={e=>s({start_date:e.target.value})} style={inp}/>
      </div>
      {/* Repeat */}
      <div style={row}>
        <span style={rowL}>repeat:</span>
        <span style={{ ...vm,fontSize:'0.78rem',color:'rgba(255,255,255,0.3)' }}>every</span>
        <input type="number" min={1} max={99} value={rule.repeat_interval} onChange={e=>s({repeat_interval:Number(e.target.value)||1})}
          style={{ ...inp,width:34,textAlign:'center',border:'1px solid rgba(255,255,255,0.15)' }}/>
        {tabBtn('days',   rule.freq==='daily',   ()=>s({freq:'daily'}))}
        {tabBtn('weeks',  rule.freq==='weekly',  ()=>s({freq:'weekly'}))}
        {tabBtn('months', rule.freq==='monthly', ()=>s({freq:'monthly'}))}
      </div>
      {/* Day picker */}
      {rule.freq==='weekly'&&(
        <div style={{ display:'flex',gap:3,marginBottom:5,paddingLeft:68 }}>
          {DL.map((d,i)=>(
            <button key={i} onClick={()=>{
              const nd=(rule.days??[]).includes(i)?(rule.days??[]).filter(x=>x!==i):[...(rule.days??[]),i];
              s({days:nd});
            }} style={{ width:20,height:20,background:(rule.days??[]).includes(i)?'var(--teal)':'rgba(255,255,255,0.06)',
              border:'none',color:(rule.days??[]).includes(i)?'#000':'rgba(255,255,255,0.35)',
              ...vm,fontSize:'0.72rem',cursor:'pointer' }}>{d}</button>
          ))}
        </div>
      )}
      {/* End condition */}
      <div style={row}>
        <span style={rowL}>end:</span>
        {tabBtn('after',  rule.end_mode==='count', ()=>s({end_mode:'count',end_count:rule.end_count??52}))}
        {rule.end_mode==='count'&&(
          <input type="number" min={1} max={999} value={rule.end_count??52} onChange={e=>s({end_count:Number(e.target.value)||1})}
            style={{ ...inp,width:44,textAlign:'center',border:'1px solid rgba(255,255,255,0.15)' }}/>
        )}
        {rule.end_mode==='count'&&<span style={{ ...vm,fontSize:'0.78rem',color:'rgba(255,255,255,0.28)' }}>times</span>}
        {tabBtn('by date',rule.end_mode==='date',  ()=>s({end_mode:'date', end_date:rule.end_date??''}))}
        {rule.end_mode==='date'&&(
          <input type="date" value={rule.end_date??''} onChange={e=>s({end_date:e.target.value})} style={inp}/>
        )}
      </div>
      {/* Time + duration (events only) */}
      {isEvent&&(
        <div style={row}>
          <span style={rowL}>time:</span>
          <span style={{ ...vm,color:'rgba(255,255,255,0.3)',fontSize:'0.82rem' }}>[</span>
          <input type="text" placeholder="HH:MM" maxLength={5} value={rule.start_time??''}
            onChange={e=>s({start_time: e.target.value || null})}
            onBlur={e=>{ const v=e.target.value.trim(); s({start_time: v ? normalizeTime(v) : null}); }}
            style={{ ...vm,background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.2)',color:'#fff',fontSize:'0.82rem',width:44,textAlign:'center',outline:'none',padding:'1px 0' }}/>
          <span style={{ ...vm,color:'rgba(255,255,255,0.3)',fontSize:'0.82rem' }}>]</span>
          <input type="number" placeholder="min" min={5} max={480} value={rule.duration_minutes??''}
            onChange={e=>s({duration_minutes:Number(e.target.value)||undefined})}
            style={{ ...inp,width:44,textAlign:'center',border:'1px solid rgba(255,255,255,0.15)' }}/>
          <span style={{ ...vm,fontSize:'0.72rem',color:'rgba(255,255,255,0.28)' }}>min</span>
        </div>
      )}
    </div>
  );
}

// ── Row label (matches TaskForm style) ────────────────────────────────────────
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ ...vm, fontSize:'0.68rem', letterSpacing:'3px',
      color:'rgba(255,255,255,0.3)', textTransform:'uppercase',
      display:'block', marginBottom:'0.4rem' }}>
      {children}
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ icon, label, color='var(--yellow)' }: {
  icon:React.ReactNode; label:string; color?:string;
}) {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:8,paddingBottom:4,borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ color,display:'flex',alignItems:'center' }}>{icon}</span>
      <span style={{ ...vm,fontSize:'0.85rem',letterSpacing:2,color }}>{label}</span>
    </div>
  );
}

// ── Main RoutineForm ──────────────────────────────────────────────────────────
export default function RoutineForm({ initial, onSave, onCancel, onRemoveManualOcc }: Props) {
  const arcs        = usePlannerStore(s => s.arcs);
  const projects    = usePlannerStore(s => s.projects);
  const groups      = usePlannerStore(s => s.groups);
  const createGroup = usePlannerStore(s => s.createGroup);

  const [nodeType,   setNodeType]   = useState<'task'|'event'>(
    (initial?.node_type as 'task'|'event') ?? 'task',
  );
  const [step,       setStep]       = useState<1|2>(initial ? 2 : 1);
  const [title,      setTitle]      = useState(initial?.title ?? '');
  const [important,  setImportant]  = useState(Boolean(initial?.importance_level));
  const [arcId,      setArcId]      = useState<string>(initial?.arc_id ?? '');
  const [projectId,  setProjectId]  = useState<string>(initial?.project_id ?? '');
  const [groupIds,   setGroupIds]   = useState<string[]>(initial?.group_ids ?? []);
  // Deserialize: recurring rules (with their exceptions arrays), manual rules → manualOccs UI state,
  // and the union of all rule exceptions → global exceptions Set for calendar display
  const [rules, setRules] = useState<RoutineRule[]>(() =>
    (initial?.rules ?? []).filter(r => r.freq !== 'manual'),
  );
  const [exceptions, setExceptions] = useState<Set<string>>(() =>
    new Set((initial?.rules ?? []).flatMap(r => r.freq !== 'manual' ? (r.exceptions ?? []) : [])),
  );
  const [manualOccs, setManualOccs] = useState<ManualOccInput[]>(() =>
    (initial?.rules ?? [])
      .filter(r => r.freq === 'manual')
      .map(r => ({ id: r.id, date: r.start_date, start_time: r.start_time ?? undefined, duration_minutes: r.duration_minutes ?? undefined })),
  );
  const [expandedRuleId, setExpandedRuleId] = useState<string|null>(null);
  const [calMonth,      setCalMonth]      = useState(new Date());
  const [manDate,       setManDate]       = useState('');
  const [manTime,       setManTime]       = useState('');
  const [manDuration,   setManDuration]   = useState('');
  const [showNewGroup,  setShowNewGroup]  = useState(false);
  const [closingGroup,  setClosingGroup]  = useState(false);
  const [newGroupName,  setNewGroupName]  = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#64c8ff');

  const closeGroupForm = () => {
    setClosingGroup(true);
    setTimeout(()=>{ setShowNewGroup(false); setClosingGroup(false); }, 140);
  };
  const handleNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const id = await createGroup({ name: newGroupName.trim(), color_hex: newGroupColor });
    setGroupIds(p => [...p, id]);
    setNewGroupName(''); setNewGroupColor('#64c8ff'); setShowNewGroup(false);
  };

  // ── Compute calendar highlights ────────────────────────────────────────────
  const { fixedDates, manualDates } = useMemo(()=>{
    const y=calMonth.getFullYear(); const m=calMonth.getMonth();
    const from=`${y}-${String(m+1).padStart(2,'0')}-01`;
    const dim=new Date(y,m+1,0).getDate();
    const to=`${y}-${String(m+1).padStart(2,'0')}-${String(dim).padStart(2,'0')}`;
    const fixedDates=new Set<string>();
    const manualDates=new Set<string>();
    for(const r of rules){
      for(const d of genRuleDates(r)){
        if(d>=from&&d<=to&&!exceptions.has(d)) fixedDates.add(d);
      }
    }
    for(const o of manualOccs){
      if(o.date>=from&&o.date<=to) manualDates.add(o.date);
    }
    return {fixedDates,manualDates};
  },[rules,exceptions,manualOccs,calMonth]);

  // ── Compute sorted occurrences list (next 6 months) ─────────────────────
  const allOccs = useMemo(()=>{
    const today=toDS(new Date());
    const far=new Date(); far.setMonth(far.getMonth()+6);
    const farStr=toDS(far);
    const list:{date:string;time?:string;duration_minutes?:number;isManual:boolean}[]=[];
    for(const r of rules){
      for(const d of genRuleDates(r)){
        if(d>=today&&d<=farStr&&!exceptions.has(d)){
          list.push({date:d,time:r.start_time??undefined,duration_minutes:r.duration_minutes??undefined,isManual:false});
        }
      }
    }
    for(const o of manualOccs){
      // Show all manual occurrences regardless of date (past ones may not have fired yet)
      list.push({date:o.date,time:o.start_time,duration_minutes:o.duration_minutes,isManual:true});
    }
    return list.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,80);
  },[rules,exceptions,manualOccs]);

  const handleCalToggle=(date:string,isFixed:boolean,isManual:boolean)=>{
    if(isManual){
      setManualOccs(p=>p.filter(o=>o.date!==date));
    } else if(isFixed){
      setExceptions(p=>{const s=new Set(p); s.add(date); return s;});
    }
  };
  const handleOccRemove=(date:string,isManual:boolean)=>{
    if(isManual){
      setManualOccs(p=>p.filter(o=>o.date!==date));
      // In edit mode, immediately delete the DB node so the block disappears from calendar/today
      onRemoveManualOcc?.(date);
    } else {
      setExceptions(p=>{const s=new Set(p); s.add(date); return s;});
    }
  };
  const handleAddManual=()=>{
    if(!manDate) return;
    if(manualOccs.some(o=>o.date===manDate)) return;
    setManualOccs(p=>[...p,{id:gid(),date:manDate,start_time:manTime||undefined,duration_minutes:Number(manDuration)||undefined}]);
    setManDate(''); setManTime(''); setManDuration('');
  };

  const handleSubmit=()=>{
    if(!title.trim()) return;
    // Distribute global exceptions into the rule that generated each date
    const recurringRules = rules.map(r => {
      const rDates = new Set(genRuleDatesRaw(r));
      const rExceptions = [...exceptions].filter(d => rDates.has(d));
      return rExceptions.length > 0 ? { ...r, exceptions: rExceptions } : { ...r, exceptions: null };
    });
    // Convert manual occs to manual RoutineRule rows
    const manualRules: RoutineRule[] = manualOccs.map(o => ({
      id: o.id, freq: 'manual' as const, repeat_interval: 1,
      start_date: o.date, end_mode: 'count' as const, end_count: 1,
      start_time: o.start_time ?? null, duration_minutes: o.duration_minutes ?? null, days: null, exceptions: null,
    }));
    onSave({
      title:title.trim(), node_type:nodeType,
      importance_level:important?1:0,
      arc_id: arcId || null,
      project_id: projectId || null,
      rules: [...recurringRules, ...manualRules],
      group_ids: groupIds.length>0 ? groupIds : undefined,
    } as RoutineFormData);
  };

  if(step===1) return <TypePicker onSelect={t=>{setNodeType(t);setStep(2);}}/>;

  return (
    <div style={{ position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.78)' }}
      onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#080808',border:'1px solid rgba(255,255,255,0.1)',
        width:860,height:620,display:'flex',flexDirection:'column',overflow:'hidden',...vm,color:'#fff' }}>

        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',gap:8,padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',flexShrink:0 }}>
          <Reload size={16} style={{ color:'var(--teal)' }}/>
          <span style={{ fontSize:'1.45rem',letterSpacing:3,color:'var(--teal)' }}>
            {initial?'EDIT ROUTINE':'ADD NEW ROUTINE'}
          </span>
          <span style={{ fontSize:'1rem',letterSpacing:1,color:'rgba(255,255,255,0.3)',marginLeft:4 }}>
            [{nodeType.toUpperCase()}]
          </span>
        </div>

        {/* Body */}
        <div style={{ flex:1,minHeight:0,display:'flex' }}>

          {/* LEFT — calendar + occurrences */}
          <div style={{ width:260,borderRight:'1px solid rgba(255,255,255,0.07)',padding:'14px 14px',display:'flex',flexDirection:'column',gap:10,flexShrink:0 }}>
            <SectionLabel icon={<Calendar size={13}/>} label="CALENDAR" color="rgba(255,255,255,0.55)"/>
            <RoutineCalendar month={calMonth} setMonth={setCalMonth}
              fixed={fixedDates} manual={manualDates} exceptions={exceptions}
              onToggle={handleCalToggle}/>
            <div style={{ ...vm,fontSize:'0.7rem',color:'rgba(255,255,255,0.2)',marginTop:2 }}>
              <span style={{ color:'rgba(255,255,255,0.55)' }}>■</span> fixed &nbsp;
              <span style={{ color:'#64c8ff' }}>■</span> manual
            </div>
            <SectionLabel icon={<span style={{ fontSize:'0.8rem' }}>≡</span>} label="OCCURRENCES" color="rgba(255,255,255,0.55)"/>
            <OccList occs={allOccs} isEvent={nodeType==='event'} onRm={handleOccRemove}/>
          </div>

          {/* RIGHT — identity + rules + manual */}
          <div style={{ flex:1,minWidth:0,overflowY:'auto',padding:'14px 18px',display:'flex',flexDirection:'column',gap:14 }} className="checklist-scroll">

            {/* IDENTITY */}
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              <SectionLabel icon={<Contact size={13}/>} label="IDENTITY"/>

              {/* Name + importance star inline */}
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <span style={{ ...vm,color:'rgba(255,255,255,0.28)',fontSize:'0.9rem' }}>[</span>
                <input autoFocus placeholder="routine name" value={title}
                  onChange={e=>setTitle(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleSubmit()}
                  style={{ flex:1,background:'transparent',border:0,...vm,fontSize:'1rem',color:'#fff',padding:0,outline:'none' }}
                  className="placeholder:text-[rgba(255,255,255,0.18)]"/>
                <span style={{ ...vm,color:'rgba(255,255,255,0.28)',fontSize:'0.9rem' }}>]</span>
                {nodeType==='task'&&(
                  <button onClick={()=>setImportant(p=>!p)}
                    style={{ ...vm,background:'none',border:'none',cursor:'pointer',padding:0,fontSize:'1rem',flexShrink:0,
                      color:important?'var(--yellow)':'rgba(255,255,255,0.22)' }}>
                    {important?'★':'☆'}
                  </button>
                )}
              </div>

              {/* Arc + Project */}
              <div style={{ display:'flex',gap:'0.4rem' }}>
                <Select value={arcId||'__none__'} onValueChange={(v:string)=>{setArcId(v==='__none__'?'':v);setProjectId('');}}>
                  <TS className="rounded-none bg-transparent border-[rgba(255,255,255,0.15)] font-mono text-sm focus:ring-0 h-7 px-2"
                    style={{ color: arcId?(arcs.find(a=>a.id===arcId)?.color_hex??'rgba(255,255,255,0.55)'):'rgba(255,255,255,0.35)' }}>
                    <SelectValue placeholder="arc"/>
                  </TS>
                  <TC className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                    <TI value="__none__" className="font-mono text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>no arc</TI>
                    {arcs.map(a=>(
                      <TI key={a.id} value={a.id} className="font-mono text-sm" style={{ color:a.color_hex }}>{a.name}</TI>
                    ))}
                  </TC>
                </Select>
                <Select value={projectId||'__none__'} onValueChange={(v:string)=>setProjectId(v==='__none__'?'':v)} disabled={!arcId}>
                  <TS className="rounded-none bg-transparent border-[rgba(255,255,255,0.15)] font-mono text-sm focus:ring-0 h-7 px-2 disabled:opacity-35"
                    style={{ color:'rgba(255,255,255,0.35)' }}>
                    <SelectValue placeholder={arcId?'project':'—'}/>
                  </TS>
                  <TC className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
                    <TI value="__none__" className="font-mono text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>no project</TI>
                    {projects.filter(p=>p.arc_id===arcId).map(p=>(
                      <TI key={p.id} value={p.id} className="font-mono text-sm">{p.name}</TI>
                    ))}
                  </TC>
                </Select>
              </div>

              {/* Groups + add button */}
              <div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:'0.4rem',alignItems:'center' }}>
                  {groups.filter(g=>!g.is_ungrouped).map(g=>{
                    const sel=groupIds.includes(g.id);
                    return (
                      <button key={g.id}
                        onClick={()=>setGroupIds(p=>sel?p.filter(x=>x!==g.id):[...p,g.id])}
                        style={{ ...vm,fontSize:'0.88rem',color:sel?g.color_hex:'rgba(255,255,255,0.3)',
                          background:'none',border:'none',cursor:'pointer',padding:0 }}>
                        #{g.name}
                      </button>
                    );
                  })}
                  <button
                    onClick={()=>showNewGroup?closeGroupForm():setShowNewGroup(true)}
                    style={{ ...vm,fontSize:'0.95rem',color:'rgba(255,255,255,0.38)',background:'none',
                      border:'1px solid rgba(255,255,255,0.18)',cursor:'pointer',padding:'0 0.3rem',lineHeight:1.3 }}>
                    +
                  </button>
                </div>
                {showNewGroup&&(
                  <div style={{ marginTop:'0.4rem',animation:`${closingGroup?'term-out':'term-in'} 0.14s ease forwards` }}>
                    <div style={{ display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'wrap' }}>
                      <span style={{ ...vm,fontSize:'0.85rem',color:'#00c4a7' }}>&gt;</span>
                      <input autoFocus value={newGroupName} onChange={e=>setNewGroupName(e.target.value)}
                        placeholder="group name_"
                        onKeyDown={e=>{ e.stopPropagation(); if(e.key==='Enter')handleNewGroup(); if(e.key==='Escape')closeGroupForm(); }}
                        style={{ ...vm,fontSize:'0.85rem',background:'transparent',border:0,
                          borderBottom:'1px solid rgba(255,255,255,0.25)',color:newGroupColor,outline:'none',width:110 }}/>
                      <div style={{ display:'flex',gap:4 }}>
                        {SWATCH_COLORS.map(c=>(
                          <button key={c} onClick={()=>setNewGroupColor(c)}
                            style={{ width:9,height:9,background:c,border:'none',cursor:'pointer',
                              outline:newGroupColor===c?`2px solid ${c}`:'none',outlineOffset:2 }}/>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FIXED RULES */}
            <div>
              <SectionLabel icon={<TeachSharp size={13}/>} label="FIXED RULES"/>
              {rules.map(r=>(
                <div key={r.id} style={{ marginBottom:6 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <button onClick={()=>setExpandedRuleId(expandedRuleId===r.id?null:r.id)}
                      style={{ ...vm,background:'none',border:'1px solid rgba(255,255,255,0.12)',
                        padding:'2px 8px',cursor:'pointer',color:'rgba(255,255,255,0.65)',fontSize:'0.82rem',
                        flex:1,textAlign:'left' }}>
                      {expandedRuleId===r.id?'▾':' ▸'} {ruleLabel(r)}
                    </button>
                    <button onClick={()=>setRules(p=>p.filter(x=>x.id!==r.id))}
                      style={{ ...vm,background:'none',border:'none',cursor:'pointer',
                        color:'rgba(255,59,59,0.55)',fontSize:'0.82rem',padding:'0 4px' }}>✕</button>
                  </div>
                  {expandedRuleId===r.id&&(
                    <RuleEditor rule={r} isEvent={nodeType==='event'}
                      onChange={nr=>setRules(p=>p.map(x=>x.id===r.id?nr:x))}/>
                  )}
                </div>
              ))}
              <button onClick={()=>{const r=defaultRule();setRules(p=>[...p,r]);setExpandedRuleId(r.id);}}
                style={{ ...vm,background:'none',border:'1px dashed rgba(255,255,255,0.18)',
                  color:'rgba(255,255,255,0.4)',fontSize:'0.82rem',padding:'3px 10px',cursor:'pointer',marginTop:2 }}>
                + add rule
              </button>
            </div>

            {/* MANUAL MODE */}
            <div>
              <SectionLabel icon={<span style={{ fontSize:'0.85rem' }}>✦</span>} label="MANUAL MODE" color="var(--blue)"/>
              <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' }}>
                <input type="date" value={manDate} onChange={e=>setManDate(e.target.value)}
                  style={{ ...vm,background:'transparent',border:'1px solid rgba(255,255,255,0.15)',
                    color:'#fff',fontSize:'0.82rem',outline:'none',padding:'2px 6px',colorScheme:'dark' }}/>
                {nodeType==='event'&&(
                  <>
                    <span style={{ color:'rgba(255,255,255,0.3)',...vm,fontSize:'0.82rem' }}>[</span>
                    <input type="text" placeholder="HH:MM" maxLength={5} value={manTime}
                      onChange={e=>setManTime(e.target.value)}
                      style={{ ...vm,background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.2)',
                        color:'#fff',fontSize:'0.82rem',width:44,textAlign:'center',outline:'none',padding:'1px 0' }}/>
                    <span style={{ color:'rgba(255,255,255,0.3)',...vm,fontSize:'0.82rem' }}>]</span>
                    <input type="number" placeholder="min" min={5} max={480} value={manDuration}
                      onChange={e=>setManDuration(e.target.value)}
                      style={{ ...vm,background:'transparent',border:'1px solid rgba(255,255,255,0.15)',
                        color:'#fff',fontSize:'0.82rem',width:48,textAlign:'center',outline:'none',padding:'1px 4px' }}/>
                    <span style={{ ...vm,fontSize:'0.72rem',color:'rgba(255,255,255,0.28)' }}>min</span>
                  </>
                )}
                <button onClick={handleAddManual} disabled={!manDate}
                  style={{ ...vm,background:manDate?'rgba(100,200,255,0.15)':'transparent',
                    border:'1px solid rgba(100,200,255,0.3)',color:manDate?'#64c8ff':'rgba(255,255,255,0.2)',
                    fontSize:'0.82rem',padding:'2px 10px',cursor:manDate?'pointer':'default' }}>+ add</button>
              </div>
            </div>

            {/* EXCEPTIONS */}
            {(() => {
              // Collect all exceptions across all recurring rules
              const allExceptions: { date: string; ruleLabel: string }[] = [];
              for (const r of rules) {
                if (!r.exceptions?.length) continue;
                for (const date of r.exceptions) {
                  allExceptions.push({ date, ruleLabel: ruleLabel(r) });
                }
              }
              if (allExceptions.length === 0) return null;
              allExceptions.sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div>
                  <SectionLabel icon={<span style={{ fontSize:'0.85rem' }}>✕</span>} label="SKIPPED DATES" color="#f5a623"/>
                  <div style={{ display:'flex',flexDirection:'column',gap:3,maxHeight:140,overflowY:'auto' }} className="checklist-scroll">
                    {allExceptions.map(({ date }) => (
                      <div key={date} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 0',borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ ...vm,fontSize:'0.82rem',color:'rgba(255,165,0,0.75)' }}>{date}</span>
                        <button
                          onClick={async () => {
                            // Remove from local exceptions Set (affects calendar + save)
                            setExceptions(p => { const s = new Set(p); s.delete(date); return s; });
                            // Also remove from the rule's local exceptions array
                            setRules(p => p.map(r => r.exceptions?.includes(date)
                              ? { ...r, exceptions: r.exceptions.filter(e => e !== date) }
                              : r,
                            ));
                            // If editing an existing routine, persist immediately and create node
                            if (initial?.id) {
                              await cancelException(initial.id, date);
                            }
                          }}
                          style={{ ...vm,background:'none',border:'1px solid rgba(255,165,0,0.3)',color:'rgba(255,165,0,0.7)',
                            fontSize:'0.78rem',padding:'0 8px',cursor:'pointer',letterSpacing:1,
                            transition:'border-color 0.12s,color 0.12s' }}
                        >
                          restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Spacer + actions */}
            <div style={{ flex:1 }}/>
            <div style={{ display:'flex',gap:10,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={handleSubmit} disabled={!title.trim()} style={{ ...vm,
                background:title.trim()?'var(--teal)':'rgba(0,196,167,0.15)',
                border:'none',color:title.trim()?'#000':'rgba(0,196,167,0.3)',
                fontSize:'1.1rem',padding:'4px 20px',cursor:title.trim()?'pointer':'default' }}>
                {initial?'save':'create'}
              </button>
              <button onClick={onCancel} style={{ ...vm,background:'transparent',
                border:'1px solid rgba(255,255,255,0.18)',color:'rgba(255,255,255,0.45)',
                fontSize:'1.1rem',padding:'4px 14px',cursor:'pointer' }}>cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
