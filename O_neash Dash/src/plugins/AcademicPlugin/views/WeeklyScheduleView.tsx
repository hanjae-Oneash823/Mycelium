import type { Project, Arc } from '../../ProjectsPlugin/lib/projectsDb';
import type { Routine, RoutineRule } from '../../PlannerPlugin/types';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#f59e0b';

// Time range: 07:00 – 23:00 (16 hours = 960 minutes)
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
const GRID_HEIGHT = 768; // px

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
// day-of-week numbers: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
const DAY_NUMS = [1, 2, 3, 4, 5];

function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const norm = /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
  const [h, m] = norm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function topPct(startMins: number): number {
  return Math.max(0, (startMins - START_HOUR * 60) / TOTAL_MINS) * 100;
}

function heightPct(durationMins: number): number {
  return Math.max(0.5, durationMins / TOTAL_MINS) * 100;
}

interface SessionBlock {
  routineId: string;
  title: string;
  color: string;
  startMins: number;
  durationMins: number;
  dayNum: number;
}

function buildBlocks(routines: Routine[], arcMap: Map<string, Arc>, projectMap: Map<string, Project>): SessionBlock[] {
  const blocks: SessionBlock[] = [];

  for (const routine of routines) {
    const arc = routine.arc_id ? arcMap.get(routine.arc_id) : null;
    const project = routine.project_id ? projectMap.get(routine.project_id) : null;
    const projectArc = project?.arc_id ? arcMap.get(project.arc_id) : null;
    const color = arc?.color_hex ?? projectArc?.color_hex ?? ACC;

    for (const rule of (routine.rules ?? [])) {
      const start = parseTime(rule.start_time);
      if (start === null) continue;
      const duration = rule.duration_minutes ?? 60;

      if (rule.freq === 'daily') {
        for (const dayNum of DAY_NUMS) {
          blocks.push({ routineId: routine.id, title: routine.title, color, startMins: start, durationMins: duration, dayNum });
        }
      } else if (rule.freq === 'weekly' && rule.days && rule.days.length > 0) {
        for (const d of rule.days) {
          if (DAY_NUMS.includes(d)) {
            blocks.push({ routineId: routine.id, title: routine.title, color, startMins: start, durationMins: duration, dayNum: d });
          }
        }
      }
    }
  }

  return blocks;
}

// ── Time Labels ───────────────────────────────────────────────────────────────

function TimeGutter() {
  const labels = [];
  for (let h = START_HOUR; h <= END_HOUR; h += 2) {
    const pct = topPct(h * 60);
    labels.push(
      <div
        key={h}
        style={{
          position: 'absolute',
          top: `${pct}%`,
          right: 6,
          fontFamily: VT,
          fontSize: '0.7rem',
          letterSpacing: 0.5,
          color: 'rgba(255,255,255,0.2)',
          transform: 'translateY(-50%)',
          userSelect: 'none',
        }}
      >
        {String(h).padStart(2, '0')}
      </div>,
    );
  }
  return (
    <div style={{ position: 'relative', height: GRID_HEIGHT }}>
      {labels}
    </div>
  );
}

// ── Hour Lines ────────────────────────────────────────────────────────────────

function HourLines() {
  const lines = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const pct = topPct(h * 60);
    lines.push(
      <div
        key={h}
        style={{
          position: 'absolute',
          top: `${pct}%`,
          left: 0, right: 0,
          height: 1,
          background: h % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
          pointerEvents: 'none',
        }}
      />,
    );
  }
  return <>{lines}</>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  subjects: Project[];
  arcs: Arc[];
  routines: Routine[];
}

export default function WeeklyScheduleView({ subjects, arcs, routines }: Props) {
  const arcMap = new Map(arcs.map(a => [a.id, a]));
  const projectMap = new Map(subjects.map(p => [p.id, p]));
  const blocks = buildBlocks(routines, arcMap, projectMap);

  const today = new Date().getDay(); // 0=Sun, 1=Mon … 6=Sat

  // Current week Mon-Fri dates for header
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // ISO: Mon=1
  const weekDates = DAY_NUMS.map(d => {
    const date = new Date(now);
    date.setDate(now.getDate() - dayOfWeek + d);
    return date;
  });

  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '2.5rem 160px 0', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {routines.length === 0 && (
          <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 2, color: 'rgba(255,255,255,0.12)', padding: '40px 0' }}>
            no class sessions — add routines linked to your subjects in the planner
          </div>
        )}

        {/* ── Timetable ── */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(5, 1fr)', minHeight: GRID_HEIGHT + 48 }}>

            {/* Gutter header */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }} />

            {/* Day headers */}
            {DAY_NUMS.map((dayNum, i) => {
              const isToday = today === dayNum;
              return (
                <div
                  key={dayNum}
                  className={`timetable-header${isToday ? ' today' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                >
                  <span>{DAYS[i]}</span>
                  <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.55 }}>{fmtDate(weekDates[i])}</span>
                </div>
              );
            })}

            {/* Time gutter */}
            <div style={{ position: 'relative', height: GRID_HEIGHT }}>
              <TimeGutter />
            </div>

            {/* Day columns */}
            {DAY_NUMS.map(dayNum => {
              const dayBlocks = blocks.filter(b => b.dayNum === dayNum);
              return (
                <div
                  key={dayNum}
                  className="timetable-col"
                  style={{ position: 'relative', height: GRID_HEIGHT }}
                >
                  <HourLines />
                  {dayBlocks.map((blk, i) => (
                    <div
                      key={`${blk.routineId}-${i}`}
                      className="session-block"
                      style={{
                        top: `${topPct(blk.startMins)}%`,
                        height: `${heightPct(blk.durationMins)}%`,
                        borderLeftColor: blk.color,
                        background: `${blk.color}15`,
                      }}
                    >
                      <div style={{ fontFamily: VT, fontSize: '0.8rem', letterSpacing: 0.5, color: blk.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {blk.title}
                      </div>
                      <div style={{ fontFamily: VT, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                        {String(Math.floor(blk.startMins / 60)).padStart(2, '0')}:{String(blk.startMins % 60).padStart(2, '0')}
                        {blk.durationMins ? ` · ${blk.durationMins}m` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
